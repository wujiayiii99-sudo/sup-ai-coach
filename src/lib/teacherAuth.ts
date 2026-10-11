/** 教师端登录状态：存 sessionStorage，关闭浏览器后自动登出 */
const SESSION_KEY = "sup_teacher";

export function isTeacherLoggedIn(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === "true";
  } catch {
    return false;
  }
}

/** 校验密码，成功则写入 sessionStorage 并返回 true */
export function teacherLogin(password: string): boolean {
  const expected = import.meta.env.VITE_TEACHER_PASSWORD;
  if (!expected || password !== expected) return false;
  try {
    sessionStorage.setItem(SESSION_KEY, "true");
  } catch {
    return false;
  }
  return true;
}

export function teacherLogout(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}
