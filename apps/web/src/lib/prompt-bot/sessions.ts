// apps/web/src/lib/prompt-bot/sessions.ts
import { prisma } from "@/lib/db/prisma";
import { scoreAndApply, toAnswerView, type AnswerView } from "./score-run";
import { readiness } from "./scoring";

export type { AnswerView };

export type MatrixView = {
  id: string;
  slug: string;
  name: string;
  kind: "CORE";
  questions: { id: string; text: string; guidance: string; order: number }[];
};
export type SessionView = {
  id: string;
  title: string;
  basePrompt: string;
  scoreRevision: number;
  matrices: MatrixView[];
  answers: AnswerView[];
  latestEnhancement: { version: number; content: string; createdAt: string } | null;
};

export function titleFrom(basePrompt: string, fallback = "Untitled prompt"): string {
  const first = basePrompt.trim().split("\n")[0]?.trim() ?? "";
  return first ? first.slice(0, 80) : fallback;
}

/**
 * The questions every session asks: the active core matrix and its active questions. Task add-on
 * matrices are no longer offered; a session's stored task matrix and answers to switched-off
 * questions stay in the database but are not shown, scored or sent to the enhancer.
 */
export async function sessionMatrices(): Promise<MatrixView[]> {
  const rows = await prisma.promptMatrix.findMany({
    where: { isActive: true, kind: "CORE" },
    include: { questions: { where: { isActive: true }, orderBy: { order: "asc" } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((m) => ({
    id: m.id,
    slug: m.slug,
    name: m.name,
    kind: "CORE" as const,
    questions: m.questions.map((q) => ({ id: q.id, text: q.text, guidance: q.guidance, order: q.order })),
  }));
}

export type RecentSession = { id: string; title: string; updatedAt: Date; answered: number; relevant: number; ratio: number };

/** The user's latest sessions with progress measured against the questions sessions ask now. */
export async function recentSessions(userId: string, take: number): Promise<RecentSession[]> {
  const [questions, sessions] = await Promise.all([
    prisma.promptMatrixQuestion.findMany({ where: { isActive: true, matrix: { isActive: true, kind: "CORE" } }, select: { id: true } }),
    prisma.promptBotSession.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take,
      select: { id: true, title: true, updatedAt: true, answers: { select: { questionId: true, score: true, notRelevant: true } } },
    }),
  ]);
  return sessions.map((s) => {
    const byId = new Map(s.answers.map((a) => [a.questionId, a]));
    const ready = readiness(questions.map((q) => byId.get(q.id) ?? { score: 0, notRelevant: false }));
    return { id: s.id, title: s.title, updatedAt: s.updatedAt, answered: ready.answered, relevant: ready.relevant, ratio: ready.ratio };
  });
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
  const matrices = await sessionMatrices();
  const activeIds = new Set(matrices.flatMap((m) => m.questions.map((q) => q.id)));
  const latest = session.enhancements[0];
  return {
    id: session.id,
    title: session.title,
    basePrompt: session.basePrompt,
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
