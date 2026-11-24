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
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/ai/config", async (orig) => ({ ...(await orig()), isAiConfigured: mocks.isAiConfigured }));
vi.mock("@/lib/ai/usage", async (orig) => ({ ...(await orig()), consumeAiUsage: mocks.consumeAiUsage }));
vi.mock("@/lib/ai/claude", () => ({ streamEnhancement: mocks.streamEnhancement }));
vi.mock("@/lib/prompt-bot/sessions", () => ({ runScoring: mocks.runScoring, loadSessionView: mocks.loadSessionView }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    promptBotEnhancement: { findFirst: mocks.enhancementFindFirst, create: mocks.enhancementCreate, findMany: mocks.enhancementFindMany },
  },
}));

import * as score from "./[id]/score/route";
import * as enhance from "./[id]/enhance/route";

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
      finalModel: async () => "claude-opus-5-5",
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
        instructionsVersion: "prompt-bot-v1",
      },
    });
  });

  it("sends an error event and saves nothing when the model fails mid-stream", async () => {
    mocks.streamEnhancement.mockReturnValue({
      textStream: (async function* () {
        yield "partial";
        throw new Error("boom");
      })(),
      finalModel: async () => "x",
    });
    const body = await (await enhance.POST(req(), ctx)).text();
    expect(body).toContain('"type":"error"');
    expect(mocks.enhancementCreate).not.toHaveBeenCalled();
  });

  it("returns 404 for someone else's session before spending usage", async () => {
    mocks.loadSessionView.mockResolvedValue(null);
    expect((await enhance.POST(req(), ctx)).status).toBe(404);
    expect(mocks.consumeAiUsage).not.toHaveBeenCalled();
  });
});
