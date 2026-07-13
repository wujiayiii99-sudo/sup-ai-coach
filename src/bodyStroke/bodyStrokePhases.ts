/**
 * V4.2 五阶段划桨状态机
 *
 * 基于 V4.1 的 20 项平滑指标，识别划桨动作的五个阶段：
 *   pause → ready → pull → push → recovery → (ready → pull → … → pause)
 *
 * 输入：StrokeTracker.update() 输出的 BodyStrokeMetrics（已平滑）
 * 输出：PhaseState（当前阶段、时长、置信度、动作计数）
 *
 * 设计要点：
 * - 时间基防抖（仿 V3 postureStabilizer），避免单帧误跳
 * - 左右侧方向角镜像映射（通过 _currentSide）
 * - 峰值速度跟踪，用于判定拉桨→推桨过渡
 */
import type { BodyStrokeMetrics, StrokeSide, StrokePhase, PhaseState } from "./bodyStrokeTypes";
import { PHASE_CONFIG } from "./bodyStrokeConfig";

// ================================================================
// Timer 辅助
// ================================================================

interface Timer {
  okSince: number;
  failSince: number;
}

function startOk(t: Timer, now: number): void {
  t.okSince = t.okSince || now;
  t.failSince = 0;
}

function startFail(t: Timer, now: number): void {
  t.failSince = t.failSince || now;
}

function resetTimer(t: Timer): void {
  t.okSince = 0;
  t.failSince = 0;
}

/** 条件满足的时长（毫秒） */
function okElapsed(t: Timer, now: number): number {
  return t.okSince > 0 ? now - t.okSince : 0;
}

// ================================================================
// 方向判定工具
// ================================================================

function isInRange(value: number, range: readonly [number, number]): boolean {
  return value >= range[0] && value <= range[1];
}

// ================================================================
// StrokePhaseMachine
// ================================================================

export class StrokePhaseMachine {
  private _currentPhase: StrokePhase = "pause";
  private _phaseStartTime: number = 0;
  private _strokeCount: number = 0;
  private _pullPeakSpeed: number = 0;
  private _currentSide: StrokeSide = "right";

  // 时间基计数器
  private _pullTimer: Timer = { okSince: 0, failSince: 0 };
  private _pushTimer: Timer = { okSince: 0, failSince: 0 };
  private _pauseTimer: Timer = { okSince: 0, failSince: 0 };

  constructor(side?: StrokeSide) {
    if (side) this._currentSide = side;
  }

  /** 根据当前划桨侧获取方向区间（镜像） */
  private _getRanges(): {
    pull: readonly [number, number];
    recovery: readonly [number, number];
  } {
    const p = PHASE_CONFIG.pullDirectionRange;
    const r = PHASE_CONFIG.recoveryDirectionRange;
    if (this._currentSide === "right") {
      return { pull: p, recovery: r };
    }
    // 左侧：方向区间取反
    return {
      pull: [-r[1], -r[0]] as [number, number],
      recovery: [-p[1], -p[0]] as [number, number],
    };
  }

  /**
   * 每帧更新状态机
   * @param metrics 已平滑的 V4.1 指标
   * @param now performance.now()
   * @param side 可选，动态更新划桨侧
   */
  update(
    metrics: BodyStrokeMetrics,
    now: number,
    side?: StrokeSide,
  ): PhaseState {
    if (side) this._currentSide = side;

    const speed = metrics.powerWristRelativeCompositeSpeed ?? 0;
    const direction = metrics.powerWristRelativeDirectionDeg;
    const ranges = this._getRanges();
    const directionInPull =
      direction !== null && isInRange(direction, ranges.pull);

const nowMs = now;
    const cfg = PHASE_CONFIG;

    // ---- 状态切换 ----
    let newPhase = this._currentPhase;
    let justTransitioned = false;

    switch (this._currentPhase) {
      // ── 暂停 ──
      case "pause": {
        if (speed > cfg.pullSpeedMin) {
          if (directionInPull) {
            this._transitionTo("pull", nowMs);
            newPhase = "pull";
          } else {
            this._transitionTo("ready", nowMs);
            newPhase = "ready";
          }
          justTransitioned = true;
        }
        break;
      }

      // ── 准备 ──
      case "ready": {
        if (speed > cfg.pullSpeedMin && directionInPull) {
          startOk(this._pullTimer, nowMs);
          if (okElapsed(this._pullTimer, nowMs) >= cfg.pullEnterDebounceMs) {
            this._transitionTo("pull", nowMs);
            newPhase = "pull";
            justTransitioned = true;
          }
        } else {
          startFail(this._pullTimer, nowMs);
        }

        if (speed < cfg.pauseSpeedThreshold) {
          startOk(this._pauseTimer, nowMs);
          if (okElapsed(this._pauseTimer, nowMs) >= cfg.pauseEnterMs) {
            this._transitionTo("pause", nowMs);
            newPhase = "pause";
            justTransitioned = true;
          }
        } else {
          startFail(this._pauseTimer, nowMs);
        }
        break;
      }

      // ── 拉桨 ──
      case "pull": {
        if (speed > this._pullPeakSpeed) this._pullPeakSpeed = speed;

        // 方向离开拉桨范围 → 推桨（方向驱动，不依赖速度）
        if (!directionInPull) {
          startOk(this._pushTimer, nowMs);
          if (okElapsed(this._pushTimer, nowMs) >= cfg.pullExitDebounceMs) {
            this._transitionTo("push", nowMs);
            newPhase = "push";
            justTransitioned = true;
          }
        } else {
          startFail(this._pushTimer, nowMs);
        }
        break;
      }

      // ── 推桨 ──
      case "push": {
        // 方向进入恢复范围 → 恢复（方向驱动）
        if (direction !== null && isInRange(direction, ranges.recovery)) {
          startOk(this._pushTimer, nowMs);
          if (okElapsed(this._pushTimer, nowMs) >= cfg.pushExitDebounceMs) {
            this._transitionTo("recovery", nowMs);
            newPhase = "recovery";
            justTransitioned = true;
          }
        } else {
          // 超时强制进入恢复（防止卡死在推桨）
          const pushDuration = nowMs - this._phaseStartTime;
          if (pushDuration > cfg.pushMaxDurationMs) {
            this._transitionTo("recovery", nowMs);
            newPhase = "recovery";
            justTransitioned = true;
          }
          startFail(this._pushTimer, nowMs);
        }
        break;
      }

      // ── 恢复 ──
      case "recovery": {
        // 下一桨：方向重新进入拉桨范围
        if (directionInPull && speed > cfg.pullSpeedMin) {
          startOk(this._pullTimer, nowMs);
          if (okElapsed(this._pullTimer, nowMs) >= cfg.pullEnterDebounceMs) {
            this._strokeCount++;
            this._transitionTo("ready", nowMs);
            newPhase = "ready";
            justTransitioned = true;
          }
        } else {
          startFail(this._pullTimer, nowMs);
        }

        // 暂停
        if (speed < cfg.pauseSpeedThreshold) {
          startOk(this._pauseTimer, nowMs);
          if (okElapsed(this._pauseTimer, nowMs) >= cfg.pauseEnterMs) {
            this._transitionTo("pause", nowMs);
            newPhase = "pause";
            justTransitioned = true;
          }
        } else {
          startFail(this._pauseTimer, nowMs);
        }
        break;
      }
    }// 如果相位未变但时间推进，更新 begin 时间（保持 durationMs 正确）
    // _transitionTo 已记录 phaseStartTime，无需额外处理

    // ---- 置信度计算 ----
    let confidence = 0;
    if (newPhase === "pause" || newPhase === "ready") {
      // 静止阶段：速度越低越确定
      confidence = Math.max(0, 1 - speed / cfg.pauseSpeedThreshold);
    } else {
      // 运动阶段：速度越高越确定，但上限为 1
      confidence = Math.min(1, speed / cfg.pullSpeedMin);
    }

    return {
      phase: newPhase,
      durationMs: nowMs - this._phaseStartTime,
      justTransitioned,
      confidence: Number(confidence.toFixed(3)),
      phaseStartTime: this._phaseStartTime,
      strokeCount: this._strokeCount,
    };
  }

  /** 执行相位切换 */
  private _transitionTo(phase: StrokePhase, now: number): void {
    this._currentPhase = phase;
    this._phaseStartTime = now;
    resetTimer(this._pullTimer);
    resetTimer(this._pushTimer);
    resetTimer(this._pauseTimer);
    if (phase === "pull") {
      this._pullPeakSpeed = 0;
    }
  }

  /** 重置所有状态 */
  reset(side?: StrokeSide): void {
    this._currentPhase = "pause";
    this._phaseStartTime = 0;
    this._strokeCount = 0;
    this._pullPeakSpeed = 0;
    if (side) this._currentSide = side;
    resetTimer(this._pullTimer);
    resetTimer(this._pushTimer);
    resetTimer(this._pauseTimer);
  }

  get currentPhase(): StrokePhase { return this._currentPhase; }
  get strokeCount(): number { return this._strokeCount; }
}
