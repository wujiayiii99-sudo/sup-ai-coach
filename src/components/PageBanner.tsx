interface PageBannerProps {
  image: string;
  title: string;
  subtitle?: string;
}

/** 模块页顶部横幅：全宽图 + 半透明遮罩 + 标题文字 */
export default function PageBanner({ image, title, subtitle }: PageBannerProps) {
  return (
    <div className="module-banner" style={{ backgroundImage: `url(${image})` }}>
      <div className="module-banner-overlay" />
      <div className="module-banner-content">
        <h1 className="module-banner-title">{title}</h1>
        {subtitle && <p className="module-banner-subtitle">{subtitle}</p>}
      </div>
    </div>
  );
}
