import { Link } from "react-router-dom";
import ModuleArticle from "../components/ModuleArticle";
import { module2Content } from "../data/module2-content";
import { VIDEOS, type Video } from "../data/videos";
import type { ContentSection } from "../data/module1-content";

function SectionVideo({
  video,
  link,
}: {
  video: Video;
  link?: { to: string; label: string };
}) {
  return (
    <div className="video-block">
      <h2 className="video-block-title">教学视频：{video.title}</h2>
      <div
        className="video-embed"
        dangerouslySetInnerHTML={{ __html: video.iframe }}
      />
      {link && (
        <div className="video-card-actions">
          <Link className="btn-primary" to={link.to}>
            {link.label}
          </Link>
        </div>
      )}
    </div>
  );
}

/** 模块 2：先文字、再视频（2.2→视频3、2.3→视频5、2.4→视频4） */
export default function Module2() {
  const renderAfterSection = (section: ContentSection) => {
    if (section.id === "2-2") {
      return (
        <SectionVideo
          video={VIDEOS[2]}
          link={{ to: "/module/4", label: "去模块 4 练习直线划行" }}
        />
      );
    }
    if (section.id === "2-3") return <SectionVideo video={VIDEOS[4]} />;
    if (section.id === "2-4") return <SectionVideo video={VIDEOS[3]} />;
    return null;
  };

  return (
    <ModuleArticle
      title="桨板技术教学视频"
      bannerImage="/images/photos/module2-1.jpg"
      sections={module2Content}
      renderAfterSection={renderAfterSection}
      tocVideoMap={{
        "2-2": VIDEOS[2].title,
        "2-3": VIDEOS[4].title,
        "2-4": VIDEOS[3].title,
      }}
    />
  );
}
