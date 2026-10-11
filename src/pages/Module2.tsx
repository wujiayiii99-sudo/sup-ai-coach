import { Link } from "react-router-dom";
import { VIDEOS } from "../data/videos";

export default function Module2() {
  // 视频 3 / 4 / 5 属于模块 2
  const module2Videos = VIDEOS.slice(2, 5);

  return (
    <div className="video-page">
      <h1 className="video-page-title">模块 2 · 基础划桨</h1>
      <p className="video-page-desc">
        观看以下教学视频，掌握跪姿与站姿直线划行、转弯绕标与陆上模拟训练方法。
      </p>

      {module2Videos.map((v) => (
        <div className="video-card" key={v.id}>
          <h2 className="video-card-title">{v.title}</h2>
          <p className="video-card-usage">{v.usage}</p>
          <div
            className="video-embed"
            dangerouslySetInnerHTML={{ __html: v.iframe }}
          />
          {v.id === 3 && (
            <div className="video-card-actions">
              <Link className="btn-primary" to="/module/4">
                去模块 4 练习直线划行
              </Link>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
