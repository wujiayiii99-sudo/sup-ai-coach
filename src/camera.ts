/**
 * 摄像头控制模块
 * 负责启动和停止摄像头，获取视频流
 */

/**
 * 启动摄像头并绑定到 video 元素
 * @param videoElement - 用于显示摄像头画面的 video 元素
 * @param facingMode - 摄像头方向，默认前置
 * @returns 获取到的 MediaStream
 */
export async function startCamera(
  videoElement: HTMLVideoElement,
  facingMode: "user" | "environment" = "user"
): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode,
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  });

  videoElement.srcObject = stream;
  await videoElement.play();
  return stream;
}

/**
 * 停止摄像头并释放所有轨道资源
 * @param stream - 要停止的 MediaStream
 */
export function stopCamera(stream: MediaStream | null): void {
  if (!stream) return;
  stream.getTracks().forEach((track) => track.stop());
}
