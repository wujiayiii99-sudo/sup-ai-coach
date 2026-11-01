/** 单次测验记录（用于统计分析） */
export interface QuizScoreRecord {
  student_id: string;
  module_no: number;
  score: number;
  total: number;
  answers?: unknown;
  created_at: string;
}

export interface AnswerEntry {
  q: number;
  correct: boolean;
}

/** 安全解析 quiz_scores.answers (jsonb)：只保留 { q:number, correct:boolean } 的条目 */
export function parseAnswers(raw: unknown): AnswerEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: AnswerEntry[] = [];
  for (const item of raw) {
    if (item && typeof item === "object") {
      const rec = item as Record<string, unknown>;
      if (typeof rec.q === "number" && typeof rec.correct === "boolean") {
        out.push({ q: rec.q, correct: rec.correct });
      }
    }
  }
  return out;
}

/** 每个学生每个模块只保留最新一次测验（按 created_at 最大） */
export function latestQuizByStudentModule(
  rows: QuizScoreRecord[]
): Map<string, QuizScoreRecord> {
  const map = new Map<string, QuizScoreRecord>();
  for (const r of rows) {
    const key = `${r.student_id}|${r.module_no}`;
    const prev = map.get(key);
    if (!prev || r.created_at > prev.created_at) map.set(key, r);
  }
  return map;
}
