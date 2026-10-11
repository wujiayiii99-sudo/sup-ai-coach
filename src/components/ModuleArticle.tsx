import { useState } from "react";
import { Link } from "react-router-dom";
import type { ContentSection } from "../data/module1-content";
import type { Video } from "../data/videos";

interface ModuleArticleProps {
  title: string;
  sections: ContentSection[];
  quizPath: string;
  video?: Video;
}

interface Lightbox {
  src: string;
  caption: string;
}

function Figure({
  images,
  onOpen,
}: {
  images: { src: string; caption: string }[];
  onOpen: (img: Lightbox) => void;
}) {
  return (
    <div className="figure-grid">
      {images.map((img) => (
        <figure key={img.src} className="figure-item">
          <button className="figure-btn" type="button" onClick={() => onOpen(img)}>
            <img src={img.src} alt={img.caption} loading="lazy" />
          </button>
          <figcaption>{img.caption}</figcaption>
        </figure>
      ))}
    </div>
  );
}

function Table({
  caption,
  headers,
  rows,
}: {
  caption: string;
  headers: string[];
  rows: string[][];
}) {
  return (
    <div className="table-wrap">
      <table className="content-table">
        <caption>{caption}</caption>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SectionBlock({
  section,
  depth,
  onOpen,
}: {
  section: ContentSection;
  depth: number;
  onOpen: (img: Lightbox) => void;
}) {
  const Heading = depth === 0 ? "h2" : depth === 1 ? "h3" : "h4";
  return (
    <section className={`article-section depth-${depth}`} id={section.id}>
      <Heading className="article-heading">{section.title}</Heading>
      {section.paragraphs.map((p, i) => (
        <p key={i} className="article-paragraph">
          {p}
        </p>
      ))}
      {section.images && section.images.length > 0 && (
        <Figure images={section.images} onOpen={onOpen} />
      )}
      {section.tables &&
        section.tables.map((t) => (
          <Table
            key={t.caption}
            caption={t.caption}
            headers={t.headers}
            rows={t.rows}
          />
        ))}
      {section.subsections &&
        section.subsections.map((sub) => (
          <SectionBlock key={sub.id} section={sub} depth={depth + 1} onOpen={onOpen} />
        ))}
    </section>
  );
}

/** 图文教学页：章节目录 + 图文混排 + 图片放大 + 测验按钮 + 底部视频 */
export default function ModuleArticle({
  title,
  sections,
  quizPath,
  video,
}: ModuleArticleProps) {
  const [lightbox, setLightbox] = useState<Lightbox | null>(null);

  return (
    <div className="article-page">
      <header className="article-header">
        <h1 className="article-title">{title}</h1>
      </header>

      <div className="article-body">
        <nav className="article-toc">
          <div className="toc-title">目录</div>
          <ul>
            {sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`}>{s.title}</a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="article-main">
          {sections.map((s) => (
            <SectionBlock key={s.id} section={s} depth={0} onOpen={setLightbox} />
          ))}

          <div className="article-actions">
            <Link className="btn-primary" to={quizPath}>
              开始测验
            </Link>
          </div>

          {video && (
            <div className="video-block">
              <h2 className="video-block-title">教学视频：{video.title}</h2>
              <div
                className="video-embed"
                dangerouslySetInnerHTML={{ __html: video.iframe }}
              />
            </div>
          )}
        </div>
      </div>

      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <div className="lightbox-inner" onClick={(e) => e.stopPropagation()}>
            <img src={lightbox.src} alt={lightbox.caption} />
            <div className="lightbox-caption">{lightbox.caption}</div>
            <button
              className="lightbox-close"
              type="button"
              onClick={() => setLightbox(null)}
            >
              关闭
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
