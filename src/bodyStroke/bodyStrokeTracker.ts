/**
 * V4.1 状态管理 — 平滑、速度、校准、debug 缓存
 *
 * ScalarTracker：单指标 EMA 平滑 + 速度计算 + 丢失恢复
 * BodyCenterCalibrator：身体中心基线校准
 * StrokeTracker：持有所有 ScalarTracker，协调每帧更新
 * DebugBuffer：最近 N 帧缓存（不含图像）
 */
import type {
  BodyStrokeMetrics,
  TrackerResult,
  InferredSide,
  CalibrationStatus,
  DebugFrameEntry,
  DebugExport,
} from "./bodyStrokeTypes";
import {
  SMOOTHING,
  VELOCITY as VEL_CFG,
  STALE,
  DEBUG,
  CALIBRATION,
} from "./bodyStrokeConfig";

// ================================================================
// ScalarTracker — 单指标状态管理
// ================================================================

export class ScalarTracker {
  _valueAlpha: number;
  _velocityAlpha: number;
  _maxStale: number;

  _smoothedValue: number | null = null;
  _prevSmoothed: number | null = null;
  _smoothedVelocity: number | null = null;
  _prevTimestamp: number = -1;
  _staleCount: number = 0;

  constructor(
    valueAlpha: number,
    velocityAlpha: number,
    maxStale: number = STALE.maxFramesBeforeReset,
  ) {
    this._valueAlpha = valueAlpha;
    this._velocityAlpha = velocityAlpha;
    this._maxStale = maxStale;
  }

  /**
   * 更新一帧
   * @param raw 原始值；null 表示该帧此指标不可用
   * @param timestamp performance.now()
   */
  update(raw: number | null, timestamp: number): TrackerResult {
    // ── 无效输入（丢失）──
    if (raw === null) {
      this._staleCount++;

      if (this._staleCount >= this._maxStale) {
        const lostFrames = this._staleCount;
        this._clearHistory();
        return {
          value: null,
          velocity: null,
          valid: false,
          stale: false,
          staleFrames: lostFrames,
        };
      }

      return {
        value: this._smoothedValue,
        velocity: null,
        valid: false,
        stale: true,
        staleFrames: this._staleCount,
      };
    }

    // ── 恢复检测 ──
    if (this._staleCount >= this._maxStale || this._smoothedValue === null) {
      return this._initFromFresh(raw, timestamp);
    }

    // ── 正常帧 ──
    this._staleCount = 0;

    const dtSec = (timestamp - this._prevTimestamp) / 1000;
    this._prevTimestamp = timestamp;

    if (dtSec < VEL_CFG.minDtSec || dtSec > VEL_CFG.maxDtSec) {
      this._smoothedValue = this._smoothedValue + this._valueAlpha * (raw - this._smoothedValue);
      this._prevSmoothed = this._smoothedValue;
      return {
        value: this._smoothedValue,
        velocity: null,
        valid: true,
        stale: false,
        staleFrames: 0,
      };
    }

    // ── 正常更新：位置平滑 + 速度计算 ──
    const prevForVel = this._prevSmoothed!;
    this._smoothedValue = this._smoothedValue + this._valueAlpha * (raw - this._smoothedValue);

    const rawVelocity = (this._smoothedValue - prevForVel) / dtSec;
    if (this._smoothedVelocity === null) {
      this._smoothedVelocity = rawVelocity;
    } else {
      this._smoothedVelocity = this._smoothedVelocity + this._velocityAlpha * (rawVelocity - this._smoothedVelocity);
    }

    this._prevSmoothed = this._smoothedValue;

    return {
      value: this._smoothedValue,
      velocity: this._smoothedVelocity,
      valid: true,
      stale: false,
      staleFrames: 0,
    };
  }

  _initFromFresh(raw: number, timestamp: number): TrackerResult {
    this._smoothedValue = raw;
    this._prevSmoothed = raw;
    this._smoothedVelocity = null;
    this._prevTimestamp = timestamp;
    this._staleCount = 0;
    return {
      value: raw,
      velocity: null,
      valid: true,
      stale: false,
      staleFrames: 0,
    };
  }

  _clearHistory(): void {
    this._smoothedValue = null;
    this._prevSmoothed = null;
    this._smoothedVelocity = null;
    this._prevTimestamp = -1;
  }

  /** 清空所有状态（包括 staleCount） */
  resetAll(): void {
    this._clearHistory();
    this._staleCount = 0;
  }

  /** 仅清空值历史（保留 staleCount） */
  clearHistory(): void {
    this._clearHistory();
  }

  get staleCount(): number { return this._staleCount; }
}

// ================================================================
// PowerWristVelocityTracker — 下手速度专用（双分量 + 方向）
// ================================================================

export interface Velocity2DResult {
  horizontalVelocity: number | null;
  verticalVelocity: number | null;
  compositeSpeed: number | null;
  directionDeg: number | null;
}

const EMPTY_VEL_RESULT: Velocity2DResult = {
  horizontalVelocity: null,
  verticalVelocity: null,
  compositeSpeed: null,
  directionDeg: null,
};

export class PowerWristVelocityTracker {
  _prevRelX: number | null = null;
  _prevRelY: number | null = null;
  _prevTimestamp: number = -1;
  _staleCount: number = 0;

  _smoothVx: number | null = null;
  _smoothVy: number | null = null;

  _velocityAlpha: number;
  _maxStale: number;

  constructor(
    velocityAlpha: number = SMOOTHING.powerWristVelocityAlpha,
    maxStale: number = STALE.maxFramesBeforeReset,
  ) {
    this._velocityAlpha = velocityAlpha;
    this._maxStale = maxStale;
  }

  update(
    relX: number | null,
    relY: number | null,
    timestamp: number,
  ): Velocity2DResult {
    // ── 缺失 ──
    if (relX === null || relY === null) {
      this._staleCount++;
      if (this._staleCount >= this._maxStale) {
        this._doReset();
      }
      return EMPTY_VEL_RESULT;
    }

    // 用局部变量避免 TS 属性窄化问题
    const px = this._prevRelX;
    const py = this._prevRelY;
    const pt = this._prevTimestamp;

    // ── 首次或恢复 ──
    if (this._staleCount >= this._maxStale || px === null || py === null) {
      this._prevRelX = relX;
      this._prevRelY = relY;
      this._prevTimestamp = timestamp;
      this._staleCount = 0;
      return EMPTY_VEL_RESULT;
    }

    this._staleCount = 0;
    const dtSec = (timestamp - pt) / 1000;

    if (dtSec <= VEL_CFG.minDtSec || dtSec >= VEL_CFG.maxDtSec) {
      this._prevRelX = relX;
      this._prevRelY = relY;
      this._prevTimestamp = timestamp;
      return EMPTY_VEL_RESULT;
    }

    const rawVx = (relX - px) / dtSec;
    const rawVy = (relY - py) / dtSec;

    // 平滑 vx/vy（独立处理，不交叉依赖）
    let svx: number;
    if (this._smoothVx === null) {
      svx = rawVx;
    } else {
      svx = this._smoothVx + this._velocityAlpha * (rawVx - this._smoothVx);
    }
    this._smoothVx = svx;

    let svy: number;
    if (this._smoothVy === null) {
      svy = rawVy;
    } else {
      svy = this._smoothVy + this._velocityAlpha * (rawVy - this._smoothVy);
    }
    this._smoothVy = svy;

    const speed = Math.sqrt(svx * svx + svy * svy);
    const dir = speed >= VEL_CFG.minDirectionSpeed
      ? Math.atan2(svy, svx) * (180 / Math.PI)
      : null;

    this._prevRelX = relX;
    this._prevRelY = relY;
    this._prevTimestamp = timestamp;

    return {
      horizontalVelocity: svx,
      verticalVelocity: svy,
      compositeSpeed: speed,
      directionDeg: dir,
    };
  }

  _doReset(): void {
    this._prevRelX = null;
    this._prevRelY = null;
    this._prevTimestamp = -1;
    this._smoothVx = null;
    this._smoothVy = null;
    this._staleCount = 0;
  }

  resetAll(): void {
    this._doReset();
  }
}

// ================================================================
// BodyCenterCalibrator — 身体中心基线校准
// ================================================================

export class BodyCenterCalibrator {
  _baseline: number | null = null;
  _samples: number[] = [];
  _startTime: number = 0;
  _isReady: boolean = false;
  _current: number = 0;
  _target: number = CALIBRATION.requiredFrames;

  /** 添加一帧到校准样本 */
  addFrame(
    bodyCenterY: number | null,
    bodyStatus: string,
    _shoulderWidth: number | null,
    _torsoLeanDeg: number | null,
    timestamp: number,
  ): CalibrationStatus {
    if (this._isReady) return { phase: "collecting", current: this._target, target: this._target };

    if (this._samples.length === 0) {
      this._startTime = timestamp;
    }

    if (!this._isStable(bodyCenterY, bodyStatus)) {
      this._samples = [];
      this._current = 0;
      return { phase: "collecting", current: 0, target: this._target };
    }

    this._samples.push(bodyCenterY!);
    this._current = this._samples.length;

    const elapsed = timestamp - this._startTime;
    if (this._samples.length >= this._target || elapsed >= CALIBRATION.maxCollectMs) {
      this._finalize();
      return { phase: "collecting", current: this._target, target: this._target };
    }

    return { phase: "collecting", current: this._current, target: this._target };
  }

  _isStable(
    bodyCenterY: number | null,
    bodyStatus: string,
  ): boolean {
    if (bodyCenterY === null) return false;
    if (bodyStatus !== "人体完整入镜") return false;

    if (this._samples.length > 0) {
      const prevY = this._samples[this._samples.length - 1];
      const movement = Math.abs(bodyCenterY - prevY);
      if (movement > CALIBRATION.maxFrameToFrameMovement) return false;
    }

    return true;
  }

  _finalize(): void {
    const sorted = [...this._samples].sort((a, b) => a - b);
    this._baseline = sorted[Math.floor(sorted.length / 2)];
    this._isReady = true;
    this._samples = [];
  }

  getDisplacement(bodyCenterY: number): number | null {
    if (this._baseline === null) return null;
    return bodyCenterY - this._baseline;
  }

  get isReady(): boolean { return this._isReady; }
  get baseline(): number | null { return this._baseline; }

  reset(): void {
    this._baseline = null;
    this._samples = [];
    this._isReady = false;
    this._current = 0;
    this._startTime = 0;
  }

  get status(): CalibrationStatus {
    if (this._isReady) return "ready";
    if (this._current > 0) return { phase: "collecting", current: this._current, target: this._target };
    return "uncalibrated";
  }
}

// ================================================================
// DebugBuffer — 调试帧缓存
// ================================================================

export class DebugBuffer {
  _frames: DebugFrameEntry[] = [];
  _maxFrames: number;

  constructor(maxFrames = DEBUG.maxBufferFrames) {
    this._maxFrames = maxFrames;
  }

  push(entry: DebugFrameEntry): void {
    this._frames.push(entry);
    if (this._frames.length > this._maxFrames) {
      this._frames.shift();
    }
  }

  exportJSON(): string {
    const data: DebugExport = {
      configVersion: DEBUG.configVersion,
      exportedAt: performance.now(),
      selectedSide: this._frames[0]?.selectedSide ?? null,
      frameCount: this._frames.length,
      frames: this._frames,
    };
    return JSON.stringify(data, null, 2);
  }

  reset(): void {
    this._frames = [];
  }
}

// ================================================================
// StrokeTracker — V4.1 主协调器
// ================================================================

export class StrokeTracker {
  // 角度类
  readonly elbowLeft = new ScalarTracker(SMOOTHING.elbowAngleAlpha, 0);
  readonly elbowRight = new ScalarTracker(SMOOTHING.elbowAngleAlpha, 0);
  readonly kneeLeft = new ScalarTracker(SMOOTHING.kneeAngleAlpha, 0);
  readonly kneeRight = new ScalarTracker(SMOOTHING.kneeAngleAlpha, 0);
  readonly torsoLean = new ScalarTracker(SMOOTHING.torsoLeanAlpha, 0);
  readonly shoulderLine = new ScalarTracker(SMOOTHING.shoulderLineAlpha, 0);
  readonly hipLine = new ScalarTracker(SMOOTHING.hipLineAlpha, 0);
  readonly shoulderHipDiff = new ScalarTracker(SMOOTHING.shoulderHipDiffAlpha, 0);

  // 距离类
  readonly handSpanRatio_tracker = new ScalarTracker(SMOOTHING.handSpanRatioAlpha, 0);
  readonly topPowerVertOffset = new ScalarTracker(SMOOTHING.topPowerVertOffsetAlpha, 0);
  readonly pwrWristRelShX = new ScalarTracker(SMOOTHING.powerWristPosAlpha, 0);
  readonly pwrWristRelShY = new ScalarTracker(SMOOTHING.powerWristPosAlpha, 0);
  readonly pwrWristRelHipX = new ScalarTracker(SMOOTHING.powerWristPosAlpha, 0);
  readonly pwrWristRelHipY = new ScalarTracker(SMOOTHING.powerWristPosAlpha, 0);
  readonly shoulderHeightDiffTracker = new ScalarTracker(SMOOTHING.shoulderHeightDiffAlpha, 0);

  // 身体中心
  readonly bodyCenterYTracker = new ScalarTracker(SMOOTHING.bodyCenterYAlpha, SMOOTHING.bodyCenterVelocityAlpha);
  readonly calibrator = new BodyCenterCalibrator();

  // 手间距速度
  readonly handSpanVelocityTracker = new ScalarTracker(0, SMOOTHING.handSpanVelocityAlpha);
  _prevHandRatio: number | null = null;
  _prevHandRatioTime: number = -1;

  // 下手速度（双分量）
  readonly powerWristVel = new PowerWristVelocityTracker();

  // Debug
  readonly debug = new DebugBuffer();

  // 自动推断状态
  _inferredSide: InferredSide = "unknown";
  _inferredConfidence: number = 0;

  // 帧时间
  _prevTimestamp: number = -1;

  update(
    raw: BodyStrokeMetrics,
    now: number,
    bodyStatus: string,
  ): BodyStrokeMetrics {
    const _prevTs = this._prevTimestamp; // save before update
    this._prevTimestamp = now;
    const dt = _prevTs > 0 ? now - _prevTs : 0;

    // ── 1. 更新所有 ScalarTracker ──
    const eL = this.elbowLeft.update(raw.elbowAngleDeg.left, now);
    const eR = this.elbowRight.update(raw.elbowAngleDeg.right, now);
    const kL = this.kneeLeft.update(raw.kneeAngleDeg.left, now);
    const kR = this.kneeRight.update(raw.kneeAngleDeg.right, now);
    const tL = this.torsoLean.update(raw.torsoLeanDeg, now);
    const sL = this.shoulderLine.update(raw.shoulderLineAngleDeg, now);
    const hL = this.hipLine.update(raw.hipLineAngleDeg, now);
    const sHD = this.shoulderHipDiff.update(raw.shoulderHipProjectedAngleDiffDeg, now);
    const hR = this.handSpanRatio_tracker.update(raw.handSpanRatio, now);
    const tPV = this.topPowerVertOffset.update(raw.topPowerVerticalOffsetRatio, now);
    const pRSx = this.pwrWristRelShX.update(raw.powerWristRelShoulder.x, now);
    const pRSy = this.pwrWristRelShY.update(raw.powerWristRelShoulder.y, now);
    const pRHx = this.pwrWristRelHipX.update(raw.powerWristRelHip.x, now);
    const pRHy = this.pwrWristRelHipY.update(raw.powerWristRelHip.y, now);
    const shHD = this.shoulderHeightDiffTracker.update(raw.shoulderHeightDiff, now);
    const bCY = this.bodyCenterYTracker.update(raw.bodyCenterY, now);

    // ── 2. 手间距速度 ──
    let handSpanVel: number | null = null;
    let handSpanVelValid = false;
    if (raw.handSpanRatio !== null && this._prevHandRatio !== null) {
      const hDtSec = (now - this._prevHandRatioTime) / 1000;
      if (hDtSec > VEL_CFG.minDtSec && hDtSec < VEL_CFG.maxDtSec) {
        const rawV = (raw.handSpanRatio - this._prevHandRatio) / hDtSec;
        const result = this.handSpanVelocityTracker.update(rawV, now);
        handSpanVel = result.value;
        handSpanVelValid = result.valid;
      }
    }
    this._prevHandRatio = raw.handSpanRatio;
    this._prevHandRatioTime = now;

    // ── 3. 下手速度（双分量 → 方向）──
    const pwrVel = this.powerWristVel.update(
      raw.powerWristRelShoulder.x,
      raw.powerWristRelShoulder.y,
      now,
    );

    // ── 4. 身体中心校准 ──
    this.calibrator.addFrame(
      raw.bodyCenterY,
      bodyStatus,
      null, // shoulderWidth - not needed for current stability check
      null, // torsoLeanDeg - not needed for current stability check
      now,
    );
    const bCDisp = raw.bodyCenterY !== null
      ? this.calibrator.getDisplacement(raw.bodyCenterY)
      : null;

    // ── 5. 自动推断 ──
    this._inferredSide = raw.inferredSide;
    this._inferredConfidence = raw.inferredSideConfidence;

    // ── 6. 组装结果 ──
    const result: BodyStrokeMetrics = {
      ...raw,
      elbowAngleDeg: { left: eL.value, right: eR.value },
      kneeAngleDeg: { left: kL.value, right: kR.value },
      torsoLeanDeg: tL.value,
      shoulderLineAngleDeg: sL.value,
      hipLineAngleDeg: hL.value,
      shoulderHipProjectedAngleDiffDeg: sHD.value,
      handSpanRatio: hR.value,
      topPowerVerticalOffsetRatio: tPV.value,
      powerWristRelShoulder: { x: pRSx.value, y: pRSy.value },
      powerWristRelHip: { x: pRHx.value, y: pRHy.value },
      shoulderHeightDiff: shHD.value,
      powerWristRelativeHorizontalVelocity: pwrVel.horizontalVelocity,
      powerWristRelativeVerticalVelocity: pwrVel.verticalVelocity,
      powerWristRelativeCompositeSpeed: pwrVel.compositeSpeed,
      powerWristRelativeDirectionDeg: pwrVel.directionDeg,
      handSpanVelocity: handSpanVel,
      bodyCenterY: bCY.value,
      bodyCenterVerticalDisplacement: bCDisp,
      bodyCenterVerticalVelocity: bCY.velocity,
      inferredSide: this._inferredSide,
      inferredSideConfidence: this._inferredConfidence,
      deltaTimeMs: dt,
    };

    // 覆盖有效性标记（速度相关）
    const valid = { ...result.validity };
    valid.powerWristRelHorizVel = pwrVel.horizontalVelocity !== null;
    valid.powerWristRelVertVel = pwrVel.verticalVelocity !== null;
    valid.powerWristRelCompositeSpeed = pwrVel.compositeSpeed !== null;
    valid.powerWristRelDirection = pwrVel.directionDeg !== null;
    valid.handSpanVelocity = handSpanVelValid;
    valid.bodyCenterDisplacement = bCDisp !== null;
    valid.bodyCenterVelocity = bCY.velocity !== null;
    result.validity = valid;

    // ── 7. Debug 缓存 ──
    this.debug.push({
      timestamp: result.timestamp,
      frameTime: result.frameTime,
      deltaTimeMs: dt,
      selectedSide: result.selectedSide,
      metrics: result,
    });

    return result;
  }

  /** 清空所有状态 */
  resetAll(): void {
    this.elbowLeft.resetAll();
    this.elbowRight.resetAll();
    this.kneeLeft.resetAll();
    this.kneeRight.resetAll();
    this.torsoLean.resetAll();
    this.shoulderLine.resetAll();
    this.hipLine.resetAll();
    this.shoulderHipDiff.resetAll();
    this.handSpanRatio_tracker.resetAll();
    this.topPowerVertOffset.resetAll();
    this.pwrWristRelShX.resetAll();
    this.pwrWristRelShY.resetAll();
    this.pwrWristRelHipX.resetAll();
    this.pwrWristRelHipY.resetAll();
    this.shoulderHeightDiffTracker.resetAll();
    this.bodyCenterYTracker.resetAll();
    this.handSpanVelocityTracker.resetAll();
    this.powerWristVel.resetAll();
    this.calibrator.reset();
    this.debug.reset();
    this._prevHandRatio = null;
    this._prevHandRatioTime = -1;
    this._prevTimestamp = -1;
  }

  get calibrationStatus(): CalibrationStatus {
    return this.calibrator.status;
  }
}
