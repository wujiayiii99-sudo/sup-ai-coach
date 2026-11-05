export const NETWORK_ERROR_MESSAGE = "网络开小差了，请稍后再试";
export const NETWORK_RETRY_HINT =
  "如果页面卡住或报错，请关闭 WiFi，使用手机 5G/4G 流量重试";

function errorName(err: unknown): string {
  if (err instanceof Error) return err.name;
  if (err && typeof err === "object" && "name" in err) {
    const n = (err as { name: unknown }).name;
    return typeof n === "string" ? n : "";
  }
  return "";
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message: unknown }).message;
    return typeof m === "string" ? m : "";
  }
  return "";
}

const ERROR_NAME_RE = /^(abort|timeout|type|fetch)error\b/i;
const NETWORK_TEXT_RE =
  /fetch failed|failed to fetch|networkerror|network error|load failed/i;

/** 判断是否为网络/超时类错误（Supabase 返回的错误对象通常只带 message） */
export function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (
    typeof DOMException !== "undefined" &&
    err instanceof DOMException &&
    err.name === "AbortError"
  ) {
    return true;
  }
  const name = errorName(err);
  const message = errorMessage(err);
  return (
    ERROR_NAME_RE.test(name) ||
    ERROR_NAME_RE.test(message) ||
    NETWORK_TEXT_RE.test(message)
  );
}

/** 把任意错误对象安全地转成可展示的字符串，绝不返回 [object Object] */
export function toErrorMessage(
  err: unknown,
  fallback = NETWORK_ERROR_MESSAGE
): string {
  if (isNetworkError(err)) return NETWORK_ERROR_MESSAGE;
  const message = errorMessage(err).trim();
  return message || fallback;
}

/** 面向学生：网络错误时附带「关闭 WiFi 用 5G/4G 重试」的操作提示 */
export function toUserFacingMessage(err: unknown): string {
  if (isNetworkError(err)) {
    return `${NETWORK_ERROR_MESSAGE}。${NETWORK_RETRY_HINT}。`;
  }
  const message = errorMessage(err).trim();
  return message || NETWORK_ERROR_MESSAGE;
}
