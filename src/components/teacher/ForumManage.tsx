import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { forumCategoryClass, type ForumPost } from "../../lib/forum";
import { formatDateTime } from "../../lib/format";

/** 拉取全部帖子（不操作组件状态，便于复用） */
async function fetchForumPosts(): Promise<ForumPost[]> {
  const { data, error } = await supabase
    .from("forum_posts")
    .select("*, students(name, class_name)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ForumPost[];
}

/** 教师端：答疑管理（查看帖子 + 删除） */
export default function ForumManage() {
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchForumPosts()
      .then((rows) => {
        if (cancelled) return;
        setPosts(rows);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleDelete = async (post: ForumPost) => {
    if (!window.confirm("确定删除该帖子及所有回复吗？")) return;
    setDeletingId(post.id);
    setNotice(null);
    setError(null);

    const { error: delErr } = await supabase
      .from("forum_posts")
      .delete()
      .eq("id", post.id);
    if (delErr) {
      setError(delErr.message);
      setDeletingId(null);
      return;
    }

    setDeletingId(null);
    setNotice(`已删除帖子「${post.title}」及其所有回复`);
    try {
      const rows = await fetchForumPosts();
      setPosts(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <section className="teacher-section">
      <div className="teacher-section-header">
        <h2 className="teacher-section-title">答疑管理</h2>
        <span className="forum-manage-count">共 {posts.length} 帖</span>
      </div>

      {loading ? (
        <p className="teacher-loading">加载中…</p>
      ) : error ? (
        <p className="teacher-error">加载失败：{error}</p>
      ) : (
        <>
          {notice && <p className="forum-manage-notice">{notice}</p>}
          <div className="table-wrap">
            <table className="teacher-table">
              <thead>
                <tr>
                  <th>标题</th>
                  <th>发帖人</th>
                  <th>班级</th>
                  <th>分类</th>
                  <th>时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {posts.map((p) => (
                  <tr key={p.id}>
                    <td>{p.title}</td>
                    <td>{p.students?.name ?? "未知"}</td>
                    <td>{p.students?.class_name ?? "—"}</td>
                    <td>
                      <span
                        className={`forum-tag forum-tag-${forumCategoryClass(p.category)}`}
                      >
                        {p.category}
                      </span>
                    </td>
                    <td>{formatDateTime(p.created_at)}</td>
                    <td>
                      <button
                        className="btn-danger"
                        type="button"
                        disabled={deletingId === p.id}
                        onClick={() => handleDelete(p)}
                      >
                        {deletingId === p.id ? "删除中…" : "删除"}
                      </button>
                    </td>
                  </tr>
                ))}
                {posts.length === 0 && (
                  <tr>
                    <td colSpan={6} className="table-empty">
                      暂无帖子
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
