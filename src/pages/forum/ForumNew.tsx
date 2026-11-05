import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { FORUM_CATEGORIES } from "../../lib/forum";
import { useStudent } from "../../contexts/StudentContext";
import { toUserFacingMessage } from "../../lib/errorMessage";

export default function ForumNew() {
  const { student } = useStudent();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>(FORUM_CATEGORIES[0]);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const t = title.trim();
    const c = content.trim();
    if (!student) return;
    if (!t || !c) {
      setError("请填写标题和内容");
      return;
    }
    setSubmitting(true);
    setError(null);

    const { data, error: insertError } = await supabase
      .from("forum_posts")
      .insert({
        student_id: student.id,
        title: t,
        content: c,
        category,
      })
      .select("id")
      .single();

    if (insertError) {
      setError(toUserFacingMessage(insertError));
      setSubmitting(false);
      return;
    }

    navigate(`/forum/${data.id}`);
  };

  return (
    <div className="forum-page forum-page-narrow">
      <header className="forum-header">
        <h1 className="forum-title">发布新帖</h1>
        <Link className="btn-secondary" to="/forum">
          返回列表
        </Link>
      </header>

      <form className="forum-form" onSubmit={handleSubmit}>
        <label className="forum-field">
          <span>标题</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="一句话说明你的问题"
            autoFocus
          />
        </label>
        <label className="forum-field">
          <span>分类</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {FORUM_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="forum-field">
          <span>内容</span>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="详细描述你的问题…"
            rows={8}
          />
        </label>
        {error && <p className="forum-error">{error}</p>}
        <div className="forum-form-actions">
          <button className="btn-primary" type="submit" disabled={submitting}>
            {submitting ? "发布中…" : "发布"}
          </button>
        </div>
      </form>
    </div>
  );
}
