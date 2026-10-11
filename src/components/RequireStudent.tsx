import { Navigate, Outlet } from "react-router-dom";
import { useStudent } from "../contexts/StudentContext";

/** 学生身份网关：无身份则跳 /setup */
export default function RequireStudent() {
  const { student } = useStudent();
  if (!student) return <Navigate to="/setup" replace />;
  return <Outlet />;
}
