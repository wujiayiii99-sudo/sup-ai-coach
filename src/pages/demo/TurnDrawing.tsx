import { useState } from "react";
import { DrawingBoard, AnswerBoard } from "../../components/DrawingBoard";
import { RESULT_COLOR } from "../../lib/drawingColors";
import type { Pt, LineResult } from "../../components/DrawingBoard";
import { classifyTurnLine } from "../../lib/drawingJudgement";
import { module5Questions } from "../../data/module5-quiz";
import "./TurnDrawing.css";

const ANSWER_PATHS = module5Questions[0].answer;

export default function TurnDrawing() {
  const [lines, setLines] = useState<Pt[][]>([]);
  const [results, setResults] = useState<LineResult[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);

  function onClear() {
    setLines([]);
    setResults(null);
    setMessage(null);
    setSubmitted(false);
    setShowAnswer(false);
  }

  function onSubmit() {
    const res = lines.map((pts) => classifyTurnLine(pts, "left"));
    const hasForward = res.some((r) => r.stroke === "forward");
    const hasReverse = res.some((r) => r.stroke === "reverse");
    const correctCount = (hasForward ? 1 : 0) + (hasReverse ? 1 : 0);
    setResults(res);
    setSubmitted(true);
    setMessage(
      correctCount === 2
        ? "完全正确！"
        : correctCount === 1
        ? "部分正确，再想想另一条"
        : "再试一次"
    );
  }

  const tones = results ? results.map((r) => r.tone) : null;

  const messageClass =
    message === "完全正确！"
      ? "td-message-correct"
      : message === "部分正确，再想想另一条"
      ? "td-message-partial"
      : "td-message-fail";

  return (
    <div className="td-page">
      <h1 className="td-title">绕标画图题 Demo</h1>
      <p className="td-question">请画出左转弯时使用的两种桨法。用鼠标或手指在图上拖动画线。</p>

      <div className="td-canvas-wrap">
        <DrawingBoard
          maxLines={2}
          lines={lines}
          onLinesChange={setLines}
          tones={tones}
          disabled={submitted}
        />
      </div>

      <div className="td-controls">
        <button
          type="button"
          className="td-btn td-btn-clear"
          onClick={onClear}
          disabled={lines.length === 0 && !submitted}
        >
          清除
        </button>
        <button
          type="button"
          className="td-btn td-btn-submit"
          onClick={onSubmit}
          disabled={submitted || lines.length === 0}
        >
          提交
        </button>
      </div>

      {message && (
        <div className="td-result">
          <p className={`td-message ${messageClass}`}>{message}</p>
          <div className="td-line-results">
            {lines.map((_, i) => {
              const r = results?.[i];
              if (!r) return null;
              return (
                <div key={`res-${i}`} className={`td-line-result ${r.tone}`}>
                  <span className="td-line-swatch" style={{ background: RESULT_COLOR[r.tone] }} />
                  <span>第{i === 0 ? "一" : "二"}条线：{r.label}</span>
                  {r.hint && <span className="td-hint">{r.hint}</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {message && (
        <div className="td-answer-toggle">
          <button
            type="button"
            className="td-btn td-btn-answer"
            onClick={() => setShowAnswer((v) => !v)}
          >
            {showAnswer ? "收起正确答案" : "查看正确答案"}
          </button>
        </div>
      )}

      {showAnswer && (
        <div className="td-answer">
          <h2 className="td-answer-title">标准答案</h2>
          <div className="td-canvas-wrap">
            <AnswerBoard paths={ANSWER_PATHS} />
          </div>
        </div>
      )}
    </div>
  );
}
