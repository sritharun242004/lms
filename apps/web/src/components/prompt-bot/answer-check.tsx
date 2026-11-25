"use client";
import * as React from "react";
import { Check, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MatrixAnswers } from "./use-matrix-answers";

/** Errors a retry can't fix: the server's message says what to do instead. */
const NO_RETRY = new Set(["LIMIT_REACHED", "AI_NOT_CONFIGURED"]);

type Phase = "hidden" | "checking" | "ready" | "empty" | "checked";

function phaseOf(state: MatrixAnswers, questionId: string): Phase {
  const a = state.answerFor(questionId);
  if (!state.canCheck || a.notRelevant) return "hidden";
  if (state.checking) return "checking";
  if (!a.answer.trim()) return "empty";
  return state.isChanged(questionId) || state.contextStale ? "ready" : "checked";
}

/** Keydown handler for the answer box: Cmd/Ctrl+Enter checks the answer; focus stays in the box. */
export function checkOnShortcut(state: MatrixAnswers, questionId: string) {
  return (event: React.KeyboardEvent) => {
    if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return;
    event.preventDefault();
    if (phaseOf(state, questionId) === "ready") void state.check();
  };
}

const subscribeNothing = () => () => {};
/** "⌘" on Apple keyboards, "Ctrl" elsewhere; "Ctrl" during server render and hydration. */
function useModKey() {
  return React.useSyncExternalStore(
    subscribeNothing,
    () => (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl"),
    () => "Ctrl",
  );
}

type Props = { state: MatrixAnswers; questionId: string; question: string };

/**
 * The row under an answer box: the last check's score and note, and the "Check answer" button.
 * Answers save on their own; scoring happens only here (or with Cmd/Ctrl+Enter in the box).
 * Mount it keyed by question so switching questions doesn't announce the other question's note.
 */
export function AnswerCheck({ state, questionId, question }: Props) {
  const mod = useModKey();
  const a = state.answerFor(questionId);
  const phase = phaseOf(state, questionId);
  const changed = state.isChanged(questionId) || state.contextStale;
  const error = state.checkError;
  const label = phase === "checking" ? "Checking…" : phase === "checked" ? "Checked" : "Check answer";

  const note =
    !a.notRelevant && a.reason ? (
      <p key={`${a.score}:${a.reason}`} className={cn("animate-fade-in text-xs leading-snug text-pretty", changed ? "text-muted-foreground" : "text-foreground/80")}>
        {changed && <span className="font-medium">Last check · </span>}
        <span className="font-semibold tabular-nums">{a.score}/3</span> — {a.reason}
      </p>
    ) : null;

  const announcement = phase === "checking" ? "Checking your answers…" : error ? `Couldn't check. ${error.message}` : !changed && a.reason ? `${a.score} of 3. ${a.reason}` : "";

  return (
    <div className="mt-2.5 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="min-w-0 flex-1 basis-56 pt-1">
        {error && phase !== "checking" ? (
          <p className="text-xs leading-snug text-destructive">
            Couldn&apos;t check: {error.message}
            {!NO_RETRY.has(error.code) && (
              <button
                type="button"
                onClick={() => void state.check()}
                aria-label="Retry check"
                className="ml-1.5 rounded font-semibold underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40"
              >
                Retry
              </button>
            )}
          </p>
        ) : (
          note
        )}
        <span role="status" aria-live="polite" className="sr-only">
          {announcement}
        </span>
      </div>
      {phase !== "hidden" && (
        <div className="flex shrink-0 items-center gap-2">
          {phase === "ready" && (
            <kbd aria-hidden className="hidden rounded-md border border-border/80 bg-white/50 px-1.5 py-0.5 font-sans text-[11px] text-muted-foreground sm:inline-block dark:bg-white/5">
              {mod} Enter
            </kbd>
          )}
          <Button
            type="button"
            size="sm"
            variant={phase === "ready" ? "default" : "outline"}
            disabled={phase !== "ready"}
            aria-label={`${label}: ${question}`}
            aria-keyshortcuts="Meta+Enter Control+Enter"
            onClick={() => void state.check()}
            className={cn("min-w-32 hover:translate-y-0", phase === "checked" && "text-emerald-700 disabled:opacity-100 dark:text-emerald-400")}
          >
            {phase === "checking" ? (
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
            ) : phase === "checked" ? (
              <Check className="size-4" aria-hidden />
            ) : (
              <Sparkles className="size-4" aria-hidden />
            )}
            {label}
          </Button>
        </div>
      )}
    </div>
  );
}
