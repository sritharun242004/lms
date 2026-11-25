// apps/web/src/app/api/v1/prompt-bot/sessions/score-enhance-routes.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  runScoring: vi.fn(),
  loadSessionView: vi.fn(),
  consumeAiUsage: vi.fn(),
  streamEnhancement: vi.fn(),
  enhancementFindFirst: vi.fn(),
  enhancementCreate: vi.fn(),
  enhancementFindMany: vi.fn(),
  isAiConfigured: vi.fn(),
  sessionFindFirst: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/ai/config", async (orig) => ({ ...(await orig()), isAiConfigured: mocks.isAiConfigured }));
vi.mock("@/lib/ai/usage", async (orig) => ({ ...(await orig()), consumeAiUsage: mocks.consumeAiUsage }));
vi.mock("@/lib/ai/claude", () => ({ streamEnhancement: mocks.streamEnhancement }));
vi.mock("@/lib/prompt-bot/sessions", () => ({ runScoring: mocks.runScoring, loadSessionView: mocks.loadSessionView }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    promptBotSession: { findFirst: mocks.sessionFindFirst },
    promptBotEnhancement: { findFirst: mocks.enhancementFindFirst, create: mocks.enhancementCreate, findMany: mocks.enhancementFindMany },
  },
}));

import * as score from "./[id]/score/route";
import * as enhance from "./[id]/enhance/route";
import * as versions from "./[id]/enhancements/route";

const req = (body?: unknown) =>
  new NextRequest("http://localhost/x", { method: "POST", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
const ctx = { params: Promise.resolve({ id: "s1" }) };
const VIEW = {
  id: "s1",
  basePrompt: "Write",
  matrices: [{ id: "core", questions: [{ id: "q1", text: "Why?", guidance: "g", order: 0 }, { id: "q2", text: "Who?", guidance: "g", order: 1 }] }],
  answers: [
    { questionId: "q1", answer: "Because", score: 3, reason: null, notRelevant: false },
    { questionId: "q2", answer: "", score: 1, reason: null, notRelevant: false },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "u1", role: "MENTOR" });
  mocks.isAiConfigured.mockReturnValue(true);
  mocks.loadSessionView.mockResolvedValue(VIEW);
  mocks.enhancementFindFirst.mockResolvedValue({ version: 1 });
});

describe("score route", () => {
  it("passes the client revision through and reports whether it was applied", async () => {
    mocks.runScoring.mockResolvedValue({ applied: false, revision: 7, answers: [] });
    const res = await score.POST(req({ revision: 5 }), ctx);
    expect(res.status).toBe(200);
    expect(mocks.runScoring).toHaveBeenCalledWith("s1", "u1", 5);
    expect((await res.json()).data).toEqual({ applied: false, revision: 7, answers: [] });
  });

  it("maps the daily limit to 429 LIMIT_REACHED", async () => {
    const { LimitReachedError } = await import("@/lib/ai/usage");
    mocks.runScoring.mockRejectedValue(new LimitReachedError("score", new Date("2026-11-25T00:00:00Z")));
    const res = await score.POST(req({ revision: 1 }), ctx);
    expect(res.status).toBe(429);
    expect((await res.json()).error.code).toBe("LIMIT_REACHED");
  });

  it("rejects a missing revision", async () => {
    expect((await score.POST(req({}), ctx)).status).toBe(400);
  });
});

describe("enhance route", () => {
  it("streams deltas, saves the next version with its gaps, and ends with done", async () => {
    mocks.streamEnhancement.mockReturnValue({
      textStream: (async function* () {
        yield "## Persona\n";
        yield "You are…";
      })(),
      finalMessage: async () => ({ model: "claude-opus-5-5", stopReason: "end_turn" }),
    });
    const res = await enhance.POST(req(), ctx);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const body = await res.text();
    expect(body).toContain('data: {"type":"delta","text":"## Persona\\n"}');
    expect(body).toContain('data: {"type":"done","version":2}');
    expect(mocks.enhancementCreate).toHaveBeenCalledWith({
      data: {
        sessionId: "s1",
        version: 2,
        content: "## Persona\nYou are…",
        unansweredQuestionIds: ["q2"],
        model: "claude-opus-5-5",
        instructionsVersion: "prompt-bot-v5",
      },
    });
  });

  it("sends an error event and saves nothing when the model fails mid-stream", async () => {
    mocks.streamEnhancement.mockReturnValue({
      textStream: (async function* () {
        yield "partial";
        throw new Error("boom");
      })(),
      finalMessage: async () => ({ model: "x", stopReason: "end_turn" }),
    });
    const body = await (await enhance.POST(req(), ctx)).text();
    expect(body).toContain('"type":"error"');
    expect(mocks.enhancementCreate).not.toHaveBeenCalled();
  });

  it.each([
    ["empty output", "  ", "end_turn"],
    ["a refusal", "partial", "refusal"],
  ])("sends an error event and saves nothing on %s", async (_name, text, stopReason) => {
    mocks.streamEnhancement.mockReturnValue({
      textStream: (async function* () {
        yield text;
      })(),
      finalMessage: async () => ({ model: "claude-opus-5-5", stopReason }),
    });
    const body = await (await enhance.POST(req(), ctx)).text();
    expect(body).toContain('"type":"error"');
    expect(body).not.toContain('"type":"done"');
    expect(mocks.enhancementCreate).not.toHaveBeenCalled();
  });

  it("returns 404 for someone else's session before spending usage", async () => {
    mocks.loadSessionView.mockResolvedValue(null);
    expect((await enhance.POST(req(), ctx)).status).toBe(404);
    expect(mocks.consumeAiUsage).not.toHaveBeenCalled();
  });
});

describe("enhancements route", () => {
  const get = () => versions.GET(new NextRequest("http://localhost/x"), ctx);

  it("returns 401 when signed out", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    expect((await get()).status).toBe(401);
  });

  it("returns 404 for a missing or foreign session without listing versions", async () => {
    mocks.sessionFindFirst.mockResolvedValue(null);
    expect((await get()).status).toBe(404);
    expect(mocks.sessionFindFirst).toHaveBeenCalledWith({ where: { id: "s1", userId: "u1" }, select: { id: true } });
    expect(mocks.enhancementFindMany).not.toHaveBeenCalled();
  });

  it("lists versions with ISO createdAt for an owned session", async () => {
    mocks.sessionFindFirst.mockResolvedValue({ id: "s1" });
    mocks.enhancementFindMany.mockResolvedValue([
      { version: 2, content: "c", unansweredQuestionIds: ["q2"], createdAt: new Date("2026-11-24T00:00:00Z") },
    ]);
    const res = await get();
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual([
      { version: 2, content: "c", unansweredQuestionIds: ["q2"], createdAt: "2026-11-24T00:00:00.000Z" },
    ]);
  });
});
