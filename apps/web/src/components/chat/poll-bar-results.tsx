"use client";

import * as React from "react";
import { Check } from "lucide-react";
import type { PollData } from "@/lib/api/services/message-service";
import { cn } from "@/lib/utils";
import { pollColor } from "@/components/chat/poll-chart";
import { PollBarChart, useElementWidth, usesNumberKeys } from "@/components/chat/poll-bar-chart";

/**
 * Multiple-choice BAR results: a column chart on the left, the full answer
 * list on the right. Used only for `PollChartType.BAR`; Donut and Pie keep
 * `PollChart`.
 *
 * Layout
 * - Phones / narrow panes: the chart stacks above the answers and the card
 *   simply grows with the chat thread (no nested scroller to get trapped in).
 * - From the `@2xl` container width: two columns (about 48% / 52%) with a
 *   divider. The results region is capped to what fits beside the thread
 *   header and composer, scrolls as ONE container (chart + answers together),
 *   and keeps the chart pinned while a long answer list scrolls.
 *
 * The answer rows are deliberately static: colours, percentages, votes and the
 * progress fill change instantly with the data, without any transition. Only
 * the chart animates.
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
  const [graphRef, graphWidth] = useElementWidth<HTMLDivElement>(480);
  const numbered = usesNumberKeys(poll.options.length, graphWidth);
  const topVotes = Math.max(0, ...poll.options.map((option) => option.voteCount));

  return (
    <div
      className={cn(
        // Room left for the thread header, composer and the card's own chrome.
        "@2xl:max-h-[max(20rem,calc(100dvh-21rem))] @2xl:overflow-y-auto @2xl:overscroll-contain"
      )}
      data-testid="poll-bar-results"
    >
      <div className="grid grid-cols-1 items-start gap-4 @2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] @2xl:gap-x-5">
        {/* Left: graph. Pinned while a long answer list scrolls beside it. */}
        <div
          ref={graphRef}
          className="min-w-0 @2xl:sticky @2xl:top-0"
          data-testid="poll-bar-graph"
        >
          <PollBarChart options={poll.options} keysOnly={numbered} className="w-full min-w-0" />
        </div>

        {/* Right: every answer, with its colour, percentage, votes and progress. */}
        <div
          className="flex min-w-0 flex-col gap-2 @2xl:border-l @2xl:border-border @2xl:pl-5"
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
                  "flex w-full min-w-0 flex-col gap-2 rounded-xl border px-3.5 py-2.5 text-left",
                  selected
                    ? "border-primary bg-primary/5"
                    : leading
                      ? "border-primary/30 bg-primary/[0.03] hover:bg-accent"
                      : "border-border hover:bg-accent",
                  isVoting && "cursor-wait opacity-70"
                )}
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="flex min-w-0 flex-1 items-start gap-2.5">
                    <span
                      className={cn(
                        "flex shrink-0 items-center justify-center rounded-full text-[11px] leading-none font-semibold text-white",
                        numbered ? "mt-px size-6" : "mt-1.5 size-3.5"
                      )}
                      style={{ backgroundColor: pollColor(index) }}
                      data-testid="poll-answer-marker"
                      aria-hidden
                    >
                      {numbered ? index + 1 : null}
                    </span>
                    <span className="min-w-0 text-sm leading-snug font-medium [overflow-wrap:anywhere] @md:text-[0.95rem]">
                      {selected && (
                        <Check className="mr-1.5 inline size-4 align-text-bottom text-primary" />
                      )}
                      {option.text}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-baseline gap-1.5 tabular-nums">
                    <span className="text-base leading-tight font-semibold">{percent}%</span>
                    <span className="text-xs text-muted-foreground">
                      {option.voteCount} {option.voteCount === 1 ? "vote" : "votes"}
                    </span>
                  </span>
                </span>
                <span className="block h-2 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
                  <span
                    className="block h-full rounded-full"
                    style={{ backgroundColor: pollColor(index), width: `${share}%` }}
                    data-testid="poll-answer-fill"
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
