"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { Check } from "lucide-react";
import type { PollData } from "@/lib/api/services/message-service";
import { cn } from "@/lib/utils";
import { POLL_ANIMATION_MS, pollColor } from "@/components/chat/poll-chart";
import { barPercent, pollAxis } from "@/components/chat/poll-bar-scale";

// The last 4 characters of the value column ("100%"/"1,000") fit here; the
// axis header reserves the same width so ticks line up with every bar track.
const VALUE_COLUMN = "w-9";

// Up to this many options the card simply grows with the chat. Beyond it the
// results scroll inside ONE container (graph + answers together), so a very
// long list never turns the chat thread into a wall of bars.
const SCROLL_AFTER_OPTIONS = 12;

/**
 * Multiple-choice BAR results: a bar graph on the left and the full answer
 * list on the right.
 *
 * Both halves are cells of ONE grid, one grid row per option, so a graph row
 * and its answer card always share a height and a baseline no matter how much
 * either one wraps - there is nothing to keep in sync and no second scroller.
 * Below the `@2xl` container width the same cells are re-ordered with CSS
 * `order` so the whole graph comes first and the answer list follows.
 *
 * Only used for `PollChartType.BAR`; Donut and Pie keep `PollChart`.
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
  const axis = React.useMemo(
    () => pollAxis(Math.max(0, ...poll.options.map((option) => option.voteCount))),
    [poll.options]
  );
  const transition = reduceMotion
    ? { duration: 0 }
    : { duration: POLL_ANIMATION_MS / 1000, ease: "easeOut" as const };
  // Only a card with its own scroller keeps the axis pinned; otherwise a sticky
  // header would attach to the chat thread and float over the answer cards.
  const scrolls = poll.options.length > SCROLL_AFTER_OPTIONS;
  const stickyHeader = scrolls ? "sticky top-0 z-10" : "";
  // Result cards sort after every graph row when the layout is stacked.
  const RESULT_ORDER_BASE = 1000;

  return (
    <div
      className={cn(scrolls && "max-h-[min(75vh,56rem)] overflow-y-auto overscroll-contain")}
      data-testid="poll-bar-results"
    >
      <div className="grid grid-cols-1 items-start @2xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] @2xl:gap-x-6">
        {/* Numerical axis. Sticky so it stays visible while a long list scrolls. */}
        <div
          className={cn("order-[-1] bg-card pt-1 pb-2 @2xl:order-none", stickyHeader)}
          aria-hidden
          data-testid="poll-axis"
        >
          <div className="flex items-end gap-2">
            <div className="relative h-5 min-w-0 flex-1">
              {axis.ticks.map((tick) => (
                <span
                  key={tick}
                  className="absolute bottom-0 -translate-x-1/2 text-[11px] leading-none text-muted-foreground tabular-nums first:translate-x-0 last:-translate-x-full"
                  style={{ left: `${(tick / axis.max) * 100}%` }}
                >
                  {tick}
                </span>
              ))}
            </div>
            <span className={cn("shrink-0", VALUE_COLUMN)} />
          </div>
        </div>
        <div
          className={cn("hidden bg-card pt-1 pb-2 @2xl:block @2xl:border-l @2xl:pl-6", stickyHeader)}
          aria-hidden
        >
          <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Answer options
          </span>
        </div>

        {poll.options.map((option, index) => {
          const share = poll.totalVotes === 0 ? 0 : (option.voteCount / poll.totalVotes) * 100;
          const percent = Math.round(share);
          const selected = poll.myVote === option.id;
          const graphOrder = { "--o": index } as React.CSSProperties;
          const resultOrder = { "--o": RESULT_ORDER_BASE + index } as React.CSSProperties;

          return (
            <React.Fragment key={option.id}>
              {/* Graph row: category label, bar on the shared axis, vote count. */}
              <div
                className="order-(--o) min-w-0 py-2 @2xl:order-none"
                style={graphOrder}
                aria-hidden
                data-testid="poll-graph-row"
              >
                <span className="mb-1.5 block text-xs leading-snug font-medium [overflow-wrap:anywhere] text-muted-foreground">
                  {option.text}
                </span>
                <div className="flex items-center gap-2">
                  <div className="relative h-4 min-w-0 flex-1 overflow-hidden rounded-r-md bg-muted/60">
                    {axis.ticks.slice(1, -1).map((tick) => (
                      <span
                        key={tick}
                        className="absolute inset-y-0 w-px bg-border"
                        style={{ left: `${(tick / axis.max) * 100}%` }}
                      />
                    ))}
                    <motion.span
                      className="absolute inset-y-0 left-0 block rounded-r-md"
                      style={{ backgroundColor: pollColor(index) }}
                      initial={reduceMotion ? false : { width: "0%" }}
                      animate={{ width: `${barPercent(option.voteCount, axis.max)}%` }}
                      transition={transition}
                      data-testid="poll-bar"
                    />
                  </div>
                  <span
                    className={cn(
                      "shrink-0 text-right text-xs font-semibold tabular-nums",
                      VALUE_COLUMN
                    )}
                  >
                    {option.voteCount}
                  </span>
                </div>
              </div>

              {/* Answer card: full text (wraps, never truncated), %, votes, progress. */}
              <div
                className="order-(--o) min-w-0 py-2 @2xl:order-none @2xl:border-l @2xl:pl-6"
                style={resultOrder}
              >
                <button
                  type="button"
                  disabled={isVoting}
                  aria-pressed={selected}
                  onClick={() => onVote(option.id)}
                  className={cn(
                    "flex w-full min-w-0 flex-col gap-2.5 rounded-xl border px-4 py-3 text-left transition-colors",
                    selected ? "border-primary bg-primary/5" : "border-border hover:bg-accent",
                    isVoting && "cursor-wait opacity-70"
                  )}
                >
                  <span className="flex items-start justify-between gap-4">
                    <span className="flex min-w-0 flex-1 items-start gap-2.5 text-sm leading-snug font-medium [overflow-wrap:anywhere] @md:text-base">
                      {selected && <Check className="mt-0.5 size-4 shrink-0 text-primary @md:mt-1" />}
                      {option.text}
                    </span>
                    <span className="flex shrink-0 flex-col items-end tabular-nums @md:flex-row @md:items-baseline @md:gap-2">
                      <span className="text-base leading-snug font-semibold">{percent}%</span>
                      <span className="text-xs text-muted-foreground @md:min-w-14 @md:text-right">
                        {option.voteCount} {option.voteCount === 1 ? "vote" : "votes"}
                      </span>
                    </span>
                  </span>
                  <span className="block h-3.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
                    <motion.span
                      className="block h-full rounded-full"
                      style={{ backgroundColor: pollColor(index) }}
                      initial={reduceMotion ? false : { width: "0%" }}
                      animate={{ width: `${share}%` }}
                      transition={transition}
                    />
                  </span>
                </button>
              </div>
            </React.Fragment>
          );
        })}

        {/* Stacked layout only: a rule between the graph and the answer list. */}
        <div className="order-[999] my-2 border-t border-border @2xl:hidden" aria-hidden />
      </div>
    </div>
  );
}
