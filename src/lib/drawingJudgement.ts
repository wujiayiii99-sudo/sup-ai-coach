import type { Pt, LineResult } from "../components/DrawingBoard";

const MID_X = 200;
const MID_Y = 300;
const MID_BAND = 10;

type Half = "left" | "right" | "middle";

interface LineAnalysis {
  meanX: number;
  startX: number;
  endX: number;
  startY: number;
  endY: number;
  half: Half;
}

function analyzeLine(points: Pt[]): LineAnalysis {
  const meanX = points.reduce((s, p) => s + p.x, 0) / points.length;
  const start = points[0];
  const end = points[points.length - 1];
  const half: Half =
    meanX >= MID_X - MID_BAND && meanX <= MID_X + MID_BAND
      ? "middle"
      : meanX > MID_X
        ? "right"
        : "left";
  return {
    meanX,
    startX: start.x,
    endX: end.x,
    startY: start.y,
    endY: end.y,
    half,
  };
}

type Turn = "left" | "right";

/** 转弯题：左转弯前扫桨在右侧、右转弯前扫桨在左侧；与绘制顺序无关 */
export function classifyTurnLine(points: Pt[], turn: Turn): LineResult {
  if (points.length === 0) return { tone: "wrong", label: "✗ 方向不对" };
  const a = analyzeLine(points);
  if (a.half === "middle") {
    return {
      tone: "unclear",
      label: "⚠ 方向不明确",
      hint: "这条线跨过了中线，请重画",
    };
  }
  const forwardSide: Half = turn === "left" ? "right" : "left";
  const forward = a.half === forwardSide && a.startY < MID_Y && a.endY > MID_Y;
  const reverse = a.half !== forwardSide && a.startY > MID_Y && a.endY < MID_Y;
  if (forward) return { tone: "correct", label: "✓ 前扫桨", stroke: "forward" };
  if (reverse) return { tone: "correct", label: "✓ 反扫桨", stroke: "reverse" };
  return { tone: "wrong", label: "✗ 方向不对" };
}

type Pull = "left" | "right";

/** 横拉题：向左=主体在左且起点 x < 终点 x（向中心画）；向右相反 */
export function classifyPullLine(points: Pt[], pull: Pull): LineResult {
  if (points.length === 0) return { tone: "wrong", label: "✗ 方向不对" };
  const a = analyzeLine(points);
  if (a.half === "middle") {
    return {
      tone: "unclear",
      label: "⚠ 方向不明确",
      hint: "这条线跨过了中线，请重画",
    };
  }
  const ok =
    pull === "left"
      ? a.half === "left" && a.startX < a.endX
      : a.half === "right" && a.startX > a.endX;
  const label = pull === "left" ? "✓ 向左横拉" : "✓ 向右横拉";
  return ok ? { tone: "correct", label } : { tone: "wrong", label: "✗ 方向不对" };
}
