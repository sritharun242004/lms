"use client";

import * as React from "react";
import { useReducedMotion } from "motion/react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import type { PollOptionResult } from "@/lib/api/services/message-service";
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
/** Smallest plot (bars + counts); the column may stretch it to match the list. */
const MIN_PLOT_HEIGHT = 230;
const MARGIN = { top: 30, right: 8, left: 0, bottom: 0 } as const;

interface PollBarChartProps {
  options: PollOptionResult[];
  /** Number keys instead of answer text under the bars (see usesNumberKeys). */
  keysOnly: boolean;
  className?: string;
}

interface Datum {
  id: string;
  label: string;
  /** Short key shown under the bar when there are too many options for text. */
  key: string;
  votes: number;
  fill: string;
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
 * band decides how wide a label line may be (measured in the real font), the
 * longest wrapped label decides the height of the label area, and
 * ResponsiveContainer gives the plot whatever height is left - at least
 * MIN_PLOT_HEIGHT, more when the column is stretched beside a taller answer
 * list. Above FULL_LABEL_LIMIT options the bars carry numbered keys (matching
 * the numbered circles on the answer cards) so labels can never collide.
 */
export const PollBarChart = React.memo(function PollBarChart({
  options,
  keysOnly,
  className,
}: PollBarChartProps) {
  const reduceMotion = useReducedMotion();
  const [boxRef, boxWidth] = useElementWidth<HTMLDivElement>(480);

  const data = React.useMemo<Datum[]>(
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
    () => data.map((datum) => (keysOnly ? [datum.key] : wrap(datum.label))),
    [data, keysOnly, wrap]
  );
  const labelAreaHeight = Math.max(1, ...lines.map((entry) => entry.length)) * LINE_HEIGHT + 22;

  const summary = options.map((o, i) => `${i + 1}. ${o.text}: ${o.voteCount}`).join("; ");

  return (
    <div
      ref={boxRef}
      className={className}
      role="img"
      aria-label={`Bar graph of votes. ${summary}`}
      data-testid="poll-bar-chart"
    >
      <ResponsiveContainer
        width="100%"
        height="100%"
        minHeight={MIN_PLOT_HEIGHT + MARGIN.top + labelAreaHeight}
      >
        <BarChart data={data} margin={MARGIN} barCategoryGap="22%">
          <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="var(--border)" />
          <YAxis
            width={Y_AXIS_WIDTH}
            domain={[0, axis.max]}
            ticks={axis.ticks}
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
          <Bar
            dataKey="votes"
            maxBarSize={64}
            radius={[10, 10, 0, 0]}
            isAnimationActive={!reduceMotion}
            animationBegin={0}
            animationDuration={POLL_ANIMATION_MS}
            animationEasing="ease-out"
          >
            {data.map((datum) => (
              <Cell key={datum.id} fill={datum.fill} />
            ))}
            <LabelList
              dataKey="votes"
              position="top"
              offset={8}
              style={{ fontSize: 13, fontWeight: 600, fill: "var(--foreground)" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}, sameBars);
