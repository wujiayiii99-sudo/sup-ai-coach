import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useStudent, type Student } from "../contexts/StudentContext";
import { toUserFacingMessage } from "../lib/errorMessage";

export default function StudentSetup() {
  const { student, saveStudent } = useStudent();
  const navigate = useNavigate();
  const [studentNo, setStudentNo] = useState("");
  const [name, setName] = useState("");
  const [className, setClassName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 已填写身份的学生跳过 /setup
  if (student) return <Navigate to="/" replace />;

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const no = studentNo.trim();
    const nm = name.trim();
    const cls = className.trim();
    if (!no || !nm || !cls) {
      setError("请填写学号、姓名和班级");
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      const { data: existing, error: selectError } = await supabase
        .from("students")
        .select("id, student_no, name, class_name")
        .eq("student_no", no)
        .maybeSingle();

      if (selectError) throw selectError;

      let saved: Student;
      if (existing) {
        // 学号已存在：更新 last_seen_at 与班级，读取库里已有信息（不覆盖姓名）
        const { error: updateError } = await supabase
          .from("students")
          .update({
            last_seen_at: new Date().toISOString(),
            class_name: cls,
          })
          .eq("id", existing.id);
        if (updateError) throw updateError;
        saved = {
          id: existing.id,
          student_no: existing.student_no,
          name: existing.name,
          class_name: cls,
        };
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from("students")
          .insert({ student_no: no, name: nm, class_name: cls })
          .select("id, student_no, name, class_name")
          .single();
        if (insertError) throw insertError;
        saved = inserted as Student;
      }

      saveStudent(saved);
      navigate("/");
    } catch (err) {
      setError(toUserFacingMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="setup-page">
      <form className="setup-form" onSubmit={handleSubmit}>
        <h1 className="setup-title">学生信息登记</h1>
        <p className="setup-hint">首次进入请填写学号、姓名和班级，用于记录学习进度。</p>
        <label className="setup-field">
          <span>学号</span>
          <input
            value={studentNo}
            onChange={(e) => setStudentNo(e.target.value)}
            placeholder="请输入学号"
            autoFocus
          />
        </label>
        <label className="setup-field">
          <span>姓名</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="请输入姓名"
          />
        </label>
        <label className="setup-field">
          <span>班级</span>
          <input
            value={className}
            onChange={(e) => setClassName(e.target.value)}
            placeholder="例如：2024级体教1班"
          />
        </label>
        {error && <p className="setup-error">{error}</p>}
        <button className="setup-submit" type="submit" disabled={submitting}>
          {submitting ? "提交中…" : "进入课程"}
        </button>
      </form>
    </div>
  );
}
