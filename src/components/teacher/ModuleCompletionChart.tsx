import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface CompletionDatum {
  name: string;
  已完成: number;
  总人数: number;
}

/** 班级完成率：5 个模块「已完成人数 / 总人数」柱状图 */
export default function ModuleCompletionChart({
  data,
}: {
  data: CompletionDatum[];
}) {
  return (
    <div className="chart-card">
      <h3 className="chart-title">班级完成率</h3>
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
            <XAxis dataKey="name" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Legend />
            <Bar dataKey="已完成" fill="#0066cc" radius={[4, 4, 0, 0]} />
            <Bar dataKey="总人数" fill="#c7d9ef" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
