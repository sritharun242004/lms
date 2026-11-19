import { prisma } from "@/lib/db/prisma";
import { requireStaff } from "./form-service";
import { isStopWord } from "@/lib/word-cloud/stop-words";

type Actor = { id: string; role: string };

export type WordCloudEntry = { word: string; count: number; responseIds: string[] };

// Tokenizes every open-text answer (SHORT_ANSWER/PARAGRAPH) on FEEDBACK
// forms matching the filters, lowercases, strips punctuation, drops stop
// words, and counts frequency. This is word-frequency only — never
// sentiment — matching the master prompt's explicit instruction to keep
// the two separate (no sentiment scoring is implemented at all here).
export async function getFeedbackWordCloud(
  actor: Actor,
  filters: { formId?: string; targetLabel?: string; since?: Date }
): Promise<WordCloudEntry[]> {
  requireStaff(actor);

  const forms = await prisma.form.findMany({
    where: {
      category: "FEEDBACK",
      ...(actor.role === "ADMIN" ? {} : { createdById: actor.id }),
      ...(filters.formId ? { id: filters.formId } : {}),
      ...(filters.targetLabel ? { feedbackTargetLabel: filters.targetLabel } : {}),
    },
    include: {
      sections: { include: { questions: true } },
      responses: {
        where: filters.since ? { submittedAt: { gte: filters.since } } : {},
        include: { answers: true },
      },
    },
  });

  const openTextQuestionIds = new Set(
    forms
      .flatMap((f) => f.sections.flatMap((s) => s.questions))
      .filter((q) => q.type === "SHORT_ANSWER" || q.type === "PARAGRAPH")
      .map((q) => q.id)
  );

  const counts = new Map<string, { count: number; responseIds: Set<string> }>();

  for (const form of forms) {
    for (const response of form.responses) {
      for (const answer of response.answers) {
        if (!openTextQuestionIds.has(answer.questionId) || typeof answer.value !== "string") continue;
        const words = answer.value
          .toLowerCase()
          .replace(/[^\p{L}\p{N}\s]/gu, " ")
          .split(/\s+/)
          .filter((word) => word.length > 1 && !isStopWord(word));

        for (const word of words) {
          const entry = counts.get(word) ?? { count: 0, responseIds: new Set<string>() };
          entry.count += 1;
          entry.responseIds.add(response.id);
          counts.set(word, entry);
        }
      }
    }
  }

  return Array.from(counts.entries())
    .map(([word, { count, responseIds }]) => ({ word, count, responseIds: Array.from(responseIds) }))
    .sort((a, b) => b.count - a.count);
}
