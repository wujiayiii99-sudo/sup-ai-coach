import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  MODULES,
  MODULE_STATUS_LABEL,
  type ModuleStatus,
} from "../lib/modules";
import { useStudent } from "../contexts/StudentContext";

export default function Home() {
  const { student } = useStudent();
  const [progressMap, setProgressMap] = useState<Record<number, ModuleStatus>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!student) return;
    let cancelled = false;
    setLoading(true);

    supabase
      .from("module_progress")
      .select("module_no, status")
      .eq("student_id", student.id)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.warn("读取学习进度失败", error);
          setLoading(false);
          return;
        }
        const map: Record<number, ModuleStatus> = {};
        for (const row of data ?? []) {
          const no = row.module_no as number;
          const status = row.status as ModuleStatus;
          if (["not_started", "in_progress", "completed"].includes(status)) {
            map[no] = status;
          }
        }
        setProgressMap(map);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [student]);

  return (
    <div className="home">
      <h1 className="home-title">课程地图</h1>
      <p className="home-subtitle">选择模块开始学习</p>
      <div className="module-grid">
        {MODULES.map((m) => {
          const status = progressMap[m.no] ?? "not_started";
          return (
            <Link key={m.no} to={m.path} className="module-card">
              <div className="module-card-header">
                <span className="module-card-no">模块 {m.no}</span>
                <span className={`module-status module-status-${status}`}>
                  {MODULE_STATUS_LABEL[status]}
                </span>
              </div>
              <h2 className="module-card-title">{m.name}</h2>
              <p className="module-card-desc">{m.description}</p>
            </Link>
          );
        })}
      </div>
      {loading && <p className="home-loading">加载中…</p>}
    </div>
  );
}
