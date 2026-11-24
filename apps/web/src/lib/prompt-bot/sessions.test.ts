// apps/web/src/lib/prompt-bot/sessions.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), questionFindMany: vi.fn(), sessionFindMany: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    promptMatrix: { findMany: mocks.findMany },
    promptMatrixQuestion: { findMany: mocks.questionFindMany },
    promptBotSession: { findMany: mocks.sessionFindMany },
  },
}));
vi.mock("@/lib/ai/claude", () => ({ scoreQuestions: vi.fn() }));
vi.mock("@/lib/ai/usage", () => ({ consumeAiUsage: vi.fn() }));

import { recentSessions, sessionMatrices, titleFrom } from "./sessions";

beforeEach(() => vi.clearAllMocks());

describe("sessionMatrices", () => {
  it("asks only the active core matrix, with only its active questions", async () => {
    mocks.findMany.mockResolvedValue([{ id: "pbm_core", slug: "core", name: "Design Think", kind: "CORE", questions: [{ id: "c1", text: "Why?", guidance: "g", order: 0 }] }]);
    const result = await sessionMatrices();
    expect(result).toEqual([
      { id: "pbm_core", slug: "core", name: "Design Think", kind: "CORE", questions: [{ id: "c1", text: "Why?", guidance: "g", order: 0 }] },
    ]);
    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { isActive: true, kind: "CORE" },
      include: { questions: { where: { isActive: true }, orderBy: { order: "asc" } } },
      orderBy: { createdAt: "asc" },
    });
  });
});

describe("recentSessions", () => {
  it("measures progress against the active core questions only, counting unanswered ones as not ready", async () => {
    mocks.questionFindMany.mockResolvedValue([{ id: "c1" }, { id: "c2" }, { id: "c3" }]);
    const updatedAt = new Date("2026-11-24T10:00:00Z");
    mocks.sessionFindMany.mockResolvedValue([
      {
        id: "s1",
        title: "Board update",
        updatedAt,
        answers: [
          { questionId: "c1", score: 3, notRelevant: false },
          { questionId: "c2", score: 0, notRelevant: true },
          { questionId: "pbq_image_1", score: 3, notRelevant: false },
        ],
      },
    ]);
    expect(await recentSessions("u1", 8)).toEqual([{ id: "s1", title: "Board update", updatedAt, answered: 1, relevant: 2, ratio: 0.5 }]);
    expect(mocks.questionFindMany).toHaveBeenCalledWith({
      where: { isActive: true, matrix: { isActive: true, kind: "CORE" } },
      select: { id: true },
    });
    expect(mocks.sessionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1" }, orderBy: { updatedAt: "desc" }, take: 8 }),
    );
  });
});

describe("titleFrom", () => {
  it("uses the first line of the prompt, trimmed to 80 characters", () => {
    expect(titleFrom("  Write a board update\nwith details")).toBe("Write a board update");
    expect(titleFrom("x".repeat(100))).toHaveLength(80);
    expect(titleFrom("   ")).toBe("Untitled prompt");
  });

  it("uses the caller's fallback for blank text", () => {
    expect(titleFrom("   ", "My skills")).toBe("My skills");
  });
});
