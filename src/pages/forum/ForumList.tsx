import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import {
  FORUM_CATEGORIES,
  forumAuthorLabel,
  forumCategoryClass,
  type ForumPost,
} from "../../lib/forum";
import { formatDateTime } from "../../lib/format";
import { toUserFacingMessage } from "../../lib/errorMessage";

export default function ForumList() {
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<string>("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("forum_posts")
      .select("*, students(name, class_name)")
      .order("created_at", { ascending: false })
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) {
          setError(toUserFacingMessage(err));
        } else {
          setPosts((data ?? []) as ForumPost[]);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return posts.filter((p) => {
      if (category && p.category !== category) return false;
      if (q && !p.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [posts, category, search]);

  return (
    <div className="forum-page">
      <header className="forum-header">
        <div>
          <h1 className="forum-title">答疑园地</h1>
          <p className="forum-subtitle">有问题，来提问；会解答，来帮忙。</p>
        </div>
        <Link className="btn-primary" to="/forum/new">
          发布新帖
        </Link>
      </header>

      <div className="forum-toolbar">
        <input
          className="forum-search"
          type="text"
          placeholder="按标题搜索"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="forum-filters">
          <button
            type="button"
            className={`forum-filter-chip ${category === "" ? "active" : ""}`}
            onClick={() => setCategory("")}
          >
            全部
          </button>
          {FORUM_CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              className={`forum-filter-chip ${category === c ? "active" : ""}`}
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="forum-loading">加载中…</p>
      ) : error ? (
        <p className="forum-error">加载失败：{error}</p>
      ) : filtered.length === 0 ? (
        <div className="forum-empty">
          <p>暂无帖子，点击「发布新帖」发起第一个讨论吧。</p>
        </div>
      ) : (
        <div className="forum-list">
          {filtered.map((p) => (
            <Link key={p.id} to={`/forum/${p.id}`} className="forum-card">
              <div className="forum-card-top">
                <span
                  className={`forum-tag forum-tag-${forumCategoryClass(p.category)}`}
                >
                  {p.category}
                </span>
                <span className="forum-card-author">
                  {forumAuthorLabel(p.students)}
                </span>
              </div>
              <h2 className="forum-card-title">{p.title}</h2>
              <span className="forum-card-time">
                {formatDateTime(p.created_at)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
