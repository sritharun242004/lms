// apps/web/src/lib/prompt-bot/sessions.ts
import { prisma } from "@/lib/db/prisma";
import { scoreAndApply, toAnswerView, type AnswerView } from "./score-run";

export type { AnswerView };

export type MatrixView = {
  id: string;
  slug: string;
  name: string;
  kind: "CORE" | "TASK";
  questions: { id: string; text: string; guidance: string; order: number }[];
};
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

export function titleFrom(basePrompt: string, fallback = "Untitled prompt"): string {
  const first = basePrompt.trim().split("\n")[0]?.trim() ?? "";
  return first ? first.slice(0, 80) : fallback;
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
  return scoreAndApply({
    userId,
    revision,
    scoringBase: view.basePrompt,
    questions,
    answers: view.answers,
    ensureRows: () => ensureAnswerRows(sessionId, questions.map((q) => q.id)),
    readRevision: async () =>
      (await prisma.promptBotSession.findFirst({ where: { id: sessionId, userId }, select: { scoreRevision: true } }))?.scoreRevision ?? null,
    applyOps: (results, scoredAt, next) => [
      ...results.map((r) =>
        prisma.promptBotAnswer.update({
          where: { sessionId_questionId: { sessionId, questionId: r.questionId } },
          data: { score: r.score, reason: r.reason, scoredAt },
        }),
      ),
      prisma.promptBotSession.update({ where: { id: sessionId }, data: { scoreRevision: next } }),
    ],
    transaction: (ops) => prisma.$transaction(ops),
    reload: async () => (await loadSessionView(sessionId, userId))?.answers ?? [],
  });
}
