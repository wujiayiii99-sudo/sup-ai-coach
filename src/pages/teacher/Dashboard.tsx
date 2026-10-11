import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { isTeacherLoggedIn, teacherLogout } from "../../lib/teacherAuth";
import { downloadCsv } from "../../lib/exportCsv";
import { MODULE_STATUS_LABEL, type ModuleStatus } from "../../lib/modules";
import OverviewCards from "../../components/teacher/OverviewCards";
import StudentTable, {
  type StudentRow,
} from "../../components/teacher/StudentTable";
import { formatDateTime } from "../../lib/format";
import ModuleCompletionChart from "../../components/teacher/ModuleCompletionChart";
import ProgressChart from "../../components/teacher/ProgressChart";
import PageViewStats from "../../components/teacher/PageViewStats";

interface StudentRecord {
  id: string;
  student_no: string;
  name: string;
  last_seen_at: string | null;
}
interface ProgressRecord {
  student_id: string;
  module_no: number;
  status: string;
}
interface QuizRecord {
  student_id: string;
  module_no: number;
  score: number;
  total: number;
  created_at: string;
}
interface PracticeRecord {
  student_id: string;
  posture_score: number;
  paddle_score: number;
  created_at: string;
}
interface PageViewRecord {
  student_id: string;
  page_path: string;
  viewed_at: string;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [progress, setProgress] = useState<ProgressRecord[]>([]);
  const [quizzes, setQuizzes] = useState<QuizRecord[]>([]);
  const [practices, setPractices] = useState<PracticeRecord[]>([]);
  const [pageViews, setPageViews] = useState<PageViewRecord[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isTeacherLoggedIn()) return;
    let cancelled = false;

    Promise.all([
      supabase
        .from("students")
        .select("id, student_no, name, last_seen_at")
        .order("student_no", { ascending: true }),
      supabase.from("module_progress").select("student_id, module_no, status"),
      supabase
        .from("quiz_scores")
        .select("student_id, module_no, score, total, created_at"),
      supabase
        .from("practice_scores")
        .select("student_id, posture_score, paddle_score, created_at"),
      supabase.from("page_views").select("student_id, page_path, viewed_at"),
    ]).then((res) => {
      if (cancelled) return;
      const msgs = res.map((r) => r.error?.message).filter(Boolean);
      if (msgs.length > 0) {
        setError(msgs.join("；"));
      } else {
        setStudents((res[0].data ?? []) as StudentRecord[]);
        setProgress((res[1].data ?? []) as ProgressRecord[]);
        setQuizzes((res[2].data ?? []) as QuizRecord[]);
        setPractices((res[3].data ?? []) as PracticeRecord[]);
        setPageViews((res[4].data ?? []) as PageViewRecord[]);
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const studentRows = useMemo<StudentRow[]>(() => {
    const progressByStudent = new Map<string, Map<number, string>>();
    for (const p of progress) {
      let m = progressByStudent.get(p.student_id);
      if (!m) {
        m = new Map();
        progressByStudent.set(p.student_id, m);
      }
      m.set(p.module_no, p.status);
    }

    const quizByStudent = new Map<
      string,
      Map<number, { score: number; total: number; created_at: string }>
    >();
    for (const q of quizzes) {
      let m = quizByStudent.get(q.student_id);
      if (!m) {
        m = new Map();
        quizByStudent.set(q.student_id, m);
      }
      const prev = m.get(q.module_no);
      if (!prev || q.created_at > prev.created_at) {
        m.set(q.module_no, { score: q.score, total: q.total, created_at: q.created_at });
      }
    }

    const practiceCountByStudent = new Map<string, number>();
    for (const p of practices) {
      practiceCountByStudent.set(
        p.student_id,
        (practiceCountByStudent.get(p.student_id) ?? 0) + 1
      );
    }

    const firstByStudent = new Map<string, string>();
    const lastByStudent = new Map<string, string>();
    for (const v of pageViews) {
      const curFirst = firstByStudent.get(v.student_id);
      if (!curFirst || v.viewed_at < curFirst) firstByStudent.set(v.student_id, v.viewed_at);
      const curLast = lastByStudent.get(v.student_id);
      if (!curLast || v.viewed_at > curLast) lastByStudent.set(v.student_id, v.viewed_at);
    }

    return students.map((s) => {
      const prog = progressByStudent.get(s.id);
      const quiz = quizByStudent.get(s.id);
      const statusOf = (no: number): ModuleStatus => {
        const st = prog?.get(no);
        return st === "completed" ? "completed" : st === "in_progress" ? "in_progress" : "not_started";
      };
      const practiceCount = practiceCountByStudent.get(s.id) ?? 0;
      const q1 = quiz?.get(1);
      const q3 = quiz?.get(3);
      const q5 = quiz?.get(5);
      return {
        id: s.id,
        studentNo: s.student_no,
        name: s.name,
        firstVisit: firstByStudent.get(s.id) ?? null,
        lastActive: lastByStudent.get(s.id) ?? s.last_seen_at,
        status1: statusOf(1),
        status2: statusOf(2),
        status3: statusOf(3),
        status4: practiceCount > 0 ? "completed" : "not_started",
        status5: statusOf(5),
        quiz1: q1 ? { score: q1.score, total: q1.total } : null,
        quiz3: q3 ? { score: q3.score, total: q3.total } : null,
        quiz5: q5 ? { score: q5.score, total: q5.total } : null,
        practiceCount,
      };
    });
  }, [students, progress, quizzes, practices, pageViews]);

  const selectedId = selectedStudentId || (studentRows[0]?.id ?? "");

  const overview = useMemo(() => {
    const total = studentRows.length;
    const m1 = studentRows.filter((r) => r.status1 === "completed").length;
    const m3 = studentRows.filter((r) => r.status3 === "completed").length;
    return { total, m1, m3, m4: practices.length };
  }, [studentRows, practices]);

  const completionData = useMemo(
    () => [
      {
        name: "模块1",
        已完成: studentRows.filter((r) => r.status1 === "completed").length,
        总人数: studentRows.length,
      },
      {
        name: "模块2",
        已完成: studentRows.filter((r) => r.status2 === "completed").length,
        总人数: studentRows.length,
      },
      {
        name: "模块3",
        已完成: studentRows.filter((r) => r.status3 === "completed").length,
        总人数: studentRows.length,
      },
      {
        name: "模块4",
        已完成: studentRows.filter((r) => r.status4 === "completed").length,
        总人数: studentRows.length,
      },
      {
        name: "模块5",
        已完成: studentRows.filter((r) => r.status5 === "completed").length,
        总人数: studentRows.length,
      },
    ],
    [studentRows]
  );

  const pageViewData = useMemo(() => {
    const map = new Map<string, number>();
    for (const v of pageViews) map.set(v.page_path, (map.get(v.page_path) ?? 0) + 1);
    return Array.from(map.entries())
      .map(([path, count]) => ({ path, count }))
      .sort((a, b) => b.count - a.count);
  }, [pageViews]);

  const progressStudents = useMemo(
    () => studentRows.map((r) => ({ id: r.id, name: r.name, studentNo: r.studentNo })),
    [studentRows]
  );

  const progressData = useMemo(() => {
    if (!selectedId) return [];
    return practices
      .filter((p) => p.student_id === selectedId)
      .slice()
      .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0))
      .map((p, i) => ({
        name: `第${i + 1}次`,
        姿态分: p.posture_score,
        桨法分: p.paddle_score,
        time: p.created_at,
      }));
  }, [selectedId, practices]);

  if (!isTeacherLoggedIn()) return <Navigate to="/teacher/login" replace />;

  const handleLogout = () => {
    teacherLogout();
    navigate("/teacher/login");
  };

  const handleExport = () => {
    const headers = [
      "学号",
      "姓名",
      "首次访问",
      "最后活跃",
      "模块1状态",
      "模块2状态",
      "模块3状态",
      "模块4状态",
      "模块5状态",
      "模块1测验成绩",
      "模块3测验成绩",
      "模块5测验成绩",
      "模块4练习次数",
    ];
    const rows = studentRows.map((r) => [
      r.studentNo,
      r.name,
      formatDateTime(r.firstVisit),
      formatDateTime(r.lastActive),
      MODULE_STATUS_LABEL[r.status1],
      MODULE_STATUS_LABEL[r.status2],
      MODULE_STATUS_LABEL[r.status3],
      MODULE_STATUS_LABEL[r.status4],
      MODULE_STATUS_LABEL[r.status5],
      r.quiz1 ? `${r.quiz1.score}/${r.quiz1.total}` : "—",
      r.quiz3 ? `${r.quiz3.score}/${r.quiz3.total}` : "—",
      r.quiz5 ? `${r.quiz5.score}/${r.quiz5.total}` : "—",
      String(r.practiceCount),
    ]);
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    downloadCsv(
      `学生数据_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.csv`,
      headers,
      rows
    );
  };

  return (
    <div className="teacher-dashboard">
      <header className="teacher-header">
        <h1 className="teacher-title">教师后台</h1>
        <button className="btn-secondary" type="button" onClick={handleLogout}>
          退出登录
        </button>
      </header>

      {loading ? (
        <p className="teacher-loading">加载中…</p>
      ) : error ? (
        <p className="teacher-error">数据加载失败：{error}</p>
      ) : (
        <>
          <OverviewCards
            totalStudents={overview.total}
            module1Done={overview.m1}
            module3Done={overview.m3}
            module4Count={overview.m4}
          />

          <section className="teacher-section">
            <div className="teacher-section-header">
              <h2 className="teacher-section-title">学生清单</h2>
              <button className="btn-primary" type="button" onClick={handleExport}>
                导出学生数据 CSV
              </button>
            </div>
            <StudentTable rows={studentRows} />
          </section>

          <ModuleCompletionChart data={completionData} />
          <ProgressChart
            students={progressStudents}
            selectedId={selectedId}
            onSelect={setSelectedStudentId}
            data={progressData}
          />
          <PageViewStats data={pageViewData} />
        </>
      )}
    </div>
  );
}
