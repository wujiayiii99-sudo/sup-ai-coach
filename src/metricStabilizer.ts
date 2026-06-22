/**
 * 指标稳定器
 *
 * 职责：
 * 1. 状态防抖：人体入镜状态必须在连续 N 个新视频帧中保持不变才切换
 * 2. 数值平滑：对侧倾角、双手间距比进行轻量 EMA 平滑
 *
 * 所有计数均基于新视频帧（video.currentTime 变化判断），而非 rAF 调用次数。
 */

// ================================================================
// 配置
// ================================================================

/** 状态切换前需等待的连续新视频帧数 */
const DEBOUNCE_FRAMES = 5;

/** 侧倾角平滑 alpha（越小越平滑，延迟越大） */
const ANGLE_SMOOTH_ALPHA = 0.4;

/** 双手间距比平滑 alpha */
const RATIO_SMOOTH_ALPHA = 0.3;

// ================================================================
// 人体入镜状态防抖
// ================================================================

let bodyLastTime = -1;
let bodyCurrentState = "";
let bodyCounter = 0;

/**
 * 对原始 bodyStatus 进行防抖
 * 新状态必须连续 DEBOUNCE_FRAMES 帧保持才生效
 */
export function stabilizeBodyStatus(
  rawState: string,
  currentTime: number
): string {
  const isNewFrame = currentTime !== bodyLastTime;
  bodyLastTime = currentTime;

  if (!isNewFrame) return bodyCurrentState;

  if (rawState === bodyCurrentState) {
    bodyCounter = 0;
    return bodyCurrentState;
  }

  bodyCounter++;
  if (bodyCounter >= DEBOUNCE_FRAMES) {
    bodyCurrentState = rawState;
    bodyCounter = 0;
  }
  return bodyCurrentState;
}

// ================================================================
// 侧倾角平滑（EMA）
// ================================================================

let angleLastTime = -1;
let angleSmoothed: number | null = null;

/**
 * 对侧倾角数值（度）进行轻量 EMA 平滑
 * @param rawDeg  原始角度（有符号，正=左侧倾），null 表示无法计算
 * @param currentTime video.currentTime
 */
export function smoothLeanAngle(
  rawDeg: number | null,
  currentTime: number
): number | null {
  const isNewFrame = currentTime !== angleLastTime;
  angleLastTime = currentTime;

  if (!isNewFrame) return angleSmoothed;
  if (rawDeg === null) return angleSmoothed;

  if (angleSmoothed === null) {
    angleSmoothed = rawDeg;
  } else {
    angleSmoothed = angleSmoothed + ANGLE_SMOOTH_ALPHA * (rawDeg - angleSmoothed);
  }
  return angleSmoothed;
}

// ================================================================
// 双手间距比平滑（EMA）
// ================================================================

let ratioLastTime = -1;
let ratioSmoothed: number | null = null;

/**
 * 对双手间距比进行轻量 EMA 平滑
 * @param rawRatio 原始比值，null 表示无法计算
 * @param currentTime video.currentTime
 */
export function smoothHandRatio(
  rawRatio: number | null,
  currentTime: number
): number | null {
  const isNewFrame = currentTime !== ratioLastTime;
  ratioLastTime = currentTime;

  if (!isNewFrame) return ratioSmoothed;
  if (rawRatio === null) return ratioSmoothed;

  if (ratioSmoothed === null) {
    ratioSmoothed = rawRatio;
  } else {
    ratioSmoothed = ratioSmoothed + RATIO_SMOOTH_ALPHA * (rawRatio - ratioSmoothed);
  }
  return ratioSmoothed;
}

// ================================================================
// 重置
// ================================================================

/**
 * 重置所有稳定器内部状态
 * 在停止/重启摄像头时应调用
 */
export function resetMetrics(): void {
  bodyLastTime = -1;
  bodyCurrentState = "";
  bodyCounter = 0;
  angleLastTime = -1;
  angleSmoothed = null;
  ratioLastTime = -1;
  ratioSmoothed = null;
}
