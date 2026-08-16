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
  private _pullStartX: number | null = null;
  private _pullStartY: number | null = null;
  private _pullMaxDisplacement: number = 0;
  private _strokeArmed: boolean = false;
  private _lastCountTime: number = Number.NEGATIVE_INFINITY;
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
    if (this._phaseStartTime === 0) this._phaseStartTime = now;

    const speed = metrics.powerWristRelativeCompositeSpeed ?? 0;
    const direction = metrics.powerWristRelativeDirectionDeg;
    const wristX = metrics.powerWristRelShoulder.x;
    const wristY = metrics.powerWristRelShoulder.y;
    const ranges = this._getRanges();
    const directionInPull =
      direction !== null && isInRange(direction, ranges.pull);
    const directionInRecovery =
      direction !== null && isInRange(direction, ranges.recovery);

    const nowMs = now;
    const cfg = PHASE_CONFIG;

    // ---- 状态切换 ----
    let newPhase = this._currentPhase;
    let justTransitioned = false;

    switch (this._currentPhase) {
      // ── 暂停 ──
      case "pause": {
        if (speed > cfg.pullSpeedMin && directionInPull) {
          startOk(this._pullTimer, nowMs);
          if (okElapsed(this._pullTimer, nowMs) >= cfg.pullEnterDebounceMs) {
            this._beginPull(wristX, wristY, speed, nowMs);
            newPhase = "pull";
            justTransitioned = true;
          }
        } else if (speed > cfg.pauseSpeedThreshold) {
          this._transitionTo("ready", nowMs);
          newPhase = "ready";
          justTransitioned = true;
        } else {
          resetTimer(this._pullTimer);
        }
        break;
      }

      // ── 准备 ──
      case "ready": {
        if (speed > cfg.pullSpeedMin && directionInPull) {
          startOk(this._pullTimer, nowMs);
          if (okElapsed(this._pullTimer, nowMs) >= cfg.pullEnterDebounceMs) {
            this._beginPull(wristX, wristY, speed, nowMs);
            newPhase = "pull";
            justTransitioned = true;
          }
        } else {
          resetTimer(this._pullTimer);
        }

        if (speed < cfg.pauseSpeedThreshold) {
          startOk(this._pauseTimer, nowMs);
          if (okElapsed(this._pauseTimer, nowMs) >= cfg.pauseEnterMs) {
            this._transitionTo("pause", nowMs);
            newPhase = "pause";
            justTransitioned = true;
          }
        } else {
          resetTimer(this._pauseTimer);
        }
        break;
      }

      // ── 拉桨 ──
      case "pull": {
        this._updatePullDisplacement(wristX, wristY);
        if (speed > this._pullPeakSpeed) this._pullPeakSpeed = speed;
        const pullDuration = nowMs - this._phaseStartTime;

        if (pullDuration > cfg.pullMaxDurationMs) {
          this._resetCycle();
          this._transitionTo("ready", nowMs);
          newPhase = "ready";
          justTransitioned = true;
          break;
        }

        // 持续离开拉桨方向或拉桨后明显减速，才进入出水/换向阶段。
        const exitCandidate = !directionInPull || (
          pullDuration >= cfg.pullMinDurationMs && speed < cfg.pauseSpeedThreshold
        );
        if (exitCandidate) {
          startOk(this._pushTimer, nowMs);
          if (okElapsed(this._pushTimer, nowMs) >= cfg.pullExitDebounceMs) {
            this._strokeArmed = this._isPullValid(nowMs);
            this._transitionTo("push", nowMs);
            newPhase = "push";
            justTransitioned = true;
          }
        } else {
          resetTimer(this._pushTimer);
        }
        break;
      }

      // ── 推桨 ──
      case "push": {
        // 回桨方向连续成立后，确认本桨完成并立即计数。
        if (directionInRecovery && speed >= cfg.pauseSpeedThreshold) {
          startOk(this._pushTimer, nowMs);
          if (okElapsed(this._pushTimer, nowMs) >= cfg.pushExitDebounceMs) {
            this._countArmedStroke(nowMs);
            this._transitionTo("recovery", nowMs);
            newPhase = "recovery";
            justTransitioned = true;
          }
        } else {
          resetTimer(this._pushTimer);
          const pushDuration = nowMs - this._phaseStartTime;
          // 有效拉桨后手腕停下，视为完成出水；这样最后一桨无需等下一桨才计数。
          if (this._strokeArmed && speed < cfg.pauseSpeedThreshold && pushDuration >= cfg.pullExitDebounceMs) {
            this._countArmedStroke(nowMs);
            this._transitionTo("recovery", nowMs);
            newPhase = "recovery";
            justTransitioned = true;
          } else if (pushDuration > cfg.pushMaxDurationMs) {
            this._countArmedStroke(nowMs);
            this._transitionTo("recovery", nowMs);
            newPhase = "recovery";
            justTransitioned = true;
          }
        }
        break;
      }

      // ── 恢复 ──
      case "recovery": {
        const recoveryDuration = nowMs - this._phaseStartTime;

        // 下一桨必须经过最短回桨时间，再连续进入拉桨方向。
        if (recoveryDuration >= cfg.recoveryMinDurationMs && directionInPull && speed > cfg.pullSpeedMin) {
          startOk(this._pullTimer, nowMs);
          if (okElapsed(this._pullTimer, nowMs) >= cfg.pullEnterDebounceMs) {
            this._beginPull(wristX, wristY, speed, nowMs);
            newPhase = "pull";
            justTransitioned = true;
          }
        } else {
          resetTimer(this._pullTimer);
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
          resetTimer(this._pauseTimer);
        }

        if (recoveryDuration > cfg.maxCycleDurationMs) {
          this._resetCycle();
          this._transitionTo("pause", nowMs);
          newPhase = "pause";
          justTransitioned = true;
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
  }

  private _beginPull(
    wristX: number | null,
    wristY: number | null,
    speed: number,
    now: number,
  ): void {
    this._resetCycle();
    this._pullStartX = wristX;
    this._pullStartY = wristY;
    this._pullPeakSpeed = speed;
    this._transitionTo("pull", now);
  }

  private _updatePullDisplacement(wristX: number | null, wristY: number | null): void {
    if (wristX === null || wristY === null || this._pullStartX === null || this._pullStartY === null) return;
    const dx = wristX - this._pullStartX;
    const dy = wristY - this._pullStartY;
    this._pullMaxDisplacement = Math.max(this._pullMaxDisplacement, Math.sqrt(dx * dx + dy * dy));
  }

  private _isPullValid(now: number): boolean {
    const cfg = PHASE_CONFIG;
    const duration = now - this._phaseStartTime;
    return duration >= cfg.pullMinDurationMs &&
      duration <= cfg.pullMaxDurationMs &&
      this._pullPeakSpeed >= cfg.pullSpeedMin &&
      this._pullMaxDisplacement >= cfg.pullMinDisplacement;
  }

  private _countArmedStroke(now: number): boolean {
    if (!this._strokeArmed) return false;
    if (now - this._lastCountTime < PHASE_CONFIG.strokeCooldownMs) {
      this._strokeArmed = false;
      return false;
    }
    this._strokeCount++;
    this._lastCountTime = now;
    this._strokeArmed = false;
    return true;
  }

  private _resetCycle(): void {
    this._pullStartX = null;
    this._pullStartY = null;
    this._pullMaxDisplacement = 0;
    this._pullPeakSpeed = 0;
    this._strokeArmed = false;
  }

  /** 测试结束时补计已经完成有效拉桨、但尚未来得及进入回桨的最后一桨。 */
  finalizePendingStroke(now: number): boolean {
    if (this._currentPhase === "pull" && this._isPullValid(now)) {
      this._strokeArmed = true;
    }
    const counted = this._countArmedStroke(now);
    if (counted) {
      // 将已补计的周期关闭，避免检测循环继续运行时再次计入同一桨。
      this._resetCycle();
      this._transitionTo("recovery", now);
    }
    return counted;
  }

  /** 重置所有状态 */
  reset(side?: StrokeSide): void {
    this._currentPhase = "pause";
    this._phaseStartTime = 0;
    this._strokeCount = 0;
    this._lastCountTime = Number.NEGATIVE_INFINITY;
    this._resetCycle();
    if (side) this._currentSide = side;
    resetTimer(this._pullTimer);
    resetTimer(this._pushTimer);
    resetTimer(this._pauseTimer);
  }

  get currentPhase(): StrokePhase { return this._currentPhase; }
  get strokeCount(): number { return this._strokeCount; }
}
