/**
 * 桨板直线划行 AI 陪练 - 主组件
 *
 * V4.1 更新：
 * - V2/V3 由 featureFlags 控制，默认关闭
 * - V4.1 纯人体徒手划桨动作指标层
 * - 侧选 UI + 20 项指标面板 + debug 导出
 */
import { useState, useRef, useEffect, useCallback } from "react";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
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
// ---- V4.1 导入 ----
import { FEATURE_FLAGS } from "./featureFlags";
import { getStrokeRoles } from "./bodyStroke/bodyStrokeRoles";
import { computeStrokeMetrics } from "./bodyStroke/bodyStrokeMetrics";
import { StrokeTracker } from "./bodyStroke/bodyStrokeTracker";
import { StrokePhaseMachine } from "./bodyStroke/bodyStrokePhases";
import type { BodyStrokeMetrics, StrokeSide, CalibrationStatus, PhaseState, StrokePhase } from "./bodyStroke/bodyStrokeTypes";
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

  // ---- V4.1 状态 ----
  const [selectedStrokeSide, setSelectedStrokeSide] = useState<StrokeSide>("right");
  const [detectedStrokeSide, setDetectedStrokeSide] = useState<StrokeSide | null>(null);
  const [strokeMetrics, setStrokeMetrics] = useState<BodyStrokeMetrics | null>(null);
  const [calibrationStatus, setCalibrationStatus] = useState<CalibrationStatus>("uncalibrated");
  const [showAdvancedMetrics, setShowAdvancedMetrics] = useState(false);
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [sessionReportReady, setSessionReportReady] = useState(false);
  const [sessionReportData, setSessionReportData] = useState<{
    items: { title: string; value: string; comment: string }[];
    score: number | null;
  } | null>(null);
  const selectedSideRef = useRef<StrokeSide>("right");
  const detectedStrokeSideRef = useRef<StrokeSide | null>(null);
  const strokeTrackerRef = useRef<StrokeTracker | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const lastDebugRef = useRef<any>(null);
  const [lastDebugText, setLastDebugText] = useState<string>("{}");
  const latestStrokeMetricsRef = useRef<BodyStrokeMetrics | null>(null);

  // ---- V4.2 状态 ----
  const [phaseState, setPhaseState] = useState<PhaseState | null>(null);
  const phaseMachineRef = useRef<StrokePhaseMachine | null>(null);

  // 同步 ref
  useEffect(() => {
    selectedSideRef.current = selectedStrokeSide;
  }, [selectedStrokeSide]);

  useEffect(() => {
    detectedStrokeSideRef.current = detectedStrokeSide;
  }, [detectedStrokeSide]);

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

    return () => {
      cancelled = true;
      closeDetector();
    };
  }, []);

  // ================================================================
  // 初始化 StrokeTracker
  // ================================================================
  useEffect(() => {
    strokeTrackerRef.current = new StrokeTracker();
    phaseMachineRef.current = new StrokePhaseMachine();
    return () => {
      strokeTrackerRef.current?.resetAll();
	      phaseMachineRef.current?.reset();
      strokeTrackerRef.current = null;
      phaseMachineRef.current = null;
    };
  }, []);

  // ================================================================
  // 检测循环
  // ================================================================
  useEffect(() => {
    if (!isCameraOn) return;

    isRunningRef.current = true;

    function detectLoop(): void {
      if (!isRunningRef.current) return;

      const v = videoRef.current;
      const c = canvasRef.current;
      if (!v || !c) {
        animationIdRef.current = requestAnimationFrame(detectLoop);
        return;
      }

      let _lastFrameLandmarks: NormalizedLandmark[] | null = null;
      if (v.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        try {
          const rawLandmarks = detectPose(v);
          _lastFrameLandmarks = rawLandmarks;
          const displayLandmarks = applySmoothing(rawLandmarks, v.currentTime);

          if (c.width !== v.videoWidth || c.height !== v.videoHeight) {
            c.width = v.videoWidth;
            c.height = v.videoHeight;
          }

          const ctx = c.getContext("2d");
          if (ctx) {
            drawPose(ctx, c.width, c.height, displayLandmarks);
          }

          const newStatus: AppStatus =
            rawLandmarks && rawLandmarks.length > 0
              ? "人体识别正常"
              : "未检测到人体";
          if (statusRef.current !== newStatus) {
            statusRef.current = newStatus;
            setStatus(newStatus);
          }

          // ============================================================
          // V2 杆体标记检测（由 FEATURE_FLAGS 控制，默认关闭）
          // ============================================================
          if (FEATURE_FLAGS.V2_STICK_DETECTION && v.currentTime !== lastFrameTimeRef.current) {
            const markerResult = detectMarkers(v, rawLandmarks);
            if (markerResult) {
              markerRedRef.current = markerResult.pink;
              markerBlueRef.current = markerResult.green;
              markerValidRef.current =
                markerResult.score >= MARKER_DETECTOR_CONFIG.minTotalScore;

              const perf = getMarkerPerformance();
              setMarkerDetectTime(`${perf.lastMs.toFixed(1)}ms`);

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
                  markerResult.pink.x, markerResult.pink.y,
                  markerResult.green.x, markerResult.green.y
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

              if (ctx) {
                drawStickMarkers(ctx, c.width, c.height,
                  markerResult.pink, markerResult.green,
                  markerResult.score >= MARKER_DETECTOR_CONFIG.minTotalScore
                );
              }
            }
          }

          // ============================================================
          // V1 基础指标（保持运行）+ V3 + V4.1
          // ============================================================
          if (v.currentTime !== lastFrameTimeRef.current) {
            lastFrameTimeRef.current = v.currentTime;
            const ct = v.currentTime;

            // ---- V1 指标 ----
            const rawStatus = computeBodyStatus(rawLandmarks);
            const stableBodyStatus = stabilizeBodyStatus(rawStatus, ct);
            setMetricsBodyStatus(stableBodyStatus);

            const signedDeg = computeSignedLeanDeg(rawLandmarks);
            const smoothedLeanDeg = smoothLeanAngle(signedDeg, ct);
            setMetricsLean(smoothedLeanDeg !== null ? formatLeanAngle(smoothedLeanDeg) : null);

            const rawRatio = computeHandSpanRatio(rawLandmarks);
            const smoothedRatio = smoothHandRatio(
              rawRatio !== null ? rawRatio.ratio : null, ct
            );
            setMetricsHandRatio(smoothedRatio);

            // ---- V3 静态握桨姿势（由 FEATURE_FLAGS 控制，默认关闭）----
            if (FEATURE_FLAGS.V3_POSTURE_ANALYSIS) {
              const pink = markerRedRef.current;
              const green = markerBlueRef.current;
              const markersValid = markerValidRef.current;

              let wristResult: WristStickResult | null = null;
              if (rawLandmarks && pink && green && markersValid) {
                wristResult = computeWristStickDistances(
                  rawLandmarks, pink.x, pink.y, green.x, green.y
                );
              }
              setWristDist(wristResult);

              if (rawLandmarks && rawLandmarks.length >= 33) {
                const lw = rawLandmarks[15];
                const rw = rawLandmarks[16];
                if (lw && rw && (lw.visibility ?? 0) >= 0.5 && (rw.visibility ?? 0) >= 0.5) {
                  pushStabilitySample({
                    time: performance.now(),
                    leftWristX: lw.x, leftWristY: lw.y,
                    rightWristX: rw.x, rightWristY: rw.y,
                    stickAngle: stickAngleRef.current ?? 0,
                    leanAngle: signedDeg ?? 0,
                    handRatio: rawRatio !== null ? rawRatio.ratio : null,
                  });
                }
              }

              const blockedReason = getPostureBlockedReason(
                stableBodyStatus, stickStatusRef.current, rawLandmarks,
                stickAngleRef.current, wristResult
              );
              const isStable = blockedReason === null
                ? checkStability(performance.now()) : false;
              const phase = updatePostureState(
                blockedReason === null && isStable, performance.now()
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

            // ---- V4.1 徒手划桨指标 ----
            if (FEATURE_FLAGS.V4_STROKE_ANALYSIS && rawLandmarks) {
              const now = performance.now();
              const prevTs = strokeTrackerRef.current
                ? (strokeTrackerRef.current as any)._prevTimestamp
                : now;
              // 使用用户手动选择的划桨侧
              const side = selectedSideRef.current;
              const roles = getStrokeRoles(side);
              const raw = computeStrokeMetrics(
                rawLandmarks, roles, now, ct,
                typeof prevTs === "number" && prevTs > 0 ? prevTs : now,
              );
              const smoothed = strokeTrackerRef.current!.update(raw, now, stableBodyStatus);
              setStrokeMetrics(smoothed);
              latestStrokeMetricsRef.current = smoothed;

              // 校准状态同步到 UI
              const calStatus = strokeTrackerRef.current!.calibrationStatus;
              setCalibrationStatus(calStatus);

              // V4.2 阶段状态机更新
              if (phaseMachineRef.current) {
                const activeSide = detectedStrokeSideRef.current ?? selectedSideRef.current;
                const ps = phaseMachineRef.current.update(smoothed, now, activeSide);
                if (ps.justTransitioned || phaseState?.phase !== ps.phase) {
                  setPhaseState(ps);
                }
              }
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

      // ---- FPS ----
      fpsCounterRef.current++;
      const now = performance.now();
      const elapsed = now - fpsLastTimeRef.current;
      if (elapsed >= 1000) {
        setFps(Math.round((fpsCounterRef.current / elapsed) * 1000));
        fpsCounterRef.current = 0;
        fpsLastTimeRef.current = now;
      }

      // 更新最近一帧调试数据（轻量摘要）
      try {
        const visibleCount = (_lastFrameLandmarks || []).reduce((acc: number, kp: any) => acc + (((kp.visibility ?? 0) >= 0.5) ? 1 : 0), 0);
        lastDebugRef.current = {
          timestamp: Date.now(),
          status: statusRef.current,
          calibrationStatus,
          posturePhase,
          markerValid: markerValidRef.current,
          stickStatus: stickStatusRef.current,
          stickAngle: stickAngleRef.current,
          detectedStrokeSide: detectedStrokeSideRef.current,
          metrics: {
            lean: metricsLean,
            handRatio: metricsHandRatio,
            strokeMetrics: sm ? {
              elbowAngleDeg: sm.elbowAngleDeg,
              kneeAngleDeg: sm.kneeAngleDeg,
              torsoLeanDeg: sm.torsoLeanDeg,
              shoulderHipProjectedAngleDiffDeg: sm.shoulderHipProjectedAngleDiffDeg,
            } : null,
          },
          rawLandmarksCount: _lastFrameLandmarks ? _lastFrameLandmarks.length : 0,
          visibleKeypoints: visibleCount,
        };
      } catch (e) {
        // ignore
      }

      animationIdRef.current = requestAnimationFrame(detectLoop);
    }

    animationIdRef.current = requestAnimationFrame(detectLoop);

    return () => {
      isRunningRef.current = false;
      cancelAnimationFrame(animationIdRef.current);
    };
  }, [isCameraOn]);

  useEffect(() => {
    if (!isCameraOn || sessionStartedAt === null) return;
    const activeScores: number[] = [];
    let maxActiveSpeed = 0;
    const id = window.setInterval(() => {
      const elapsedSeconds = Math.floor((performance.now() - sessionStartedAt) / 1000);
      setSessionSeconds(Math.min(elapsedSeconds, 15));

      // 只在拉桨/推桨阶段采集评分，静止/准备/暂停帧不计入
      const phase = phaseMachineRef.current?.currentPhase;
      const m = latestStrokeMetricsRef.current;
      if (m && (phase === "pull" || phase === "push")) {
        const s = computeSessionScore(m);
        if (s !== null) activeScores.push(s);
        if (m.powerWristRelativeCompositeSpeed !== null) {
          maxActiveSpeed = Math.max(maxActiveSpeed, m.powerWristRelativeCompositeSpeed);
        }
      }

      if (elapsedSeconds >= 15) {
        clearInterval(id); // 冻结报告，不再覆盖
        setSessionReportReady(true);
        const activeSide = selectedSideRef.current;
        const lastM = latestStrokeMetricsRef.current;
        const items = lastM ? buildReportItems(lastM, activeSide) : [];
        const strokeCount = phaseMachineRef.current?.strokeCount ?? 0;

        // 综合评分 = 动作质量(60%) + 完成桨数(40%)
        // 动作质量：拉桨/推桨阶段的指标平均分
        // 完成桨数：每完成一桨 = 20分，5桨满分
        let finalScore: number | null = null;
        const qualityScore = activeScores.length > 0
          ? Math.round(activeScores.reduce((a, b) => a + b, 0) / activeScores.length)
          : 0;
        const activityScore = Math.min(100, strokeCount * 20); // 每桨+20，5桨满分

        if (strokeCount > 0) {
          // 有完整划桨周期：质量60% + 活动量40%
          finalScore = Math.round(qualityScore * 0.6 + activityScore * 0.4);
        } else if (activeScores.length > 3) {
          // 有动作但未成完整周期，给一个基础分
          finalScore = Math.round(Math.min(55, qualityScore * 0.5 + 15));
        } else {
          // 基本没动，最高45分
          finalScore = Math.min(45, qualityScore);
        }

        setSessionReportData({
          items,
          score: Math.max(0, Math.min(100, finalScore)),
        });
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [isCameraOn, sessionStartedAt]);

  // 当调试面板展开时，定时把 lastDebugRef 写入可复制文本（降低渲染频率）
  useEffect(() => {
    if (!debugOpen) return;
    const id = window.setInterval(() => {
      try {
        const obj = lastDebugRef.current ?? {};
        setLastDebugText(JSON.stringify(obj, null, 2));
      } catch (e) {
        setLastDebugText("{}");
      }
    }, 500);
    return () => window.clearInterval(id);
  }, [debugOpen]);

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
        if (FEATURE_FLAGS.V2_STICK_DETECTION) {
          resetStickState();
          resetMarkerState();
        }
        if (FEATURE_FLAGS.V3_POSTURE_ANALYSIS) {
          resetPostureState();
          clearStabilityHistory();
        }
        setMetricsBodyStatus("");
        setMetricsLean(null);
        setMetricsHandRatio(null);
        markerRedRef.current = null;
        markerBlueRef.current = null;
        markerValidRef.current = false;
        strokeTrackerRef.current?.resetAll();
	      phaseMachineRef.current?.reset();
        setStrokeMetrics(null);
        setCalibrationStatus("uncalibrated");
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
  // 页面卸载时释放资源
  // ================================================================
  useEffect(() => {
    return () => {
      stopCamera(streamRef.current);
      resetSmoothing();
      resetMetrics();
      if (FEATURE_FLAGS.V2_STICK_DETECTION) {
        resetStickState();
        resetMarkerState();
      }
      if (FEATURE_FLAGS.V3_POSTURE_ANALYSIS) {
        resetPostureState();
        clearStabilityHistory();
      }
      strokeTrackerRef.current?.resetAll();
	      phaseMachineRef.current?.reset();
    };
  }, []);

  // ================================================================
  // D 键导出 debug JSON
  // ================================================================
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "d" || e.key === "D") {
        const tracker = strokeTrackerRef.current;
        if (!tracker) return;
        const json = tracker.debug.exportJSON();
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `v41-debug-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  // ================================================================
  // 事件处理
  // ================================================================

  const handleStartCamera = useCallback(async () => {
    try {
      setErrorMessage(null);
      resetSmoothing();
      resetMetrics();
      if (FEATURE_FLAGS.V2_STICK_DETECTION) {
        resetStickState();
        resetMarkerState();
      }
      if (FEATURE_FLAGS.V3_POSTURE_ANALYSIS) {
        resetPostureState();
        clearStabilityHistory();
      }
      strokeTrackerRef.current?.resetAll();
	      phaseMachineRef.current?.reset();
      setStrokeMetrics(null);
      setCalibrationStatus("uncalibrated");
      setDetectedStrokeSide(null);
      detectedStrokeSideRef.current = null;
      // 流程变更：仅开启摄像头，不自动开始测试，等待用户在侧边栏点击“开始测试”
      setSessionStartedAt(null);
      setSessionSeconds(0);
      setSessionReportReady(false);
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

  const handleStartTest = useCallback(() => {
    // 必要条件：检测到人体并且四肢/站姿/校准准备就绪
    const bodyReady = status === "人体识别正常" && metricsLean !== null && metricsHandRatio !== null;
    const postureReady = FEATURE_FLAGS.V3_POSTURE_ANALYSIS ? posturePhase === "active" : true;
    const calibrationReady = calibrationStatus === "ready";
    if (!bodyReady || !postureReady || !calibrationReady) {
      // 不满足条件直接提示（UI 按钮会被禁用），但为保险起见不启动
      return;
    }

    // 清除之前的报告（开始新测试）
    setSessionReportData(null);
    setDetectedStrokeSide(null);
    detectedStrokeSideRef.current = null;
    // 仅清空 debug，保留校准基线
    strokeTrackerRef.current?.debug.reset();
    strokeTrackerRef.current!._prevHandRatio = null;
    strokeTrackerRef.current!._prevHandRatioTime = -1;
    strokeTrackerRef.current!._prevTimestamp = -1;
    phaseMachineRef.current?.reset();
    setStrokeMetrics(null);
    setSessionReportReady(false);
    setSessionSeconds(0);
    setSessionStartedAt(performance.now());
  }, [status, metricsLean, metricsHandRatio, posturePhase, calibrationStatus]);

  const computeSessionScore = (smParam: BodyStrokeMetrics | null): number | null => {
    if (!smParam) return null;
    const scores: number[] = [];
    const cap = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

    // 1. 肩髋差：8-18° 是划桨转体的最佳范围
    //    静止站姿 ~5-7° → ~70分；僵直 0° → 40分；过度 >25° → 逐渐降低
    if (smParam.shoulderHipProjectedAngleDiffDeg !== null) {
      const d = Math.abs(smParam.shoulderHipProjectedAngleDiffDeg);
      if (d >= 8 && d <= 18) scores.push(100);
      else if (d < 3) scores.push(40);
      else if (d < 8) scores.push(cap(40 + (d - 3) * 8));    // 3-8° 线性上升
      else scores.push(Math.max(30, 100 - (d - 18) * 4));     // >18° 线性下降
    }

    // 2. 下手肘角：120-150° 是拉桨时合理的弯曲范围
    //    静止垂臂 ~175° → ~65分
    const activeElbow = selectedSideRef.current === 'right'
      ? smParam.elbowAngleDeg.right
      : smParam.elbowAngleDeg.left;
    if (activeElbow !== null) {
      const d = Math.abs(activeElbow - 140);
      scores.push(cap(100 - d * 1.5));
    }

    // 3. 膝角：155-175° 微屈最佳
    if (smParam.kneeAngleDeg.left !== null && smParam.kneeAngleDeg.right !== null) {
      const avg = (smParam.kneeAngleDeg.left + smParam.kneeAngleDeg.right) / 2;
      const d = Math.abs(avg - 165);
      scores.push(cap(100 - d * 1.5));
    }

    // 4. 运动状态：是否在主动划桨（关键区分项）
    //    方向也为空说明手腕不可见/未运动 → 30分
    //    不运动 → 40分；低速 → 60分；正常划桨 → 90分
    const speed = smParam.powerWristRelativeCompositeSpeed;
    const dir = smParam.powerWristRelativeDirectionDeg;
    if (speed !== null) {
      if (speed > 0.8) scores.push(90);
      else if (speed > 0.3) scores.push(60);
      else scores.push(40);
    } else if (dir === null) {
      scores.push(30); // 未检测到运动——既无速度也无方向
    }

    // 5. 躯干侧倾：≤6°优秀，≤10°可接受
    if (smParam.torsoLeanDeg !== null) {
      const lean = Math.abs(smParam.torsoLeanDeg);
      const v = lean <= 6 ? 100 : Math.max(0, 100 - (lean - 6) * 6);
      scores.push(cap(v));
    }

    // 6. 身体稳定性：动作中重心稳定加分
    if (smParam.bodyCenterVerticalDisplacement !== null) {
      const d = Math.abs(smParam.bodyCenterVerticalDisplacement);
      scores.push(d <= 0.015 ? 100 : Math.max(0, 100 - (d - 0.015) * 800));
    }

    if (scores.length === 0) return null;
    const avg = Math.round(scores.reduce((s, x) => s + x, 0) / scores.length);
    return cap(avg);
  };

  /** 从指标数据构建报告项（可在组件渲染和定时器回调中复用） */
  const buildReportItems = useCallback((
    m: BodyStrokeMetrics,
    activeSide: StrokeSide,
  ): { title: string; value: string; comment: string }[] => {
    const fv = (v: number | null | undefined, d = 2) =>
      v === null || v === undefined ? "--" : Number(v.toFixed(d)).toString();

    const powerElbow = activeSide === "right" ? m.elbowAngleDeg.right : m.elbowAngleDeg.left;
    const topElbow = activeSide === "right" ? m.elbowAngleDeg.left : m.elbowAngleDeg.right;

    return [
      // 1. 肩髋协调（是否转髋）
      {
        title: "肩髋协调",
        value: fv(m.shoulderHipProjectedAngleDiffDeg, 1) + "°",
        comment: m.shoulderHipProjectedAngleDiffDeg === null
          ? "无法检测肩髋一致性"
          : Math.abs(m.shoulderHipProjectedAngleDiffDeg) <= 6
          ? "肩髋协调良好，转体稳定"
          : Math.abs(m.shoulderHipProjectedAngleDiffDeg) <= 12
          ? "肩髋配合有偏差，注意胸髋同步转动"
          : "肩髋不一致，建议减少上半身错位",
      },
      // 2. 下支撑手肘（弯曲程度）
      {
        title: "下支撑手肘",
        value: fv(powerElbow, 1) + "°",
        comment: powerElbow === null
          ? "无法检测"
          : powerElbow > 165
          ? "下手肘过直，建议保持轻微弯曲"
          : powerElbow >= 145
          ? "下手肘角度适中，保持支撑稳定"
          : "下手肘屈曲较大，注意稳定支撑",
      },
      // 3. 上支撑手肘（NEW）
      {
        title: "上支撑手肘",
        value: fv(topElbow, 1) + "°",
        comment: topElbow === null
          ? "无法检测"
          : topElbow > 170
          ? "上手肘接近伸直，上半身较舒展"
          : topElbow >= 140
          ? "上手肘角度适中，保持稳定"
          : "上手肘屈曲较大，注意举臂高度",
      },
      // 4. 上下手垂直差（NEW）
      {
        title: "上下手垂直差",
        value: m.topPowerVerticalOffsetRatio !== null
          ? fv(m.topPowerVerticalOffsetRatio, 2) + "×肩" : "--",
        comment: m.topPowerVerticalOffsetRatio === null
          ? "无法检测"
          : m.topPowerVerticalOffsetRatio >= 1.5
          ? "上下手间距充足，桨杆握距合适"
          : m.topPowerVerticalOffsetRatio >= 0.8
          ? "上下手间距适中"
          : "上下手垂直距离偏小，注意伸直上手",
      },
      // 5. 膝部姿势
      {
        title: "膝部姿势",
        value: m.kneeAngleDeg.left !== null && m.kneeAngleDeg.right !== null
          ? fv((m.kneeAngleDeg.left + m.kneeAngleDeg.right) / 2, 1) + "°" : "--",
        comment: m.kneeAngleDeg.left === null || m.kneeAngleDeg.right === null
          ? "无法检测双膝角度"
          : (m.kneeAngleDeg.left + m.kneeAngleDeg.right) / 2 > 170
          ? "膝盖接近伸直，建议轻微弯曲以缓冲"
          : "膝部角度良好，保持稳定",
      },
      // 6. 下手运动方向（替代桨角度）
      {
        title: "下手拉桨方向",
        value: m.powerWristRelativeDirectionDeg !== null
          ? fv(Math.abs(m.powerWristRelativeDirectionDeg), 1) + "°"
          : "--",
        comment: m.powerWristRelativeDirectionDeg === null
          ? "静止或速度过低，无法判断方向"
          : (Math.abs(m.powerWristRelativeDirectionDeg) >= 45 && Math.abs(m.powerWristRelativeDirectionDeg) <= 135)
          ? "下手向后拉桨方向合理，沿躯干方向运动"
          : "下手拉桨方向偏斜较大，注意沿直线向后拉",
      },
      // 7. 躯干侧倾
      {
        title: "躯干侧倾",
        value: fv(m.torsoLeanDeg, 1) + "°",
        comment: m.torsoLeanDeg === null
          ? "无法检测"
          : Math.abs(m.torsoLeanDeg) <= 8
          ? "躯干侧倾正常，保持稳定"
          : "侧倾较大，建议保持躯干正直",
      },
      // 8. 身体稳定性
      {
        title: "身体稳定性",
        value: m.bodyCenterVerticalDisplacement !== null
          ? fv(m.bodyCenterVerticalDisplacement, 4) + "×肩" : "--",
        comment: m.bodyCenterVerticalDisplacement === null
          ? "校准未完成"
          : Math.abs(m.bodyCenterVerticalDisplacement) <= 0.02
          ? "身体重心稳定，划行姿态好"
          : "身体重心起伏较大，注意减少上下晃动",
      },
    ];
  }, []);

  const handleStopCamera = useCallback(() => {
    isRunningRef.current = false;
    resetSmoothing();
    resetMetrics();
    if (FEATURE_FLAGS.V2_STICK_DETECTION) {
      resetStickState();
      resetMarkerState();
    }
    if (FEATURE_FLAGS.V3_POSTURE_ANALYSIS) {
      resetPostureState();
      clearStabilityHistory();
    }
    strokeTrackerRef.current?.resetAll();
	      phaseMachineRef.current?.reset();
    setStrokeMetrics(null);
    setCalibrationStatus("uncalibrated");
    setDetectedStrokeSide(null);
    detectedStrokeSideRef.current = null;
    // 保留已生成的 sessionReportData/报告，不在停止摄像头时清除，便于用户查看
    markerRedRef.current = null;
    markerBlueRef.current = null;
    markerValidRef.current = false;
    stopCamera(streamRef.current);
    streamRef.current = null;
    setIsCameraOn(false);
    statusRef.current = "摄像头未启动";
    setStatus("摄像头未启动");

    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, []);

  const handleRecalibrate = useCallback(() => {
    strokeTrackerRef.current?.calibrator.reset();
    setCalibrationStatus("uncalibrated");
  }, []);

  // ================================================================
  // 渲染辅助
  // ================================================================

  const calStatusText = (cs: CalibrationStatus): string => {
    if (cs === "uncalibrated") return "未校准";
    if (cs === "ready") return "已校准";
    return `校准中 ${cs.current}/${cs.target}`;
  };

  const phaseLabel = (p: StrokePhase): string => {
    switch (p) {
      case "pause": return "⏸ 暂停";
      case "ready": return "🏁 准备";
      case "pull": return "⬇ 拉桨";
      case "push": return "⬆ 推桨";
      case "recovery": return "↻ 恢复";
    }
  };

  const f = (v: number | null | undefined, decimals = 2): string => {
    if (v === null || v === undefined) return "--";
    return Number(v.toFixed(decimals)).toString();
  };

  const fm = (v: number | null | undefined, decimals = 2): string => {
    if (v === null || v === undefined) return "--";
    const val = Number(v.toFixed(decimals));
    if (val > 0) return `+${val}`;
    return val.toString();
  };

  const sm = strokeMetrics;

  const activeStrokeSide = selectedStrokeSide;

  const paddleAngleDisplay =
    stickAngleStr !== "--"
      ? stickAngleStr
      : sm?.powerWristRelativeDirectionDeg !== null && sm?.powerWristRelativeDirectionDeg !== undefined
      ? `${f(Math.abs(sm.powerWristRelativeDirectionDeg), 1)}°`
      : "--";

  const sessionCountdownText =
    !isCameraOn
      ? "请先启动摄像头并开始划形"
      : sessionReportReady
      ? "报告已生成，可查看下面评估"
      : `请持续划形 15s，剩余 ${15 - sessionSeconds}s`;


  const reportItems = sm
    ? buildReportItems(sm, activeStrokeSide)
    : [];

  const canStartTest =
    status === "人体识别正常" &&
    metricsLean !== null &&
    metricsHandRatio !== null &&
    (FEATURE_FLAGS.V3_POSTURE_ANALYSIS ? posturePhase === "active" : true) &&
    calibrationStatus === "ready";

  const compactActionHint =
    !isCameraOn
      ? "请先启动摄像头"
      : status === "未检测到人体"
      ? "请进入画面，确保全身可见"
      : calibrationStatus !== "ready"
      ? "请先完成站姿校准"
      : sm?.powerWristRelativeCompositeSpeed !== null && sm?.powerWristRelativeCompositeSpeed !== undefined
      ? sm.powerWristRelativeCompositeSpeed > 1.5
        ? "动作节奏稳定，继续保持"
        : "请注意下手合速度，适当加快"
      : "等待检测结果";

  // ================================================================
  // 渲染
  // ================================================================

  return (
    <div className="app">
      <h1 className="app-title">桨板直线划行 AI 陪练</h1>

      <p className="app-description">
        请将设备放在身体正前方，并确保全身完整进入画面
      </p>

      <div className="controls">
        {!isCameraOn ? (
          <button className="btn btn-start" onClick={handleStartCamera} disabled={!modelReady}>
            启动摄像头
          </button>
        ) : (
          <button className="btn btn-stop" onClick={handleStopCamera}>
            停止摄像头
          </button>
        )}
      </div>

      <p className="privacy-notice">
        摄像头画面仅在当前设备浏览器中实时处理，不会上传或保存。
      </p>

      <div className="session-layout">
        <div className="video-column">
          <div className={`video-wrapper ${isCameraOn ? "mirrored" : ""}`}>
            <video ref={videoRef} playsInline />
            <canvas ref={canvasRef} className="pose-canvas" />
          </div>

          <div className="status-bar">
            <div className="status-indicator">
              <span className={`status-dot ${STATUS_DOT_CLASS[status]}`} />
              <span>{status}</span>
            </div>
            {isCameraOn && <div className="fps-display">FPS: {fps}</div>}
          </div>
        </div>

        <div className="sidebar">
          <div className="session-card">
            <div className="session-card-title">开始划形评估</div>
            <div className="session-card-body">
              <div className="session-card-row">{sessionCountdownText}</div>
              <div className="session-card-row">{detectedStrokeSide ? "自动识别成功" : "正在判断划侧"}</div>
              <div style={{ marginTop: 10 }}>
                <button
                  className="btn btn-start"
                  onClick={handleStartTest}
                  disabled={!isCameraOn || !canStartTest}
                  title={!canStartTest ? "请确保入镜、四肢/站姿识别及校准完成后再开始" : "开始 15s 测试"}
                >
                  开始测试
                </button>
              </div>
            </div>
          </div>

          {sessionReportReady && (
            <div className="report-panel">
              <div className="metrics-title">📋 动作检测报告</div>
              <div className="report-score">
                {sessionReportData && sessionReportData.score !== null ? (
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#00ff88' }}>得分：{sessionReportData.score} / 100</div>
                ) : null}
              </div>
              <div className="report-list">
                {((sessionReportData && sessionReportData.items.length === 0) || (!sessionReportData && reportItems.length === 0)) ? (
                  <div className="report-note">等待更多检测数据...</div>
                ) : (
                  (sessionReportData ? sessionReportData.items : reportItems).map((item) => (
                    <div key={item.title} className="report-item">
                      <div className="report-item-title">{item.title}</div>
                      <div className="report-item-value">{item.value}</div>
                      <div className="report-item-comment">{item.comment}</div>
                    </div>
                  ))
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="btn btn-small" onClick={() => { setSessionReportData(null); setSessionReportReady(false); }}>清除报告</button>
                <button className="btn btn-small" onClick={() => { /* 重新测试：开启摄像头已经在 */ handleStartTest(); }}>重新测试</button>
              </div>
            </div>
          )}

          {/* 调试面板（折叠/展开） */}
          <div className="debug-panel">
            <div className="debug-header">
              <span className="metrics-title">🧾 调试面板</span>
              <button className="btn btn-small" onClick={() => setDebugOpen((s) => !s)}>
                {debugOpen ? '折叠' : '展开'}
              </button>
            </div>
            {debugOpen && (
              <div className="debug-body">
                <div className="debug-keys">
                  <div>pose 有效: {status === '人体识别正常' ? '是' : '否'}</div>
                  <div>stick/paddle 检测: {markerValidRef.current ? '是' : stickStatusRef.current === '杆体识别正常' ? '是' : '否'}</div>
                  <div>stroke phase: {posturePhase}</div>
                  <div>hands distance 有效: {metricsHandRatio !== null ? '是' : '否'}</div>
                  <div>trunk angle 有效: {metricsLean !== null ? '是' : '否'}</div>
                  <div>paddle vertical angle 有效: {paddleAngleDisplay !== '--' ? '是' : '否'}</div>
                  <div>哪些字段为 null: {(() => {
                    const nulls: string[] = [];
                    if (metricsHandRatio === null) nulls.push('handSpanRatio');
                    if (metricsLean === null) nulls.push('torsoLeanDeg');
                    if (!sm) nulls.push('strokeMetrics');
                    if (stickAngleRef.current === null) nulls.push('stickAngle');
                    return nulls.length ? nulls.join(', ') : '无';
                  })()}</div>
                </div>

                <div className="debug-json">
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ fontWeight: 600 }}>最近一帧 Debug JSON</div>
                    <button
                      className="btn btn-small"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(lastDebugText);
                        } catch (e) {
                          const ta = document.createElement('textarea');
                          ta.value = lastDebugText;
                          document.body.appendChild(ta);
                          ta.select();
                          document.execCommand('copy');
                          document.body.removeChild(ta);
                        }
                      }}
                    >复制</button>
                  </div>
                  <pre className="debug-pre">{lastDebugText}</pre>
                </div>
              </div>
            )}
          </div>

        

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
                {metricsHandRatio !== null ? `${metricsHandRatio.toFixed(2)} 倍肩宽` : "--"}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ---- V2 杆体识别（FEATURE_FLAGS 控制）---- */}
      {FEATURE_FLAGS.V2_STICK_DETECTION && isCameraOn && (
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

      {/* ---- V3 静态握桨姿势（FEATURE_FLAGS 控制）---- */}
      {FEATURE_FLAGS.V3_POSTURE_ANALYSIS && isCameraOn && (
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
                    {metricsHandRatio !== null ? `${metricsHandRatio.toFixed(2)} 倍肩宽` : "--"}
                  </span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">左手距杆体</span>
                  <span className="metric-value">
                    {wristDist ? `${wristDist.leftRatio.toFixed(2)} 倍肩宽（${wristDist.leftStatus}）` : "--"}
                  </span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">右手距杆体</span>
                  <span className="metric-value">
                    {wristDist ? `${wristDist.rightRatio.toFixed(2)} 倍肩宽（${wristDist.rightStatus}）` : "--"}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ================================================================
          V4.1 侧选 + 划桨动作指标
          ================================================================ */}
      {FEATURE_FLAGS.V4_STROKE_ANALYSIS && isCameraOn && (
        <>
          {/* 自动划桨侧检测 + 校准 */}
          <div className="metrics-panel">
            <div className="metrics-title">🏃 划桨动作指标</div>
            <div className="stroke-side-selector">
              <span className="metric-label">划桨侧：</span>
              <button
                className={`btn-side ${selectedStrokeSide === "right" ? "btn-side-active" : ""}`}
                onClick={() => setSelectedStrokeSide("right")}
              >
                右桨
              </button>
              <button
                className={`btn-side ${selectedStrokeSide === "left" ? "btn-side-active" : ""}`}
                onClick={() => setSelectedStrokeSide("left")}
              >
                左桨
              </button>
              <span className="stroke-side-hint">
                请选择与手持木棍一致的一侧
              </span>
            </div>
            <div className="stroke-calibration">
              <span className="metric-label">站姿校准：</span>
              <span className={`metric-value ${calibrationStatus === "ready" ? "status-ok" : "status-warn"}`}>
                {calStatusText(calibrationStatus)}
              </span>
              <button className="btn btn-small" onClick={handleRecalibrate}>
                重新校准
              </button>
            </div>
            {/* V4.2 阶段状态 */}
            {phaseState && (
              <div className="stroke-phase-display">
                <span className="metric-label">动作阶段：</span>
                <span className={`metric-value phase-${phaseState.phase}`}>
                  {phaseLabel(phaseState.phase)}
                </span>
                <span className="metric-label" style={{ marginLeft: 12 }}>划桨计数：</span>
                <span className="metric-value">{phaseState.strokeCount}</span>
              </div>
            )}
          </div>

          {/* 简洁指标面板 */}
          <div className="metrics-panel metrics-panel-compact">
            <div className="metrics-title">🏃 关键划桨指标</div>
            <div className="metrics-grid stroke-grid compact-grid">
              <div className="metric-item">
                <span className="metric-label">入镜状态</span>
                <span className="metric-value">
                  {status === "人体识别正常"
                    ? "已入镜"
                    : status === "未检测到人体"
                    ? "请进入画面"
                    : status}
                </span>
              </div>
              <div className="metric-item">
                <span className="metric-label">躯干侧倾</span>
                <span className="metric-value">{f(sm?.torsoLeanDeg, 1)}°</span>
              </div>
              <div className="metric-item">
                <span className="metric-label">双手/肩宽</span>
                <span className="metric-value">{f(sm?.handSpanRatio, 2)}×肩</span>
              </div>
              <div className="metric-item">
                <span className="metric-label">桨/木棍角度</span>
                <span className="metric-value">{paddleAngleDisplay}</span>
              </div>
              <div className="metric-item metric-item-full">
                <span className="metric-label">动作提示</span>
                <span className="metric-value">{compactActionHint}</span>
              </div>
            </div>
            <button
              className="btn btn-small btn-toggle"
              onClick={() => setShowAdvancedMetrics((prev) => !prev)}
            >
              {showAdvancedMetrics ? "隐藏更多指标" : "查看更多指标"}
            </button>
          </div>

          {showAdvancedMetrics && (
            <>
              <div className="metrics-panel metrics-panel-advanced">
                <div className="metrics-grid stroke-grid">
                  {/* 角度 */}
                  <div className="metric-item">
                    <span className="metric-label">左肘角</span>
                    <span className="metric-value">{f(sm?.elbowAngleDeg.left, 1)}°</span>
                  </div>
                  <div className="metric-item">
                    <span className="metric-label">右肘角</span>
                    <span className="metric-value">{f(sm?.elbowAngleDeg.right, 1)}°</span>
                  </div>
                  <div className="metric-item">
                    <span className="metric-label">左膝角</span>
                    <span className="metric-value">{f(sm?.kneeAngleDeg.left, 1)}°</span>
                  </div>
                  <div className="metric-item">
                    <span className="metric-label">右膝角</span>
                    <span className="metric-value">{f(sm?.kneeAngleDeg.right, 1)}°</span>
                  </div>
                  <div className="metric-item">
                    <span className="metric-label">躯干侧倾</span>
                    <span className="metric-value">{f(sm?.torsoLeanDeg, 1)}°</span>
                  </div>
                  <div className="metric-item">
                    <span className="metric-label">肩线</span>
                    <span className="metric-value">{f(sm?.shoulderLineAngleDeg, 1)}°</span>
                  </div>
                  <div className="metric-item">
                    <span className="metric-label">髋线</span>
                    <span className="metric-value">{f(sm?.hipLineAngleDeg, 1)}°</span>
                  </div>
                  <div className="metric-item">
                    <span className="metric-label">肩髋投影差</span>
                    <span className="metric-value">{f(sm?.shoulderHipProjectedAngleDiffDeg, 1)}°</span>
                  </div>

                  {/* 距离 */}
                  <div className="metric-item">
                    <span className="metric-label">手间距</span>
                    <span className="metric-value">{f(sm?.handSpanRatio, 2)}×肩</span>
                  </div>
                  <div className="metric-item">
                    <span className="metric-label">上下手垂直</span>
                    <span className="metric-value">{f(sm?.topPowerVerticalOffsetRatio, 2)}×肩</span>
                  </div>
                  <div className="metric-item">
                    <span className="metric-label">下手→肩</span>
                    <span className="metric-value">({f(sm?.powerWristRelShoulder.x, 2)}, {f(sm?.powerWristRelShoulder.y, 2)})×肩</span>
                  </div>
                  <div className="metric-item">
                    <span className="metric-label">下手→髋</span>
                    <span className="metric-value">({f(sm?.powerWristRelHip.x, 2)}, {f(sm?.powerWristRelHip.y, 2)})×肩</span>
                  </div>
                  <div className="metric-item">
                    <span className="metric-label">肩高度差</span>
                    <span className="metric-value">{fm(sm?.shoulderHeightDiff, 3)}×肩</span>
                  </div>

                  {/* 速度 */}
                  <div className="metric-item">
                    <span className="metric-label">下手水平速度</span>
                    <span className="metric-value">{f(sm?.powerWristRelativeHorizontalVelocity, 2)}/s</span>
                  </div>
                  <div className="metric-item">
                    <span className="metric-label">下手垂直速度</span>
                    <span className="metric-value">{f(sm?.powerWristRelativeVerticalVelocity, 2)}/s</span>
                  </div>
                  <div className="metric-item">
                    <span className="metric-label">下手合速度</span>
                    <span className="metric-value">{f(sm?.powerWristRelativeCompositeSpeed, 2)}/s</span>
                  </div>
                  <div className="metric-item">
                    <span className="metric-label">下手方向</span>
                    <span className="metric-value">{sm !== null && sm.powerWristRelativeDirectionDeg !== null ? `${f(sm.powerWristRelativeDirectionDeg, 1)}°` : "--"}</span>
                  </div>
                  <div className="metric-item">
                    <span className="metric-label">手间距速度</span>
                    <span className="metric-value">{f(sm?.handSpanVelocity, 3)}/s</span>
                  </div>

                  {/* 身体中心 */}
                  <div className="metric-item">
                    <span className="metric-label">身体中心位移</span>
                    <span className="metric-value">{fm(sm?.bodyCenterVerticalDisplacement, 4)}×肩</span>
                  </div>
                  <div className="metric-item">
                    <span className="metric-label">身体中心速度</span>
                    <span className="metric-value">{fm(sm?.bodyCenterVerticalVelocity, 4)}/s</span>
                  </div>
                </div>
              </div>

              {/* Debug 提示 */}
              <div className="debug-hint">
                按 <kbd>D</kbd> 导出调试 JSON（最多 300 帧，不含图像）
              </div>
            </>
          )}
        </>
      )}

      </div>
      </div>

      {/* 错误提示 */}
      {errorMessage && <div className="error-msg">{errorMessage}</div>}
    </div>
  );
}

export default App;
