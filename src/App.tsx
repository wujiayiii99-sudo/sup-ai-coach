/**
 * 桨板直线划行 AI 陪练 - 主组件
 *
 * 功能：摄像头管理、姿态检测循环、状态显示
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { initializeDetector, detectPose, closeDetector } from "./poseDetector";
import { startCamera, stopCamera } from "./camera";
import { drawPose, drawStickMarkers } from "./drawing";
import { applySmoothing, resetSmoothing } from "./smoothing";
import {
  computeBodyStatus,
  computeSignedLeanDeg,
  formatLeanAngle,
  computeHandSpanRatio,
  type LeanResult,
} from "./poseMetrics";
import {
  stabilizeBodyStatus,
  smoothLeanAngle,
  smoothHandRatio,
  resetMetrics,
} from "./metricStabilizer";
import {
  detectMarkers,
  getMarkerPerformance,
  resetMarkerState,
  MARKER_DETECTOR_CONFIG,
} from "./markerDetector";
import { computeStickAngle } from "./stickMetrics";
import {
  computeRawStickStatus,
  stabilizeStickStatus,
  smoothStickAngle,
  resetStickState,
  type StickStatus,
} from "./stickStabilizer";
import {
  computeWristStickDistances,
  pushStabilitySample,
  checkStability,
  clearStabilityHistory,
  getPostureBlockedReason,
  type WristStickResult,
} from "./postureMetrics";
import {
  updatePostureState,
  resetPostureState,
  type PosturePhase,
} from "./postureStabilizer";
import "./App.css";

/** 应用状态类型 */
type AppStatus =
  | "模型加载中"
  | "摄像头未启动"
  | "未检测到人体"
  | "人体识别正常"
  | "发生错误";

/** 状态对应的指示点 CSS 类名 */
const STATUS_DOT_CLASS: Record<AppStatus, string> = {
  "模型加载中": "dot-loading",
  "摄像头未启动": "dot-ready",
  "未检测到人体": "dot-no-body",
  "人体识别正常": "dot-detecting",
  "发生错误": "dot-error",
};

function App() {
  // ---- 状态 ----
  const [status, setStatus] = useState<AppStatus>("模型加载中");
  const [fps, setFps] = useState(0);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [modelReady, setModelReady] = useState(false);

  // ---- 引用 ----
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const statusRef = useRef<AppStatus>("模型加载中");
  const isRunningRef = useRef(false);
  const animationIdRef = useRef(0);
  const fpsCounterRef = useRef(0);
  const fpsLastTimeRef = useRef(performance.now());
  const lastFrameTimeRef = useRef(-1);

  // ---- V1 指标状态 ----
  const [metricsBodyStatus, setMetricsBodyStatus] = useState("");
  const [metricsLean, setMetricsLean] = useState<LeanResult | null>(null);
  const [metricsHandRatio, setMetricsHandRatio] = useState<number | null>(null);

  // ---- V2 杆体识别状态 ----
  const [stickStatus, setStickStatus] = useState<StickStatus>("杆体识别不完整");
  const [stickAngleStr, setStickAngleStr] = useState<string>("--");
  const [markerDetectTime, setMarkerDetectTime] = useState<string>("");
  const markerRedRef = useRef<{ x: number; y: number } | null>(null);
  const markerBlueRef = useRef<{ x: number; y: number } | null>(null);
  const markerValidRef = useRef(false);
  const stickAngleRef = useRef<number | null>(null);
  const stickStatusRef = useRef<StickStatus>("杆体识别不完整");

  // ---- V3 静态姿势状态 ----
  const [posturePhase, setPosturePhase] = useState<PosturePhase>("idle");
  const [postureReason, setPostureReason] = useState<string | null>(null);
  const [wristDist, setWristDist] = useState<WristStickResult | null>(null);

  // ================================================================
  // 初始化姿态检测模型
  // ================================================================
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        await initializeDetector();
        if (!cancelled) {
          setModelReady(true);
          statusRef.current = "摄像头未启动";
          setStatus("摄像头未启动");
        }
      } catch (err) {
        if (!cancelled) {
          statusRef.current = "发生错误";
          setStatus("发生错误");
          setErrorMessage(
            `模型加载失败：${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    }

    init();

    // 组件卸载时释放模型资源
    return () => {
      cancelled = true;
      closeDetector();
    };
  }, []);

  // ================================================================
  // 检测循环：摄像头开启时持续检测并绘制
  // ================================================================
  useEffect(() => {
    if (!isCameraOn) return;

    isRunningRef.current = true;

    function detectLoop(): void {
      if (!isRunningRef.current) return;

      // 每次回调重新读取 ref，确保元素未被卸载
      const v = videoRef.current;
      const c = canvasRef.current;
      if (!v || !c) {
        animationIdRef.current = requestAnimationFrame(detectLoop);
        return;
      }

      // 确保视频帧已就绪
      if (v.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        try {
          const rawLandmarks = detectPose(v);

          // 对原始关键点应用平滑（仅影响绘制，不修改原始数据）
          const displayLandmarks = applySmoothing(rawLandmarks, v.currentTime);

          // 同步 canvas 尺寸与视频尺寸
          if (c.width !== v.videoWidth || c.height !== v.videoHeight) {
            c.width = v.videoWidth;
            c.height = v.videoHeight;
          }

          // 绘制关键点和骨架（使用平滑后的数据）
          const ctx = c.getContext("2d");
          if (ctx) {
            drawPose(ctx, c.width, c.height, displayLandmarks);
          }

          // 状态判断基于原始检测结果，不受平滑影响
          const newStatus: AppStatus =
            rawLandmarks && rawLandmarks.length > 0
              ? "人体识别正常"
              : "未检测到人体";
          if (statusRef.current !== newStatus) {
            statusRef.current = newStatus;
            setStatus(newStatus);
          }

          // ---- V2 杆体标记检测（限频 ~12fps） ----
          if (v.currentTime !== lastFrameTimeRef.current) {
            const markerResult = detectMarkers(v, rawLandmarks);
            if (markerResult) {
              markerRedRef.current = markerResult.pink;
              markerBlueRef.current = markerResult.green;
              markerValidRef.current =
                markerResult.score >= MARKER_DETECTOR_CONFIG.minTotalScore;

              // 标记检测性能
              const perf = getMarkerPerformance();
              setMarkerDetectTime(`${perf.lastMs.toFixed(1)}ms`);

              // 计算杆体状态和角度
              const rawStatus = computeRawStickStatus(
                markerResult.pink !== null,
                markerResult.green !== null,
                markerResult.score,
                MARKER_DETECTOR_CONFIG.minTotalScore
              );
              const stableStatus = stabilizeStickStatus(rawStatus, v.currentTime);
              setStickStatus(stableStatus);

              let rawAngleDeg: number | null = null;
              if (markerResult.pink && markerResult.green) {
                const angle = computeStickAngle(
                  markerResult.pink.x,
                  markerResult.pink.y,
                  markerResult.green.x,
                  markerResult.green.y
                );
                rawAngleDeg = angle ? angle.signedDeg : null;
              }

              const smoothedDeg = smoothStickAngle(rawAngleDeg, v.currentTime);
              stickAngleRef.current = smoothedDeg;
              stickStatusRef.current = stableStatus;

              if (smoothedDeg !== null && stableStatus === "杆体识别正常") {
                const absD = Math.abs(smoothedDeg);
                const dir = smoothedDeg > 0 ? "向左倾斜" : "向右倾斜";
                let lv = "";
                if (absD >= 10) lv = "明显";
                else if (absD >= 5) lv = "轻微";
                setStickAngleStr(`${absD.toFixed(1)}° ${lv}${lv ? " " : ""}${dir}`);
              } else {
                setStickAngleStr("--");
              }

              // 在 Canvas 上绘制标记
              if (ctx) {
                drawStickMarkers(
                  ctx,
                  c.width,
                  c.height,
                  markerResult.pink,
                  markerResult.green,
                  markerResult.score >= MARKER_DETECTOR_CONFIG.minTotalScore
                );
              }
            }
          }

          // ---- V1 基础指标计算（仅在新视频帧上执行） ----
          if (v.currentTime !== lastFrameTimeRef.current) {
            lastFrameTimeRef.current = v.currentTime;
            const ct = v.currentTime;

            // 人体完整入镜
            const rawStatus = computeBodyStatus(rawLandmarks);
            const stableStatus = stabilizeBodyStatus(rawStatus, ct);
            setMetricsBodyStatus(stableStatus);

            // 身体侧倾角
            const signedDeg = computeSignedLeanDeg(rawLandmarks);
            const smoothedDeg = smoothLeanAngle(signedDeg, ct);
            setMetricsLean(smoothedDeg !== null ? formatLeanAngle(smoothedDeg) : null);

            // 双手间距比
            const rawRatio = computeHandSpanRatio(rawLandmarks);
            const smoothedRatio = smoothHandRatio(
              rawRatio !== null ? rawRatio.ratio : null,
              ct
            );
            setMetricsHandRatio(smoothedRatio);

            // ---- V3 静态握桨姿势 ----
            const pink = markerRedRef.current;
            const green = markerBlueRef.current;
            const markersValid = markerValidRef.current;

            // 手腕距杆体距离
            let wristResult: WristStickResult | null = null;
            if (rawLandmarks && pink && green && markersValid) {
              wristResult = computeWristStickDistances(
                rawLandmarks,
                pink.x, pink.y,
                green.x, green.y
              );
            }
            setWristDist(wristResult);

            // 稳定性样本
            if (rawLandmarks && rawLandmarks.length >= 33) {
              const lw = rawLandmarks[15];
              const rw = rawLandmarks[16];
              if (lw && rw && (lw.visibility ?? 0) >= 0.5 && (rw.visibility ?? 0) >= 0.5) {
                pushStabilitySample({
                  time: performance.now(),
                  leftWristX: lw.x,
                  leftWristY: lw.y,
                  rightWristX: rw.x,
                  rightWristY: rw.y,
                  stickAngle: stickAngleRef.current ?? 0,
                  leanAngle: signedDeg ?? 0,
                  handRatio: rawRatio !== null ? rawRatio.ratio : null,
                });
              }
            }

            // 姿势可分析条件 + 稳定性
            const blockedReason = getPostureBlockedReason(
              stableStatus,
              stickStatusRef.current,
              rawLandmarks,
              stickAngleRef.current,
              wristResult
            );

            const isStable = blockedReason === null
              ? checkStability(performance.now())
              : false;

            const phase = updatePostureState(
              blockedReason === null && isStable,
              performance.now()
            );
            setPosturePhase(phase);

            if (phase === "warming") {
              setPostureReason("请保持当前姿势片刻");
            } else if (phase === "idle") {
              setPostureReason(blockedReason ?? "无法进行姿势分析");
            } else {
              setPostureReason(null);
            }
          }
        } catch (err) {
          if (statusRef.current !== "发生错误") {
            statusRef.current = "发生错误";
            setStatus("发生错误");
            setErrorMessage(
              `检测错误：${err instanceof Error ? err.message : String(err)}`
            );
          }
        }
      }

      // ---- FPS 计算（每秒更新一次） ----
      fpsCounterRef.current++;
      const now = performance.now();
      const elapsed = now - fpsLastTimeRef.current;
      if (elapsed >= 1000) {
        setFps(Math.round((fpsCounterRef.current / elapsed) * 1000));
        fpsCounterRef.current = 0;
        fpsLastTimeRef.current = now;
      }

      animationIdRef.current = requestAnimationFrame(detectLoop);
    }

    animationIdRef.current = requestAnimationFrame(detectLoop);

    // 停止摄像头时取消动画循环
    return () => {
      isRunningRef.current = false;
      cancelAnimationFrame(animationIdRef.current);
    };
  }, [isCameraOn]);

  // ================================================================
  // 页面后台时自动停止摄像头
  // ================================================================
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden && streamRef.current) {
        isRunningRef.current = false;
        cancelAnimationFrame(animationIdRef.current);
        stopCamera(streamRef.current);
        streamRef.current = null;
        setIsCameraOn(false);
        statusRef.current = "摄像头未启动";
        setStatus("摄像头未启动");
        resetSmoothing();
        resetMetrics();
        resetStickState();
        resetMarkerState();
        resetPostureState();
        clearStabilityHistory();
        setMetricsBodyStatus("");
        setMetricsLean(null);
        setMetricsHandRatio(null);
        markerRedRef.current = null;
        markerBlueRef.current = null;
        markerValidRef.current = false;
        const canvas = canvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext("2d");
          if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  // ================================================================
  // 页面卸载时释放摄像头资源并重置平滑状态
  // ================================================================
  useEffect(() => {
    return () => {
      stopCamera(streamRef.current);
      resetSmoothing();
      resetMetrics();
      resetStickState();
      resetMarkerState();
      resetPostureState();
      clearStabilityHistory();
    };
  }, []);

  // ================================================================
  // 事件处理
  // ================================================================

  /** 启动摄像头 */
  const handleStartCamera = useCallback(async () => {
    try {
      setErrorMessage(null);
      resetSmoothing();
      resetMetrics();
      resetStickState();
      resetMarkerState();
      resetPostureState();
      clearStabilityHistory();
      const video = videoRef.current;
      if (!video) return;

      const stream = await startCamera(video, "user");
      streamRef.current = stream;
      setIsCameraOn(true);
      statusRef.current = "未检测到人体";
      setStatus("未检测到人体");
    } catch (err) {
      statusRef.current = "发生错误";
      setStatus("发生错误");
      const message =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "摄像头权限被拒绝，请在浏览器设置中允许访问摄像头"
          : `摄像头启动失败：${err instanceof Error ? err.message : String(err)}`;
      setErrorMessage(message);
    }
  }, []);

  /** 停止摄像头 */
  const handleStopCamera = useCallback(() => {
    isRunningRef.current = false;
    resetSmoothing();
    resetMetrics();
    resetStickState();
    resetMarkerState();
    resetPostureState();
    clearStabilityHistory();
    markerRedRef.current = null;
    markerBlueRef.current = null;
    markerValidRef.current = false;
    stopCamera(streamRef.current);
    streamRef.current = null;
    setIsCameraOn(false);
    statusRef.current = "摄像头未启动";
    setStatus("摄像头未启动");

    // 清空 canvas
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, []);

  // ================================================================
  // 渲染
  // ================================================================

  return (
    <div className="app">
      {/* 标题 */}
      <h1 className="app-title">桨板直线划行 AI 陪练</h1>

      {/* 说明 */}
      <p className="app-description">
        请将设备放在身体正前方，并确保全身完整进入画面
      </p>

      {/* 控制按钮 */}
      <div className="controls">
        {!isCameraOn ? (
          <button
            className="btn btn-start"
            onClick={handleStartCamera}
            disabled={!modelReady}
          >
            启动摄像头
          </button>
        ) : (
          <button className="btn btn-stop" onClick={handleStopCamera}>
            停止摄像头
          </button>
        )}
      </div>

      {/* 隐私提示 */}
      <p className="privacy-notice">
        摄像头画面仅在当前设备浏览器中实时处理，不会上传或保存。
      </p>

      {/* 视频与 Canvas 叠加区域 */}
      <div className={`video-wrapper ${isCameraOn ? "mirrored" : ""}`}>
        <video ref={videoRef} playsInline />
        <canvas ref={canvasRef} className="pose-canvas" />
      </div>

      {/* 状态与 FPS */}
      <div className="status-bar">
        <div className="status-indicator">
          <span className={`status-dot ${STATUS_DOT_CLASS[status]}`} />
          <span>{status}</span>
        </div>
        {isCameraOn && <div className="fps-display">FPS: {fps}</div>}
      </div>

      {/* ---- V1 基础动作指标 ---- */}
      {isCameraOn && (
        <div className="metrics-panel">
          <div className="metrics-title">📐 基础动作指标</div>
          <div className="metrics-grid">
            <div className="metric-item">
              <span className="metric-label">人体入镜</span>
              <span className={`metric-value ${metricsBodyStatus === "人体完整入镜" ? "status-ok" : "status-warn"}`}>
                {metricsBodyStatus || "检测中..."}
              </span>
            </div>
            <div className="metric-item">
              <span className="metric-label">身体侧倾</span>
              <span className="metric-value">
                {metricsLean
                  ? `${metricsLean.angleDeg}° ${metricsLean.level}${metricsLean.level ? " " : ""}${metricsLean.direction}`
                  : "--"}
              </span>
            </div>
            <div className="metric-item">
              <span className="metric-label">双手间距</span>
              <span className="metric-value">
                {metricsHandRatio !== null
                  ? `${metricsHandRatio.toFixed(2)} 倍肩宽`
                  : "--"}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ---- V2 杆体识别 ---- */}
      {isCameraOn && (
        <div className="metrics-panel">
          <div className="metrics-title">🪵 杆体识别</div>
          <div className="metrics-grid">
            <div className="metric-item">
              <span className="metric-label">杆体状态</span>
              <span className={`metric-value ${stickStatus === "杆体识别正常" ? "status-ok" : "status-warn"}`}>
                {stickStatus}
              </span>
            </div>
            <div className="metric-item">
              <span className="metric-label">杆体方向</span>
              <span className="metric-value">{stickAngleStr}</span>
            </div>
            <div className="metric-item">
              <span className="metric-label">标记检测</span>
              <span className="metric-value marker-perf">{markerDetectTime}</span>
            </div>
          </div>
        </div>
      )}

      {/* ---- V3 静态握桨姿势 ---- */}
      {isCameraOn && (
        <div className="metrics-panel">
          <div className="metrics-title">🧘 静态握桨姿势</div>
          <div className="metrics-grid">
            <div className="metric-item">
              <span className="metric-label">分析状态</span>
              <span className={`metric-value ${posturePhase === "active" ? "status-ok" : "status-warn"}`}>
                {posturePhase === "active"
                  ? "✅ 可以进行姿势分析"
                  : posturePhase === "warming"
                    ? "⏳ 请保持当前姿势片刻"
                    : `⚠️ ${postureReason ?? "无法分析"}`}
              </span>
            </div>
            {posturePhase === "active" && (
              <>
                <div className="metric-item">
                  <span className="metric-label">杆体状态</span>
                  <span className="metric-value">{stickAngleStr}</span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">身体状态</span>
                  <span className="metric-value">
                    {metricsLean
                      ? `${metricsLean.angleDeg}° ${metricsLean.level}${metricsLean.level ? " " : ""}${metricsLean.direction}`
                      : "--"}
                  </span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">双手间距</span>
                  <span className="metric-value">
                    {metricsHandRatio !== null
                      ? `${metricsHandRatio.toFixed(2)} 倍肩宽`
                      : "--"}
                  </span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">左手距杆体</span>
                  <span className="metric-value">
                    {wristDist
                      ? `${wristDist.leftRatio.toFixed(2)} 倍肩宽（${wristDist.leftStatus}）`
                      : "--"}
                  </span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">右手距杆体</span>
                  <span className="metric-value">
                    {wristDist
                      ? `${wristDist.rightRatio.toFixed(2)} 倍肩宽（${wristDist.rightStatus}）`
                      : "--"}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 错误提示 */}
      {errorMessage && <div className="error-msg">{errorMessage}</div>}
    </div>
  );
}

export default App;
