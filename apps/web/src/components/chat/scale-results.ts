// One accent per statement, in the approved order: blue, green, purple,
// orange, pink — then the remaining chart tokens so a scale with up to 10
// statements (SCALE_MAX_STATEMENTS) never repeats a colour. They are the same
// theme tokens the poll charts use, so light and dark mode are already covered.
const ACCENTS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-4)",
  "var(--chart-7)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-3)",
  "var(--chart-9)",
  "var(--chart-10)",
  "var(--chart-8)",
];

export function scaleAccent(statementIndex: number): string {
  return ACCENTS[((statementIndex % ACCENTS.length) + ACCENTS.length) % ACCENTS.length];
}

export interface ScaleBar {
  /** The scale value this bar stands for (min + index). */
  value: number;
  count: number;
  /** Whole-number share of all responses; 0 when nobody has responded. */
  percent: number;
  /** Drawn in the full accent: the viewer's value, else the most chosen one(s). */
  highlighted: boolean;
}

export interface ScaleBars {
  bars: ScaleBar[];
  total: number;
  /** Highest single count (0 when there are no responses). */
  peak: number;
}

const safeCount = (count: unknown) =>
  typeof count === "number" && Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;

/**
 * One bar per allowed value, derived only from the response distribution.
 * The bar set always covers the whole min → max range, so a missing, short or
 * late distribution still draws every value (at zero) instead of shifting bars.
 */
export function scaleBars(
  range: { min: number; max: number },
  distribution: readonly number[] | null | undefined,
  selected: number | null
): ScaleBars {
  const length = Math.max(1, range.max - range.min + 1);
  const counts = Array.from({ length }, (_, i) => safeCount(distribution?.[i]));
  const total = counts.reduce((sum, count) => sum + count, 0);
  const peak = Math.max(0, ...counts);
  const hasSelection = selected !== null && selected >= range.min && selected <= range.max;
  const bars = counts.map((count, i) => {
    const value = range.min + i;
    return {
      value,
      count,
      percent: total === 0 ? 0 : Math.round((count / total) * 100),
      highlighted: hasSelection ? value === selected : peak > 0 && count === peak,
    };
  });
  return { bars, total, peak };
}

/** Stat tiles show a dash until there is something to measure. */
export function formatScaleStat(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "–";
}
