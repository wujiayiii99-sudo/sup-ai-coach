import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import NavBar from "../components/NavBar";
import { supabase } from "../lib/supabase";
import { useStudent } from "../contexts/StudentContext";

export default function MainLayout() {
  const { student } = useStudent();
  const location = useLocation();

  // 每次进入一个页面，往 page_views 插一条记录
  useEffect(() => {
    if (!student) return;
    supabase
      .from("page_views")
      .insert({ student_id: student.id, page_path: location.pathname })
      .then(({ error }) => {
        if (error) console.warn("page_views 记录失败", error);
      });
  }, [location.pathname, student]);

  return (
    <div className="layout">
      <NavBar />
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
