"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { Check } from "lucide-react";
import type { PollData } from "@/lib/api/services/message-service";
import { cn } from "@/lib/utils";
import { POLL_ANIMATION_MS, pollColor } from "@/components/chat/poll-chart";
import { PollBarChart, useElementWidth, usesNumberKeys } from "@/components/chat/poll-bar-chart";

// Up to this many options the card simply grows with the chat. Beyond it, the
// chart and the answers scroll together inside ONE container so a long list
// never turns the thread into a wall of cards.
const SCROLL_AFTER_OPTIONS = 12;

/**
 * Multiple-choice BAR results: a column chart on the left, the full answer
 * list on the right. Used only for `PollChartType.BAR`; Donut and Pie keep
 * `PollChart`.
 *
 * The graph and the answers are independent sections (so a tall list never
 * stretches the chart), tied together by colour and - above FULL_LABEL_LIMIT
 * options - by the same numbers on the bars and the answer circles.
 */
export function PollBarResults({
  poll,
  isVoting,
  onVote,
}: {
  poll: PollData;
  isVoting: boolean;
  onVote: (optionId: string) => void;
}) {
  const reduceMotion = useReducedMotion();
  const transition = reduceMotion
    ? { duration: 0 }
    : { duration: POLL_ANIMATION_MS / 1000, ease: "easeOut" as const };
  const [graphRef, graphWidth] = useElementWidth<HTMLDivElement>(480);
  const numbered = usesNumberKeys(poll.options.length, graphWidth);
  const scrolls = poll.options.length > SCROLL_AFTER_OPTIONS;
  const topVotes = Math.max(0, ...poll.options.map((option) => option.voteCount));

  return (
    <div
      className={cn(scrolls && "max-h-[min(75vh,56rem)] overflow-y-auto overscroll-contain")}
      data-testid="poll-bar-results"
    >
      <div
        className={cn(
          "grid grid-cols-1 gap-6 @2xl:grid-cols-2",
          scrolls ? "items-start" : "@2xl:items-stretch"
        )}
      >
        {/* Left: graph. It fills the column beside the answers, or stays in
            view while a long answer list scrolls. */}
        <div
          ref={graphRef}
          className={cn("min-w-0", scrolls ? "@2xl:sticky @2xl:top-0" : "flex flex-col")}
          data-testid="poll-bar-graph"
        >
          <PollBarChart
            options={poll.options}
            keysOnly={numbered}
            className="w-full min-w-0 max-h-[30rem] flex-1"
          />
        </div>

        {/* Right: every answer, with its colour, percentage, votes and progress. */}
        <div
          className="flex min-w-0 flex-col gap-3 @2xl:border-l @2xl:border-border @2xl:pl-6"
          data-testid="poll-answer-list"
        >
          {poll.options.map((option, index) => {
            const share = poll.totalVotes === 0 ? 0 : (option.voteCount / poll.totalVotes) * 100;
            const percent = Math.round(share);
            const selected = poll.myVote === option.id;
            const leading = topVotes > 0 && option.voteCount === topVotes;

            return (
              <button
                key={option.id}
                type="button"
                disabled={isVoting}
                aria-pressed={selected}
                onClick={() => onVote(option.id)}
                data-leading={leading ? "true" : undefined}
                className={cn(
                  "flex w-full min-w-0 flex-col gap-3 rounded-2xl border px-4 py-3.5 text-left transition-colors",
                  selected
                    ? "border-primary bg-primary/5"
                    : leading
                      ? "border-primary/30 bg-primary/[0.03] hover:bg-accent"
                      : "border-border hover:bg-accent",
                  isVoting && "cursor-wait opacity-70"
                )}
              >
                <span className="flex items-start justify-between gap-4">
                  <span className="flex min-w-0 flex-1 items-start gap-3">
                    <span
                      className={cn(
                        "mt-0.5 flex shrink-0 items-center justify-center rounded-full text-[11px] leading-none font-semibold text-white",
                        numbered ? "size-6" : "size-3.5 mt-1.5"
                      )}
                      style={{ backgroundColor: pollColor(index) }}
                      data-testid="poll-answer-marker"
                      aria-hidden
                    >
                      {numbered ? index + 1 : null}
                    </span>
                    <span className="min-w-0 text-sm leading-snug font-medium [overflow-wrap:anywhere] @md:text-base">
                      {selected && (
                        <Check className="mr-1.5 inline size-4 align-text-bottom text-primary" />
                      )}
                      {option.text}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end tabular-nums">
                    <span className="text-lg leading-tight font-semibold">{percent}%</span>
                    <span className="text-xs text-muted-foreground">
                      {option.voteCount} {option.voteCount === 1 ? "vote" : "votes"}
                    </span>
                  </span>
                </span>
                <span className="block h-2.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
                  <motion.span
                    className="block h-full rounded-full"
                    style={{ backgroundColor: pollColor(index) }}
                    initial={reduceMotion ? false : { width: "0%" }}
                    animate={{ width: `${share}%` }}
                    transition={transition}
                  />
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
