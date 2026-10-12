"use client";

import * as React from "react";
import { useReducedMotion } from "motion/react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Rectangle,
  XAxis,
  YAxis,
} from "recharts";
import type { PollOptionResult } from "@/lib/api/services/message-service";
import { useTweenedNumbers } from "@/hooks/use-tweened-numbers";
import { POLL_ANIMATION_MS, pollColor } from "@/components/chat/poll-chart";
import { pollAxis } from "@/components/chat/poll-bar-scale";
import { createTextMeasurer, wrapLabel, wrapLabelBy } from "@/components/chat/poll-bar-label";

/** Up to this many options the categories carry their full (wrapped) text. */
export const FULL_LABEL_LIMIT = 8;
/** Narrower than this per category, full words would be split: use number keys. */
export const MIN_LABEL_BAND = 58;
export const Y_AXIS_WIDTH = 52;

/** True when the bars should carry number keys instead of the answer text. */
export function usesNumberKeys(optionCount: number, chartWidth: number): boolean {
  if (optionCount > FULL_LABEL_LIMIT) return true;
  return (chartWidth - Y_AXIS_WIDTH - 8) / Math.max(1, optionCount) < MIN_LABEL_BAND;
}

const LINE_HEIGHT = 14;
const LABEL_FONT_PX = 11;
const CHAR_WIDTH = 6.6; // fallback glyph width when the font cannot be measured
const BAND_PADDING = 4;
/** Height of the plot itself (bars + counts), below the top margin. */
const PLOT_HEIGHT = 200;
const MARGIN = { top: 26, right: 8, left: 0, bottom: 0 } as const;

interface PollBarChartProps {
  options: PollOptionResult[];
  /** Number keys instead of answer text under the bars (see usesNumberKeys). */
  keysOnly: boolean;
  className?: string;
}

interface Item {
  id: string;
  label: string;
  /** Short key shown under the bar when there are too many options for text. */
  key: string;
  /** The real vote count: what is displayed as text and used for the axis. */
  votes: number;
  fill: string;
}

/** Item plus the (animated) value the bar is currently drawn at. */
interface Datum extends Item {
  shown: number;
}

/** Track the rendered width of an element; changes only arrive from the observer. */
export function useElementWidth<T extends HTMLElement>(initial: number) {
  const ref = React.useRef<T>(null);
  const [width, setWidth] = React.useState(initial);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const next = Math.round(entries[0]?.contentRect.width ?? 0);
      if (next > 0) setWidth((current) => (current === next ? current : next));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

interface TickProps {
  x?: number;
  y?: number;
  index?: number;
  /** Pre-wrapped lines per category, so the label area and the ticks always agree. */
  lines: string[][];
  keysOnly: boolean;
}

function CategoryTick({ x = 0, y = 0, index = 0, lines: all, keysOnly }: TickProps) {
  const lines = all[index];
  if (!lines) return null;
  return (
    <g transform={`translate(${x},${y + 14})`}>
      <text
        textAnchor="middle"
        fontSize={LABEL_FONT_PX}
        fontWeight={keysOnly ? 600 : 400}
        fill="var(--muted-foreground)"
      >
        {lines.map((line, i) => (
          <tspan key={i} x={0} dy={i === 0 ? 0 : LINE_HEIGHT}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
}

interface BarShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  payload?: Datum;
}

/**
 * One column plus its vote count. The count is part of the bar's own shape, so
 * it is positioned from the same animated geometry and rides on top of the bar
 * while it grows. (Recharts' LabelList is hidden for the whole animation and
 * only reappears afterwards, which made counts blink out on every update.)
 */
function BarWithCount({ x = 0, y = 0, width = 0, height = 0, fill, payload }: BarShapeProps) {
  return (
    <g>
      <Rectangle x={x} y={y} width={width} height={height} fill={fill} radius={[10, 10, 0, 0]} />
      <text
        x={x + width / 2}
        y={y - 8}
        textAnchor="middle"
        fontSize={13}
        fontWeight={600}
        fill="var(--foreground)"
        data-testid="poll-bar-count"
      >
        {payload?.votes ?? 0}
      </text>
    </g>
  );
}

function sameBars(a: PollBarChartProps, b: PollBarChartProps) {
  return (
    a.className === b.className &&
    a.keysOnly === b.keysOnly &&
    a.options.length === b.options.length &&
    a.options.every((option, i) => {
      const other = b.options[i];
      return (
        option.id === other.id && option.voteCount === other.voteCount && option.text === other.text
      );
    })
  );
}

/**
 * Vertical, rounded column chart of poll votes.
 *
 * Space is reserved from the real container width: the width of one category
 * band decides how wide a label line may be (measured in the real font) and the
 * longest wrapped label decides the height of the label area. The chart height
 * is computed from that, so it is fixed for a given layout and never flickers
 * while the container is being measured.
 *
 * Animation runs only when the vote numbers change (and on first mount); a
 * resize or any other layout change re-lays the bars out instantly. Above
 * FULL_LABEL_LIMIT options, or when categories are too narrow, the bars carry
 * number keys that match the numbered circles on the answer cards.
 */
export const PollBarChart = React.memo(function PollBarChart({
  options,
  keysOnly,
  className,
}: PollBarChartProps) {
  const reduceMotion = useReducedMotion();
  const [boxRef, boxWidth] = useElementWidth<HTMLDivElement>(480);

  const items = React.useMemo<Item[]>(
    () =>
      options.map((option, i) => ({
        id: option.id,
        label: option.text,
        key: String(i + 1),
        votes: option.voteCount,
        fill: pollColor(i),
      })),
    [options]
  );
  const axis = React.useMemo(
    () => pollAxis(Math.max(0, ...options.map((option) => option.voteCount))),
    [options]
  );

  // ONE animation system. The bars and the axis maximum follow the real values
  // together, always from what is currently drawn to the latest target; Recharts'
  // own animation is off so the two can never fight over the same bar.
  const targets = React.useMemo(() => [...items.map((item) => item.votes), axis.max], [items, axis.max]);
  // Bars grow from 0 on mount; the axis starts at its final scale.
  const initial = React.useMemo(() => [...items.map(() => 0), axis.max], [items, axis.max]);
  const { values, animating } = useTweenedNumbers(targets, POLL_ANIMATION_MS, Boolean(reduceMotion), initial);
  const domainMax = Math.max(1, values[values.length - 1] ?? axis.max);

  const data = React.useMemo<Datum[]>(
    () => items.map((item, i) => ({ ...item, shown: values[i] ?? 0 })),
    [items, values]
  );

  const plotWidth = Math.max(1, boxWidth - Y_AXIS_WIDTH - MARGIN.left - MARGIN.right);
  const band = plotWidth / Math.max(1, options.length);
  const lineWidth = Math.max(24, band - BAND_PADDING);

  // Wrap by measured pixel width in the real font; fall back to a character
  // estimate where text cannot be measured (SSR, jsdom).
  const wrap = React.useMemo(() => {
    const family =
      typeof document === "undefined" ? "sans-serif" : getComputedStyle(document.body).fontFamily;
    const measure = createTextMeasurer(LABEL_FONT_PX, family);
    if (!measure) {
      const maxChars = Math.max(4, Math.floor(lineWidth / CHAR_WIDTH));
      return (label: string) => wrapLabel(label, maxChars);
    }
    return (label: string) => wrapLabelBy(label, (candidate) => measure(candidate) <= lineWidth);
  }, [lineWidth]);

  const lines = React.useMemo(
    () => items.map((item) => (keysOnly ? [item.key] : wrap(item.label))),
    [items, keysOnly, wrap]
  );
  const labelAreaHeight = Math.max(1, ...lines.map((entry) => entry.length)) * LINE_HEIGHT + 22;
  const chartHeight = MARGIN.top + PLOT_HEIGHT + labelAreaHeight;

  const summary = options.map((o, i) => `${i + 1}. ${o.text}: ${o.voteCount}`).join("; ");

  return (
    <div
      ref={boxRef}
      className={className}
      role="img"
      aria-label={`Bar graph of votes. ${summary}`}
      data-testid="poll-bar-chart"
      data-animating={animating ? "true" : "false"}
    >
      {/*
        Sized from the same measurement that drives label wrapping (boxWidth), not
        from Recharts' ResponsiveContainer. Two separate observers meant the plot
        got the new width a frame before the label area got its new height, so a
        resize showed one frame of squashed bars.
      */}
      <BarChart width={boxWidth} height={chartHeight} data={data} margin={MARGIN} barCategoryGap="22%">
          <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="var(--border)" />
          <YAxis
            width={Y_AXIS_WIDTH}
            domain={[0, domainMax]}
            ticks={axis.ticks.filter((tick) => tick <= domainMax + 1e-6)}
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
            label={{
              value: "Votes",
              angle: -90,
              position: "insideLeft",
              offset: 12,
              style: { fontSize: 12, fill: "var(--muted-foreground)", textAnchor: "middle" },
            }}
          />
          <XAxis
            dataKey="id"
            interval={0}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            height={labelAreaHeight}
            tick={<CategoryTick lines={lines} keysOnly={keysOnly} />}
          />
          <Bar dataKey="shown" maxBarSize={64} shape={<BarWithCount />} isAnimationActive={false}>
            {data.map((datum) => (
              <Cell key={datum.id} fill={datum.fill} />
            ))}
          </Bar>
      </BarChart>
    </div>
  );
}, sameBars);
