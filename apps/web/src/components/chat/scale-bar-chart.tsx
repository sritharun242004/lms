"use client";

import * as React from "react";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { useTweenedNumbers } from "@/hooks/use-tweened-numbers";
import { POLL_ANIMATION_MS } from "@/components/chat/poll-chart";
import { scaleBars } from "@/components/chat/scale-results";
import { cn } from "@/lib/utils";

/** Height of the tallest possible bar. */
export const SCALE_PLOT_HEIGHT = 96;
/** Room above the plot for the count + percentage riding on the tallest bar. */
const LABEL_HEIGHT = 36;
/** A value nobody chose keeps a hairline on the baseline, not a bar. */
const EMPTY_MARK_HEIGHT = 2;

interface ScaleBarChartProps {
  min: number;
  max: number;
  /** distribution[i] = how many participants chose min + i */
  distribution: readonly number[];
  /** The viewer's saved value, drawn in the full accent. */
  selected: number | null;
  /** Statement accent colour (any CSS colour). */
  accent: string;
  /** Statement text, for the accessible summary. */
  label: string;
  className?: string;
}

function sameChart(a: ScaleBarChartProps, b: ScaleBarChartProps) {
  return (
    a.min === b.min &&
    a.max === b.max &&
    a.selected === b.selected &&
    a.accent === b.accent &&
    a.label === b.label &&
    a.className === b.className &&
    a.distribution.length === b.distribution.length &&
    a.distribution.every((count, i) => count === b.distribution[i])
  );
}

/**
 * Column chart of one Scale statement: one bar per allowed value.
 *
 * It moves exactly like the multiple-choice bar graph (PollBarChart): the bars
 * and the scale maximum follow the real counts through the ONE shared tween
 * (useTweenedNumbers, POLL_ANIMATION_MS), always from what is currently drawn
 * to the latest target, so a count going up grows the bar, a count going down
 * shrinks it, and an interrupted change continues from where the bar is.
 *
 * - The count and percentage are the real values and sit on top of their bar,
 *   so they travel with it and are never hidden mid-animation.
 * - Every column has a fixed height and the columns share the width by flex,
 *   so a resize or a text wrap elsewhere re-lays the chart out instantly: there
 *   is nothing to measure and nothing to re-animate.
 * - The thread hands down fresh-but-equal objects on every refresh; the memo
 *   comparator and the value-keyed tween both ignore those.
 */
export const ScaleBarChart = React.memo(function ScaleBarChart({
  min,
  max,
  distribution,
  selected,
  accent,
  label,
  className,
}: ScaleBarChartProps) {
  const reduceMotion = usePrefersReducedMotion();
  const { bars, total, peak } = React.useMemo(
    () => scaleBars({ min, max }, distribution, selected),
    [min, max, distribution, selected]
  );

  const scaleMax = Math.max(1, peak);
  const targets = React.useMemo(() => [...bars.map((bar) => bar.count), scaleMax], [bars, scaleMax]);
  // Bars grow from 0 on mount; the scale maximum starts at its final value.
  const initial = React.useMemo(() => [...bars.map(() => 0), scaleMax], [bars, scaleMax]);
  const { values, animating } = useTweenedNumbers(targets, POLL_ANIMATION_MS, Boolean(reduceMotion), initial);
  const shownMax = Math.max(1, values[values.length - 1] ?? scaleMax);

  const summary = bars.map((bar) => `${bar.value}: ${bar.count} (${bar.percent}%)`).join("; ");

  return (
    <div
      className={cn("min-w-0", className)}
      role="img"
      aria-label={`Response distribution for "${label}". ${total} ${total === 1 ? "response" : "responses"}. ${summary}`}
      data-testid="scale-bar-chart"
      data-animating={animating ? "true" : "false"}
    >
      <div
        className="flex items-end gap-1 border-b border-border @md:gap-1.5"
        style={{ height: LABEL_HEIGHT + SCALE_PLOT_HEIGHT }}
        aria-hidden
      >
        {bars.map((bar, i) => {
          const shown = Math.max(0, values[i] ?? 0);
          const height = Math.min(SCALE_PLOT_HEIGHT, (shown / shownMax) * SCALE_PLOT_HEIGHT);
          return (
            <div
              key={bar.value}
              className="flex h-full min-w-0 flex-1 flex-col items-center justify-end"
              data-testid="scale-bar-column"
            >
              <span className="flex shrink-0 flex-col items-center pb-1 leading-none tabular-nums">
                <span
                  className={cn("text-xs font-semibold", bar.count === 0 && "text-muted-foreground")}
                  data-testid="scale-bar-count"
                >
                  {bar.count}
                </span>
                <span className="mt-0.5 text-[10px] text-muted-foreground" data-testid="scale-bar-percent">
                  {bar.percent}%
                </span>
              </span>
              <span
                className="block w-full max-w-16 shrink-0 rounded-t-md"
                style={{
                  height: Math.max(EMPTY_MARK_HEIGHT, height),
                  backgroundColor: accent,
                  opacity: bar.count === 0 && shown < 0.001 ? 0.25 : bar.highlighted ? 1 : 0.4,
                }}
                data-testid="scale-bar"
                data-value={bar.value}
                data-highlighted={bar.highlighted ? "true" : undefined}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-1 @md:gap-1.5" aria-hidden>
        {bars.map((bar) => (
          <span
            key={bar.value}
            className={cn(
              "min-w-0 flex-1 text-center text-[11px] tabular-nums",
              bar.value === selected ? "font-bold text-foreground" : "text-muted-foreground"
            )}
          >
            {bar.value}
          </span>
        ))}
      </div>
    </div>
  );
}, sameChart);
