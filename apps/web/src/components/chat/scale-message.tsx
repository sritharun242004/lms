"use client";

import * as React from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, Loader2, SlidersHorizontal, Trash2 } from "lucide-react";
import type { ChatMessage, ScaleData } from "@/lib/api/services/message-service";
import { messageService } from "@/lib/api/services/message-service";
import { getInitials, cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ScaleSlider } from "@/components/chat/scale-slider";

export function ScaleMessage({
  message,
  scale,
  groupId,
  isOwn,
  canManage,
  onResponded,
  onDelete,
}: {
  message: ChatMessage;
  scale: ScaleData;
  groupId: string;
  isOwn: boolean;
  canManage: boolean;
  onResponded: (scale: ScaleData) => void;
  onDelete: (messageId: string) => void;
}) {
  // Values chosen this visit; anything absent falls back to the saved value,
  // and null means "not answered" (never a silent 0).
  const [chosen, setChosen] = React.useState<Record<string, number>>({});
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [feedback, setFeedback] = React.useState<{ type: "success" | "error"; message: string } | null>(null);

  const valueOf = (statementId: string, saved: number | null) => chosen[statementId] ?? saved;
  const dirty = scale.statements.filter((st) => chosen[st.id] !== undefined && chosen[st.id] !== st.myValue);
  const hasSaved = scale.statements.some((st) => st.myValue !== null);

  async function submit() {
    if (dirty.length === 0 || isSubmitting) return;
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const res = await messageService.submitScale(groupId, message.id, {
        responses: dirty.map((st) => ({ statementId: st.id, value: chosen[st.id] })),
      });
      if (!res.success) throw new Error(res.error?.message || "Failed to submit scale");
      onResponded(res.data!.scale);
      setChosen({});
      setFeedback({ type: "success", message: hasSaved ? "Your response was updated." : "Your response was submitted." });
    } catch (error) {
      const text = error instanceof Error ? error.message : "Failed to submit scale";
      setFeedback({ type: "error", message: text });
      toast.error(text);
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
              <SlidersHorizontal className="size-4" aria-hidden="true" />
              <span>Scale</span>
              <span aria-hidden="true">·</span>
              <span>
                {scale.statements.length} {scale.statements.length === 1 ? "statement" : "statements"}
              </span>
            </div>
            <h3 className="text-base font-semibold leading-snug sm:text-lg">
              How much do you agree with {scale.statements.length === 1 ? "this statement" : "these statements"}?
            </h3>
          </div>
          {isOwn && (
            <Button
              size="icon"
              className="size-8 shrink-0 text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
              variant="ghost"
              aria-label="Delete scale"
              onClick={() => onDelete(message.id)}
            >
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs text-primary-foreground/75">
          <Avatar className="size-6 border border-primary-foreground/25">
            {message.sender.avatarUrl && <AvatarImage src={message.sender.avatarUrl} alt="" />}
            <AvatarFallback className="bg-primary-foreground/15 text-[10px] text-primary-foreground">
              {getInitials(message.sender.name)}
            </AvatarFallback>
          </Avatar>
          <span>
            {message.sender.name} · {format(new Date(message.createdAt), "h:mm a")}
          </span>
        </div>
      </header>

      <div className="space-y-5 p-4 sm:p-5">
        {scale.statements.map((statement, index) => {
          const inputId = `scale-${message.id}-${statement.id}`;
          const stats = statement.stats;
          return (
            <div key={statement.id} className="rounded-2xl border border-border bg-background/70 p-3 sm:p-4">
              <label htmlFor={inputId} className="mb-3 block text-sm font-semibold">
                {index + 1}. {statement.text}
              </label>
              <ScaleSlider
                id={inputId}
                label={statement.text}
                min={statement.min}
                max={statement.max}
                leftLabel={statement.leftLabel}
                rightLabel={statement.rightLabel}
                value={valueOf(statement.id, statement.myValue)}
                disabled={isSubmitting || scale.isClosed}
                onChange={(value) => {
                  setChosen((current) => ({ ...current, [statement.id]: value }));
                  if (feedback) setFeedback(null);
                }}
              />
              {canManage && stats && (
                <div className="mt-4 border-t border-border/60 pt-3" data-testid={`scale-results-${statement.id}`}>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    {stats.count} {stats.count === 1 ? "response" : "responses"}
                    {stats.average !== null && ` · Average ${stats.average} · Min ${stats.min} · Max ${stats.max}`}
                  </p>
                  <div className="flex h-16 items-end gap-1" role="img" aria-label="Response distribution">
                    {stats.distribution.map((count, i) => {
                      const peak = Math.max(1, ...stats.distribution);
                      return (
                        <div key={i} className="flex flex-1 flex-col items-center justify-end gap-1">
                          <span className="text-[10px] tabular-nums text-muted-foreground">{count}</span>
                          <div
                            className="w-full rounded-t bg-primary/70"
                            style={{ height: `${Math.max(count > 0 ? 8 : 2, (count / peak) * 40)}px` }}
                          />
                          <span className="text-[10px] tabular-nums">{statement.min + i}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-h-5 flex-1">
            {feedback && (
              <p
                role={feedback.type === "error" ? "alert" : "status"}
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
            {canManage && scale.totalParticipants !== undefined && (
              <p className="text-xs text-muted-foreground">
                {scale.totalParticipants} {scale.totalParticipants === 1 ? "participant has" : "participants have"} responded
              </p>
            )}
          </div>
          <Button onClick={submit} disabled={dirty.length === 0 || isSubmitting || scale.isClosed} className="min-w-36">
            {isSubmitting && <Loader2 className="size-4 animate-spin" />}
            {isSubmitting ? "Submitting…" : hasSaved ? "Update response" : "Submit response"}
          </Button>
        </div>
      </div>
    </section>
  );
}
