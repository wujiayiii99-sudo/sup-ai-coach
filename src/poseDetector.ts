/**
 * 姿态识别模块
 * 封装 MediaPipe Pose Landmarker 的初始化和检测逻辑
 */

import {
  PoseLandmarker,
  FilesetResolver,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";

let poseLandmarker: PoseLandmarker | null = null;

/** 最近一次处理过的视频帧序号（用于同帧去重） */
let lastVideoTime: number = -1;
/** 最近一次推理结果缓存 */
let lastResult: NormalizedLandmark[] | null = null;

// 模型文件地址（MediaPipe 官方 CDN）
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task";

// WASM 文件根目录
const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm/";

/**
 * 初始化 Pose Landmarker 模型
 * 仅在首次调用时加载，复用已有实例
 */
export async function initializeDetector(): Promise<void> {
  if (poseLandmarker) return;

  const vision = await FilesetResolver.forVisionTasks(WASM_URL);
  poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: MODEL_URL,
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
}

/**
 * 对视频帧进行姿态检测
 * 使用 video.currentTime 判断视频帧是否已变化：
 *   - 同一帧重复调用时直接返回缓存结果，避免重复推理导致的跳变；
 *   - 仅在新视频帧到来时调用 detectForVideo。
 *
 * @param video - 包含摄像头画面的 video 元素
 * @returns 检测到的 33 个关键点数组，未检测到时返回 null
 */
export function detectPose(
  video: HTMLVideoElement
): NormalizedLandmark[] | null {
  if (!poseLandmarker) return null;

  // 视频帧未变化 → 返回缓存结果，不运行推理
  if (video.currentTime === lastVideoTime) {
    return lastResult;
  }

  // 新视频帧 → 更新标记并运行推理
  lastVideoTime = video.currentTime;
  const timestamp = performance.now();
  const result = poseLandmarker.detectForVideo(video, timestamp);

  if (result.landmarks && result.landmarks.length > 0) {
    lastResult = result.landmarks[0];
  } else {
    lastResult = null;
  }
  return lastResult;
}

/**
 * 释放模型资源
 */
export function closeDetector(): void {
  poseLandmarker?.close();
  poseLandmarker = null;
  lastVideoTime = -1;
  lastResult = null;
}
