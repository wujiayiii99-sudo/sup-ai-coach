const PAGE_LABELS: Record<string, string> = {
  "/": "首页",
  "/module/1": "模块 1 · 桨板器材",
  "/module/2": "模块 2 · 技术视频",
  "/module/3": "模块 3 · 安全知识",
  "/module/4": "模块 4 · 直线划行",
  "/module/1/quiz": "模块 1 测验",
  "/module/3/quiz": "模块 3 测验",
};

interface PageViewDatum {
  path: string;
  count: number;
}

/** 页面浏览统计：每个 page_path 的访问总数，按次数降序 */
export default function PageViewStats({ data }: { data: PageViewDatum[] }) {
  return (
    <div className="chart-card">
      <h3 className="chart-title">页面浏览统计</h3>
      <div className="table-wrap">
        <table className="teacher-table">
          <thead>
            <tr>
              <th>页面</th>
              <th>访问次数</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.path}>
                <td>{PAGE_LABELS[d.path] ?? d.path}</td>
                <td>{d.count}</td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td colSpan={2} className="table-empty">
                  暂无数据
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
