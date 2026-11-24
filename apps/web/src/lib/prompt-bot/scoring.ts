export const MAX_SCORE = 3;
const REASON_LIMIT = 160;

export type ScoreResult = { questionId: string; score: number; reason: string };
type Scored = { score: number; notRelevant: boolean };

export function clampScore(value: unknown): number {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(MAX_SCORE, Math.floor(n)));
}

export function isTicked(answer: Scored): boolean {
  return !answer.notRelevant && answer.score >= MAX_SCORE;
}

export function readiness(answers: Scored[]) {
  const relevant = answers.filter((a) => !a.notRelevant);
  if (relevant.length === 0) return { answered: 0, relevant: 0, ratio: 0 };
  const points = relevant.reduce((sum, a) => sum + Math.min(a.score, MAX_SCORE), 0);
  return {
    answered: relevant.filter((a) => a.score >= MAX_SCORE).length,
    relevant: relevant.length,
    ratio: points / (MAX_SCORE * relevant.length),
  };
}

export function sanitizeScores(results: unknown[], validIds: ReadonlySet<string>): ScoreResult[] {
  const seen = new Set<string>();
  const clean: ScoreResult[] = [];
  for (const row of results) {
    if (!row || typeof row !== "object") continue;
    const { questionId, score, reason } = row as Record<string, unknown>;
    if (typeof questionId !== "string" || !validIds.has(questionId) || seen.has(questionId)) continue;
    seen.add(questionId);
    clean.push({
      questionId,
      score: clampScore(score),
      reason: (typeof reason === "string" ? reason.trim() : "").slice(0, REASON_LIMIT),
    });
  }
  return clean;
}

export function shouldApplyRevision(incoming: number, stored: number): boolean {
  return incoming >= stored;
}

export function unansweredQuestionIds(answers: (Scored & { questionId: string })[]): string[] {
  return answers.filter((a) => !a.notRelevant && a.score < MAX_SCORE).map((a) => a.questionId);
}
