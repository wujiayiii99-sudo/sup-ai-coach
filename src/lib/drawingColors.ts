export type LineTone = "correct" | "wrong" | "unclear";

export const RESULT_COLOR: Record<LineTone, string> = {
  correct: "#2e7d32",
  wrong: "#d32f2f",
  unclear: "#f9a825",
};
