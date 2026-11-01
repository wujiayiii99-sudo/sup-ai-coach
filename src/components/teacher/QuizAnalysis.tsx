import { useMemo } from "react";
import {
  parseAnswers,
  latestQuizByStudentModule,
  type QuizScoreRecord,
} from "../../lib/analytics";

interface QuizAnalysisProps {
  students: { id: string; class_name: string | null }[];
  quizzes: QuizScoreRecord[];
  classFilter: string;
}

interface QuestionStat {
  moduleNo: number;
  q: number;
  correct: number;
  total: number;
  rate: number;
}

const MODULE_NAMES: Record<number, string> = {
  1: "模块 1 · 认识桨板",
  3: "模块 3 · 水上安全",
  5: "模块 5 · 绕标技术",
};

/** 测验分析：模块 1/3/5 每一道题的（班级）正确率 */
export default function QuizAnalysis({
  students,
  quizzes,
  classFilter,
}: QuizAnalysisProps) {
  const stats = useMemo<QuestionStat[]>(() => {
    const classIds = new Set(
      students
        .filter((s) => !classFilter || (s.class_name ?? "").trim() === classFilter)
        .map((s) => s.id)
    );

    const latest = latestQuizByStudentModule(quizzes);
    const tally = new Map<string, { correct: number; total: number }>();

    for (const [key, rec] of latest) {
      const studentId = key.split("|")[0];
      if (!classIds.has(studentId)) continue;
      for (const a of parseAnswers(rec.answers)) {
        const k = `${rec.module_no}|${a.q}`;
        const t = tally.get(k) ?? { correct: 0, total: 0 };
        t.total += 1;
        if (a.correct) t.correct += 1;
        tally.set(k, t);
      }
    }

    const rows: QuestionStat[] = [];
    for (const [k, v] of tally) {
      const [moduleNo, q] = k.split("|").map(Number);
      rows.push({
        moduleNo,
        q,
        correct: v.correct,
        total: v.total,
        rate: v.total ? (v.correct / v.total) * 100 : 0,
      });
    }
    rows.sort((a, b) => a.moduleNo - b.moduleNo || a.q - b.q);
    return rows;
  }, [students, quizzes, classFilter]);

  const worst = useMemo(() => {
    return stats
      .filter((s) => s.total > 0)
      .slice()
      .sort((a, b) => a.rate - b.rate)
      .slice(0, 3);
  }, [stats]);

  const label = classFilter || "全部班级";

  return (
    <div className="chart-card">
      <h3 className="chart-title">测验分析 · 每题正确率（{label}）</h3>
      {worst.length > 0 && (
        <p className="quiz-analysis-worst">
          错得最多：
          {worst
            .map((w) => `模块${w.moduleNo} 第${w.q}题（${w.rate.toFixed(0)}%）`)
            .join("、")}
        </p>
      )}
      <div className="table-wrap">
        <table className="teacher-table">
          <thead>
            <tr>
              <th>题目</th>
              <th>正确率</th>
              <th>答对 / 作答</th>
            </tr>
          </thead>
          <tbody>
            {stats.length === 0 ? (
              <tr>
                <td colSpan={3} className="table-empty">
                  暂无测验数据
                </td>
              </tr>
            ) : (
              stats.map((s) => (
                <tr key={`${s.moduleNo}-${s.q}`}>
                  <td>
                    {MODULE_NAMES[s.moduleNo] ?? `模块${s.moduleNo}`} · 第 {s.q} 题
                  </td>
                  <td>
                    <div className="quiz-rate-cell">
                      <span className="quiz-rate-bar">
                        <span
                          className={`quiz-rate-fill ${
                            s.rate < 60 ? "low" : s.rate < 80 ? "mid" : "high"
                          }`}
                          style={{ width: `${s.rate}%` }}
                        />
                      </span>
                      <span className="quiz-rate-text">{s.rate.toFixed(0)}%</span>
                    </div>
                  </td>
                  <td>
                    {s.correct}/{s.total}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
