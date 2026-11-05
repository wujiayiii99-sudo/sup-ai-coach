import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import {
  forumAuthorLabel,
  forumCategoryClass,
  type ForumPost,
  type ForumReply,
} from "../../lib/forum";
import { formatDateTime } from "../../lib/format";
import { useStudent } from "../../contexts/StudentContext";
import { toUserFacingMessage } from "../../lib/errorMessage";

/** 拉取某个帖子的全部回复（不操作组件状态，便于复用） */
async function fetchReplies(postId: string): Promise<ForumReply[]> {
  const { data, error } = await supabase
    .from("forum_replies")
    .select("*, students(name, class_name)")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ForumReply[];
}

export default function ForumDetail() {
  const { id } = useParams<{ id: string }>();
  const { student } = useStudent();
  const [post, setPost] = useState<ForumPost | null>(null);
  const [replies, setReplies] = useState<ForumReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replying, setReplying] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    supabase
      .from("forum_posts")
      .select("*, students(name, class_name)")
      .eq("id", id)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) {
          setError(toUserFacingMessage(err));
        } else {
          setPost((data ?? null) as ForumPost | null);
        }
        setLoading(false);
      });

    fetchReplies(id)
      .then((rows) => {
        if (!cancelled) setReplies(rows);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(toUserFacingMessage(err));
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleReply = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const text = replyText.trim();
    if (!student || !id || !text) return;
    setReplying(true);
    const { error: insertErr } = await supabase.from("forum_replies").insert({
      post_id: id,
      student_id: student.id,
      content: text,
    });
    if (insertErr) {
      setError(toUserFacingMessage(insertErr));
      setReplying(false);
      return;
    }
    setReplyText("");
    try {
      const rows = await fetchReplies(id);
      setReplies(rows);
    } catch (err) {
      setError(toUserFacingMessage(err));
    } finally {
      setReplying(false);
    }
  };

  if (loading) {
    return (
      <div className="forum-page forum-page-narrow">
        <p className="forum-loading">加载中…</p>
      </div>
    );
  }

  if (error && !post) {
    return (
      <div className="forum-page forum-page-narrow">
        <p className="forum-error">加载失败：{error}</p>
        <Link className="btn-secondary" to="/forum">
          返回列表
        </Link>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="forum-page forum-page-narrow">
        <p className="forum-empty">帖子不存在或已删除。</p>
        <Link className="btn-secondary" to="/forum">
          返回列表
        </Link>
      </div>
    );
  }

  return (
    <div className="forum-page forum-page-narrow">
      <div className="forum-detail-nav">
        <Link className="btn-secondary" to="/forum">
          ← 返回列表
        </Link>
      </div>

      <article className="forum-post">
        <div className="forum-post-head">
          <span
            className={`forum-tag forum-tag-${forumCategoryClass(post.category)}`}
          >
            {post.category}
          </span>
          <h1 className="forum-post-title">{post.title}</h1>
          <div className="forum-post-meta">
            <span>{forumAuthorLabel(post.students)}</span>
            <span>·</span>
            <span>{formatDateTime(post.created_at)}</span>
          </div>
        </div>
        <p className="forum-post-content">{post.content}</p>
      </article>

      <section className="forum-replies">
        <h2 className="forum-replies-title">回复（{replies.length}）</h2>
        {replies.length === 0 ? (
          <p className="forum-empty">还没有回复，来抢沙发。</p>
        ) : (
          <ul className="forum-reply-list">
            {replies.map((r) => (
              <li key={r.id} className="forum-reply">
                <div className="forum-reply-meta">
                  <span className="forum-reply-author">
                    {forumAuthorLabel(r.students)}
                  </span>
                  <span className="forum-reply-time">
                    {formatDateTime(r.created_at)}
                  </span>
                </div>
                <p className="forum-reply-content">{r.content}</p>
              </li>
            ))}
          </ul>
        )}

        <form className="forum-reply-form" onSubmit={handleReply}>
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="写下你的回复…"
            rows={4}
          />
          <div className="forum-form-actions">
            <button
              className="btn-primary"
              type="submit"
              disabled={replying || !replyText.trim()}
            >
              {replying ? "回复中…" : "回复"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
