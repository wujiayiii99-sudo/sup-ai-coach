/**
 * V4.1 纯人体徒手划桨动作指标 — 单帧计算
 *
 * 所有函数为纯计算，不含状态、不含平滑、不含历史。
 * 仅使用原始 landmarks 和角色映射，不修改传入数据。
 * 每项指标独立标记有效性。
 */
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import type {
  StrokeRoles,
  StrokeSide,
  BodyStrokeMetrics,
  VisibilityReport,
  PerMetricValidity,
} from "./bodyStrokeTypes";
import { VISIBILITY } from "./bodyStrokeConfig";
import {
  computeSignedLeanDeg,
  computeHandSpanRatio as v1HandSpanRatio,
} from "../poseMetrics";

// ================================================================
// 常量
// ================================================================

/** 必检关键点下标 */
const L_SHOULDER = 11;
const R_SHOULDER = 12;
const L_ELBOW = 13;
const R_ELBOW = 14;
const L_WRIST = 15;
const R_WRIST = 16;
const L_HIP = 23;
const R_HIP = 24;
const L_KNEE = 25;
const R_KNEE = 26;
const L_ANKLE = 27;
const R_ANKLE = 28;

/** 可见度检查对象 — 在使用处直接引用下标 */

// ================================================================
// 内部工具
// ================================================================

function distance2D(
  ax: number, ay: number,
  bx: number, by: number,
): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

function getLm(
  landmarks: NormalizedLandmark[],
  idx: number,
): NormalizedLandmark | undefined {
  return idx >= 0 && idx < landmarks.length ? landmarks[idx] : undefined;
}

function isVisible(
  lm: NormalizedLandmark | undefined,
  threshold: number = VISIBILITY.required,
): lm is NormalizedLandmark {
  return lm !== undefined && (lm.visibility ?? 0) >= threshold;
}

/**
 * 计算关节内角（三点法）
 * v1 = proximal → joint（指向关节）
 * v2 = distal  → joint（指向关节）
 * 返回值：0-180°，180=完全伸展
 */
function computeJointAngle(
  jointX: number, jointY: number,
  proximalX: number, proximalY: number,
  distalX: number, distalY: number,
): number | null {
  const v1x = jointX - proximalX;
  const v1y = jointY - proximalY;
  const v2x = jointX - distalX;
  const v2y = jointY - distalY;

  const len1 = Math.sqrt(v1x * v1x + v1y * v1y);
  const len2 = Math.sqrt(v2x * v2x + v2y * v2y);
  if (len1 < 1e-6 || len2 < 1e-6) return null;

  const cross = v1x * v2y - v1y * v2x;
  const dot = v1x * v2x + v1y * v2y;
  return Math.atan2(Math.abs(cross), dot) * (180 / Math.PI);
}

/**
 * 将线段角度归一化到 [-90°, 90°]
 * 线段无方向性：+100° ≡ −80°（翻转）
 */
function normalizeLineAngle(deg: number): number {
  let norm = deg % 180;
  if (norm > 90) norm -= 180;
  if (norm < -90) norm += 180;
  return norm;
}

// ================================================================
// M01 — 左右肘角
// ================================================================

function computeElbowAngle(
  landmarks: NormalizedLandmark[],
  side: "left" | "right",
): number | null {
  const [shoulder, elbow, wrist] = side === "left"
    ? [getLm(landmarks, L_SHOULDER), getLm(landmarks, L_ELBOW), getLm(landmarks, L_WRIST)]
    : [getLm(landmarks, R_SHOULDER), getLm(landmarks, R_ELBOW), getLm(landmarks, R_WRIST)];

  if (!shoulder || !elbow || !wrist) return null;
  if (!isVisible(shoulder) || !isVisible(elbow) || !isVisible(wrist, VISIBILITY.wrist)) return null;

  return computeJointAngle(elbow.x, elbow.y, shoulder.x, shoulder.y, wrist.x, wrist.y);
}

// ================================================================
// M02 — 左右膝角
// ================================================================

function computeKneeAngle(
  landmarks: NormalizedLandmark[],
  side: "left" | "right",
): number | null {
  const [hip, knee, ankle] = side === "left"
    ? [getLm(landmarks, L_HIP), getLm(landmarks, L_KNEE), getLm(landmarks, L_ANKLE)]
    : [getLm(landmarks, R_HIP), getLm(landmarks, R_KNEE), getLm(landmarks, R_ANKLE)];

  if (!hip || !knee || !ankle) return null;
  if (!isVisible(hip) || !isVisible(knee) || !isVisible(ankle)) return null;

  return computeJointAngle(knee.x, knee.y, hip.x, hip.y, ankle.x, ankle.y);
}

// ================================================================
// M03 — 躯干投影侧倾（复用 V1）
// ================================================================

/** 使用 V1 函数计算有符号侧倾角 */
function computeTorsoLeanDeg(landmarks: NormalizedLandmark[] | null): number | null {
  return computeSignedLeanDeg(landmarks);
}

// ================================================================
// M04 — 肩线角度
// ================================================================

function computeShoulderLineAngleDeg(landmarks: NormalizedLandmark[]): number | null {
  const ls = getLm(landmarks, L_SHOULDER);
  const rs = getLm(landmarks, R_SHOULDER);
  if (!isVisible(ls) || !isVisible(rs)) return null;

  const raw = Math.atan2(ls.y - rs.y, ls.x - rs.x) * (180 / Math.PI);
  return normalizeLineAngle(raw);
}

// ================================================================
// M05 — 髋线角度
// ================================================================

function computeHipLineAngleDeg(landmarks: NormalizedLandmark[]): number | null {
  const lh = getLm(landmarks, L_HIP);
  const rh = getLm(landmarks, R_HIP);
  if (!isVisible(lh) || !isVisible(rh)) return null;

  const raw = Math.atan2(lh.y - rh.y, lh.x - rh.x) * (180 / Math.PI);
  return normalizeLineAngle(raw);
}

// ================================================================
// M06 — 肩髋投影角差
// ================================================================

function computeShoulderHipDiff(
  shoulderDeg: number | null,
  hipDeg: number | null,
): number | null {
  if (shoulderDeg === null || hipDeg === null) return null;
  // 注意：[-90,90] 归一化后两个值可直接相减
  return shoulderDeg - hipDeg;
}

// ================================================================
// M07 — 双手间距/肩宽比（复用 V1）
// ================================================================

function computeHandSpanRatio(landmarks: NormalizedLandmark[] | null): number | null {
  const result = v1HandSpanRatio(landmarks);
  return result !== null ? result.ratio : null;
}

// ================================================================
// M08 — 上下手垂直偏移/肩宽
// ================================================================

function computeTopPowerVerticalOffset(
  landmarks: NormalizedLandmark[],
  roles: StrokeRoles,
  shWidth: number,
): number | null {
  if (shWidth < 0.02) return null;
  const top = getLm(landmarks, roles.topWristIdx);
  const pwr = getLm(landmarks, roles.powerWristIdx);
  if (!isVisible(top, VISIBILITY.wrist) || !isVisible(pwr, VISIBILITY.wrist)) return null;

  return Math.abs(top.y - pwr.y) / shWidth;
}

// ================================================================
// M09 — 下手相对工作侧肩的二维位置
// ================================================================

function computePowerWristRelShoulder(
  landmarks: NormalizedLandmark[],
  roles: StrokeRoles,
  shWidth: number,
): { x: number | null; y: number | null } {
  if (shWidth < 0.02) return { x: null, y: null };
  const pwr = getLm(landmarks, roles.powerWristIdx);
  const sh = getLm(landmarks, roles.powerShoulderIdx);
  if (!isVisible(pwr, VISIBILITY.wrist) || !isVisible(sh)) return { x: null, y: null };

  return {
    x: (pwr.x - sh.x) / shWidth,
    y: (pwr.y - sh.y) / shWidth,
  };
}

// ================================================================
// M10 — 下手相对工作侧髋的二维位置
// ================================================================

function computePowerWristRelHip(
  landmarks: NormalizedLandmark[],
  roles: StrokeRoles,
  shWidth: number,
): { x: number | null; y: number | null } {
  if (shWidth < 0.02) return { x: null, y: null };
  const pwr = getLm(landmarks, roles.powerWristIdx);
  const hip = getLm(landmarks, roles.workingHipIdx);
  if (!isVisible(pwr, VISIBILITY.wrist) || !isVisible(hip)) return { x: null, y: null };

  return {
    x: (pwr.x - hip.x) / shWidth,
    y: (pwr.y - hip.y) / shWidth,
  };
}

// ================================================================
// M18 — 左右肩高度差
// ================================================================

function computeShoulderHeightDiff(
  landmarks: NormalizedLandmark[],
  shWidth: number,
): number | null {
  if (shWidth < 0.02) return null;
  const ls = getLm(landmarks, L_SHOULDER);
  const rs = getLm(landmarks, R_SHOULDER);
  if (!isVisible(ls) || !isVisible(rs)) return null;
  return (ls.y - rs.y) / shWidth;
}

// ================================================================
// M16 辅助 — 身体中心 Y
// ================================================================

function computeBodyCenterY(landmarks: NormalizedLandmark[]): number | null {
  const ls = getLm(landmarks, L_SHOULDER);
  const rs = getLm(landmarks, R_SHOULDER);
  const lh = getLm(landmarks, L_HIP);
  const rh = getLm(landmarks, R_HIP);
  if (!isVisible(ls) || !isVisible(rs) || !isVisible(lh) || !isVisible(rh)) return null;

  const shMidY = (ls.y + rs.y) / 2;
  const hipMidY = (lh.y + rh.y) / 2;
  return (shMidY + hipMidY) / 2;
}

// ================================================================
// M19 — 关键点可见度
// ================================================================

function computeVisibility(landmarks: NormalizedLandmark[]): VisibilityReport {
  const get = (idx: number): number => getLm(landmarks, idx)?.visibility ?? 0;
  return {
    leftShoulder:  get(L_SHOULDER),
    rightShoulder: get(R_SHOULDER),
    leftElbow:     get(L_ELBOW),
    rightElbow:    get(R_ELBOW),
    leftWrist:     get(L_WRIST),
    rightWrist:    get(R_WRIST),
    leftHip:       get(L_HIP),
    rightHip:      get(R_HIP),
    leftKnee:      get(L_KNEE),
    rightKnee:     get(R_KNEE),
    leftAnkle:     get(L_ANKLE),
    rightAnkle:    get(R_ANKLE),
  };
}

// ================================================================
// 肩宽
// ================================================================

function computeShoulderWidth(landmarks: NormalizedLandmark[]): number | null {
  const ls = getLm(landmarks, L_SHOULDER);
  const rs = getLm(landmarks, R_SHOULDER);
  if (!isVisible(ls) || !isVisible(rs)) return null;
  const w = distance2D(ls.x, ls.y, rs.x, rs.y);
  return w >= 0.02 ? w : null;
}

// ================================================================
// 自动侧推断（仅调试）
// ================================================================

function computeInferredSide(
  landmarks: NormalizedLandmark[],
  shWidth: number,
): { inferredSide: "left" | "right" | "unknown"; confidence: number } {
  const lw = getLm(landmarks, L_WRIST);
  const rw = getLm(landmarks, R_WRIST);
  const ls = getLm(landmarks, L_SHOULDER);
  const rs = getLm(landmarks, R_SHOULDER);
  if (!isVisible(lw, VISIBILITY.wrist) || !isVisible(rw, VISIBILITY.wrist) ||
      !isVisible(ls) || !isVisible(rs) || shWidth < 0.02) {
    return { inferredSide: "unknown", confidence: 0 };
  }

  // 上手（top hand）特征：手腕 Y 更小（图像中更高）
  // 划右侧：右手更靠下（下手），左手更靠上（上手）
  // 划左侧：左手更靠下（下手），右手更靠上（上手）
  const leftStretchY = (lw.y - ls.y) / shWidth;
  const rightStretchY = (rw.y - rs.y) / shWidth;
  const asymmetry = rightStretchY - leftStretchY;
  // asymmetry > 0  → 右手比左手更靠下 → 右手是下手 → 划右侧
  // asymmetry < 0  → 左手比右手更靠下 → 左手是下手 → 划左侧

  const confidence = Math.min(Math.abs(asymmetry) * 1.5, 1.0);
  if (asymmetry > 0.3) return { inferredSide: "right", confidence };
  if (asymmetry < -0.3) return { inferredSide: "left", confidence };
  return { inferredSide: "unknown", confidence };
}

// ================================================================
// M20 — 各指标有效性
// ================================================================

function computeValidity(
  landmarks: NormalizedLandmark[],
  shWidth: number | null,
): PerMetricValidity {
  const v = (idx: number, thr: number = VISIBILITY.required) => {
    const lm = getLm(landmarks, idx);
    return lm !== undefined && (lm.visibility ?? 0) >= thr;
  };
  const swOk = shWidth !== null && shWidth >= 0.02;

  return {
    elbowAngleLeft:        v(L_SHOULDER) && v(L_ELBOW) && v(L_WRIST, VISIBILITY.wrist),
    elbowAngleRight:       v(R_SHOULDER) && v(R_ELBOW) && v(R_WRIST, VISIBILITY.wrist),
    kneeAngleLeft:         v(L_HIP) && v(L_KNEE) && v(L_ANKLE),
    kneeAngleRight:        v(R_HIP) && v(R_KNEE) && v(R_ANKLE),
    torsoLean:             v(L_SHOULDER) && v(R_SHOULDER) && v(L_HIP) && v(R_HIP),
    shoulderLineAngle:     v(L_SHOULDER) && v(R_SHOULDER),
    hipLineAngle:          v(L_HIP) && v(R_HIP),
    shoulderHipProjectedDiff: v(L_SHOULDER) && v(R_SHOULDER) && v(L_HIP) && v(R_HIP),
    handSpanRatio:         swOk && v(L_WRIST, VISIBILITY.wrist) && v(R_WRIST, VISIBILITY.wrist) && v(L_SHOULDER) && v(R_SHOULDER),
    topPowerVertOffset:    swOk,
    powerWristRelShoulderX: swOk,
    powerWristRelShoulderY: swOk,
    powerWristRelHipX:     swOk,
    powerWristRelHipY:     swOk,
    // 以下由 tracker 动态判定，此处默认为 false，由 tracker 覆盖
    powerWristRelHorizVel:       false,
    powerWristRelVertVel:        false,
    powerWristRelCompositeSpeed: false,
    powerWristRelDirection:      false,
    handSpanVelocity:            false,
    bodyCenterDisplacement:      false,
    bodyCenterVelocity:          false,
    shoulderHeightDiff:    swOk && v(L_SHOULDER) && v(R_SHOULDER),
  };
}

// ================================================================
// 主聚合函数
// ================================================================

/**
 * 单帧计算所有 V4.1 指标
 *
 * @param landmarks  - MediaPipe 原始关键点（33 点或 null）
 * @param roles      - 由用户选择的划桨侧决定
 * @param timestamp  - performance.now()
 * @param frameTime  - video.currentTime
 * @param prevMetrics - 上一帧指标（用于 dt 和 inferred side 的历史参考，可传 null）
 * @returns 完整的 BodyStrokeMetrics，所有指标均为原始值（未平滑）
 */
export function computeStrokeMetrics(
  landmarks: NormalizedLandmark[] | null,
  roles: StrokeRoles,
  timestamp: number,
  frameTime: number,
  prevTimestamp: number,
): BodyStrokeMetrics {
  // 默认空结构
  const now = timestamp;

  // ── 无检测 → 全 null ──
  if (!landmarks || landmarks.length < 33) {
    return createEmptyMetrics(roles.selectedSide, now, frameTime, now - prevTimestamp);
  }

  const shWidth = computeShoulderWidth(landmarks);

  // ── 各项指标独立计算 ──
  const elbowL = computeElbowAngle(landmarks, "left");
  const elbowR = computeElbowAngle(landmarks, "right");
  const kneeL = computeKneeAngle(landmarks, "left");
  const kneeR = computeKneeAngle(landmarks, "right");
  const shoulderDeg = computeShoulderLineAngleDeg(landmarks);
  const hipDeg = computeHipLineAngleDeg(landmarks);
  const shoulderHipDiff = computeShoulderHipDiff(shoulderDeg, hipDeg);
  const torsoLean = computeTorsoLeanDeg(landmarks);
  const handRatio = computeHandSpanRatio(landmarks);
  const topVertOff = shWidth !== null ? computeTopPowerVerticalOffset(landmarks, roles, shWidth) : null;
  const pwrRelSh = shWidth !== null ? computePowerWristRelShoulder(landmarks, roles, shWidth) : { x: null, y: null };
  const pwrRelHip = shWidth !== null ? computePowerWristRelHip(landmarks, roles, shWidth) : { x: null, y: null };
  const shHeightDiff = shWidth !== null ? computeShoulderHeightDiff(landmarks, shWidth) : null;
  const bodyCenterY = computeBodyCenterY(landmarks);
  const visibility = computeVisibility(landmarks);
  const { inferredSide, confidence } = shWidth !== null
    ? computeInferredSide(landmarks, shWidth)
    : { inferredSide: "unknown" as const, confidence: 0 };

  return {
    selectedSide: roles.selectedSide,
    inferredSide,
    inferredSideConfidence: Number(confidence.toFixed(3)),

    elbowAngleDeg: { left: elbowL, right: elbowR },
    kneeAngleDeg: { left: kneeL, right: kneeR },
    torsoLeanDeg: torsoLean,
    shoulderLineAngleDeg: shoulderDeg,
    hipLineAngleDeg: hipDeg,
    shoulderHipProjectedAngleDiffDeg: shoulderHipDiff,

    handSpanRatio: handRatio,
    topPowerVerticalOffsetRatio: topVertOff,
    powerWristRelShoulder: { x: pwrRelSh.x, y: pwrRelSh.y },
    powerWristRelHip: { x: pwrRelHip.x, y: pwrRelHip.y },
    shoulderHeightDiff: shHeightDiff,

    // 速度由 tracker 填充
    powerWristRelativeHorizontalVelocity: null,
    powerWristRelativeVerticalVelocity: null,
    powerWristRelativeCompositeSpeed: null,
    powerWristRelativeDirectionDeg: null,
    handSpanVelocity: null,
    bodyCenterVerticalDisplacement: null,
    bodyCenterVerticalVelocity: null,

    bodyCenterY,
    visibility,
    validity: computeValidity(landmarks, shWidth),

    timestamp: now,
    frameTime,
    deltaTimeMs: now - prevTimestamp,
  };
}

// ================================================================
// 辅助
// ================================================================

function createEmptyMetrics(
  side: StrokeSide,
  timestamp: number,
  frameTime: number,
  dt: number,
): BodyStrokeMetrics {
  const zeroVis: VisibilityReport = {
    leftShoulder: 0, rightShoulder: 0,
    leftElbow: 0, rightElbow: 0,
    leftWrist: 0, rightWrist: 0,
    leftHip: 0, rightHip: 0,
    leftKnee: 0, rightKnee: 0,
    leftAnkle: 0, rightAnkle: 0,
  };
  const falseValidity: PerMetricValidity = {
    elbowAngleLeft: false, elbowAngleRight: false,
    kneeAngleLeft: false, kneeAngleRight: false,
    torsoLean: false,
    shoulderLineAngle: false, hipLineAngle: false,
    shoulderHipProjectedDiff: false,
    handSpanRatio: false,
    topPowerVertOffset: false,
    powerWristRelShoulderX: false, powerWristRelShoulderY: false,
    powerWristRelHipX: false, powerWristRelHipY: false,
    powerWristRelHorizVel: false, powerWristRelVertVel: false,
    powerWristRelCompositeSpeed: false, powerWristRelDirection: false,
    handSpanVelocity: false,
    bodyCenterDisplacement: false, bodyCenterVelocity: false,
    shoulderHeightDiff: false,
  };
  return {
    selectedSide: side,
    inferredSide: "unknown",
    inferredSideConfidence: 0,
    elbowAngleDeg: { left: null, right: null },
    kneeAngleDeg: { left: null, right: null },
    torsoLeanDeg: null,
    shoulderLineAngleDeg: null,
    hipLineAngleDeg: null,
    shoulderHipProjectedAngleDiffDeg: null,
    handSpanRatio: null,
    topPowerVerticalOffsetRatio: null,
    powerWristRelShoulder: { x: null, y: null },
    powerWristRelHip: { x: null, y: null },
    shoulderHeightDiff: null,
    powerWristRelativeHorizontalVelocity: null,
    powerWristRelativeVerticalVelocity: null,
    powerWristRelativeCompositeSpeed: null,
    powerWristRelativeDirectionDeg: null,
    handSpanVelocity: null,
    bodyCenterY: null,
    bodyCenterVerticalDisplacement: null,
    bodyCenterVerticalVelocity: null,
    visibility: zeroVis,
    validity: falseValidity,
    timestamp,
    frameTime,
    deltaTimeMs: dt,
  };
}
