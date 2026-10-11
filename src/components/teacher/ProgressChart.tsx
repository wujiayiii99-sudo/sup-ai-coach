import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface ProgressPoint {
  name: string;
  姿态分: number;
  桨法分: number;
  time: string;
}

interface ProgressChartProps {
  students: { id: string; name: string; studentNo: string }[];
  selectedId: string;
  onSelect: (id: string) => void;
  data: ProgressPoint[];
}

/** 学生进步曲线：某学生模块 4 每次练习的姿态分 + 桨法分（双线） */
export default function ProgressChart({
  students,
  selectedId,
  onSelect,
  data,
}: ProgressChartProps) {
  return (
    <div className="chart-card">
      <div className="chart-card-header">
        <h3 className="chart-title">学生进步曲线</h3>
        <select
          className="progress-select"
          value={selectedId}
          onChange={(e) => onSelect(e.target.value)}
        >
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}（{s.studentNo}）
            </option>
          ))}
        </select>
      </div>

      {data.length === 0 ? (
        <p className="chart-empty">暂无练习记录</p>
      ) : (
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
              <XAxis dataKey="name" />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="姿态分"
                stroke="#0066cc"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="桨法分"
                stroke="#ff8800"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
