/**
 * Canvas 绘制模块
 * 负责在 Canvas 上绘制人体关键点和骨架连接线
 *
 * 支持低置信度保留帧的透明度淡出效果：
 * - visibility >= 0.5 → 完全不透明
 * - 0.2 < visibility < 0.5 → 半透明（visibility × 2）
 * - visibility <= 0.2 → 不绘制
 */

import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

// MediaPipe Pose Landmarker 33 个关键点的骨架连接线定义
// 索引对应 landmarks 数组中的下标
const SKELETON_CONNECTIONS: [number, number][] = [
  // 面部
  [0, 1], [1, 2], [2, 3], [3, 7], // 左眼
  [0, 4], [4, 5], [5, 6], [6, 8], // 右眼
  [9, 10], // 嘴

  // 肩部
  [11, 12],

  // 左臂
  [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19],
  // 右臂
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],

  // 躯干
  [11, 23], [12, 24], [23, 24],

  // 左腿
  [23, 25], [25, 27], [27, 29], [29, 31],
  // 右腿
  [24, 26], [26, 28], [28, 30], [30, 32],
];

/** 将 visibility 值映射为 Canvas globalAlpha */
function visibilityToAlpha(v: number): number {
  if (v >= 0.5) return 1.0;
  if (v > 0.2) return v * 2; // 0.3 → 0.6
  return 0;
}

/** 判断关键点是否可见（含低置信度保留帧） */
function isVisible(v: number): boolean {
  return v > 0.2;
}

/**
 * 在 Canvas 上绘制人体关键点和骨架连接线
 * @param ctx - Canvas 2D 渲染上下文
 * @param width - Canvas 宽度
 * @param height - Canvas 高度
 * @param landmarks - MediaPipe 检测到的关键点数组，为 null 时清空画布
 */
export function drawPose(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  landmarks: NormalizedLandmark[] | null
): void {
  // 清空画布
  ctx.clearRect(0, 0, width, height);

  if (!landmarks || landmarks.length === 0) return;

  const pointRadius = 5;

  // ---- 绘制骨架连接线 ----
  ctx.strokeStyle = "#00FF88";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";

  for (const [i, j] of SKELETON_CONNECTIONS) {
    const p1 = landmarks[i];
    const p2 = landmarks[j];
    if (!p1 || !p2) continue;

    const v1 = p1.visibility ?? 0;
    const v2 = p2.visibility ?? 0;
    const minVis = Math.min(v1, v2);

    if (!isVisible(minVis)) continue;

    ctx.globalAlpha = visibilityToAlpha(minVis);
    ctx.beginPath();
    ctx.moveTo(p1.x * width, p1.y * height);
    ctx.lineTo(p2.x * width, p2.y * height);
    ctx.stroke();
  }

  // ---- 绘制关键点 ----
  ctx.fillStyle = "#FF0055";

  for (let i = 0; i < landmarks.length; i++) {
    const lm = landmarks[i];
    const visibility = lm.visibility ?? 0;

    if (!isVisible(visibility)) continue;

    ctx.globalAlpha = visibilityToAlpha(visibility);
    ctx.beginPath();
    ctx.arc(lm.x * width, lm.y * height, pointRadius, 0, 2 * Math.PI);
    ctx.fill();
  }

  // 重置透明度（不影响后续绘制）
  ctx.globalAlpha = 1.0;
}

// ================================================================
// V2：杆体标记绘制
// ================================================================

/**
 * 在 Canvas 上绘制粉绿标记和杆体方向线
 *
 * 粉色 = 上端，绿色 = 下端
 *
 * @param pink   粉色标记归一化坐标，null 时不绘制
 * @param green  绿色标记归一化坐标，null 时不绘制
 * @param valid  是否识别有效（无效时只画半透明标记）
 */
export function drawStickMarkers(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  pink: { x: number; y: number } | null,
  green: { x: number; y: number } | null,
  valid: boolean
): void {
  const markerRadius = 8;
  const alpha = valid ? 1.0 : 0.4;

  // 绘制方向线
  if (pink && green) {
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "#FFD700";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(pink.x * width, pink.y * height);
    ctx.lineTo(green.x * width, green.y * height);
    ctx.stroke();
    ctx.globalAlpha = 1.0;
  }

  // 绘制粉色标记（上端）
  if (pink) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#FF69B4";
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(pink.x * width, pink.y * height, markerRadius, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();

    // 中心十字
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo((pink.x * width) - 4, pink.y * height);
    ctx.lineTo((pink.x * width) + 4, pink.y * height);
    ctx.moveTo(pink.x * width, (pink.y * height) - 4);
    ctx.lineTo(pink.x * width, (pink.y * height) + 4);
    ctx.stroke();
    ctx.globalAlpha = 1.0;
  }

  // 绘制绿色标记（下端）
  if (green) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#00CC66";
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(green.x * width, green.y * height, markerRadius, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();

    // 中心十字
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo((green.x * width) - 4, green.y * height);
    ctx.lineTo((green.x * width) + 4, green.y * height);
    ctx.moveTo(green.x * width, (green.y * height) - 4);
    ctx.lineTo(green.x * width, (green.y * height) + 4);
    ctx.stroke();
    ctx.globalAlpha = 1.0;
  }
}
