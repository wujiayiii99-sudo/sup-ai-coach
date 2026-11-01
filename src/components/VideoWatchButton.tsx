import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useStudent } from "../contexts/StudentContext";

/** 视频下方「我已认真看完本视频」按钮：写入 video_watches 表 */
export default function VideoWatchButton({ videoId }: { videoId: string }) {
  const { student } = useStudent();
  const [watched, setWatched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!student) return;
    let cancelled = false;
    supabase
      .from("video_watches")
      .select("id")
      .eq("student_id", student.id)
      .eq("video_id", videoId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setWatched(Boolean(data));
      });
    return () => {
      cancelled = true;
    };
  }, [student, videoId]);

  const handleClick = async () => {
    if (!student || watched) return;
    setSaving(true);
    setError(null);
    const { error: err } = await supabase
      .from("video_watches")
      .upsert(
        { student_id: student.id, video_id: videoId },
        { onConflict: "student_id,video_id" }
      );
    if (err) {
      setError(err.message);
      setSaving(false);
      return;
    }
    setWatched(true);
    setSaving(false);
  };

  return (
    <div className="video-watch">
      <button
        className="btn-video-watch"
        type="button"
        onClick={handleClick}
        disabled={watched || saving}
      >
        {watched ? "✅ 已确认看完" : saving ? "记录中…" : "✅ 我已认真看完本视频"}
      </button>
      {error && <span className="video-watch-error">保存失败：{error}</span>}
    </div>
  );
}
