"use client";
import type { useMatrixAnswers } from "@/components/prompt-bot/use-matrix-answers";
import type { SkillMatrixView } from "@/lib/skills/types";

/** Replaced in Task 20. */
export function QuestionsPanel(props: { matrix: SkillMatrixView; state: ReturnType<typeof useMatrixAnswers> }) {
  return <p className="text-sm text-muted-foreground">{props.matrix.questions.length} questions</p>;
}
