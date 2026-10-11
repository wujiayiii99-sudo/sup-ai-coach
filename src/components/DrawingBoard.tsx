import { useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { RESULT_COLOR } from "../lib/drawingColors";
import type { LineTone } from "../lib/drawingColors";
import "./DrawingBoard.css";

export type Pt = { x: number; y: number };
export interface LineResult {
  tone: LineTone;
  label: string;
  hint?: string;
  /** 仅转弯题：标记该线是前扫桨还是反扫桨 */
  stroke?: "forward" | "reverse";
}
export interface AnswerPath {
  d: string;
  label: string;
  labelX: number;
  labelY: number;
  anchor?: "start" | "end" | "middle";
}

const VIEW_W = 400;
const VIEW_H = 600;
const LINE_COLOR = "#0066cc";

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function toPoint(e: ReactPointerEvent<SVGSVGElement>): Pt {
  const rect = e.currentTarget.getBoundingClientRect();
  return {
    x: clamp(((e.clientX - rect.left) / rect.width) * VIEW_W, 0, VIEW_W),
    y: clamp(((e.clientY - rect.top) / rect.height) * VIEW_H, 0, VIEW_H),
  };
}

function pointsToStr(pts: Pt[]): string {
  return pts.map((p) => `${p.x},${p.y}`).join(" ");
}

/** 根据最后一段线段的朝向，在终点生成一个三角形箭头 */
function arrowHeadPoints(points: Pt[], size = 16): string | null {
  if (points.length < 2) return null;
  const a = points[points.length - 2];
  const b = points[points.length - 1];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-3) return null;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  const half = size * 0.44;
  const baseX = b.x - ux * size;
  const baseY = b.y - uy * size;
  const p1x = baseX + px * half;
  const p1y = baseY + py * half;
  const p2x = baseX - px * half;
  const p2y = baseY - py * half;
  return `${b.x},${b.y} ${p1x},${p1y} ${p2x},${p2y}`;
}

/** 一条轨迹线 + 终点方向箭头 */
function StrokeLine({ points, color }: { points: Pt[]; color: string }) {
  const arrow = arrowHeadPoints(points);
  return (
    <g>
      <polyline
        points={pointsToStr(points)}
        fill="none"
        stroke={color}
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {arrow && <polygon points={arrow} fill={color} />}
    </g>
  );
}

/** 桨板俯视图背景：板身 + 三区分界线 + 标注，供画板与标准答案共用 */
function BoardBase() {
  return (
    <g>
      <rect
        x="60"
        y="20"
        width="280"
        height="560"
        rx="28"
        fill="#eaf3fb"
        stroke="#134c8a"
        strokeWidth="2"
      />
      <line
        x1="153"
        y1="20"
        x2="153"
        y2="580"
        stroke="#9bb7d4"
        strokeWidth="1.5"
        strokeDasharray="6 5"
      />
      <line
        x1="247"
        y1="20"
        x2="247"
        y2="580"
        stroke="#9bb7d4"
        strokeWidth="1.5"
        strokeDasharray="6 5"
      />
      <rect
        x="168"
        y="260"
        width="64"
        height="80"
        rx="8"
        fill="#ffffff"
        stroke="#9bb7d4"
        strokeWidth="1.5"
        strokeDasharray="4 4"
      />
      <text x="200" y="44" textAnchor="middle" fontSize="16" fontWeight="700" fill="#134c8a">
        板首
      </text>
      <text x="200" y="566" textAnchor="middle" fontSize="16" fontWeight="700" fill="#134c8a">
        板尾
      </text>
      <text x="200" y="305" textAnchor="middle" fontSize="13" fill="#5b6b7c">
        站立区
      </text>
      <text x="106" y="76" textAnchor="middle" fontSize="12" fill="#5b6b7c">
        左侧
      </text>
      <text x="200" y="76" textAnchor="middle" fontSize="12" fill="#5b6b7c">
        中间
      </text>
      <text x="293" y="76" textAnchor="middle" fontSize="12" fill="#5b6b7c">
        右侧
      </text>
    </g>
  );
}

export interface DrawingBoardProps {
  maxLines: 1 | 2;
  lines: Pt[][];
  onLinesChange: (lines: Pt[][]) => void;
  /** 每条线的着色；null/undefined 表示未提交，全部蓝色 */
  tones?: (LineTone | null)[] | null;
  disabled?: boolean;
}

/** 画板：SVG 桨板俯视图 + 鼠标/触摸画线 + 方向箭头，受控组件 */
export function DrawingBoard({
  maxLines,
  lines,
  onLinesChange,
  tones,
  disabled = false,
}: DrawingBoardProps) {
  const [current, setCurrentState] = useState<Pt[] | null>(null);
  const currentRef = useRef<Pt[] | null>(null);

  const setCurrent = (v: Pt[] | null) => {
    currentRef.current = v;
    setCurrentState(v);
  };

  const locked = disabled || lines.length >= maxLines;

  function onPointerDown(e: ReactPointerEvent<SVGSVGElement>) {
    if (locked) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setCurrent([toPoint(e)]);
  }

  function onPointerMove(e: ReactPointerEvent<SVGSVGElement>) {
    const cur = currentRef.current;
    if (!cur) return;
    const pt = toPoint(e);
    const last = cur[cur.length - 1];
    if (last && Math.hypot(pt.x - last.x, pt.y - last.y) < 2) return;
    setCurrent([...cur, pt]);
  }

  function onPointerUp() {
    const cur = currentRef.current;
    if (cur && cur.length >= 2) {
      onLinesChange(lines.length >= maxLines ? lines : [...lines, cur]);
    }
    setCurrent(null);
  }

  const lineColor = (i: number) => {
    const tone = tones?.[i];
    return tone ? RESULT_COLOR[tone] : LINE_COLOR;
  };

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className={`db-svg${locked ? " db-locked" : ""}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <BoardBase />
      {lines.map((pts, i) => (
        <StrokeLine key={`line-${i}`} points={pts} color={lineColor(i)} />
      ))}
      {current && <StrokeLine points={current} color={LINE_COLOR} />}
    </svg>
  );
}

/** 标准答案示意图：桨板 + 正确轨迹（绿色箭头） */
export function AnswerBoard({ paths }: { paths: AnswerPath[] }) {
  return (
    <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="db-svg" aria-label="标准答案示意图">
      <defs>
        <marker
          id="db-arrow"
          markerWidth="10"
          markerHeight="10"
          refX="5"
          refY="5"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path d="M0,0 L10,5 L0,10 Z" fill={RESULT_COLOR.correct} />
        </marker>
      </defs>
      <BoardBase />
      {paths.map((p) => (
        <g key={p.label}>
          <path
            d={p.d}
            fill="none"
            stroke={RESULT_COLOR.correct}
            strokeWidth="4"
            strokeLinecap="round"
            markerEnd="url(#db-arrow)"
          />
          <text
            x={p.labelX}
            y={p.labelY}
            textAnchor={p.anchor ?? "middle"}
            fontSize="13"
            fontWeight="700"
            fill={RESULT_COLOR.correct}
          >
            {p.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
