interface OverviewCardsProps {
  totalStudents: number;
  module1Done: number;
  module3Done: number;
  module4Count: number;
}

/** 教师后台顶部 4 张概览卡片 */
export default function OverviewCards({
  totalStudents,
  module1Done,
  module3Done,
  module4Count,
}: OverviewCardsProps) {
  const cards = [
    { label: "学生总数", value: String(totalStudents), suffix: "人" },
    {
      label: "模块 1 完成",
      value: `${module1Done} / ${totalStudents}`,
      suffix: "",
    },
    {
      label: "模块 3 完成",
      value: `${module3Done} / ${totalStudents}`,
      suffix: "",
    },
    { label: "模块 4 练习总人次", value: String(module4Count), suffix: "次" },
  ];

  return (
    <div className="overview-grid">
      {cards.map((c) => (
        <div className="overview-card" key={c.label}>
          <div className="overview-label">{c.label}</div>
          <div className="overview-value">
            {c.value}
            {c.suffix && <span className="overview-suffix">{c.suffix}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
