/**
 * 功能开关
 *
 * V4 默认关闭 V2（杆体检测）和 V3（静态握桨姿势）的功能执行和 UI 显示。
 * 文件保留，不删除。
 */
export const FEATURE_FLAGS = {
  /** V2 粉绿标记杆体检测 */
  V2_STICK_DETECTION: false,
  /** V3 静态握桨姿势评价 */
  V3_POSTURE_ANALYSIS: false,
  /** V4.1 纯人体动作指标 */
  V4_STROKE_ANALYSIS: true,
} as const;
