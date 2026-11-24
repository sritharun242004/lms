"use client";
import * as React from "react";
import { readiness } from "@/lib/prompt-bot/scoring";
import type { AnswerView } from "@/lib/prompt-bot/sessions";
import { QuestionRow } from "./question-row";
import { ReadinessMeter } from "./readiness-meter";
import type { ScoreState } from "./use-matrix-answers";

export type MatrixGroup = { id: string; title: string; questions: { id: string; text: string }[] };

type Props = {
  heading: string;
  headingLevel?: "h1" | "h2";
  groups: MatrixGroup[];
  answerFor(id: string): AnswerView;
  activeId: string | null;
  scoreState: ScoreState;
  onSelect(id: string): void;
  onToggleRelevant(id: string): void;
  children?: React.ReactNode;
};

/** The left column of a matrix workspace: readiness, then numbered question rows with 3-slice bars. */
export function MatrixPanel({ heading, headingLevel = "h1", groups, answerFor, activeId, scoreState, onSelect, onToggleRelevant, children }: Props) {
  const headingId = React.useId();
  const Heading = headingLevel;
  const GroupHeading = headingLevel === "h1" ? "h2" : "h3";
  const ready = readiness(groups.flatMap((g) => g.questions.map((q) => answerFor(q.id))));
  const offsets = groups.map((_, i) => groups.slice(0, i).reduce((sum, g) => sum + g.questions.length, 0));

  return (
    <aside className="glass h-fit rounded-[1.75rem] p-5 lg:sticky lg:top-24" aria-labelledby={headingId}>
      <Heading id={headingId} className="text-lg font-semibold">
        {heading}
      </Heading>
      <div className="mt-3">
        <ReadinessMeter {...ready} />
      </div>
      <p className="mt-2 h-4 text-xs text-muted-foreground" aria-live="polite">
        {scoreState === "scoring" ? "Updating…" : scoreState === "failed" ? "Couldn't update the bars — keep typing to retry." : ""}
      </p>
      {groups.map((group, gi) => (
        <section key={group.id} className="mt-4" aria-labelledby={`${headingId}-${group.id}`}>
          <GroupHeading id={`${headingId}-${group.id}`} className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {group.title}
          </GroupHeading>
          <ul className="mt-2 flex flex-col gap-1">
            {group.questions.map((q, qi) => {
              const a = answerFor(q.id);
              return (
                <QuestionRow
                  key={q.id}
                  index={offsets[gi] + qi + 1}
                  text={q.text}
                  score={a.score}
                  reason={a.reason}
                  notRelevant={a.notRelevant}
                  active={q.id === activeId}
                  onSelect={() => onSelect(q.id)}
                  onToggleRelevant={() => onToggleRelevant(q.id)}
                />
              );
            })}
          </ul>
        </section>
      ))}
      {children}
    </aside>
  );
}
