"use client";
import * as React from "react";
import { Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, type ConfirmDialogHandle } from "@/components/ui/confirm-dialog";
import { Textarea } from "@/components/ui/textarea";
import { MatrixPanel } from "@/components/prompt-bot/matrix-panel";
import { useActiveQuestion, useMatrixAnswers } from "@/components/prompt-bot/use-matrix-answers";
import { unansweredQuestionIds } from "@/lib/prompt-bot/scoring";
import { getItem, patchItem, requestGenerate, saveItemAnswer, scoreItem } from "@/lib/skills/client";
import type { SkillItemView, SkillMatrixView } from "@/lib/skills/types";

/** Asked before any generation that would replace existing files (Generate again, Retry). */
export const REPLACE_FILES_CONFIRM = {
  title: "Generate this skill again?",
  description: "This replaces the current files, including your edits. If the new version fails, the current files are kept.",
  confirmLabel: "Generate again",
};

type Props = {
  packId: string;
  item: SkillItemView;
  matrix: SkillMatrixView;
  onItemChange(item: SkillItemView): void;
  onGenerated(item: SkillItemView): void;
};

export function SkillRefine({ packId, item, matrix, onItemChange, onGenerated }: Props) {
  const [purpose, setPurpose] = React.useState(item.purpose);
  const [starting, setStarting] = React.useState(false);
  const confirmRef = React.useRef<ConfirmDialogHandle>(null);
  const hasFiles = (item.files?.length ?? 0) > 0;
  const state = useMatrixAnswers({
    initialAnswers: item.answers,
    initialRevision: item.scoreRevision,
    saveAnswer: (questionId, patch, options) => saveItemAnswer(packId, item.id, questionId, patch, options),
    score: (revision) => scoreItem(packId, item.id, revision),
  });
  const { activeId, answerRef, selectQuestion } = useActiveQuestion(matrix.questions[0]?.id ?? null);
  // The pack page can mount from the router's cached first load (browser Back), so read the saved
  // item once and use it if the user hasn't started editing.
  const { replaceAnswers } = state;
  React.useEffect(() => {
    let cancelled = false;
    void getItem(packId, item.id).then((fresh) => {
      if (cancelled || !fresh.ok || !Array.isArray(fresh.data?.answers)) return;
      if (replaceAnswers(fresh.data.answers, fresh.data.scoreRevision)) setPurpose(fresh.data.purpose);
    });
    return () => {
      cancelled = true;
    };
  }, [packId, item.id, replaceAnswers]);
  const [neverScored] = React.useState(item.answers.length === 0);
  const { scheduleScore } = state;
  React.useEffect(() => {
    if (neverScored) scheduleScore();
  }, [neverScored, scheduleScore]);

  const gaps = unansweredQuestionIds(matrix.questions.map((q) => state.answerFor(q.id)));
  const active = matrix.questions.find((q) => q.id === activeId) ?? null;

  function updatePurpose(value: string) {
    state.bumpRevision();
    setPurpose(value);
    if (!value.trim()) return;
    state.queueSave("purpose", async (options) => {
      const saved = await patchItem(packId, item.id, { purpose: value }, options);
      if (!saved.ok) toast.error(saved.message);
      else onItemChange(saved.data);
      state.scheduleScore();
    });
  }

  async function generate() {
    if (hasFiles && !(await confirmRef.current?.open(REPLACE_FILES_CONFIRM))) return;
    if (gaps.length > 0 && !window.confirm(`${gaps.length} questions not answered yet — the skill will be more general. Continue?`)) return;
    setStarting(true);
    await state.flushSaves();
    const result = await requestGenerate(packId, item.id);
    setStarting(false);
    if (!result.ok) return void toast.error(result.message);
    onGenerated(result.data);
  }

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
      />
      <div className="flex min-w-0 flex-col gap-5">
        <section className="glass rounded-[1.75rem] p-5">
          <label htmlFor={`purpose-${item.id}`} className="text-sm font-medium">Purpose</label>
          <Textarea
            id={`purpose-${item.id}`}
            value={purpose}
            maxLength={300}
            onChange={(e) => updatePurpose(e.target.value)}
            className="mt-2 min-h-20 bg-white/60 dark:bg-white/5"
          />
          {active && (
            <div className="mt-5">
              <label htmlFor={`answer-${item.id}`} className="text-sm font-medium">{active.text}</label>
              <Textarea
                id={`answer-${item.id}`}
                ref={answerRef}
                value={state.answerFor(active.id).answer}
                onChange={(e) => state.updateAnswer(active.id, { answer: e.target.value })}
                placeholder={active.guidance}
                className="mt-2 min-h-24 bg-white/60 dark:bg-white/5"
              />
            </div>
          )}
        </section>
        <section className="glass rounded-[1.75rem] p-5" aria-labelledby={`generate-${item.id}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 id={`generate-${item.id}`} className="font-semibold">Write the skill</h3>
              <p className="text-xs text-muted-foreground">
                {gaps.length > 0
                  ? `${gaps.length} question${gaps.length === 1 ? "" : "s"} not answered yet — the skill will be more general.`
                  : "Every question is answered."}
              </p>
            </div>
            <Button onClick={() => void generate()} disabled={starting || item.status === "GENERATING"}>
              {starting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Wand2 className="size-4" aria-hidden />}
              {hasFiles ? "Generate again" : "Generate skill"}
            </Button>
          </div>
        </section>
        <p className="text-center text-xs text-muted-foreground">
          Your descriptions and answers are stored in the LMS and sent to Anthropic&apos;s API to build your skills.
        </p>
      </div>
      <ConfirmDialog ref={confirmRef} />
    </div>
  );
}
