"use client";
import * as React from "react";
import { Textarea } from "@/components/ui/textarea";
import { MatrixPanel } from "@/components/prompt-bot/matrix-panel";
import { useActiveQuestion, type useMatrixAnswers } from "@/components/prompt-bot/use-matrix-answers";
import type { SkillMatrixView } from "@/lib/skills/types";

const ANSWER_MAX = 4000;

type Props = { matrix: SkillMatrixView; state: ReturnType<typeof useMatrixAnswers> };

/**
 * Step 3: the skill-definition matrix with 3-slice bars beside the selected question's answer, in the
 * enhancer's two-column layout (stacked on phones). Saving and scoring stay in the workspace's hook.
 */
export function QuestionsPanel({ matrix, state }: Props) {
  const { activeId, answerRef, selectQuestion } = useActiveQuestion(matrix.questions[0]?.id ?? null);
  const active = matrix.questions.find((q) => q.id === activeId) ?? null;
  const answerId = React.useId();
  const helpId = `${answerId}-help`;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <MatrixPanel
        heading={matrix.name}
        headingLevel="h2"
        groups={[{ id: matrix.id || "skill-definition", title: "Questions", questions: matrix.questions }]}
        answerFor={state.answerFor}
        activeId={activeId}
        scoreState={state.scoreState}
        onSelect={selectQuestion}
        onToggleRelevant={(id) => state.updateAnswer(id, { notRelevant: !state.answerFor(id).notRelevant })}
      >
        <p className="mt-3 text-xs text-muted-foreground">Scored against your job description, answers and files.</p>
      </MatrixPanel>
      <section className="glass h-fit min-w-0 rounded-[1.75rem] p-4 sm:p-5">
        {active ? (
          <>
            <label htmlFor={answerId} className="block text-sm font-medium text-balance">
              {active.text}
            </label>
            <Textarea
              id={answerId}
              ref={answerRef}
              value={state.answerFor(active.id).answer}
              maxLength={ANSWER_MAX}
              onChange={(e) => state.updateAnswer(active.id, { answer: e.target.value })}
              placeholder={active.guidance}
              aria-describedby={helpId}
              className="mt-2 min-h-48 resize-y bg-white/60 dark:bg-white/5"
            />
            <p id={helpId} className="mt-2 text-xs text-muted-foreground">
              Short notes are fine. Anything your description or files already say counts too.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No questions are set up yet.</p>
        )}
      </section>
    </div>
  );
}
