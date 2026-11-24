// apps/web/src/app/api/v1/prompt-bot/sessions/session-routes.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  isAiConfigured: vi.fn(),
  sessionFindMany: vi.fn(),
  sessionCreate: vi.fn(),
  sessionFindFirst: vi.fn(),
  sessionUpdate: vi.fn(),
  sessionDelete: vi.fn(),
  answerUpsert: vi.fn(),
  loadSessionView: vi.fn(),
  ensureAnswerRows: vi.fn(),
  runScoring: vi.fn(),
  sessionMatrices: vi.fn(),
  consumeAiUsage: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/ai/config", async (orig) => ({ ...(await orig()), isAiConfigured: mocks.isAiConfigured }));
vi.mock("@/lib/ai/claude", () => ({}));
vi.mock("@/lib/ai/usage", async (orig) => ({ ...(await orig()), consumeAiUsage: mocks.consumeAiUsage }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    promptBotSession: {
      findMany: mocks.sessionFindMany,
      create: mocks.sessionCreate,
      findFirst: mocks.sessionFindFirst,
      update: mocks.sessionUpdate,
      delete: mocks.sessionDelete,
    },
    promptBotAnswer: { upsert: mocks.answerUpsert },
    $transaction: (ops: unknown[]) => Promise.all(ops),
  },
}));
vi.mock("@/lib/prompt-bot/sessions", async (orig) => ({
  ...(await orig()),
  loadSessionView: mocks.loadSessionView,
  ensureAnswerRows: mocks.ensureAnswerRows,
  runScoring: mocks.runScoring,
  sessionMatrices: mocks.sessionMatrices,
}));

import * as collection from "./route";
import * as item from "./[id]/route";
import * as answer from "./[id]/answers/[questionId]/route";

const json = (url: string, method: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
const ctx = <T,>(params: T) => ({ params: Promise.resolve(params) });

const VIEW = { id: "s1", title: "Write", basePrompt: "Write", scoreRevision: 0, matrices: [], answers: [], latestEnhancement: null };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "u1", role: "MENTEE" });
  mocks.isAiConfigured.mockReturnValue(true);
  mocks.consumeAiUsage.mockResolvedValue(undefined);
  mocks.sessionCreate.mockResolvedValue({ id: "s1" });
  mocks.loadSessionView.mockResolvedValue(VIEW);
  mocks.sessionMatrices.mockResolvedValue([{ id: "pbm_core", questions: [{ id: "c1" }] }]);
  mocks.runScoring.mockResolvedValue({ applied: true, revision: 0, answers: [] });
});

describe("prompt bot session routes", () => {
  it("requires sign-in", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    expect((await collection.GET()).status).toBe(401);
  });

  it("returns 503 when AI is not configured instead of creating a session", async () => {
    mocks.isAiConfigured.mockReturnValue(false);
    const res = await collection.POST(json("/api/v1/prompt-bot/sessions", "POST", { basePrompt: "Make an image" }));
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("AI_NOT_CONFIGURED");
    expect(mocks.sessionCreate).not.toHaveBeenCalled();
  });

  it("rejects an empty prompt", async () => {
    const res = await collection.POST(json("/api/v1/prompt-bot/sessions", "POST", { basePrompt: "   " }));
    expect(res.status).toBe(400);
  });

  it("creates a core-only session for any role and scores it, with no task detection or extra AI usage", async () => {
    const res = await collection.POST(json("/api/v1/prompt-bot/sessions", "POST", { basePrompt: "Make a hero image" }));
    expect(res.status).toBe(201);
    expect(mocks.sessionCreate).toHaveBeenCalledWith({
      data: { userId: "u1", basePrompt: "Make a hero image", title: "Make a hero image" },
    });
    expect(mocks.runScoring).toHaveBeenCalledWith("s1", "u1", 0);
    // runScoring meters its own call; creation itself spends nothing.
    expect(mocks.consumeAiUsage).not.toHaveBeenCalled();
  });

  it("still creates the session when initial scoring hits the daily limit", async () => {
    const { LimitReachedError } = await import("@/lib/ai/usage");
    mocks.runScoring.mockRejectedValue(new LimitReachedError("score", new Date()));
    const res = await collection.POST(json("/api/v1/prompt-bot/sessions", "POST", { basePrompt: "Make a hero image" }));
    expect(res.status).toBe(201);
  });

  it("hides other users' sessions as 404", async () => {
    mocks.loadSessionView.mockResolvedValue(null);
    const res = await item.GET(json("/api/v1/prompt-bot/sessions/s9", "GET"), ctx({ id: "s9" }));
    expect(res.status).toBe(404);
  });

  it("no longer accepts a task matrix on PATCH", async () => {
    mocks.sessionFindFirst.mockResolvedValue({ id: "s1", userId: "u1" });
    const res = await item.PATCH(json("/api/v1/prompt-bot/sessions/s1", "PATCH", { taskMatrixId: "pbm_code" }), ctx({ id: "s1" }));
    expect(res.status).toBe(400);
    expect(mocks.sessionUpdate).not.toHaveBeenCalled();
  });

  it("updates the basic prompt", async () => {
    mocks.sessionFindFirst.mockResolvedValue({ id: "s1", userId: "u1" });
    const res = await item.PATCH(json("/x", "PATCH", { basePrompt: "Write a better email" }), ctx({ id: "s1" }));
    expect(res.status).toBe(200);
    expect(mocks.sessionUpdate).toHaveBeenCalledWith({ where: { id: "s1" }, data: { basePrompt: "Write a better email" } });
  });

  it("saves an answer note and the not-relevant flag for the owner only", async () => {
    mocks.sessionFindFirst.mockResolvedValue(null);
    const denied = await answer.PUT(json("/x", "PUT", { answer: "CEOs" }), ctx({ id: "s9", questionId: "c1" }));
    expect(denied.status).toBe(404);

    mocks.sessionFindFirst.mockResolvedValue({ id: "s1", userId: "u1" });
    const ok = await answer.PUT(json("/x", "PUT", { answer: "CEOs", notRelevant: false }), ctx({ id: "s1", questionId: "c1" }));
    expect(ok.status).toBe(200);
    expect(mocks.answerUpsert).toHaveBeenCalledWith({
      where: { sessionId_questionId: { sessionId: "s1", questionId: "c1" } },
      create: { sessionId: "s1", questionId: "c1", answer: "CEOs", notRelevant: false },
      update: { answer: "CEOs", notRelevant: false },
    });
    // The session counts as recently worked on, so the start page offers to continue it.
    expect(mocks.sessionUpdate).toHaveBeenCalledWith({ where: { id: "s1" }, data: { updatedAt: expect.any(Date) } });
  });

  it("rejects an answer for a question outside the session's active matrices", async () => {
    mocks.sessionFindFirst.mockResolvedValue({ id: "s1", userId: "u1" });
    const res = await answer.PUT(json("/x", "PUT", { answer: "x" }), ctx({ id: "s1", questionId: "other" }));
    expect(res.status).toBe(404);
    expect(mocks.answerUpsert).not.toHaveBeenCalled();
  });
});
