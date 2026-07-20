"use client";

import * as React from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Check, Trash2 } from "lucide-react";
import type { ChatMessage, PollData } from "@/lib/api/services/message-service";
import { messageService } from "@/lib/api/services/message-service";
import { getInitials, cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { PollChart } from "@/components/chat/poll-chart";

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

  return (
    <div className="mx-4 my-2 flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 shadow-sm sm:mx-auto sm:max-w-4xl">
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

      <p className="font-medium">{poll.question}</p>

      <div className="flex flex-col gap-4 sm:grid sm:grid-cols-5 sm:items-center sm:gap-4">
        <div className="sm:col-span-2">
          <PollChart poll={poll} />
        </div>

        <div className="flex flex-col gap-2 sm:col-span-3">
          {poll.options.map((option) => {
            const percent =
              poll.totalVotes === 0 ? 0 : Math.round((option.voteCount / poll.totalVotes) * 100);
            const selected = poll.myVote === option.id;

            return (
              <button
                key={option.id}
                type="button"
                disabled={isVoting}
                onClick={() => vote(option.id)}
                className={cn(
                  "relative flex items-center justify-between overflow-hidden rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                  selected ? "border-primary" : "border-border hover:bg-accent",
                  isVoting && "cursor-wait opacity-70"
                )}
              >
                <span
                  className="absolute inset-y-0 left-0 bg-primary/10 transition-all duration-500 ease-out"
                  style={{ width: `${percent}%` }}
                  aria-hidden
                />
                <span className="relative flex items-center gap-1.5 font-medium">
                  {selected && <Check className="size-3.5 text-primary" />}
                  {option.text}
                </span>
                <span className="relative shrink-0 text-xs text-muted-foreground tabular-nums">
                  {percent}% ({option.voteCount})
                </span>
              </button>
            );
          })}
          <p className="text-xs text-muted-foreground">
            {poll.totalVotes} {poll.totalVotes === 1 ? "vote" : "votes"}
          </p>
        </div>
      </div>
    </div>
  );
}
