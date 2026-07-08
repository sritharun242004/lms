"use client";

import * as React from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Loader2, Send, Trash2 } from "lucide-react";
import type { ChatMessage, OpenQuestionData } from "@/lib/api/services/message-service";
import { messageService } from "@/lib/api/services/message-service";
import { getInitials, cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function OpenQuestionMessage({
  message,
  openQuestion,
  groupId,
  isOwn,
  onAnswered,
  onDelete,
}: {
  message: ChatMessage;
  openQuestion: OpenQuestionData;
  groupId: string;
  isOwn: boolean;
  onAnswered: (openQuestion: OpenQuestionData) => void;
  onDelete: (messageId: string) => void;
}) {
  const myAnswer = openQuestion.answers.find((a) => a.id === openQuestion.myAnswerId);
  const [draft, setDraft] = React.useState(myAnswer?.text ?? "");
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function submit() {
    const text = draft.trim();
    if (!text || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await messageService.submitAnswer(groupId, message.id, { text });
      if (!res.success) throw new Error(res.error?.message || "Failed to submit answer");
      onAnswered(res.data!.openQuestion);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to submit answer");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-4 my-2 flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:mx-auto sm:max-w-2xl">
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
            aria-label="Delete question"
            onClick={() => onDelete(message.id)}
          >
            <Trash2 className="size-3" />
          </Button>
        )}
      </div>

      <p className="font-medium">{openQuestion.question}</p>

      <div className="flex items-center gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={myAnswer ? "Change your answer…" : "Type your answer…"}
          maxLength={280}
          disabled={isSubmitting}
        />
        <Button
          size="icon"
          className="shrink-0"
          onClick={submit}
          disabled={!draft.trim() || isSubmitting}
        >
          {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </Button>
      </div>

      {openQuestion.answers.length > 0 && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {openQuestion.answers.map((answer) => (
            <div
              key={answer.id}
              className={cn(
                "rounded-lg border px-3 py-2 text-sm break-words",
                answer.id === openQuestion.myAnswerId
                  ? "border-primary/40 bg-primary/5"
                  : "border-border bg-muted/50"
              )}
            >
              {answer.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
