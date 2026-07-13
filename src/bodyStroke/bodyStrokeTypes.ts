/**
 * V4.1 纯人体徒手划桨动作指标 — 类型定义
 *
 * 所有位置和距离均使用 MediaPipe 归一化坐标 [0,1]。
 * 归一化单位使用"倍肩宽"（dimensionless）。
 * 速度单位为"倍肩宽/秒"。
 */

// ================================================================
// 划桨侧
// ================================================================

/** 用户选择的划桨侧 */
export type StrokeSide = "left" | "right";

/** 系统自动推断的划桨侧 */
export type InferredSide = "left" | "right" | "unknown" | "transition";

// ================================================================
// 可靠性
// ================================================================

export type ReliabilityGrade = "high" | "medium" | "low";

export interface MetricReliability {
  reliability: ReliabilityGrade;
  interpretation: string;
  limitations: string[];
}

// ================================================================
// 角色映射
// ================================================================

export interface StrokeRoles {
  selectedSide: StrokeSide;
  /** 上手（握桨柄顶端） */
  topHand: "left" | "right";
  /** 下手/工作手（握桨杆中部） */
  powerHand: "left" | "right";
  /** 工作侧髋 */
  workingHip: "left" | "right";

  // ── Landmark 下标（MediaPipe Pose 33 点）──
  topWristIdx: number;
  powerWristIdx: number;
  topElbowIdx: number;
  powerElbowIdx: number;
  topShoulderIdx: number;
  powerShoulderIdx: number;
  workingHipIdx: number;
}

// ================================================================
// 校准状态
// ================================================================

export type CalibrationStatus =
  | "uncalibrated"
  | { phase: "collecting"; current: number; target: number }
  | "ready";

// ================================================================
// 可见度报告
// ================================================================

export interface VisibilityReport {
  leftShoulder: number;
  rightShoulder: number;
  leftElbow: number;
  rightElbow: number;
  leftWrist: number;
  rightWrist: number;
  leftHip: number;
  rightHip: number;
  leftKnee: number;
  rightKnee: number;
  leftAnkle: number;
  rightAnkle: number;
}

// ================================================================
// 各指标有效性
// ================================================================

export interface PerMetricValidity {
  elbowAngleLeft: boolean;
  elbowAngleRight: boolean;
  kneeAngleLeft: boolean;
  kneeAngleRight: boolean;
  torsoLean: boolean;
  shoulderLineAngle: boolean;
  hipLineAngle: boolean;
  shoulderHipProjectedDiff: boolean;
  handSpanRatio: boolean;
  topPowerVertOffset: boolean;
  powerWristRelShoulderX: boolean;
  powerWristRelShoulderY: boolean;
  powerWristRelHipX: boolean;
  powerWristRelHipY: boolean;
  powerWristRelHorizVel: boolean;
  powerWristRelVertVel: boolean;
  powerWristRelCompositeSpeed: boolean;
  powerWristRelDirection: boolean;
  handSpanVelocity: boolean;
  bodyCenterDisplacement: boolean;
  bodyCenterVelocity: boolean;
  shoulderHeightDiff: boolean;
}

// ================================================================
// 完整指标数据结构
// ================================================================

export interface BodyStrokeMetrics {
  // ── 角色 ──
  selectedSide: StrokeSide | null;
  inferredSide: InferredSide;
  inferredSideConfidence: number;

  // ── 角度类（度）──
  elbowAngleDeg: { left: number | null; right: number | null };
  kneeAngleDeg: { left: number | null; right: number | null };
  torsoLeanDeg: number | null;
  shoulderLineAngleDeg: number | null;
  hipLineAngleDeg: number | null;
  shoulderHipProjectedAngleDiffDeg: number | null;

  // ── 距离类（倍肩宽）──
  /** 双手间距 ÷ 肩宽 */
  handSpanRatio: number | null;
  /** 上手与下手在图像垂直方向的距离 ÷ 肩宽 */
  topPowerVerticalOffsetRatio: number | null;
  /** 下手腕相对于工作侧肩的归一化位置 */
  powerWristRelShoulder: { x: number | null; y: number | null };
  /** 下手腕相对于工作侧髋的归一化位置 */
  powerWristRelHip: { x: number | null; y: number | null };
  /** (左肩.y - 右肩.y) ÷ 肩宽 */
  shoulderHeightDiff: number | null;

  // ── 速度类（相对躯干，倍肩宽/秒）──
  powerWristRelativeHorizontalVelocity: number | null;
  powerWristRelativeVerticalVelocity: number | null;
  powerWristRelativeCompositeSpeed: number | null;
  powerWristRelativeDirectionDeg: number | null;

  /** 手间距变化速度（倍肩宽/秒） */
  handSpanVelocity: number | null;

  // ── 身体中心（归一化坐标 / 倍肩宽 / 倍肩宽/秒）──
  bodyCenterY: number | null;
  bodyCenterVerticalDisplacement: number | null;
  bodyCenterVerticalVelocity: number | null;

  // ── 质量 ──
  visibility: VisibilityReport;
  validity: PerMetricValidity;

  // ── 元数据 ──
  timestamp: number;
  frameTime: number;
  deltaTimeMs: number;
}

// ================================================================
// Tracker 单元返回
// ================================================================

export interface TrackerResult {
  /** 平滑后的位置值；清空后为 null */
  value: number | null;
  /** 平滑后的速度；不可用时为 null */
  velocity: number | null;
  /** 当前帧输入有效且处理正常 */
  valid: boolean;
  /** 返回旧值（丢失但未达清空阈值） */
  stale: boolean;
  /** 连续失帧计数 */
  staleFrames: number;
}

// ================================================================
// Debug 导出
// ================================================================

export interface DebugFrameEntry {
  timestamp: number;
  frameTime: number;
  deltaTimeMs: number;
  selectedSide: StrokeSide | null;
  /** 所有指标值（含 valid 标记） */
  metrics: BodyStrokeMetrics;
  /** 不包含图像 */
}

export interface DebugExport {
  configVersion: string;
  exportedAt: number;
  selectedSide: StrokeSide | null;
  frameCount: number;
  frames: DebugFrameEntry[];
}

// ================================================================
// V4.2 划桨阶段
// ================================================================

/** 五阶段划桨状态 */
export type StrokePhase =
  | "ready"
  | "pull"
  | "push"
  | "recovery"
  | "pause";

/** 阶段状态机输出 */
export interface PhaseState {
  phase: StrokePhase;
  /** 当前相位持续时长（ms） */
  durationMs: number;
  /** 是否刚完成相位切换 */
  justTransitioned: boolean;
  /** 该阶段置信度 [0,1] */
  confidence: number;
  /** 相位开始时间戳 */
  phaseStartTime: number;
  /** 完整动作周期计数 */
  strokeCount: number;
}
