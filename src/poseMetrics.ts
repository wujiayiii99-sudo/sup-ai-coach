/**
 * 基础人体指标计算模块
 *
 * 基于原始 landmarks 计算三个 V1 指标：
 * 1. 人体完整入镜状态
 * 2. 身体左右侧倾角
 * 3. 双手间距与肩宽比
 *
 * 仅使用原始 landmarks，避免受平滑绘制数据影响。
 * 镜像方向转换在此模块内完成，不在 App.tsx 中分散处理。
 */

import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

// ================================================================
// 配置
// ================================================================

/**
 * 画面是否进行了水平镜像（与 CSS scaleX(-1) 保持一致）。
 * 前置摄像头使用时通常为 true，用户看到的是镜像画面。
 * 身体侧倾方向会根据此配置自动转换。
 */
export const IS_DISPLAY_MIRRORED = true;

/** 距离画面边缘的归一化阈值，小于此值视为靠近边缘 */
const EDGE_MARGIN = 0.05;

/** 有效关键点的最小 visibility */
const VISIBILITY_THRESHOLD = 0.5;

// ================================================================
// 关键点下标常量
// ================================================================

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
const L_HEEL = 29;
const R_HEEL = 30;
const L_FOOT_INDEX = 31;
const R_FOOT_INDEX = 32;
const NOSE = 0;

// 分组：用于人体完整性检查
const TORSO_CORE = [L_SHOULDER, R_SHOULDER, L_HIP, R_HIP];
const LEFT_ARM_GROUP = [L_SHOULDER, L_ELBOW, L_WRIST];
const RIGHT_ARM_GROUP = [R_SHOULDER, R_ELBOW, R_WRIST];
// FEET_GROUP 在 feetOk 闭包中使用内联判断

// 12 个必检关键点
const ALL_REQUIRED = [
  L_SHOULDER, R_SHOULDER,
  L_ELBOW, R_ELBOW,
  L_WRIST, R_WRIST,
  L_HIP, R_HIP,
  L_KNEE, R_KNEE,
  L_ANKLE, R_ANKLE,
];

// ================================================================
// 内部工具
// ================================================================

/** 检查关键点是否可见（类型守卫，帮助 TypeScript 排除 undefined） */
function isVisible(lm: NormalizedLandmark | undefined): lm is NormalizedLandmark {
  return lm !== undefined && (lm.visibility ?? 0) >= VISIBILITY_THRESHOLD;
}

/** 检查关键点是否靠近画面边缘 */
function isNearEdge(lm: NormalizedLandmark): boolean {
  return (
    lm.x < EDGE_MARGIN ||
    lm.x > 1 - EDGE_MARGIN ||
    lm.y < EDGE_MARGIN ||
    lm.y > 1 - EDGE_MARGIN
  );
}

/** 获取关键点，下标越界时返回 undefined */
function getLm(
  landmarks: NormalizedLandmark[],
  idx: number
): NormalizedLandmark | undefined {
  return idx >= 0 && idx < landmarks.length ? landmarks[idx] : undefined;
}

/** 计算两点之间的二维欧氏距离（归一化坐标） */
function distance2D(
  a: NormalizedLandmark,
  b: NormalizedLandmark
): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// ================================================================
// 1. 人体完整入镜
// ================================================================

export type BodyStatus =
  | "人体完整入镜"
  | "请后退，确保头部和双脚完整入镜"
  | "左手未完整入镜"
  | "右手未完整入镜"
  | "双脚未完整入镜"
  | "人体识别不稳定";

/**
 * 检查人体是否完整入镜
 *
 * 分组优先级：
 * 1. 躯干核心或整体关键点严重缺失 → 人体识别不稳定
 * 2. 头部或脚部靠近边缘 → 请后退
 * 3. 左臂关键点缺失或左腕越界 → 左手未完整入镜
 * 4. 右臂关键点缺失或右腕越界 → 右手未完整入镜
 * 5. 双脚关键点缺失或越界 → 双脚未完整入镜
 * 6. 全部满足 → 人体完整入镜
 */
export function computeBodyStatus(
  landmarks: NormalizedLandmark[] | null
): BodyStatus {
  if (!landmarks || landmarks.length < 33) {
    return "人体识别不稳定";
  }

  // 统计 12 个必检关键点的可见数量
  const visibleCount = ALL_REQUIRED.filter((idx) =>
    isVisible(getLm(landmarks, idx))
  ).length;

  // 躯干核心（双肩 + 双髋）必须可见
  const torsoVisible = TORSO_CORE.every((idx) =>
    isVisible(getLm(landmarks, idx))
  );

  // ---- 优先级 1：整体不稳定 ----
  if (!torsoVisible || visibleCount < 8) {
    return "人体识别不稳定";
  }

  // ---- 优先级 2：头部或脚部靠近边缘 ----
  const headLm = getLm(landmarks, NOSE);
  const headAtEdge = headLm && isVisible(headLm) && isNearEdge(headLm);

  // 检查脚部关键点是否靠近边缘（优先用脚跟/脚尖，回退到脚踝）
  const feetAtEdge = [L_HEEL, R_HEEL, L_FOOT_INDEX, R_FOOT_INDEX].some((idx) => {
    const lm = getLm(landmarks, idx);
    return lm && isVisible(lm) && isNearEdge(lm);
  }) || [L_ANKLE, R_ANKLE].some((idx) => {
    const lm = getLm(landmarks, idx);
    return lm && isVisible(lm) && isNearEdge(lm);
  });

  if (headAtEdge || feetAtEdge) {
    return "请后退，确保头部和双脚完整入镜";
  }

  // ---- 优先级 3：左手 ----
  const leftArmOk = LEFT_ARM_GROUP.every((idx) => isVisible(getLm(landmarks, idx)));
  const leftWristAtEdge = (() => {
    const lm = getLm(landmarks, L_WRIST);
    return lm && isVisible(lm) && isNearEdge(lm);
  })();
  if (!leftArmOk || leftWristAtEdge) {
    return "左手未完整入镜";
  }

  // ---- 优先级 4：右手 ----
  const rightArmOk = RIGHT_ARM_GROUP.every((idx) => isVisible(getLm(landmarks, idx)));
  const rightWristAtEdge = (() => {
    const lm = getLm(landmarks, R_WRIST);
    return lm && isVisible(lm) && isNearEdge(lm);
  })();
  if (!rightArmOk || rightWristAtEdge) {
    return "右手未完整入镜";
  }

  // ---- 优先级 5：双脚 ----
  const feetOk = (() => {
    // 优先用脚跟和脚尖判断
    const hasHeelOrToe = [L_HEEL, R_HEEL, L_FOOT_INDEX, R_FOOT_INDEX].some(
      (idx) => isVisible(getLm(landmarks, idx))
    );
    if (hasHeelOrToe) {
      return [L_HEEL, R_HEEL, L_FOOT_INDEX, R_FOOT_INDEX].every(
        (idx) => {
          const lm = getLm(landmarks, idx);
          return !lm || !isVisible(lm) || !isNearEdge(lm);
        }
      );
    }
    // 回退到脚踝
    return [L_ANKLE, R_ANKLE].every((idx) => {
      const lm = getLm(landmarks, idx);
      return lm && isVisible(lm) && !isNearEdge(lm);
    });
  })();
  if (!feetOk) {
    return "双脚未完整入镜";
  }

  // ---- 优先级 6：全部通过 ----
  return "人体完整入镜";
}

// ================================================================
// 2. 身体左右侧倾角
// ================================================================

export interface LeanResult {
  /** 侧倾角绝对值（度） */
  angleDeg: number;
  /** 方向描述 */
  direction: "基本垂直" | "向左侧倾" | "向右侧倾";
  /** 程度描述 */
  level: "" | "轻微" | "明显";
}

/**
 * 计算画面坐标系中的有符号侧倾角（供平滑器使用）
 *
 * 返回镜像校正后的有符号角度：
 *   正值 → 用户在屏幕中向左侧倾
 *   负值 → 用户在屏幕中向右侧倾
 *   null → 无法计算
 *
 * @internal
 */
function computeDisplaySignedDeg(
  landmarks: NormalizedLandmark[] | null
): number | null {
  if (!landmarks || landmarks.length < 33) return null;

  const ls = getLm(landmarks, L_SHOULDER);
  const rs = getLm(landmarks, R_SHOULDER);
  const lh = getLm(landmarks, L_HIP);
  const rh = getLm(landmarks, R_HIP);

  if (!isVisible(ls) || !isVisible(rs) || !isVisible(lh) || !isVisible(rh)) {
    return null;
  }

  // 非空断言：以上 isVisible 检查保证四个关键点均存在
  const shoulderMidX = (ls.x + rs.x) / 2;
  const shoulderMidY = (ls.y + rs.y) / 2;
  const hipMidX = (lh.x + rh.x) / 2;
  const hipMidY = (lh.y + rh.y) / 2;

  const axisX = shoulderMidX - hipMidX;
  const axisY = shoulderMidY - hipMidY;

  const axisLen = Math.sqrt(axisX * axisX + axisY * axisY);
  if (axisLen < 0.005) return null;

  // angle = atan2(cross(axis, vertical), dot(axis, vertical))
  // vertical = (0, -1)
  const crossZ = -axisX;
  const dot = -axisY;

  const rawAngleDeg = Math.atan2(crossZ, dot) * (180 / Math.PI);

  // 镜像画面中视觉方向与 landmark 坐标系相反
  return IS_DISPLAY_MIRRORED ? -rawAngleDeg : rawAngleDeg;
}

/**
 * 将有符号侧倾角转换为显示格式
 *
 * 阈值说明（待专项数据验证）：
 * - < 5°  ：基本垂直
 * - 5°~10°：轻微侧倾
 * - > 10° ：明显侧倾
 */
export function formatLeanAngle(signedDeg: number): LeanResult {
  const absAngle = Math.abs(signedDeg);

  let direction: LeanResult["direction"];
  let level: LeanResult["level"];

  if (absAngle < 5) {
    direction = "基本垂直";
    level = "";
  } else if (absAngle < 10) {
    // 待专项数据验证：5°~10° 轻微侧倾阈值
    direction = signedDeg > 0 ? "向左侧倾" : "向右侧倾";
    level = "轻微";
  } else {
    // 待专项数据验证：> 10° 明显侧倾阈值
    direction = signedDeg > 0 ? "向左侧倾" : "向右侧倾";
    level = "明显";
  }

  return {
    angleDeg: Number(absAngle.toFixed(1)),
    direction,
    level,
  };
}

/**
 * 计算身体左右侧倾角（显示格式）
 *
 * 方法：连接双髋中点与双肩中点，计算身体中轴与画面垂直方向的夹角。
 * 方向已根据 IS_DISPLAY_MIRRORED 校正。
 */
export function computeLeanAngle(
  landmarks: NormalizedLandmark[] | null
): LeanResult | null {
  const signed = computeDisplaySignedDeg(landmarks);
  if (signed === null) return null;
  return formatLeanAngle(signed);
}

/**
 * 计算有符号侧倾角（供 metricStabilizer 平滑使用）
 *
 * 正值 → 屏幕中向左侧倾
 * 负值 → 屏幕中向右侧倾
 * null → 无法计算
 */
export function computeSignedLeanDeg(
  landmarks: NormalizedLandmark[] | null
): number | null {
  return computeDisplaySignedDeg(landmarks);
}

// ================================================================
// 3. 双手间距与肩宽比
// ================================================================

export interface HandSpanResult {
  /** 双手间距 ÷ 肩宽 */
  ratio: number;
}

/**
 * 计算双手间距与肩宽的比值
 *
 * 公式：||左腕 - 右腕||₂ / ||左肩 - 右肩||₂
 * 使用归一化坐标，不受设备分辨率影响。
 *
 * @returns 比值对象，关键点置信度不足或肩宽过小时返回 null
 */
export function computeHandSpanRatio(
  landmarks: NormalizedLandmark[] | null
): HandSpanResult | null {
  if (!landmarks || landmarks.length < 33) return null;

  const lw = getLm(landmarks, L_WRIST);
  const rw = getLm(landmarks, R_WRIST);
  const ls = getLm(landmarks, L_SHOULDER);
  const rs = getLm(landmarks, R_SHOULDER);

  if (!isVisible(lw) || !isVisible(rw) || !isVisible(ls) || !isVisible(rs)) {
    return null;
  }

  const wristDist = distance2D(lw, rw);
  const shoulderWidth = distance2D(ls, rs);

  // 肩宽过小时数据不可靠
  if (shoulderWidth < 0.05) return null;

  const ratio = wristDist / shoulderWidth;

  return {
    ratio: Number(ratio.toFixed(2)),
  };
}
