/**
 * 静态握桨姿势指标模块
 *
 * 职责：
 * 1. 计算左右手腕到杆体线段的最短距离（归一化为倍数肩宽）
 * 2. 维护滑动窗口检测运动稳定性
 * 3. 判定姿势可分析条件
 *
 * 原始 landmarks 用于计算，不修改已通过的粉绿标记识别逻辑。
 */

import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

// ================================================================
// 配置（待专项数据验证）
// ================================================================

export const POSTURE_CONFIG = {
  // ── 稳定性阈值（待实测调整）──
  /** 单个手腕在窗口内最大归一化位移 */
  maxWristMovement: 0.015,
  /** 杆体角度在窗口内最大波动（度） */
  maxStickAngleRange: 3,
  /** 身体侧倾角在窗口内最大波动（度） */
  maxLeanAngleRange: 3,
  /** 双手间距比在窗口内最大波动 */
  maxHandRatioRange: 0.08,

  // ── 手腕距杆体三级状态阈值（待专项数据验证）──
  /** <= 此值视为"靠近杆体" */
  closeToStick: 0.20,
  /** > 此值视为"偏离杆体"；中间为"接近边界" */
  boundaryStick: 0.35,

  // ── 杆体角度分析范围 ──
  /** 杆体 |角度| 超过此值视为超出分析范围 */
  maxStickAngle: 30,

  // ── 稳定性窗口 ──
  /** 稳定性检查时间窗口 (ms) */
  stabilityWindowMs: 500,
  /** 窗口内最少样本数（低于此数判定为不稳定） */
  minSamplesInWindow: 5,

  /** 有效关键点 visibility 阈值 */
  minVisibility: 0.5,
} as const;

// ================================================================
// 类型
// ================================================================

export interface WristStickResult {
  /** 左手腕到杆体线段距离 ÷ 肩宽 */
  leftRatio: number;
  /** 右手腕到杆体线段距离 ÷ 肩宽 */
  rightRatio: number;
  /** 左手状态描述 */
  leftStatus: "靠近杆体" | "接近边界" | "偏离杆体";
  /** 右手状态描述 */
  rightStatus: "靠近杆体" | "接近边界" | "偏离杆体";
}

/** 稳定性样本 */
interface StabilitySample {
  time: number;
  leftWristX: number;
  leftWristY: number;
  rightWristX: number;
  rightWristY: number;
  stickAngle: number;
  leanAngle: number;
  handRatio: number | null;
}

// ================================================================
// 工具函数
// ================================================================

function visibility(lm: NormalizedLandmark | undefined): number {
  return lm?.visibility ?? 0;
}

function isVisible(
  lm: NormalizedLandmark | undefined,
  threshold = POSTURE_CONFIG.minVisibility
): lm is NormalizedLandmark {
  return lm !== undefined && visibility(lm) >= threshold;
}

function getLm(
  landmarks: NormalizedLandmark[],
  idx: number
): NormalizedLandmark | undefined {
  return idx >= 0 && idx < landmarks.length ? landmarks[idx] : undefined;
}

// ================================================================
// 1. 点到线段最短距离
// ================================================================

/**
 * 计算点 P 到线段 AB 的最短距离（归一化坐标）
 *
 * 使用投影参数 t 将投影点限制在线段内：
 *   t = dot(P-A, B-A) / dot(B-A, B-A)
 *   t_clamped = clamp(t, 0, 1)
 *   Q = A + t_clamped * (B-A)
 *   distance = |P - Q|
 */
export function pointToSegmentDistance(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number
): number | null {
  const abx = bx - ax;
  const aby = by - ay;
  const abLenSq = abx * abx + aby * aby;

  if (abLenSq < 1e-8) return null; // 线段太短

  const apx = px - ax;
  const apy = py - ay;

  let t = (apx * abx + apy * aby) / abLenSq;
  t = Math.max(0, Math.min(1, t));

  const qx = ax + t * abx;
  const qy = ay + t * aby;

  const dx = px - qx;
  const dy = py - qy;
  return Math.sqrt(dx * dx + dy * dy);
}

// ================================================================
// 2. 手腕距杆体距离（归一化为倍数肩宽）
// ================================================================

function classifyDistance(ratio: number): WristStickResult[keyof WristStickResult] {
  if (ratio <= POSTURE_CONFIG.closeToStick) return "靠近杆体";
  if (ratio <= POSTURE_CONFIG.boundaryStick) return "接近边界";
  return "偏离杆体";
}

/**
 * 计算左右手腕到杆体线段距离（归一化后 ÷ 肩宽）
 *
 * @returns null 表示无法计算（关键点置信度不足）
 */
export function computeWristStickDistances(
  landmarks: NormalizedLandmark[],
  pinkX: number,
  pinkY: number,
  greenX: number,
  greenY: number
): WristStickResult | null {
  if (landmarks.length < 33) return null;

  const lw = getLm(landmarks, 15);
  const rw = getLm(landmarks, 16);
  const ls = getLm(landmarks, 11);
  const rs = getLm(landmarks, 12);

  if (!isVisible(lw) || !isVisible(rw) || !isVisible(ls) || !isVisible(rs)) {
    return null;
  }

  // 肩宽
  const swDx = ls.x - rs.x;
  const swDy = ls.y - rs.y;
  const shoulderWidth = Math.sqrt(swDx * swDx + swDy * swDy);
  if (shoulderWidth < 0.02) return null;

  // 左手腕到杆线
  const leftDist = pointToSegmentDistance(lw.x, lw.y, pinkX, pinkY, greenX, greenY);
  const rightDist = pointToSegmentDistance(rw.x, rw.y, pinkX, pinkY, greenX, greenY);

  if (leftDist === null || rightDist === null) return null;

  const leftRatio = leftDist / shoulderWidth;
  const rightRatio = rightDist / shoulderWidth;

  return {
    leftRatio: Number(leftRatio.toFixed(3)),
    rightRatio: Number(rightRatio.toFixed(3)),
    leftStatus: classifyDistance(leftRatio) as WristStickResult["leftStatus"],
    rightStatus: classifyDistance(rightRatio) as WristStickResult["rightStatus"],
  };
}

// ================================================================
// 3. 运动稳定性判断（滑动窗口）
// ================================================================

const history: StabilitySample[] = [];
const MAX_HISTORY = 60;

/** 向稳定性窗口添加一个样本 */
export function pushStabilitySample(sample: StabilitySample): void {
  history.push(sample);
  if (history.length > MAX_HISTORY) {
    history.shift();
  }
}

/** 检查过去 windowMs 内各指标是否稳定 */
export function checkStability(now: number): boolean {
  const cutoff = now - POSTURE_CONFIG.stabilityWindowMs;
  const recent = history.filter((s) => s.time >= cutoff);

  if (recent.length < POSTURE_CONFIG.minSamplesInWindow) return false;

  // 左手腕
  let lMinX = Infinity, lMaxX = -Infinity, lMinY = Infinity, lMaxY = -Infinity;
  // 右手腕
  let rMinX = Infinity, rMaxX = -Infinity, rMinY = Infinity, rMaxY = -Infinity;
  let stickMin = Infinity, stickMax = -Infinity;
  let leanMin = Infinity, leanMax = -Infinity;
  let ratioMin = Infinity, ratioMax = -Infinity;
  let ratioCount = 0;

  for (const s of recent) {
    if (s.leftWristX < lMinX) lMinX = s.leftWristX;
    if (s.leftWristX > lMaxX) lMaxX = s.leftWristX;
    if (s.leftWristY < lMinY) lMinY = s.leftWristY;
    if (s.leftWristY > lMaxY) lMaxY = s.leftWristY;

    if (s.rightWristX < rMinX) rMinX = s.rightWristX;
    if (s.rightWristX > rMaxX) rMaxX = s.rightWristX;
    if (s.rightWristY < rMinY) rMinY = s.rightWristY;
    if (s.rightWristY > rMaxY) rMaxY = s.rightWristY;

    if (s.stickAngle < stickMin) stickMin = s.stickAngle;
    if (s.stickAngle > stickMax) stickMax = s.stickAngle;

    if (s.leanAngle < leanMin) leanMin = s.leanAngle;
    if (s.leanAngle > leanMax) leanMax = s.leanAngle;

    if (s.handRatio !== null) {
      if (s.handRatio < ratioMin) ratioMin = s.handRatio;
      if (s.handRatio > ratioMax) ratioMax = s.handRatio;
      ratioCount++;
    }
  }

  const lMove = Math.sqrt((lMaxX - lMinX) ** 2 + (lMaxY - lMinY) ** 2);
  const rMove = Math.sqrt((rMaxX - rMinX) ** 2 + (rMaxY - rMinY) ** 2);
  const stickRange = stickMax - stickMin;
  const leanRange = leanMax - leanMin;

  if (lMove > POSTURE_CONFIG.maxWristMovement) return false;
  if (rMove > POSTURE_CONFIG.maxWristMovement) return false;
  if (stickRange > POSTURE_CONFIG.maxStickAngleRange) return false;
  if (leanRange > POSTURE_CONFIG.maxLeanAngleRange) return false;
  if (ratioCount >= 3 && ratioMax - ratioMin > POSTURE_CONFIG.maxHandRatioRange) return false;

  return true;
}

/** 清空稳定性历史 */
export function clearStabilityHistory(): void {
  history.length = 0;
}

// ================================================================
// 4. 姿势可分析条件
// ================================================================

/**
 * 判定静态姿势是否可分析
 *
 * @returns 可分析时返回 null，否则返回具体原因字符串
 */
export function getPostureBlockedReason(
  bodyStatus: string,
  stickStatus: string,
  landmarks: NormalizedLandmark[] | null,
  stickSignedDeg: number | null,
  wristResult: WristStickResult | null
): string | null {
  if (bodyStatus !== "人体完整入镜") return "请确保全身完整入镜";
  if (stickStatus !== "杆体识别正常") return "请将粉色上端和绿色下端完整放入画面";

  if (!landmarks || landmarks.length < 33) return "无法检测到人体关键点";

  const ls = getLm(landmarks, 11);
  const rs = getLm(landmarks, 12);
  const lw = getLm(landmarks, 15);
  const rw = getLm(landmarks, 16);

  if (!isVisible(ls) || !isVisible(rs) || !isVisible(lw) || !isVisible(rw)) {
    return "请双手握住杆体并保持片刻";
  }

  // 肩宽有效
  const sw = Math.sqrt((ls.x - rs.x) ** 2 + (ls.y - rs.y) ** 2);
  if (sw < 0.02) return "无法检测到有效肩宽";

  // 杆体角度不超出分析范围
  if (stickSignedDeg !== null && Math.abs(stickSignedDeg) >= POSTURE_CONFIG.maxStickAngle) {
    return "杆体角度超出当前分析范围";
  }

  // 手腕距杆体可计算
  if (!wristResult) return "无法计算手腕与杆体距离";

  return null;
}
