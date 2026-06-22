/**
 * 姿势分析状态稳定器
 *
 * 基于时间（performance.now()）的状态机：
 * - 条件连续满足 ≥500ms → active（正式分析）
 * - 条件满足但不足 500ms → warming（显示"请保持片刻"）
 * - 条件连续不满足 ≥200ms → idle（退出并显示原因）
 * - 条件不满足但不足 200ms → 维持原状态（抗抖动）
 *
 * 短暂单帧波动不触发状态切换。
 */

// ================================================================
// 配置
// ================================================================

const POSTURE_STABLE_MS = 500;  // 进入分析所需连续稳定时间
const POSTURE_EXIT_MS = 200;    // 退出分析所需连续失效时间

// ================================================================
// 类型
// ================================================================

export type PosturePhase = "idle" | "warming" | "active";

// ================================================================
// 内部状态
// ================================================================

let okSince = 0;   // performance.now() 上次满足条件的时刻
let failSince = 0; // performance.now() 上次不满足条件的时刻

// ================================================================
// 导出函数
// ================================================================

/**
 * 更新姿势分析状态
 *
 * @param conditionsOk 当前是否满足分析条件（含稳定性）
 * @param now          performance.now()
 * @returns "active" | "warming" | "idle"
 */
export function updatePostureState(
  conditionsOk: boolean,
  now: number
): PosturePhase {
  if (conditionsOk) {
    failSince = 0;

    if (okSince === 0) {
      okSince = now;
      return "warming";
    }

    const elapsed = now - okSince;
    if (elapsed >= POSTURE_STABLE_MS) {
      return "active";
    }
    return "warming";
  }

  // 条件不满足
  if (okSince > 0) {
    if (failSince === 0) {
      failSince = now;
    }

    const failElapsed = now - failSince;
    if (failElapsed >= POSTURE_EXIT_MS) {
      // 确实不满足，退出
      resetPostureState();
      return "idle";
    }

    // 短暂波动，维持当前阶段判断
    if (now - okSince >= POSTURE_STABLE_MS) {
      return "active"; // 之前已激活，短暂波动后恢复
    }
    return "warming";
  }

  return "idle";
}

/**
 * 重置所有状态（停止/重启摄像头时调用）
 */
export function resetPostureState(): void {
  okSince = 0;
  failSince = 0;
}
