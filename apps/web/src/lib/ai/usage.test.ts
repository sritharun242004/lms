import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findSettings: vi.fn(), upsert: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    aiSettings: { findUnique: mocks.findSettings },
    aiUsageDaily: { upsert: mocks.upsert, update: mocks.update },
  },
}));

import { consumeAiUsage, DEFAULT_LIMITS, LimitReachedError, normalizeLimits, utcDay } from "./usage";

const NOW = new Date("2026-11-24T22:30:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findSettings.mockResolvedValue({ limits: { enhance: 2 } });
});

describe("usage limits", () => {
  it("formats the UTC day", () => {
    expect(utcDay(NOW)).toBe("2026-11-24");
  });

  it("meters file analysis with its own daily default", () => {
    expect(DEFAULT_LIMITS.skill_analyze).toBe(40);
    expect(normalizeLimits({ skill_analyze: 5 }).skill_analyze).toBe(5);
  });

  it("merges stored limits over defaults and rejects junk", () => {
    expect(normalizeLimits({ enhance: 5, score: -3, bogus: 1 })).toEqual({ ...DEFAULT_LIMITS, enhance: 5 });
    expect(normalizeLimits(null)).toEqual(DEFAULT_LIMITS);
  });

  it("counts a call within the limit", async () => {
    mocks.upsert.mockResolvedValue({ count: 2 });
    await expect(consumeAiUsage("u1", "enhance", NOW)).resolves.toBeUndefined();
    expect(mocks.upsert).toHaveBeenCalledWith({
      where: { userId_day_feature: { userId: "u1", day: "2026-11-24", feature: "enhance" } },
      create: { userId: "u1", day: "2026-11-24", feature: "enhance", count: 1 },
      update: { count: { increment: 1 } },
    });
  });

  it("refuses and rolls back the increment over the limit", async () => {
    mocks.upsert.mockResolvedValue({ count: 3 });
    const error = await consumeAiUsage("u1", "enhance", NOW).catch((e) => e);
    expect(error).toBeInstanceOf(LimitReachedError);
    expect(error.feature).toBe("enhance");
    expect(error.resetAt.toISOString()).toBe("2026-11-25T00:00:00.000Z");
    expect(mocks.update).toHaveBeenCalledWith({
      where: { userId_day_feature: { userId: "u1", day: "2026-11-24", feature: "enhance" } },
      data: { count: { decrement: 1 } },
    });
  });
});
