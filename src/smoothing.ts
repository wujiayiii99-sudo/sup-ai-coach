/**
 * 关键点平滑模块
 *
 * 职责：对上肢关键点（肩、肘、腕）应用轻量级 EMA 平滑，
 *       仅影响 Canvas 绘制数据，不修改原始检测结果。
 *
 * 设计要点：
 * - 帧间位移自适应 alpha（静止 α=0.3，快速 α=0.65）
 * - 按新视频帧计数（而非 rAF 次数）
 * - 低置信度保留旧位置最多 3 帧，逐帧降低绘制透明度
 * - 连续 5 帧无检测自动重置
 * - ENABLE_UPPER_BODY_SMOOTHING = false 时完全旁路
 */

import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

// ================================================================
// 配置（修改此处即可调整平滑行为）
// ================================================================

/** 平滑总开关：false 时完全绕过，返回原始关键点 */
export const ENABLE_UPPER_BODY_SMOOTHING = true;

/** 平滑参数集 */
const CONFIG = {
  /** 需要平滑的上肢关键点下标：肩、肘、腕 */
  upperBodyIndices: [11, 12, 13, 14, 15, 16],

  /** 静止时的最低 alpha（越小越平滑，延迟越大） */
  alphaMin: 0.3,

  /** 快速运动时的最高 alpha（越大越跟随，平滑越少） */
  alphaMax: 0.65,

  /** 将此归一化帧间位移视为"全速"，用于 alpha 线性映射 */
  velocityFullScale: 0.01,

  /** 低置信度最多保留的新视频帧数 */
  maxRetainFrames: 3,

  /** 连续无检测帧数超过此值后清空所有平滑状态 */
  resetAfterNoDetect: 5,

  /** 有效关键点的最低 visibility */
  visibilityThreshold: 0.5,

  /** 保留帧期间使用的 visibility 值，drawing.ts 据此控制透明度 */
  fadeVisibility: 0.3,
} as const;

// ================================================================
// 内部状态
// ================================================================

interface KeypointState {
  x: number;
  y: number;
  z: number;
  /** 该关键点已连续处于低置信度的新视频帧数 */
  retainedFrames: number;
}

/** 各关键点的平滑状态（仅对 upperBodyIndices 中的下标维护） */
const smoothStates = new Map<number, KeypointState>();

/** 上一个处理的视频帧时间（用于判断是否新帧） */
let lastFrameTime: number = -1;

/** 连续未检测到人体的新视频帧计数 */
let noDetectionCount: number = 0;

// ================================================================
// 内部工具
// ================================================================

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ================================================================
// 导出函数
// ================================================================

/**
 * 清空所有平滑缓存
 * 在停止/重启摄像头、关闭模型、或关闭平滑开关时应调用
 */
export function resetSmoothing(): void {
  smoothStates.clear();
  lastFrameTime = -1;
  noDetectionCount = 0;
}

/**
 * 对上肢关键点应用 EMA 平滑
 *
 * @param landmarks - 原始 MediaPipe 检测结果（不会被修改）
 * @param currentTime - video.currentTime，用于判断是否新视频帧
 * @returns 平滑后的关键点副本；关闭开关或传入 null 时原样返回
 */
export function applySmoothing(
  landmarks: NormalizedLandmark[] | null,
  currentTime: number
): NormalizedLandmark[] | null {
  // 开关关闭 → 完全旁路
  if (!ENABLE_UPPER_BODY_SMOOTHING) {
    return landmarks;
  }

  const isNewFrame = currentTime !== lastFrameTime;
  lastFrameTime = currentTime;

  // ============================================================
  // 情况 A：未检测到人体
  // ============================================================
  if (!landmarks) {
    if (isNewFrame) {
      noDetectionCount++;
      if (noDetectionCount >= CONFIG.resetAfterNoDetect) {
        resetSmoothing();
      }
    }
    return null;
  }

  // ============================================================
  // 情况 B：检测到人体
  // ============================================================
  if (isNewFrame) {
    noDetectionCount = 0;
  }

  // 创建副本，不修改原始 landmarks
  const result: NormalizedLandmark[] = landmarks.map((lm) => ({ ...lm }));

  for (const idx of CONFIG.upperBodyIndices) {
    const rawLm = result[idx];
    if (!rawLm) continue;

    const visibility = rawLm.visibility ?? 0;

    if (isNewFrame) {
      if (visibility >= CONFIG.visibilityThreshold) {
        // ── 有效关键点：EMA 更新 ──
        const prev = smoothStates.get(idx);
        if (prev) {
          // 用归一化帧间位移计算运动幅度
          const dx = rawLm.x - prev.x;
          const dy = rawLm.y - prev.y;
          const velocity = Math.sqrt(dx * dx + dy * dy);

          // 自适应 alpha：静止 → 低 alpha，快速 → 高 alpha
          const t = clamp(velocity / CONFIG.velocityFullScale, 0, 1);
          const alpha =
            CONFIG.alphaMin +
            t * (CONFIG.alphaMax - CONFIG.alphaMin);

          // 应用 EMA
          result[idx].x = prev.x + alpha * (rawLm.x - prev.x);
          result[idx].y = prev.y + alpha * (rawLm.y - prev.y);
          result[idx].z = prev.z + alpha * ((rawLm.z ?? 0) - prev.z);

          smoothStates.set(idx, {
            x: result[idx].x,
            y: result[idx].y,
            z: result[idx].z,
            retainedFrames: 0,
          });
        } else {
          // 首次出现 → 直接使用原始值作为初始状态
          smoothStates.set(idx, {
            x: rawLm.x,
            y: rawLm.y,
            z: rawLm.z ?? 0,
            retainedFrames: 0,
          });
        }
      } else {
        // ── 低置信度：保留最近有效位置（最多 maxRetainFrames 帧） ──
        const prev = smoothStates.get(idx);
        if (prev && prev.retainedFrames < CONFIG.maxRetainFrames) {
          // 用旧坐标覆盖副本
          result[idx].x = prev.x;
          result[idx].y = prev.y;
          result[idx].z = prev.z;
          // 降低 visibility → drawing.ts 据此绘制半透明效果
          result[idx].visibility = CONFIG.fadeVisibility;

          smoothStates.set(idx, {
            ...prev,
            retainedFrames: prev.retainedFrames + 1,
          });
        } else {
          // 超过保留限制或无历史 → 清除该关键点状态
          smoothStates.delete(idx);
          // visibility 保持原始低值，drawing.ts 会按阈值过滤
        }
      }
    } else {
      // ── 同一视频帧：复用已有平滑结果 ──
      const prev = smoothStates.get(idx);
      if (prev) {
        result[idx].x = prev.x;
        result[idx].y = prev.y;
        result[idx].z = prev.z;
      }
    }
  }

  return result;
}
