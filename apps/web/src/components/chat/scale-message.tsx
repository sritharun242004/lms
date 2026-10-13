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
import { ScaleBarChart } from "@/components/chat/scale-bar-chart";
import { formatScaleStat, scaleAccent } from "@/components/chat/scale-results";
import { INTERACTIVE_CARD_WIDTH } from "@/components/chat/interactive-card";

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
  // State lags a render behind; the ref makes a second press in the same tick a no-op.
  const submittingRef = React.useRef(false);
  const [feedback, setFeedback] = React.useState<{ type: "success" | "error"; message: string } | null>(null);

  const valueOf = (statementId: string, saved: number | null) => chosen[statementId] ?? saved;
  const dirty = scale.statements.filter((st) => chosen[st.id] !== undefined && chosen[st.id] !== st.myValue);
  const hasSaved = scale.statements.some((st) => st.myValue !== null);
  const showResults = canManage && scale.statements.some((st) => st.stats);

  async function submit() {
    if (dirty.length === 0 || isSubmitting || submittingRef.current) return;
    submittingRef.current = true;
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
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <section className={cn("@container my-3 overflow-hidden rounded-2xl border border-primary/20 bg-card shadow-sm", INTERACTIVE_CARD_WIDTH)}>
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

      <div className="space-y-4 p-4 sm:p-5">
        {/* Participants see only the sliders, so two fit side by side. With
            results each statement is one wide row: chart | statistics | slider. */}
        <div className={cn("grid gap-3", !showResults && "@3xl:grid-cols-2")}>
        {scale.statements.map((statement, index) => {
          const inputId = `scale-${message.id}-${statement.id}`;
          const stats = showResults ? statement.stats : undefined;
          const accent = scaleAccent(index);
          return (
            <div
              key={statement.id}
              className="overflow-hidden rounded-2xl border border-l-4 border-border bg-background/70 p-3 sm:p-4"
              style={{ borderLeftColor: accent }}
              data-testid={`scale-statement-${statement.id}`}
            >
              <label htmlFor={inputId} className="mb-3 flex items-start gap-2.5 text-sm font-semibold">
                <span
                  className="mt-px flex size-6 shrink-0 items-center justify-center rounded-full text-xs tabular-nums"
                  style={{ backgroundColor: `color-mix(in oklab, ${accent} 18%, transparent)` }}
                >
                  {index + 1}
                  <span className="sr-only">.</span>
                </span>
                <span className="min-w-0 pt-0.5 leading-snug [overflow-wrap:anywhere]">{statement.text}</span>
              </label>
              <div
                className={cn(
                  "grid gap-4",
                  stats && "@4xl:grid-cols-[minmax(0,1.7fr)_auto_minmax(15rem,1fr)] @4xl:items-center @4xl:gap-6"
                )}
              >
                <div className={cn("min-w-0", stats && "@4xl:order-3")}>
                  <ScaleSlider
                    id={inputId}
                    label={statement.text}
                    min={statement.min}
                    max={statement.max}
                    leftLabel={statement.leftLabel}
                    rightLabel={statement.rightLabel}
                    value={valueOf(statement.id, statement.myValue)}
                    disabled={isSubmitting || scale.isClosed}
                    accent={accent}
                    onChange={(value) => {
                      setChosen((current) => ({ ...current, [statement.id]: value }));
                      if (feedback) setFeedback(null);
                    }}
                  />
                </div>
                {stats && (
                  <div className="contents" data-testid={`scale-results-${statement.id}`}>
                    <ScaleBarChart
                      min={statement.min}
                      max={statement.max}
                      distribution={stats.distribution}
                      selected={statement.myValue}
                      accent={accent}
                      label={statement.text}
                      className="@4xl:order-1"
                    />
                    <dl
                      className="grid grid-cols-4 gap-2 @4xl:order-2 @4xl:w-44 @4xl:grid-cols-2"
                      data-testid={`scale-stats-${statement.id}`}
                    >
                      {[
                        ["Average", formatScaleStat(stats.average)],
                        ["Total", String(stats.count)],
                        ["Min", formatScaleStat(stats.min)],
                        ["Max", formatScaleStat(stats.max)],
                      ].map(([name, value]) => (
                        <div
                          key={name}
                          className="flex min-w-0 flex-col-reverse rounded-xl px-2 py-1.5 text-center"
                          style={{ backgroundColor: `color-mix(in oklab, ${accent} 9%, transparent)` }}
                        >
                          <dt className="truncate text-[11px] text-muted-foreground">
                            {name}
                            {name === "Total" && <span className="sr-only"> responses</span>}
                          </dt>
                          <dd className="text-base leading-tight font-semibold tabular-nums">{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        </div>

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
