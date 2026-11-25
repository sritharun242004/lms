"use client";
import * as React from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { readiness } from "@/lib/prompt-bot/scoring";
import { QuestionRow } from "./question-row";
import { ReadinessMeter } from "./readiness-meter";
import type { MatrixAnswers } from "./use-matrix-answers";

export type MatrixGroup = {
  id: string;
  title: string;
  /** In display order. */
  questions: { id: string; text: string }[];
  /** Lead-in shown before the group's last question, as the deck writes "Finally: …". Needs two or more questions. */
  closingLead?: string;
};

type Props = {
  heading: string;
  /** A quiet line under the heading (e.g. what the questions are for). */
  subheading?: string | null;
  headingLevel?: "h1" | "h2";
  groups: MatrixGroup[];
  state: MatrixAnswers;
  activeId: string | null;
  onSelect(id: string): void;
  children?: React.ReactNode;
};

function statusLine(state: MatrixAnswers): {
  text: string;
  tone: "muted" | "error";
} {
  if (state.checking) return { text: "Checking your answers…", tone: "muted" };
  if (state.checkError)
    return {
      text: `Couldn't check: ${state.checkError.message}`,
      tone: "error",
    };
  if (state.contextStale)
    return {
      text: "Bars may be out of date. Check all to update them.",
      tone: "muted",
    };
  const n = state.pendingCount;
  if (n > 0)
    return {
      text: `${n} ${n === 1 ? "answer" : "answers"} changed since the last check.`,
      tone: "muted",
    };
  return { text: "", tone: "muted" };
}

/**
 * The left column of a matrix workspace: heading, overall progress and "Check all", then numbered
 * question rows with 3-slice bars. On large screens the panel stays pinned below the site header and
 * only its question list scrolls, so the header and Check all stay in view; stacked on phones.
 */
export function MatrixPanel({ heading, subheading, headingLevel = "h1", groups, state, activeId, onSelect, children }: Props) {
  const { answerFor } = state;
  const headingId = React.useId();
  const listRef = React.useRef<HTMLDivElement>(null);
  const mounted = React.useRef(false);
  // Keep the selected row visible inside the panel's own scroll; the first render leaves the page alone.
  React.useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    listRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView?.({ block: "nearest" });
  }, [activeId]);
  const status = statusLine(state);
  const canCheckAll = !state.checking && (state.pendingCount > 0 || state.contextStale);
  const Heading = headingLevel;
  const GroupHeading = headingLevel === "h1" ? "h2" : "h3";
  const ready = readiness(groups.flatMap((g) => g.questions.map((q) => answerFor(q.id))));
  const offsets = groups.map((_, i) => groups.slice(0, i).reduce((sum, g) => sum + g.questions.length, 0));

  return (
    <aside
      className="glass h-fit self-start rounded-[1.75rem] p-4 sm:p-5 lg:sticky lg:top-24 lg:flex lg:max-h-[calc(100dvh-7rem)] lg:flex-col"
      aria-labelledby={headingId}
      aria-describedby={subheading ? `${headingId}-sub` : undefined}
    >
      <div className="shrink-0">
        <ReadinessMeter {...ready}>
          <div className="min-w-0">
            <Heading id={headingId} className="text-lg font-semibold">
              {heading}
            </Heading>
            {subheading && (
              <p id={`${headingId}-sub`} className="mt-0.5 text-sm text-pretty text-muted-foreground">
                {subheading}
              </p>
            )}
          </div>
        </ReadinessMeter>
        <div className="mt-2 flex min-h-8 items-center justify-between gap-3">
          <p className={status.tone === "error" ? "text-xs leading-snug text-destructive" : "text-xs leading-snug text-muted-foreground"}>{status.text}</p>
          {state.canCheck && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!canCheckAll}
              onClick={() => void state.check()}
              className="shrink-0 hover:translate-y-0"
            >
              {state.checking ? (
                <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
              ) : (
                <RefreshCw className="size-3.5" aria-hidden />
              )}
              {state.checking ? "Checking…" : "Check all"}
              {!state.checking && state.pendingCount > 0 && (
                <span className="rounded-full bg-primary/10 px-1.5 text-xs tabular-nums text-primary">
                  {state.pendingCount}
                  <span className="sr-only"> changed</span>
                </span>
              )}
            </Button>
          )}
        </div>
      </div>
      <div ref={listRef} className="-mx-1 px-1 pb-1 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain">
        {groups.map((group, gi) => (
          <section key={group.id} className="mt-2" aria-labelledby={`${headingId}-${group.id}`}>
            {/* One group needs no visible label; the heading stays for screen-reader navigation. */}
            <GroupHeading
              id={`${headingId}-${group.id}`}
              className={groups.length === 1 ? "sr-only" : "mb-1.5 mt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground"}
            >
              {group.title}
            </GroupHeading>
            <ul className="-mx-1 flex flex-col gap-0.5">
              {group.questions.map((q, qi) => {
                const a = answerFor(q.id);
                return (
                  <QuestionRow
                    key={q.id}
                    index={offsets[gi] + qi + 1}
                    text={q.text}
                    lead={group.closingLead && group.questions.length > 1 && qi === group.questions.length - 1 ? group.closingLead : undefined}
                    score={a.score}
                    reason={a.reason}
                    active={q.id === activeId}
                    onSelect={() => onSelect(q.id)}
                  />
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </aside>
  );
}
