import { useMemo, useState } from "react";
import {
  latestQuizByStudentModule,
  type QuizScoreRecord,
} from "../../lib/analytics";
import { TRACKED_VIDEOS, type VideoWatchRecord } from "../../lib/videoWatch";
import { downloadCsv } from "../../lib/exportCsv";

interface ClassReportProps {
  students: { id: string; class_name: string | null }[];
  quizzes: QuizScoreRecord[];
  videoWatches: VideoWatchRecord[];
}

interface ModuleStat {
  completed: number;
  avgScore: number;
  totalScore: number;
}

interface ReportData {
  className: string;
  total: number;
  m1: ModuleStat;
  m3: ModuleStat;
  videos: { title: string; module_no: number; watched: number }[];
}

const pct = (n: number, total: number): string =>
  total ? `${Math.round((n / total) * 100)}%` : "0%";

const avgLabel = (m: ModuleStat): string =>
  m.completed
    ? `${m.avgScore.toFixed(1)} / ${m.totalScore}（${pct(m.avgScore, m.totalScore)}）`
    : "—";

/** 班级预习学情报告：按班级查看测验完成率/平均分 + 视频学习情况，支持导出 CSV */
export default function ClassReport({
  students,
  quizzes,
  videoWatches,
}: ClassReportProps) {
  const [selectedClass, setSelectedClass] = useState<string | null>(null);

  const classes = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of students) {
      const c = (s.class_name ?? "").trim();
      if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) =>
      a[0].localeCompare(b[0], "zh")
    );
  }, [students]);

  const report = useMemo<ReportData | null>(() => {
    if (!selectedClass) return null;
    const classIds = new Set(
      students
        .filter((s) => (s.class_name ?? "").trim() === selectedClass)
        .map((s) => s.id)
    );
    const total = classIds.size;
    const latest = latestQuizByStudentModule(quizzes);

    const moduleStat = (no: number): ModuleStat => {
      let completed = 0;
      let sum = 0;
      let totalScore = 0;
      for (const [key, rec] of latest) {
        const studentId = key.split("|")[0];
        if (!classIds.has(studentId) || rec.module_no !== no) continue;
        completed += 1;
        sum += rec.score;
        totalScore = rec.total;
      }
      return {
        completed,
        avgScore: completed ? sum / completed : 0,
        totalScore,
      };
    };

    const videoSet = new Map<string, Set<string>>();
    for (const w of videoWatches) {
      if (!classIds.has(w.student_id)) continue;
      let set = videoSet.get(w.video_id);
      if (!set) {
        set = new Set();
        videoSet.set(w.video_id, set);
      }
      set.add(w.student_id);
    }

    const videos = TRACKED_VIDEOS.map((v) => ({
      title: v.title,
      module_no: v.module_no,
      watched: videoSet.get(v.bv)?.size ?? 0,
    }));

    return {
      className: selectedClass,
      total,
      m1: moduleStat(1),
      m3: moduleStat(3),
      videos,
    };
  }, [selectedClass, students, quizzes, videoWatches]);

  const handleExport = () => {
    if (!report) return;
    const rows: string[][] = [
      ["班级", report.className],
      ["班级总人数", String(report.total)],
      ["模块1 测验完成率", `${report.m1.completed}/${report.total}（${pct(report.m1.completed, report.total)}）`],
      ["模块1 平均分", avgLabel(report.m1)],
      ["模块3 测验完成率", `${report.m3.completed}/${report.total}（${pct(report.m3.completed, report.total)}）`],
      ["模块3 平均分", avgLabel(report.m3)],
      ...report.videos.map((v) => [
        `模块${v.module_no} · ${v.title} 观看人数`,
        `${v.watched}/${report.total}（${pct(v.watched, report.total)}）`,
      ]),
    ];
    downloadCsv(`${report.className}_预习学情报告.csv`, ["指标", "数值"], rows);
  };

  return (
    <div className="chart-card">
      <h3 className="chart-title">班级预习学情报告</h3>

      {classes.length === 0 ? (
        <p className="chart-empty">暂无班级数据（学生需先填写班级）</p>
      ) : (
        <div className="class-report-list">
          {classes.map(([name, count]) => (
            <div key={name} className="class-report-row">
              <span className="class-report-name">{name}</span>
              <span className="class-report-count">{count} 人</span>
              <button
                className="btn-secondary"
                type="button"
                onClick={() => setSelectedClass(name)}
              >
                查看预习报告
              </button>
            </div>
          ))}
        </div>
      )}

      {report && (
        <div className="report-modal" onClick={() => setSelectedClass(null)}>
          <div
            className="report-modal-inner"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="report-modal-header">
              <h3 className="report-modal-title">
                {report.className} · 预习学情报告
              </h3>
              <button
                className="report-modal-close"
                type="button"
                onClick={() => setSelectedClass(null)}
              >
                关闭
              </button>
            </div>

            <table className="teacher-table report-table">
              <tbody>
                <tr>
                  <th>班级总人数</th>
                  <td>{report.total}</td>
                </tr>
                <tr>
                  <th>模块 1 测验完成率</th>
                  <td>
                    {report.m1.completed}/{report.total}（
                    {pct(report.m1.completed, report.total)}）
                  </td>
                </tr>
                <tr>
                  <th>模块 1 平均分</th>
                  <td>{avgLabel(report.m1)}</td>
                </tr>
                <tr>
                  <th>模块 3 测验完成率</th>
                  <td>
                    {report.m3.completed}/{report.total}（
                    {pct(report.m3.completed, report.total)}）
                  </td>
                </tr>
                <tr>
                  <th>模块 3 平均分</th>
                  <td>{avgLabel(report.m3)}</td>
                </tr>
                {report.videos.map((v) => (
                  <tr key={`${v.module_no}-${v.title}`}>
                    <th>
                      模块 {v.module_no} · {v.title}（观看人数）
                    </th>
                    <td>
                      {v.watched}/{report.total}（{pct(v.watched, report.total)}）
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="report-modal-actions">
              <button className="btn-primary" type="button" onClick={handleExport}>
                导出 CSV
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
