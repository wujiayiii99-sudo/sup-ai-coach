/**
 * V4.1 划桨侧 → 角色映射
 *
 * 固定语义，不随 CSS 镜像改变人体左右身份。
 * 用户选择决定角色，自动推断仅用于调试显示。
 */
import type { StrokeSide, StrokeRoles } from "./bodyStrokeTypes";

// MediaPipe Pose landmark indices
const L_SHOULDER = 11;
const R_SHOULDER = 12;
const L_ELBOW = 13;
const R_ELBOW = 14;
const L_WRIST = 15;
const R_WRIST = 16;
const L_HIP = 23;
const R_HIP = 24;

const ROLES_MAP: Record<StrokeSide, StrokeRoles> = {
  right: {
    selectedSide: "right",
    topHand: "left",
    powerHand: "right",
    workingHip: "right",
    // 划右侧：左手在上（握桨柄），右手在下（拉桨）
    topWristIdx: L_WRIST,
    powerWristIdx: R_WRIST,
    topElbowIdx: L_ELBOW,
    powerElbowIdx: R_ELBOW,
    topShoulderIdx: L_SHOULDER,
    powerShoulderIdx: R_SHOULDER,
    workingHipIdx: R_HIP,
  },
  left: {
    selectedSide: "left",
    topHand: "right",
    powerHand: "left",
    workingHip: "left",
    // 划左侧：右手在上（握桨柄），左手在下（拉桨）
    topWristIdx: R_WRIST,
    powerWristIdx: L_WRIST,
    topElbowIdx: R_ELBOW,
    powerElbowIdx: L_ELBOW,
    topShoulderIdx: R_SHOULDER,
    powerShoulderIdx: L_SHOULDER,
    workingHipIdx: L_HIP,
  },
};

/** 根据用户选择的划桨侧获取角色映射 */
export function getStrokeRoles(side: StrokeSide): StrokeRoles {
  return ROLES_MAP[side];
}
