/**
 * V4.1 配置常量
 *
 * 所有阈值标注"待实测校准"，V4.1 不做硬性判定。
 */
import type { ReliabilityGrade } from "./bodyStrokeTypes";

// ================================================================
// 关键点可见度阈值
// ================================================================

export const VISIBILITY = {
  /** 必检关键点 */
  required: 0.5,
  /** 手腕（放宽，易被手臂自身遮挡） */
  wrist: 0.4,
} as const;

// ================================================================
// 平滑参数（EMA alpha）
// ================================================================

export const SMOOTHING = {
  // ── 角度类 ──
  elbowAngleAlpha: 0.30,
  kneeAngleAlpha: 0.30,
  torsoLeanAlpha: 0.35,      // 同 V1
  shoulderLineAlpha: 0.25,   // 信号弱，多平滑
  hipLineAlpha: 0.25,
  shoulderHipDiffAlpha: 0.25,

  // ── 距离类 ──
  handSpanRatioAlpha: 0.30,
  topPowerVertOffsetAlpha: 0.30,
  powerWristPosAlpha: 0.30,
  shoulderHeightDiffAlpha: 0.25,

  // ── 速度类 ──
  handSpanVelocityAlpha: 0.20,
  powerWristVelocityAlpha: 0.20,

  // ── 身体中心 ──
  bodyCenterYAlpha: 0.30,
  bodyCenterVelocityAlpha: 0.20,
} as const;

// ================================================================
// 速度与方向
// ================================================================

export const VELOCITY = {
  /** 用于速度计算的最小 dt（秒），小于此值视为时间戳异常 */
  minDtSec: 0.005,
  /** 最大合理 dt（秒），大于此值视为检测中断 */
  maxDtSec: 0.5,
  /** 方向有效的最低合速度（倍肩宽/秒），经 T3 实测校准 */
  minDirectionSpeed: 0.3,
} as const;

// ================================================================
// 丢失与恢复
// ================================================================

export const STALE = {
  /** 连续丢失达到此帧数后清空历史 */
  maxFramesBeforeReset: 3,
} as const;

// ================================================================
// Debug 缓冲区
// ================================================================

export const DEBUG = {
  /** 最大缓存帧数 */
  maxBufferFrames: 300,
  /** 配置版本号 */
  configVersion: "v4.1.0",
} as const;

// ================================================================
// 身体中心校准
// ================================================================

export const CALIBRATION = {
  /** 校准所需稳定帧数 */
  requiredFrames: 30,
  /** 最长采集时间（毫秒） */
  maxCollectMs: 5000,
  /** 帧间 bodyCenterY 最大变化（归一化坐标），超过则放弃该帧样本，待实测校准 */
  maxFrameToFrameMovement: 0.003,
  /** 校准期间 shoulderWidth 允许的相对变化比例，待实测校准 */
  maxShoulderWidthChange: 0.05,
  /** 人体丢失超过此帧数后清除校准基线 */
  bodyLostResetFrames: 30,
} as const;

// ================================================================
// 各指标可靠性说明（供调试面板显示）
// ================================================================

export interface MetricInfo {
  id: string;
  label: string;
  unit: string;
  reliability: ReliabilityGrade;
}

export const METRICS_INFO: MetricInfo[] = [
  { id: "elbowAngleLeft",      label: "左肘角",   unit: "°",     reliability: "high" },
  { id: "elbowAngleRight",     label: "右肘角",   unit: "°",     reliability: "high" },
  { id: "kneeAngleLeft",       label: "左膝角",   unit: "°",     reliability: "medium" },
  { id: "kneeAngleRight",      label: "右膝角",   unit: "°",     reliability: "medium" },
  { id: "torsoLean",           label: "躯干侧倾", unit: "°",     reliability: "high" },
  { id: "shoulderLineAngle",   label: "肩线角度", unit: "°",     reliability: "medium" },
  { id: "hipLineAngle",        label: "髋线角度", unit: "°",     reliability: "medium" },
  { id: "shoulderHipDiff",     label: "肩髋投影差",unit: "°",    reliability: "medium" },
  { id: "handSpanRatio",       label: "双手间距", unit: "倍肩宽", reliability: "high" },
  { id: "topPowerVertOffset",  label: "上下手垂直",unit: "倍肩宽", reliability: "medium" },
  { id: "pwrWristRelShoulder", label: "下手→肩", unit: "倍肩宽", reliability: "medium" },
  { id: "pwrWristRelHip",      label: "下手→髋", unit: "倍肩宽", reliability: "medium" },
  { id: "pwrWristHorizVel",    label: "下手水平速度",unit: "倍肩宽/秒", reliability: "medium" },
  { id: "pwrWristVertVel",     label: "下手垂直速度",unit: "倍肩宽/秒", reliability: "medium" },
  { id: "pwrWristSpeed",       label: "下手合速度",unit: "倍肩宽/秒", reliability: "medium" },
  { id: "pwrWristDirection",   label: "下手方向", unit: "°",     reliability: "low" },
  { id: "handSpanVelocity",    label: "手间距速度",unit: "倍肩宽/秒", reliability: "medium" },
  { id: "bodyCenterDisp",      label: "身体中心位移",unit: "倍肩宽", reliability: "medium" },
  { id: "bodyCenterVel",       label: "身体中心速度",unit: "倍肩宽/秒", reliability: "medium" },
  { id: "shoulderHeightDiff",  label: "肩高度差", unit: "倍肩宽", reliability: "high" },
];
