import type { Prisma } from "@prisma/client";
import { scoreQuestions } from "@/lib/ai/claude";
import { consumeAiUsage } from "@/lib/ai/usage";
import { buildScoringText, type PromptQuestionContext } from "./instructions";
import { shouldApplyRevision, type ScoreResult } from "./scoring";

export type AnswerView = { questionId: string; answer: string; score: number; reason: string | null; notRelevant: boolean };
type QuestionRef = { id: string; text: string; guidance: string };

export function toAnswerView(a: AnswerView): AnswerView {
  return { questionId: a.questionId, answer: a.answer, score: a.score, reason: a.reason, notRelevant: a.notRelevant };
}

/** Pairs every active question with its stored answer (empty and unscored when there is none). */
export function buildQuestionContext(questions: QuestionRef[], answers: AnswerView[]): PromptQuestionContext[] {
  const byId = new Map(answers.map((a) => [a.questionId, a]));
  return questions.map((q) => {
    const a = byId.get(q.id);
    return { id: q.id, text: q.text, guidance: q.guidance, answer: a?.answer ?? "", score: a?.score ?? 0, notRelevant: a?.notRelevant ?? false };
  });
}

/**
 * The one scoring flow shared by the enhancer and the Skills Builder: meter usage, score the relevant
 * questions, and apply the results only if `revision` is not stale. Owners supply their own storage.
 */
export async function scoreAndApply(args: {
  userId: string;
  revision: number;
  /** The "prompt" the scorer reads before the answers: the base prompt, or a skill's purpose. */
  scoringBase: string;
  questions: QuestionRef[];
  answers: AnswerView[];
  ensureRows: () => Promise<void>;
  readRevision: () => Promise<number | null>;
  /** Writes for the results plus the new revision, run in one transaction. */
  applyOps: (results: ScoreResult[], scoredAt: Date, revision: number) => Prisma.PrismaPromise<unknown>[];
  transaction: (ops: Prisma.PrismaPromise<unknown>[]) => Promise<unknown>;
  reload: () => Promise<AnswerView[]>;
}) {
  await args.ensureRows();
  const context = buildQuestionContext(args.questions, args.answers);
  const relevantQuestions = context.filter((q) => !q.notRelevant);

  await consumeAiUsage(args.userId, "score");
  const results = await scoreQuestions(buildScoringText(args.scoringBase, context), relevantQuestions);

  const current = await args.readRevision();
  if (current === null || !shouldApplyRevision(args.revision, current)) {
    return { applied: false, revision: current ?? args.revision, answers: args.answers };
  }
  await args.transaction(args.applyOps(results, new Date(), args.revision));
  return { applied: true, revision: args.revision, answers: await args.reload() };
}
