/**
 * 颜色标记检测模块
 *
 * 在低分辨率离屏 Canvas 上执行 HSV 阈值分割，识别粉色和绿色标记连通域，
 * 通过候选组合评分选择最可能的粉绿标记对，输出归一化坐标。
 *
 * 粉色 — 木棍上端，绿色 — 木棍下端。
 *
 * 检测限频由时间间隔控制，不跟随 rAF 每帧执行。
 */

import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

// ================================================================
// 配置（根据实际胶带/光照校准）
// ================================================================

export const MARKER_DETECTOR_CONFIG = {
  /** 标记检测最小时间间隔 (ms) */
  detectionIntervalMs: 80,

  /** 离屏 Canvas 宽 */
  offscreenWidth: 320,
  /** 离屏 Canvas 高 */
  offscreenHeight: 180,

  // ── HSV 阈值（H: 0~360°, S: 0~1, V: 0~1）──
  // 待校准：以下为工程初值，需根据实际胶带和光照调整
  // 粉色（上端标记）
  pinkHueRange: [300, 355] as [number, number],
  // 绿色（下端标记）
  greenHueRange: [75, 165] as [number, number],
  minSaturation: 0.25,
  minValue: 0.30,
  // 旧红蓝阈值保留以供对照：
  // redHueRanges: [[0, 20], [340, 360]] as [number, number][],
  // blueHueRange: [195, 250] as [number, number],
  // minSaturation: 0.3,
  // minValue: 0.3,

  // ── 连通域面积过滤（离屏坐标像素数）──
  minArea: 15,
  maxArea: 2000,

  // ── 人体包围框扩展系数 ──
  horizontalPaddingRatio: 0.4,
  verticalPaddingRatio: 0.5,

  // ── 候选组合评分权重 ──
  scoreWeights: {
    verticalOrder: 15, // 粉在上、绿在下
    distanceRange: 15, // 两点间距在合理范围
    inBoundingBox: 10, // 均在人体扩展框内
    wristAlignment: 10, // 连线方向与手腕连线方向相近（软约束）
    angleRange: 10, // 杆体不严重偏离垂直
    verticalDominance: 10, // y 向距离 > x 向距离
    temporalPink: 15, // 粉色位置时序一致
    temporalGreen: 15, // 绿色位置时序一致
  } as const,

  /** 两点最小距离（离屏坐标像素） */
  minMarkerDistance: 20,
  /** 两点最大距离（离屏坐标像素） */
  maxMarkerDistance: 160,

  /** 与上一帧的最大移动距离（离屏坐标像素），超限则时序加分为 0 */
  maxMovementPx: 80,

  /** 通过最低总分 */
  minTotalScore: 50,

  /** 手腕软约束最低置信度，不足则跳过该项 */
  minWristVisibility: 0.5,
} as const;

// ================================================================
// 类型
// ================================================================

/** 标记连通域 */
export interface MarkerBlob {
  /** 离屏 Canvas 坐标 cx */
  cx: number;
  /** 离屏 Canvas 坐标 cy */
  cy: number;
  /** 像素面积 */
  area: number;
}

/** 标记检测结果 */
export interface MarkerResult {
  /** 粉色（上端）质心归一化坐标 */
  pink: { x: number; y: number } | null;
  /** 绿色（下端）质心归一化坐标 */
  green: { x: number; y: number } | null;
  /** 综合评分 */
  score: number;
  /** 检测耗时 ms */
  detectMs: number;
}

/** 性能统计 */
export interface MarkerPerformance {
  /** 上一次检测耗时 ms */
  lastMs: number;
  /** 最近若干次的平均耗时 ms */
  avgMs: number;
  /** 记录次数 */
  count: number;
}

const PERF_SAMPLES = 30;

// ================================================================
// 内部状态
// ================================================================

let prevPink: { x: number; y: number } | null = null;
let prevGreen: { x: number; y: number } | null = null;
let lastDetectFrame = -1;
let lastDetectTime = 0;

const perfTimes: number[] = [];
let perfCount = 0;

// 离屏 Canvas
let offCanvas: HTMLCanvasElement | null = null;
let offCtx: CanvasRenderingContext2D | null = null;

function ensureOffscreen(w: number, h: number) {
  if (!offCanvas) {
    offCanvas = document.createElement("canvas");
    offCanvas.width = w;
    offCanvas.height = h;
    offCtx = offCanvas.getContext("2d")!;
  }
}

// ================================================================
// 人体包围框
// ================================================================

interface BBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * 从可靠 landmarks 计算人体包围框（归一化坐标），并向外扩展
 */
function computeBBox(
  landmarks: NormalizedLandmark[]
): BBox | null {
  const reliable: { x: number; y: number }[] = [];
  for (let i = 0; i < landmarks.length; i++) {
    if ((landmarks[i].visibility ?? 0) >= 0.5) {
      reliable.push(landmarks[i]);
    }
  }
  if (reliable.length < 6) return null;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const p of reliable) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  const bboxW = maxX - minX;
  const bboxH = maxY - minY;

  if (bboxW < 0.05 || bboxH < 0.05) return null;

  const padX = bboxW * MARKER_DETECTOR_CONFIG.horizontalPaddingRatio;
  const padY = bboxH * MARKER_DETECTOR_CONFIG.verticalPaddingRatio;

  return {
    left: Math.max(0, minX - padX),
    right: Math.min(1, maxX + padX),
    top: Math.max(0, minY - padY),
    bottom: Math.min(1, maxY + padY),
  };
}

// ================================================================
// HSV 转换
// ================================================================

function rgb2hsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const rf = r / 255;
  const gf = g / 255;
  const bf = b / 255;

  const max = Math.max(rf, gf, bf);
  const min = Math.min(rf, gf, bf);
  const delta = max - min;

  // H: 0~360°, S: 0~1, V: 0~1
  let h = 0;
  const v = max;
  const s = max === 0 ? 0 : delta / max;

  if (delta !== 0) {
    if (max === rf) {
      h = 60 * (((gf - bf) / delta) % 6);
    } else if (max === gf) {
      h = 60 * ((bf - rf) / delta + 2);
    } else {
      h = 60 * ((rf - gf) / delta + 4);
    }
  }
  if (h < 0) h += 360;

  return { h, s, v };
}

// ================================================================
// 颜色阈值匹配
// ================================================================

function isPink(h: number, s: number, v: number): boolean {
  if (s < MARKER_DETECTOR_CONFIG.minSaturation) return false;
  if (v < MARKER_DETECTOR_CONFIG.minValue) return false;
  const [lo, hi] = MARKER_DETECTOR_CONFIG.pinkHueRange;
  return h >= lo && h <= hi;
}

function isGreen(h: number, s: number, v: number): boolean {
  if (s < MARKER_DETECTOR_CONFIG.minSaturation) return false;
  if (v < MARKER_DETECTOR_CONFIG.minValue) return false;
  const [lo, hi] = MARKER_DETECTOR_CONFIG.greenHueRange;
  return h >= lo && h <= hi;
}

// ================================================================
// 连通域标记（BFS flood-fill）
// ================================================================

interface RawBlob {
  cx: number;
  cy: number;
  area: number;
}

function findBlobs(mask: Uint8Array, w: number, h: number): RawBlob[] {
  const visited = new Uint8Array(w * h);
  const blobs: RawBlob[] = [];
  const { minArea, maxArea } = MARKER_DETECTOR_CONFIG;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (!mask[idx] || visited[idx]) continue;

      // BFS
      const stack: [number, number][] = [[x, y]];
      visited[idx] = 1;
      let sumX = 0;
      let sumY = 0;
      let count = 0;

      while (stack.length > 0) {
        const [cx, cy] = stack.pop()!;
        sumX += cx;
        sumY += cy;
        count++;

        // 4-连通邻域
        const neighbors: [number, number][] = [
          [cx - 1, cy],
          [cx + 1, cy],
          [cx, cy - 1],
          [cx, cy + 1],
        ];
        for (const [nx, ny] of neighbors) {
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          const nidx = ny * w + nx;
          if (mask[nidx] && !visited[nidx]) {
            visited[nidx] = 1;
            stack.push([nx, ny]);
          }
        }
      }

      if (count >= minArea && count <= maxArea) {
        blobs.push({ cx: sumX / count, cy: sumY / count, area: count });
      }
    }
  }

  return blobs;
}

// ================================================================
// 候选组合评分
// ================================================================

interface Candidate {
  pinkBlob: RawBlob;
  greenBlob: RawBlob;
  score: number;
}

function scoreCandidates(
  pinkBlobs: RawBlob[],
  greenBlobs: RawBlob[],
  offW: number,
  offH: number,
  bbox: BBox | null,
  landmarks: NormalizedLandmark[] | null
): Candidate | null {
  if (pinkBlobs.length === 0 || greenBlobs.length === 0) return null;

  const W = MARKER_DETECTOR_CONFIG.scoreWeights;
  const totalWeight = Object.values(W).reduce((a, b) => a + b, 0);

  // 双手腕连线方向（软约束）
  let wristAngle: number | null = null;
  if (landmarks && landmarks.length >= 17) {
    const lw = landmarks[15];
    const rw = landmarks[16];
    if (
      lw &&
      rw &&
      (lw.visibility ?? 0) >= MARKER_DETECTOR_CONFIG.minWristVisibility &&
      (rw.visibility ?? 0) >= MARKER_DETECTOR_CONFIG.minWristVisibility
    ) {
      wristAngle = Math.atan2(rw.x - lw.x, rw.y - lw.y) * (180 / Math.PI);
    }
  }

  // 如果手腕不可用，重新计算可用权重
  const wristAvailable = wristAngle !== null;
  const effectiveWeight = wristAvailable
    ? totalWeight
    : totalWeight - W.wristAlignment;

  let best: Candidate | null = null;

  for (const pb of pinkBlobs) {
    for (const gb of greenBlobs) {
      let score = 0;

      // 1) 空间位置：粉色在上
      if (pb.cy < gb.cy) score += W.verticalOrder;

      // 2) 距离范围
      const dx = pb.cx - gb.cx;
      const dy = pb.cy - gb.cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (
        dist >= MARKER_DETECTOR_CONFIG.minMarkerDistance &&
        dist <= MARKER_DETECTOR_CONFIG.maxMarkerDistance
      ) {
        score += W.distanceRange;
      }

      // 3) 在人体扩展框内
      if (bbox) {
        const pnx = pb.cx / offW;
        const pny = pb.cy / offH;
        const gnx = gb.cx / offW;
        const gny = gb.cy / offH;
        if (
          pnx >= bbox.left && pnx <= bbox.right && pny >= bbox.top && pny <= bbox.bottom &&
          gnx >= bbox.left && gnx <= bbox.right && gny >= bbox.top && gny <= bbox.bottom
        ) {
          score += W.inBoundingBox;
        }
      }

      // 4) 手腕连线方向（软约束，跳过则重归一化）
      if (wristAvailable) {
        const stickAngle = Math.atan2(dx, dy) * (180 / Math.PI);
        const angleDiff = Math.abs(stickAngle - wristAngle!);
        if (angleDiff < 45) score += W.wristAlignment;
      }

      // 5) 杆体角度不严重偏离垂直
      const stickAbsAngle = Math.abs(Math.atan2(dx, dy) * (180 / Math.PI));
      if (stickAbsAngle < 60) score += W.angleRange;

      // 6) y 向距离 > x 向距离（竖握）
      if (Math.abs(dy) > Math.abs(dx)) score += W.verticalDominance;

      // 7) 时序一致性（起始帧无 prev，不扣分）
      if (prevPink) {
        const pdx = pb.cx - prevPink.x;
        const pdy = pb.cy - prevPink.y;
        const pMove = Math.sqrt(pdx * pdx + pdy * pdy);
        if (pMove <= MARKER_DETECTOR_CONFIG.maxMovementPx) score += W.temporalPink;
      }
      if (prevGreen) {
        const gdx = gb.cx - prevGreen.x;
        const gdy = gb.cy - prevGreen.y;
        const gMove = Math.sqrt(gdx * gdx + gdy * gdy);
        if (gMove <= MARKER_DETECTOR_CONFIG.maxMovementPx) score += W.temporalGreen;
      }

      // 重归一化到满分 100
      const normalized = (score / effectiveWeight) * 100;

      if (!best || normalized > best.score) {
        best = { pinkBlob: pb, greenBlob: gb, score: normalized };
      }
    }
  }

  return best;
}

// ================================================================
// 主检测函数
// ================================================================

export function detectMarkers(
  video: HTMLVideoElement,
  landmarks: NormalizedLandmark[] | null
): MarkerResult | null {
  const t0 = performance.now();

  // 帧去重
  if (video.currentTime === lastDetectFrame) return null;
  lastDetectFrame = video.currentTime;

  // 时间间隔
  const now = performance.now();
  if (now - lastDetectTime < MARKER_DETECTOR_CONFIG.detectionIntervalMs) return null;
  lastDetectTime = now;

  const W = MARKER_DETECTOR_CONFIG.offscreenWidth;
  const H = MARKER_DETECTOR_CONFIG.offscreenHeight;

  ensureOffscreen(W, H);
  if (!offCtx) return null;

  // 绘制当前帧至离屏 Canvas
  offCtx.drawImage(video, 0, 0, W, H);
  const imageData = offCtx.getImageData(0, 0, W, H);
  const pixels = imageData.data;

  // 人体包围框
  const bbox = landmarks ? computeBBox(landmarks) : null;

  // 计算搜索 ROI（离屏坐标）
  let roiX = 0;
  let roiY = 0;
  let roiW = W;
  let roiH = H;
  if (bbox) {
    roiX = Math.max(0, Math.floor(bbox.left * W));
    roiY = Math.max(0, Math.floor(bbox.top * H));
    roiW = Math.min(W, Math.ceil(bbox.right * W)) - roiX;
    roiH = Math.min(H, Math.ceil(bbox.bottom * H)) - roiY;
  }

  // HSV 阈值分割
  const pinkMask = new Uint8Array(W * H);
  const greenMask = new Uint8Array(W * H);

  for (let y = roiY; y < roiY + roiH && y < H; y++) {
    for (let x = roiX; x < roiX + roiW && x < W; x++) {
      const idx = (y * W + x) * 4;
      const r = pixels[idx];
      const g = pixels[idx + 1];
      const b = pixels[idx + 2];
      const { h, s, v } = rgb2hsv(r, g, b);

      if (isPink(h, s, v)) pinkMask[y * W + x] = 1;
      if (isGreen(h, s, v)) greenMask[y * W + x] = 1;
    }
  }

  // 连通域分析
  const pinkBlobs = findBlobs(pinkMask, W, H);
  const greenBlobs = findBlobs(greenMask, W, H);

  // 按面积排序，取前 5 个候选
  pinkBlobs.sort((a, b) => b.area - a.area);
  greenBlobs.sort((a, b) => b.area - a.area);
  const topPink = pinkBlobs.slice(0, 5);
  const topGreen = greenBlobs.slice(0, 5);

  // 候选组合评分
  const best = scoreCandidates(topPink, topGreen, W, H, bbox, landmarks);

  let pinkResult: { x: number; y: number } | null = null;
  let greenResult: { x: number; y: number } | null = null;
  let score = 0;

  if (best && best.score >= MARKER_DETECTOR_CONFIG.minTotalScore) {
    pinkResult = { x: best.pinkBlob.cx / W, y: best.pinkBlob.cy / H };
    greenResult = { x: best.greenBlob.cx / W, y: best.greenBlob.cy / H };
    score = best.score;
    prevPink = { x: best.pinkBlob.cx, y: best.pinkBlob.cy };
    prevGreen = { x: best.greenBlob.cx, y: best.greenBlob.cy };
  }

  const t1 = performance.now();
  const detectMs = t1 - t0;

  // 性能统计
  perfTimes.push(detectMs);
  if (perfTimes.length > PERF_SAMPLES) perfTimes.shift();
  perfCount++;

  return { pink: pinkResult, green: greenResult, score, detectMs };
}

// ================================================================
// 性能统计
// ================================================================

export function getMarkerPerformance(): MarkerPerformance {
  const last = perfTimes.length > 0 ? perfTimes[perfTimes.length - 1] : 0;
  const avg =
    perfTimes.length > 0
      ? perfTimes.reduce((a, b) => a + b, 0) / perfTimes.length
      : 0;
  return { lastMs: last, avgMs: avg, count: perfCount };
}

// ================================================================
// 重置
// ================================================================

/** 停止或重启摄像头时调用 */
export function resetMarkerState(): void {
  prevPink = null;
  prevGreen = null;
  lastDetectFrame = -1;
  lastDetectTime = 0;
}
