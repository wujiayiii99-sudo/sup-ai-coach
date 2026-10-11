import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { isTeacherLoggedIn, teacherLogin } from "../../lib/teacherAuth";

export default function Login() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (isTeacherLoggedIn()) return <Navigate to="/teacher/dashboard" replace />;

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (teacherLogin(password)) {
      navigate("/teacher/dashboard");
    } else {
      setError("密码错误");
      setPassword("");
    }
  };

  return (
    <div className="setup-page">
      <form className="setup-form" onSubmit={handleSubmit}>
        <h1 className="setup-title">教师登录</h1>
        <label className="setup-field">
          <span>密码</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="请输入教师密码"
            autoFocus
          />
        </label>
        {error && <p className="setup-error">{error}</p>}
        <button className="setup-submit" type="submit">
          登录
        </button>
      </form>
    </div>
  );
}
