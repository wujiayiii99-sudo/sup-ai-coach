import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useStudent } from "../contexts/StudentContext";
import PageBanner from "../components/PageBanner";
import { DrawingBoard, AnswerBoard } from "../components/DrawingBoard";
import { RESULT_COLOR } from "../lib/drawingColors";
import type { Pt, LineResult } from "../components/DrawingBoard";
import { module5Questions, checkQuestion } from "../data/module5-quiz";
import "./Module5.css";

const TOTAL_QUESTIONS = module5Questions.length;
const PER_QUESTION = 25;
const TOTAL_SCORE = TOTAL_QUESTIONS * PER_QUESTION;

interface AnswerRow {
  q: number;
  selected: { lines: Pt[][] };
  correct: boolean;
}

export default function Module5() {
  const { student } = useStudent();
  const [index, setIndex] = useState(0);
  const [lines, setLines] = useState<Pt[][]>([]);
  const [results, setResults] = useState<LineResult[] | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [correct, setCorrect] = useState(false);
  const [answerRows, setAnswerRows] = useState<AnswerRow[]>([]);
  const [finished, setFinished] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const q = module5Questions[index];
  const score = answerRows.filter((a) => a.correct).length * PER_QUESTION;
  const tones = results ? results.map((r) => r.tone) : null;

  function onClear() {
    setLines([]);
    setResults(null);
    setSubmitted(false);
    setCorrect(false);
  }

  function onSubmit() {
    const { correct: ok, results: res } = checkQuestion(q, lines);
    setResults(res);
    setCorrect(ok);
    setSubmitted(true);
    setAnswerRows((rows) => [
      ...rows,
      { q: q.id, selected: { lines }, correct: ok },
    ]);
  }

  function onNext() {
    if (index < TOTAL_QUESTIONS - 1) {
      setIndex(index + 1);
      setLines([]);
      setResults(null);
      setSubmitted(false);
      setCorrect(false);
    } else {
      finish();
    }
  }

  async function finish() {
    setFinished(true);
    if (!student) return;
    setSaving(true);
    setSaveError(null);

    const finalScore = answerRows.filter((a) => a.correct).length * PER_QUESTION;
    const [scoreRes, progRes] = await Promise.all([
      supabase.from("quiz_scores").insert({
        student_id: student.id,
        module_no: 5,
        score: finalScore,
        total: TOTAL_SCORE,
        answers: answerRows,
      }),
      supabase.from("module_progress").upsert(
        { student_id: student.id, module_no: 5, status: "completed" },
        { onConflict: "student_id,module_no" }
      ),
    ]);

    if (scoreRes.error || progRes.error) {
      setSaveError(
        [scoreRes.error?.message, progRes.error?.message].filter(Boolean).join("；")
      );
    } else {
      setSaved(true);
    }
    setSaving(false);
  }

  function restart() {
    setIndex(0);
    setLines([]);
    setResults(null);
    setSubmitted(false);
    setCorrect(false);
    setAnswerRows([]);
    setFinished(false);
    setSaving(false);
    setSaved(false);
    setSaveError(null);
  }

  if (finished) {
    return (
      <div className="m5-page">
        <PageBanner
          image="/images/photos/module4-1.jpg"
          title="绕标技术"
          subtitle="转弯与横拉的桨法轨迹画图题"
        />
        <div className="quiz-page">
          <h1 className="quiz-title">模块 5 测验</h1>
          <div className="quiz-result">
            <div className="quiz-score">
              <span className="quiz-score-num">{score}</span>
              <span className="quiz-score-total"> / {TOTAL_SCORE}</span>
            </div>
            <p className="quiz-result-msg">
              {score >= TOTAL_SCORE
                ? "优秀！"
                : score >= 75
                ? "不错！"
                : score >= 50
                ? "及格。"
                : "建议再练习一下绕标技术。"}
            </p>
            {saving && <p className="quiz-save-status">成绩保存中…</p>}
            {saved && <p className="quiz-save-status ok">成绩已保存</p>}
            {saveError && (
              <p className="quiz-save-status error">成绩保存失败：{saveError}</p>
            )}
            <div className="quiz-actions">
              <button className="btn-secondary" type="button" onClick={restart}>
                再来一次
              </button>
              <Link className="btn-primary" to="/">
                返回首页
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="m5-page">
      <PageBanner
        image="/images/photos/module4-1.jpg"
        title="绕标技术"
        subtitle="转弯与横拉的桨法轨迹画图题"
      />
      <div className="m5-quiz">
        <header className="m5-header">
          <h1 className="m5-title">绕标技术画图题</h1>
          <div className="m5-progress">
            {index + 1} / {TOTAL_QUESTIONS}
          </div>
        </header>

        <div className="m5-question-card">
          <p className="m5-question">{q.question}</p>
          <p className="m5-tip">用鼠标或手指在桨板图上拖动画线。</p>

          <div className="m5-board-wrap">
            <DrawingBoard
              maxLines={q.maxLines}
              lines={lines}
              onLinesChange={setLines}
              tones={tones}
              disabled={submitted}
            />
          </div>

          {!submitted ? (
            <div className="m5-controls">
              <button
                type="button"
                className="btn-secondary"
                onClick={onClear}
                disabled={lines.length === 0}
              >
                清除
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={onSubmit}
                disabled={lines.length < q.maxLines}
              >
                提交
              </button>
            </div>
          ) : (
            <div className="m5-feedback">
              <p className={correct ? "m5-correct" : "m5-wrong"}>
                {correct ? "✓ 回答正确" : "✗ 回答错误"}
              </p>
              <div className="m5-line-results">
                {lines.map((_, i) => {
                  const r = results?.[i];
                  if (!r) return null;
                  return (
                    <div key={i} className={`m5-line-result ${r.tone}`}>
                      <span
                        className="m5-line-swatch"
                        style={{ background: RESULT_COLOR[r.tone] }}
                      />
                      <span>第{i + 1}条线：{r.label}</span>
                      {r.hint && <span className="m5-hint">{r.hint}</span>}
                    </div>
                  );
                })}
              </div>

              <div className="m5-answer">
                <h2 className="m5-answer-title">标准答案</h2>
                <div className="m5-board-wrap">
                  <AnswerBoard paths={q.answer} />
                </div>
              </div>

              <div className="m5-nav">
                <button className="btn-primary" type="button" onClick={onNext}>
                  {index < TOTAL_QUESTIONS - 1 ? "下一题" : "查看结果"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
