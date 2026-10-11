"use client";

import * as React from "react";
import { useReducedMotion } from "motion/react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import type { PollOptionResult } from "@/lib/api/services/message-service";
import { cn } from "@/lib/utils";

// One distinct colour per option — polls allow at most 10 (see createPollSchema).
const COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
  "var(--chart-8)",
  "var(--chart-9)",
  "var(--chart-10)",
];

export function pollColor(index: number) {
  return COLORS[index % COLORS.length];
}

// Shared by the Recharts slices and the bar rows in PollMessage so every
// chart type moves with the same timing (ease-out).
export const POLL_ANIMATION_MS = 600;

const TRACK = [{ value: 1 }];

interface PollChartProps {
  options: PollOptionResult[];
  totalVotes: number;
  donut: boolean;
  className?: string;
}

// The chat thread refreshes on an interval and hands down fresh-but-equal poll
// objects. Recharts restarts its animation whenever `data` changes identity,
// so only let genuinely different results through.
function sameResults(a: PollChartProps, b: PollChartProps) {
  return (
    a.donut === b.donut &&
    a.totalVotes === b.totalVotes &&
    a.className === b.className &&
    a.options.length === b.options.length &&
    a.options.every((option, i) => {
      const other = b.options[i];
      return (
        option.id === other.id && option.voteCount === other.voteCount && option.text === other.text
      );
    })
  );
}

/** Donut / pie rendering of poll results. Bar polls are drawn by the option rows themselves. */
export const PollChart = React.memo(function PollChart({
  options,
  totalVotes,
  donut,
  className,
}: PollChartProps) {
  const reduceMotion = useReducedMotion();
  const data = React.useMemo(
    () => options.map((option) => ({ name: option.text, value: option.voteCount })),
    [options]
  );
  const hasVotes = totalVotes > 0;
  const sliceCount = options.filter((option) => option.voteCount > 0).length;
  const innerRadius = donut ? "62%" : 0;

  // Decorative: the option rows beside the chart carry the same data as text.
  return (
    <div className={cn("relative aspect-square", className)} aria-hidden>
      <div className="absolute inset-0 [&_.recharts-sector]:outline-none [&_.recharts-surface]:outline-none">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            {/* Neutral ring behind the slices: the empty state, and what the slices grow over. */}
            <Pie
              data={TRACK}
              dataKey="value"
              innerRadius={innerRadius}
              outerRadius="98%"
              fill="var(--muted)"
              stroke="none"
              isAnimationActive={false}
              rootTabIndex={-1}
            />
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              startAngle={90}
              endAngle={-270}
              innerRadius={innerRadius}
              outerRadius="98%"
              stroke={sliceCount > 1 ? "var(--card)" : "none"}
              strokeWidth={2}
              isAnimationActive={!reduceMotion}
              animationBegin={0}
              animationDuration={POLL_ANIMATION_MS}
              animationEasing="ease-out"
              rootTabIndex={-1}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={pollColor(i)} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>

      {donut ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl leading-none font-semibold tabular-nums">{totalVotes}</span>
          <span className="mt-1 text-xs text-muted-foreground">
            {totalVotes === 1 ? "vote" : "votes"}
          </span>
        </div>
      ) : (
        !hasVotes && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="text-sm text-muted-foreground">No votes yet</span>
          </div>
        )
      )}
    </div>
  );
}, sameResults);
