// apps/web/src/lib/prompt-bot/sessions.ts
import { prisma } from "@/lib/db/prisma";
import { scoreQuestions } from "@/lib/ai/claude";
import { consumeAiUsage } from "@/lib/ai/usage";
import { buildScoringText } from "./instructions";
import { shouldApplyRevision } from "./scoring";

export type MatrixView = {
  id: string;
  slug: string;
  name: string;
  kind: "CORE" | "TASK";
  questions: { id: string; text: string; guidance: string; order: number }[];
};
export type AnswerView = { questionId: string; answer: string; score: number; reason: string | null; notRelevant: boolean };
export type SessionView = {
  id: string;
  title: string;
  basePrompt: string;
  taskMatrixId: string | null;
  taskDetected: boolean;
  scoreRevision: number;
  matrices: MatrixView[];
  answers: AnswerView[];
  latestEnhancement: { version: number; content: string; createdAt: string } | null;
};

export function titleFrom(basePrompt: string): string {
  const first = basePrompt.trim().split("\n")[0]?.trim() ?? "";
  return first ? first.slice(0, 80) : "Untitled prompt";
}

export async function matricesForSession(taskMatrixId: string | null): Promise<MatrixView[]> {
  const rows = await prisma.promptMatrix.findMany({
    where: { isActive: true, OR: [{ kind: "CORE" }, ...(taskMatrixId ? [{ id: taskMatrixId }] : [])] },
    include: { questions: { where: { isActive: true }, orderBy: { order: "asc" } } },
  });
  return rows
    .filter((m) => m.kind === "CORE" || m.id === taskMatrixId)
    .sort((a, b) => (a.kind === "CORE" ? -1 : 0) - (b.kind === "CORE" ? -1 : 0))
    .map((m) => ({
      id: m.id,
      slug: m.slug,
      name: m.name,
      kind: m.kind as "CORE" | "TASK",
      questions: m.questions.map((q) => ({ id: q.id, text: q.text, guidance: q.guidance, order: q.order })),
    }));
}

export async function ensureAnswerRows(sessionId: string, questionIds: string[]) {
  if (questionIds.length === 0) return;
  await prisma.promptBotAnswer.createMany({
    data: questionIds.map((questionId) => ({ sessionId, questionId })),
    skipDuplicates: true,
  });
}

function toAnswerView(a: { questionId: string; answer: string; score: number; reason: string | null; notRelevant: boolean }): AnswerView {
  return { questionId: a.questionId, answer: a.answer, score: a.score, reason: a.reason, notRelevant: a.notRelevant };
}

export async function loadSessionView(id: string, userId: string): Promise<SessionView | null> {
  const session = await prisma.promptBotSession.findFirst({
    where: { id, userId },
    include: { answers: true, enhancements: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!session) return null;
  const matrices = await matricesForSession(session.taskMatrixId);
  const activeIds = new Set(matrices.flatMap((m) => m.questions.map((q) => q.id)));
  const latest = session.enhancements[0];
  return {
    id: session.id,
    title: session.title,
    basePrompt: session.basePrompt,
    taskMatrixId: session.taskMatrixId,
    taskDetected: session.taskDetected,
    scoreRevision: session.scoreRevision,
    matrices,
    answers: session.answers.filter((a) => activeIds.has(a.questionId)).map(toAnswerView),
    latestEnhancement: latest ? { version: latest.version, content: latest.content, createdAt: latest.createdAt.toISOString() } : null,
  };
}

/** Scores every active question; applies results only if `revision` is not stale. */
export async function runScoring(sessionId: string, userId: string, revision: number) {
  const view = await loadSessionView(sessionId, userId);
  if (!view) throw new Error("session not found");
  const questions = view.matrices.flatMap((m) => m.questions);
  await ensureAnswerRows(sessionId, questions.map((q) => q.id));
  const byId = new Map(view.answers.map((a) => [a.questionId, a]));
  const context = questions.map((q) => {
    const a = byId.get(q.id);
    return { id: q.id, text: q.text, guidance: q.guidance, answer: a?.answer ?? "", score: a?.score ?? 0, notRelevant: a?.notRelevant ?? false };
  });
  const relevantQuestions = context.filter((q) => !q.notRelevant);

  await consumeAiUsage(userId, "score");
  const results = await scoreQuestions(buildScoringText(view.basePrompt, context), relevantQuestions);

  const current = await prisma.promptBotSession.findFirst({ where: { id: sessionId, userId }, select: { scoreRevision: true } });
  if (!current || !shouldApplyRevision(revision, current.scoreRevision)) {
    return { applied: false, revision: current?.scoreRevision ?? revision, answers: view.answers };
  }
  const scoredAt = new Date();
  await prisma.$transaction([
    ...results.map((r) =>
      prisma.promptBotAnswer.update({
        where: { sessionId_questionId: { sessionId, questionId: r.questionId } },
        data: { score: r.score, reason: r.reason, scoredAt },
      }),
    ),
    prisma.promptBotSession.update({ where: { id: sessionId }, data: { scoreRevision: revision } }),
  ]);
  const fresh = await loadSessionView(sessionId, userId);
  return { applied: true, revision, answers: fresh?.answers ?? [] };
}
