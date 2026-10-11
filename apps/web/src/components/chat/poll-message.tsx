"use client";

import * as React from "react";
import { format } from "date-fns";
import { motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import { Check, Trash2 } from "lucide-react";
import type { ChatMessage, PollData } from "@/lib/api/services/message-service";
import { messageService } from "@/lib/api/services/message-service";
import { getInitials, cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { PollChart, POLL_ANIMATION_MS, pollColor } from "@/components/chat/poll-chart";
import { PollBarResults } from "@/components/chat/poll-bar-results";

export function PollMessage({
  message,
  poll,
  groupId,
  isOwn,
  onVoted,
  onDelete,
}: {
  message: ChatMessage;
  poll: PollData;
  groupId: string;
  isOwn: boolean;
  onVoted: (poll: PollData) => void;
  onDelete: (messageId: string) => void;
}) {
  const [isVoting, setIsVoting] = React.useState(false);
  const reduceMotion = useReducedMotion();

  async function vote(optionId: string) {
    if (isVoting || poll.myVote === optionId) return;
    setIsVoting(true);
    try {
      const res = await messageService.votePoll(groupId, message.id, { optionId });
      if (!res.success) throw new Error(res.error?.message || "Failed to vote");
      onVoted(res.data!.poll);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to vote");
    } finally {
      setIsVoting(false);
    }
  }

  const isBar = poll.chartType === "BAR";

  const optionRows = (
    <div className="flex w-full min-w-0 flex-1 flex-col gap-2.5">
      {poll.options.map((option, index) => {
        const share = poll.totalVotes === 0 ? 0 : (option.voteCount / poll.totalVotes) * 100;
        const percent = Math.round(share);
        const selected = poll.myVote === option.id;

        return (
          <button
            key={option.id}
            type="button"
            disabled={isVoting}
            aria-pressed={selected}
            onClick={() => vote(option.id)}
            className={cn(
              "flex w-full flex-col gap-2.5 rounded-xl border px-4 py-3 text-left transition-colors",
              selected ? "border-primary bg-primary/5" : "border-border hover:bg-accent",
              isVoting && "cursor-wait opacity-70"
            )}
          >
            <span className="flex items-start justify-between gap-4">
              <span className="flex min-w-0 items-start gap-2.5 text-sm leading-snug font-medium [overflow-wrap:anywhere] @md:text-base">
                {!isBar && (
                  <span
                    className="mt-1 size-3 shrink-0 rounded-[4px] @md:mt-1.5"
                    style={{ backgroundColor: pollColor(index) }}
                    aria-hidden
                  />
                )}
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
            {isBar && (
              <span className="block h-3.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
                <motion.span
                  className="block h-full rounded-full"
                  style={{ backgroundColor: pollColor(index) }}
                  initial={reduceMotion ? false : { width: "0%" }}
                  animate={{ width: `${share}%` }}
                  transition={
                    reduceMotion
                      ? { duration: 0 }
                      : { duration: POLL_ANIMATION_MS / 1000, ease: "easeOut" }
                  }
                />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="@container mx-4 my-2 flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:mx-auto sm:max-w-4xl sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Avatar className="size-6">
            <AvatarFallback className="text-[10px]">
              {getInitials(message.sender.name)}
            </AvatarFallback>
          </Avatar>
          <span className="text-xs font-medium text-muted-foreground">
            {message.sender.name} · {format(new Date(message.createdAt), "h:mm a")}
          </span>
        </div>
        {isOwn && (
          <Button
            size="icon"
            className="size-6"
            variant="ghost"
            aria-label="Delete poll"
            onClick={() => onDelete(message.id)}
          >
            <Trash2 className="size-3" />
          </Button>
        )}
      </div>

      <p className="text-base leading-snug font-semibold [overflow-wrap:anywhere] sm:text-lg">
        {poll.question}
      </p>

      {isBar ? (
        <PollBarResults poll={poll} isVoting={isVoting} onVote={vote} />
      ) : (
        <div className="flex flex-col items-center gap-6 @2xl:flex-row @2xl:gap-8">
          <PollChart
            options={poll.options}
            totalVotes={poll.totalVotes}
            donut={poll.chartType === "DONUT"}
            className="w-full max-w-64 shrink-0 @md:max-w-72 @2xl:w-72 @3xl:w-80 @3xl:max-w-80"
          />
          {optionRows}
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        {poll.totalVotes} {poll.totalVotes === 1 ? "vote" : "votes"}
      </p>
    </div>
  );
}
