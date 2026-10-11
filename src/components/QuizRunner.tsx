import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useStudent } from "../contexts/StudentContext";
import type { QuizQuestion } from "../data/module1-quiz";

interface QuizRunnerProps {
  title: string;
  questions: QuizQuestion[];
  moduleNo: number;
  backPath: string;
}

const LETTERS = ["A", "B", "C", "D", "E", "F"];

/** 逐题作答的测验流程：选完即时判对错，答完写 quiz_scores + module_progress */
export default function QuizRunner({
  title,
  questions,
  moduleNo,
  backPath,
}: QuizRunnerProps) {
  const { student } = useStudent();
  const [current, setCurrent] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [answers, setAnswers] = useState<number[]>(() => questions.map(() => -1));
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const question = questions[current];
  const score = questions.reduce(
    (acc, q, i) => acc + (answers[i] === q.answer ? 1 : 0),
    0
  );

  const pick = (idx: number) => {
    if (picked !== null) return;
    setPicked(idx);
    setAnswers((prev) => {
      const next = [...prev];
      next[current] = idx;
      return next;
    });
  };

  const next = () => {
    if (current < questions.length - 1) {
      setCurrent(current + 1);
      setPicked(null);
    } else {
      finish();
    }
  };

  async function finish() {
    setDone(true);
    if (!student) return;

    setSaving(true);
    setSaveError(null);

    const finalScore = answers.reduce(
      (acc, a, i) => acc + (a === questions[i].answer ? 1 : 0),
      0
    );
    const answerRows = questions.map((q, i) => ({
      q: q.id,
      selected: answers[i],
      correct: answers[i] === q.answer,
    }));

    const [scoreRes, progRes] = await Promise.all([
      supabase.from("quiz_scores").insert({
        student_id: student.id,
        module_no: moduleNo,
        score: finalScore,
        total: questions.length,
        answers: answerRows,
      }),
      supabase.from("module_progress").upsert(
        { student_id: student.id, module_no: moduleNo, status: "completed" },
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

  const restart = () => {
    setCurrent(0);
    setPicked(null);
    setAnswers(questions.map(() => -1));
    setDone(false);
    setSaving(false);
    setSaved(false);
    setSaveError(null);
  };

  if (done) {
    const percent = Math.round((score / questions.length) * 100);
    return (
      <div className="quiz-page">
        <h1 className="quiz-title">{title}</h1>
        <div className="quiz-result">
          <div className="quiz-score">
            <span className="quiz-score-num">{score}</span>
            <span className="quiz-score-total"> / {questions.length}</span>
          </div>
          <p className="quiz-result-msg">
            {percent >= 90
              ? "优秀！"
              : percent >= 70
                ? "不错！"
                : percent >= 60
                  ? "及格。"
                  : "建议再复习一下本模块内容。"}
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
            <Link className="btn-primary" to={backPath}>
              返回模块
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="quiz-page">
      <header className="quiz-header">
        <h1 className="quiz-title">{title}</h1>
        <div className="quiz-progress">
          {current + 1} / {questions.length}
        </div>
      </header>

      <div className="quiz-question-card">
        <p className="quiz-question">{question.question}</p>
        <div className="quiz-options">
          {question.options.map((opt, idx) => {
            let cls = "quiz-option";
            if (picked !== null) {
              if (idx === question.answer) cls += " correct";
              else if (idx === picked) cls += " wrong";
            }
            return (
              <button
                key={idx}
                type="button"
                className={cls}
                onClick={() => pick(idx)}
                disabled={picked !== null}
              >
                <span className="quiz-option-letter">{LETTERS[idx]}</span>
                <span className="quiz-option-text">{opt}</span>
              </button>
            );
          })}
        </div>

        {picked !== null && (
          <div
            className={`quiz-feedback ${picked === question.answer ? "correct" : "wrong"}`}
          >
            {picked === question.answer
              ? "回答正确！"
              : `回答错误，正确答案是 ${LETTERS[question.answer]}`}
          </div>
        )}

        {picked !== null && (
          <div className="quiz-nav">
            <button className="btn-primary" type="button" onClick={next}>
              {current < questions.length - 1 ? "下一题" : "查看结果"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
