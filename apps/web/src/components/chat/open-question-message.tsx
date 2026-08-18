"use client";

import * as React from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, Loader2, MessageSquareText, Trash2 } from "lucide-react";
import type { ChatMessage, OpenQuestionData } from "@/lib/api/services/message-service";
import { messageService } from "@/lib/api/services/message-service";
import { getInitials, cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const MAX_ANSWER_LENGTH = 280;
const RESPONSE_TONES = [
  { name: "primary", className: "border-primary/25 bg-primary/5" },
  { name: "accent", className: "border-accent-foreground/15 bg-accent/70" },
  { name: "chart-2", className: "border-chart-2/25 bg-chart-2/10" },
  { name: "chart-4", className: "border-chart-4/25 bg-chart-4/10" },
] as const;

export function OpenQuestionMessage({
  message,
  openQuestion,
  groupId,
  isOwn,
  canManage,
  onAnswered,
  onDelete,
}: {
  message: ChatMessage;
  openQuestion: OpenQuestionData;
  groupId: string;
  isOwn: boolean;
  canManage: boolean;
  onAnswered: (openQuestion: OpenQuestionData) => void;
  onDelete: (messageId: string) => void;
}) {
  const myAnswer = openQuestion.answers.find((a) => a.id === openQuestion.myAnswerId);
  const [draft, setDraft] = React.useState(myAnswer?.text ?? "");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [feedback, setFeedback] = React.useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const inputId = `open-question-answer-${message.id}`;
  const counterId = `${inputId}-counter`;
  const feedbackId = `${inputId}-feedback`;
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (feedback?.type === "error") textareaRef.current?.focus();
  }, [feedback]);

  async function submit() {
    const text = draft.trim();
    if (!text || isSubmitting) return;
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const res = await messageService.submitAnswer(groupId, message.id, { text });
      if (!res.success) throw new Error(res.error?.message || "Failed to submit answer");
      onAnswered(res.data!.openQuestion);
      setFeedback({
        type: "success",
        message: myAnswer ? "Your response was updated." : "Your response was submitted.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to submit answer";
      setFeedback({ type: "error", message });
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="mx-4 my-3 overflow-hidden rounded-2xl border border-primary/20 bg-card shadow-sm sm:mx-auto sm:max-w-4xl">
      <header className="bg-primary px-4 py-4 text-primary-foreground sm:px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-primary-foreground/80">
              <MessageSquareText className="size-4" aria-hidden="true" />
              <span>Open-ended question</span>
              <span aria-hidden="true">·</span>
              <span>{openQuestion.answers.length} {openQuestion.answers.length === 1 ? "response" : "responses"}</span>
            </div>
            <h3 className="text-base font-semibold leading-snug sm:text-lg">
              {openQuestion.question}
            </h3>
            <p className="mt-1 text-sm text-primary-foreground/80">
              Share one thoughtful response. You can update it later.
            </p>
          </div>
          {isOwn && (
            <Button
              size="icon"
              className="size-8 shrink-0 text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
              variant="ghost"
              aria-label="Delete question"
              onClick={() => onDelete(message.id)}
            >
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs text-primary-foreground/75">
          <Avatar className="size-6 border border-primary-foreground/25">
            {message.sender.avatarUrl && (
              <AvatarImage src={message.sender.avatarUrl} alt="" />
            )}
            <AvatarFallback className="bg-primary-foreground/15 text-[10px] text-primary-foreground">
              {getInitials(message.sender.name)}
            </AvatarFallback>
          </Avatar>
          <span>{message.sender.name} · {format(new Date(message.createdAt), "h:mm a")}</span>
        </div>
      </header>

      <div className="space-y-5 p-4 sm:p-5">
        <div className="rounded-2xl border border-border bg-background/70 p-3 sm:p-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <label htmlFor={inputId} className="text-sm font-semibold">
              Your response
            </label>
            <span id={counterId} className="text-xs tabular-nums text-muted-foreground">
              {draft.length} / {MAX_ANSWER_LENGTH}
            </span>
          </div>
          <Textarea
            ref={textareaRef}
            id={inputId}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              if (feedback) setFeedback(null);
            }}
            placeholder={myAnswer ? "Update your response…" : "Type your response…"}
            maxLength={MAX_ANSWER_LENGTH}
            rows={3}
            disabled={isSubmitting}
            aria-invalid={feedback?.type === "error"}
            aria-describedby={`${counterId}${feedback ? ` ${feedbackId}` : ""}`}
            className="min-h-24 resize-y bg-card"
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="min-h-5 flex-1">
              {feedback && (
                <p
                  id={feedbackId}
                  role={feedback.type === "error" ? "alert" : "status"}
                  aria-live={feedback.type === "error" ? "assertive" : "polite"}
                  className={cn(
                    "flex items-center gap-1.5 text-xs font-medium",
                    feedback.type === "success" ? "text-success" : "text-destructive"
                  )}
                >
                  {feedback.type === "success" ? (
                    <CheckCircle2 className="size-3.5" aria-hidden="true" />
                  ) : (
                    <AlertCircle className="size-3.5" aria-hidden="true" />
                  )}
                  {feedback.message}
                </p>
              )}
            </div>
            <Button
              onClick={submit}
              disabled={!draft.trim() || isSubmitting}
              className="min-w-36"
            >
              {isSubmitting && <Loader2 className="size-4 animate-spin" />}
              {isSubmitting
                ? myAnswer
                  ? "Updating…"
                  : "Submitting…"
                : myAnswer
                  ? "Update response"
                  : "Submit response"}
            </Button>
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold">Response wall</h4>
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {openQuestion.answers.length} {openQuestion.answers.length === 1 ? "response" : "responses"}
            </span>
          </div>

          {openQuestion.answers.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-4 py-7 text-center text-sm text-muted-foreground">
              No responses yet. Be the first to share.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {openQuestion.answers.map((answer, index) => {
                const isMyAnswer = answer.id === openQuestion.myAnswerId;
                const tone = RESPONSE_TONES[index % RESPONSE_TONES.length];
                const participantName = canManage ? answer.participant?.name : undefined;
                const label = isMyAnswer
                  ? "Your response"
                  : participantName ?? "Anonymous participant";

                return (
                  <article
                    key={answer.id}
                    data-response-tone={tone.name}
                    className={cn(
                      "rounded-xl border p-3 text-sm break-words",
                      tone.className,
                      isMyAnswer && "ring-2 ring-primary/30"
                    )}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        {canManage && answer.participant ? (
                          <Avatar className="size-6">
                            {answer.participant.avatarUrl && (
                              <AvatarImage src={answer.participant.avatarUrl} alt="" />
                            )}
                            <AvatarFallback className="text-[10px]">
                              {getInitials(answer.participant.name)}
                            </AvatarFallback>
                          </Avatar>
                        ) : (
                          <span className="size-2 shrink-0 rounded-full bg-current opacity-35" aria-hidden="true" />
                        )}
                        <span className="truncate text-xs font-semibold">
                          {label}
                          {isMyAnswer && participantName ? ` · ${participantName}` : ""}
                        </span>
                      </div>
                      <time
                        dateTime={answer.createdAt}
                        className="shrink-0 text-[11px] text-muted-foreground"
                      >
                        {format(new Date(answer.createdAt), "h:mm a")}
                      </time>
                    </div>
                    <p className="whitespace-pre-wrap leading-relaxed">{answer.text}</p>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
