/**
 * 杆体状态稳定器
 *
 * 职责：
 * 1. 标记识别状态防抖（连续 3 个检测帧确认）
 * 2. 杆体角度 EMA 平滑
 * 3. 标记丢失后的角度超时清除
 */

// ================================================================
// 配置
// ================================================================

/** 状态确认所需连续检测帧数 */
const CONFIRM_FRAMES = 3;

/** 角度 EMA alpha */
const ANGLE_ALPHA = 0.4;

/** 标记连续丢失超过此检测帧数后清除角度 */
const LOSS_TIMEOUT_FRAMES = 10;

// ================================================================
// 类型
// ================================================================

export type StickStatus =
  | "杆体识别正常"
  | "未识别到上端粉色标记"
  | "未识别到下端绿色标记"
  | "杆体识别不完整"
  | "标记位置异常";

// ================================================================
// 内部状态
// ================================================================

// -- 状态防抖 --
let statusLastTime = -1;
let statusCurrent: StickStatus = "杆体识别不完整";
let statusCounter = 0;

// -- 角度平滑 --
let angleLastTime = -1;
let angleSmoothed: number | null = null;

// -- 丢失计时 --
let lossCount = 0;

// ================================================================
// 导出函数
// ================================================================

/**
 * 根据红蓝标记检测结果判定原始状态
 */
export function computeRawStickStatus(
  hasPink: boolean,
  hasGreen: boolean,
  score: number,
  minScore: number
): StickStatus {
  if (hasPink && hasGreen) {
    if (score >= minScore) return "杆体识别正常";
    return "标记位置异常";
  }
  if (hasPink) return "未识别到下端绿色标记";
  if (hasGreen) return "未识别到上端粉色标记";
  return "杆体识别不完整";
}

/**
 * 对原始状态进行防抖
 * 新状态必须连续 CONFIRM_FRAMES 个检测帧保持才生效
 */
export function stabilizeStickStatus(
  rawStatus: StickStatus,
  currentTime: number
): StickStatus {
  const isNewFrame = currentTime !== statusLastTime;
  statusLastTime = currentTime;

  if (!isNewFrame) return statusCurrent;

  if (rawStatus === statusCurrent) {
    statusCounter = 0;
    return statusCurrent;
  }

  statusCounter++;
  if (statusCounter >= CONFIRM_FRAMES) {
    statusCurrent = rawStatus;
    statusCounter = 0;
  }
  return statusCurrent;
}

/**
 * 对杆体角度进行 EMA 平滑
 *
 * @param rawDeg  原始有符号角度，null 表示无法计算
 * @param currentTime 视频帧时间
 * @returns 平滑后的角度，丢失超时时返回 null
 */
export function smoothStickAngle(
  rawDeg: number | null,
  currentTime: number
): number | null {
  const isNewFrame = currentTime !== angleLastTime;
  angleLastTime = currentTime;

  if (!isNewFrame) return angleSmoothed;

  if (rawDeg === null) {
    lossCount++;
    if (lossCount >= LOSS_TIMEOUT_FRAMES) {
      angleSmoothed = null;
    }
    return angleSmoothed;
  }

  lossCount = 0;

  if (angleSmoothed === null) {
    angleSmoothed = rawDeg;
  } else {
    angleSmoothed = angleSmoothed + ANGLE_ALPHA * (rawDeg - angleSmoothed);
  }

  return angleSmoothed;
}

/**
 * 重置所有状态（停止/重启摄像头时调用）
 */
export function resetStickState(): void {
  statusLastTime = -1;
  statusCurrent = "杆体识别不完整";
  statusCounter = 0;
  angleLastTime = -1;
  angleSmoothed = null;
  lossCount = 0;
}
