import { prisma } from "@/lib/db/prisma";

export type AiFeature = "score" | "enhance" | "skill_split" | "skill_generate" | "skill_analyze";
export const AI_FEATURES: AiFeature[] = ["score", "enhance", "skill_split", "skill_generate", "skill_analyze"];
export const DEFAULT_LIMITS: Record<AiFeature, number> = { score: 300, enhance: 30, skill_split: 10, skill_generate: 20, skill_analyze: 40 };

export class LimitReachedError extends Error {
  constructor(
    public feature: AiFeature,
    public resetAt: Date,
  ) {
    super(`Daily limit reached for ${feature}`);
    this.name = "LimitReachedError";
  }
}

export function utcDay(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function nextUtcMidnight(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1));
}

export function normalizeLimits(raw: unknown): Record<AiFeature, number> {
  const limits = { ...DEFAULT_LIMITS };
  if (!raw || typeof raw !== "object") return limits;
  for (const feature of AI_FEATURES) {
    const value = (raw as Record<string, unknown>)[feature];
    if (typeof value === "number" && Number.isInteger(value) && value >= 0) limits[feature] = value;
  }
  return limits;
}

export async function getLimits(): Promise<Record<AiFeature, number>> {
  const settings = await prisma.aiSettings.findUnique({ where: { id: "singleton" } });
  return normalizeLimits(settings?.limits);
}

/** Counts one AI call; throws LimitReachedError (and undoes the count) when over the daily limit. */
export async function consumeAiUsage(userId: string, feature: AiFeature, now = new Date()): Promise<void> {
  const limits = await getLimits();
  const key = { userId, day: utcDay(now), feature };
  const row = await prisma.aiUsageDaily.upsert({
    where: { userId_day_feature: key },
    create: { ...key, count: 1 },
    update: { count: { increment: 1 } },
  });
  if (row.count > limits[feature]) {
    await prisma.aiUsageDaily.update({ where: { userId_day_feature: key }, data: { count: { decrement: 1 } } });
    throw new LimitReachedError(feature, nextUtcMidnight(now));
  }
}

/** Hands back one unit spent on `now`'s day, for a call that was counted but will never run. Never below zero. */
export async function refundAiUsage(userId: string, feature: AiFeature, now = new Date()): Promise<void> {
  await prisma.aiUsageDaily.updateMany({
    where: { userId, day: utcDay(now), feature, count: { gt: 0 } },
    data: { count: { decrement: 1 } },
  });
}
