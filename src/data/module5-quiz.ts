import type { Pt, LineResult, AnswerPath } from "../components/DrawingBoard";
import { classifyTurnLine, classifyPullLine } from "../lib/drawingJudgement";

export interface DrawingQuestion {
  id: number;
  question: string;
  maxLines: 1 | 2;
  kind: "turn" | "pull";
  turn?: "left" | "right";
  pull?: "left" | "right";
  answer: AnswerPath[];
}

export interface QuestionCheck {
  correct: boolean;
  results: LineResult[];
}

const ANSWER_LEFT_TURN: AnswerPath[] = [
  { d: "M 285 110 C 322 200, 322 380, 290 480", label: "前扫桨", labelX: 332, labelY: 300, anchor: "start" },
  { d: "M 110 480 C 78 380, 78 200, 105 110", label: "反扫桨", labelX: 67, labelY: 300, anchor: "end" },
];

const ANSWER_RIGHT_TURN: AnswerPath[] = [
  { d: "M 110 110 C 78 200, 78 380, 105 480", label: "前扫桨", labelX: 67, labelY: 300, anchor: "end" },
  { d: "M 285 480 C 322 380, 322 200, 290 110", label: "反扫桨", labelX: 332, labelY: 300, anchor: "start" },
];

const ANSWER_PULL_LEFT: AnswerPath[] = [
  { d: "M 78 300 C 120 280, 150 320, 192 300", label: "向左横拉", labelX: 135, labelY: 270, anchor: "middle" },
];

const ANSWER_PULL_RIGHT: AnswerPath[] = [
  { d: "M 322 300 C 280 280, 250 320, 208 300", label: "向右横拉", labelX: 265, labelY: 270, anchor: "middle" },
];

export const module5Questions: DrawingQuestion[] = [
  {
    id: 1,
    question: "请画出【左转弯】的两种桨法。",
    maxLines: 2,
    kind: "turn",
    turn: "left",
    answer: ANSWER_LEFT_TURN,
  },
  {
    id: 2,
    question: "请画出【右转弯】的两种桨法。",
    maxLines: 2,
    kind: "turn",
    turn: "right",
    answer: ANSWER_RIGHT_TURN,
  },
  {
    id: 3,
    question: "请画出【向左横拉桨】的桨叶轨迹。",
    maxLines: 1,
    kind: "pull",
    pull: "left",
    answer: ANSWER_PULL_LEFT,
  },
  {
    id: 4,
    question: "请画出【向右横拉桨】的桨叶轨迹。",
    maxLines: 1,
    kind: "pull",
    pull: "right",
    answer: ANSWER_PULL_RIGHT,
  },
];

export function checkQuestion(q: DrawingQuestion, lines: Pt[][]): QuestionCheck {
  if (q.kind === "turn") {
    const results = lines.map((pts) => classifyTurnLine(pts, q.turn ?? "left"));
    const hasForward = results.some((r) => r.stroke === "forward");
    const hasReverse = results.some((r) => r.stroke === "reverse");
    return { correct: hasForward && hasReverse, results };
  }
  const results = lines.map((pts) => classifyPullLine(pts, q.pull ?? "left"));
  return { correct: results.some((r) => r.tone === "correct"), results };
}
