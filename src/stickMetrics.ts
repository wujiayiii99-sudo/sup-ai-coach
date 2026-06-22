/**
 * 杆体方向角计算模块
 *
 * 由粉色上端和绿色下端标记的归一化坐标，计算杆体与画面垂直方向的夹角。
 * 镜像方向复用 V1 的 IS_DISPLAY_MIRRORED 配置。
 */

import { IS_DISPLAY_MIRRORED } from "./poseMetrics";

// ================================================================
// 类型
// ================================================================

export type StickDirection = "基本垂直" | "向左倾斜" | "向右倾斜";

export type StickLevel = "" | "轻微" | "明显";

export interface StickAngleResult {
  /** 有符号角度（镜像校正后，正=左侧倾，负=右侧倾） */
  signedDeg: number;
  /** 方向描述 */
  direction: StickDirection;
  /** 程度描述 */
  level: StickLevel;
}

// ================================================================
// 角度计算
// ================================================================

/**
 * 计算杆体方向角
 *
 * 由粉色（上端）和绿色（下端）标记计算杆体方向，
 * 相对画面垂直方向的有符号角度。
 *
 * 方向已根据 IS_DISPLAY_MIRRORED 转换：
 *   - 屏幕中向左倾斜 → 正角度 → "向左倾斜"
 *   - 屏幕中向右倾斜 → 负角度 → "向右倾斜"
 *
 * @param pinkX  粉色标记归一化 x
 * @param pinkY  粉色标记归一化 y
 * @param greenX 绿色标记归一化 x
 * @param greenY 绿色标记归一化 y
 * @returns 角度结果，坐标无效时返回 null
 */
export function computeStickAngle(
  pinkX: number,
  pinkY: number,
  greenX: number,
  greenY: number
): StickAngleResult | null {
  const dx = pinkX - greenX;
  const dy = pinkY - greenY;

  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 0.005) return null;

  // 原始角度：atan2(dx, -dy) 以向上为 0°，右为正
  const rawDeg = Math.atan2(dx, -dy) * (180 / Math.PI);

  // 镜像校正
  const displayDeg = IS_DISPLAY_MIRRORED ? -rawDeg : rawDeg;

  const absDeg = Math.abs(displayDeg);

  // 待专项数据验证：以下阈值仅为 V2 调试使用
  let direction: StickDirection;
  let level: StickLevel;

  if (absDeg < 5) {
    direction = "基本垂直";
    level = "";
  } else if (absDeg < 10) {
    // 待专项数据验证：5°~10° 轻微倾斜阈值
    direction = displayDeg > 0 ? "向左倾斜" : "向右倾斜";
    level = "轻微";
  } else {
    // 待专项数据验证：> 10° 明显倾斜阈值
    direction = displayDeg > 0 ? "向左倾斜" : "向右倾斜";
    level = "明显";
  }

  return {
    signedDeg: displayDeg,
    direction,
    level,
  };
}
