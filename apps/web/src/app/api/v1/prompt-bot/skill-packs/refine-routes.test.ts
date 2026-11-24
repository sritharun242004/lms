import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  findOwnedCustomItem: vi.fn(),
  loadSkillMatrix: vi.fn(),
  runItemScoring: vi.fn(),
  answerUpsert: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/skills/packs", () => ({
  findOwnedCustomItem: mocks.findOwnedCustomItem,
  loadSkillMatrix: mocks.loadSkillMatrix,
  runItemScoring: mocks.runItemScoring,
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { skillItemAnswer: { upsert: mocks.answerUpsert } } }));

import * as answers from "./[id]/items/[itemId]/answers/[questionId]/route";
import * as score from "./[id]/items/[itemId]/score/route";

const req = (method: string, body?: unknown) =>
  new NextRequest("http://localhost/x", { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const answerCtx = (questionId = "pbq_skill_1") => ({ params: Promise.resolve({ id: "p1", itemId: "i1", questionId }) });
const itemCtx = { params: Promise.resolve({ id: "p1", itemId: "i1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "u1", role: "MENTEE" });
  mocks.findOwnedCustomItem.mockResolvedValue({ id: "i1" });
  mocks.loadSkillMatrix.mockResolvedValue({ id: "m", name: "Skill definition", questions: [{ id: "pbq_skill_1", text: "When?", guidance: "g", order: 0 }] });
});

describe("answer route", () => {
  it("upserts one answer for an owned custom skill", async () => {
    const res = await answers.PUT(req("PUT", { answer: "When the month closes." }), answerCtx());
    expect(res.status).toBe(200);
    expect(mocks.findOwnedCustomItem).toHaveBeenCalledWith("p1", "i1", "u1");
    expect(mocks.answerUpsert).toHaveBeenCalledWith({
      where: { itemId_questionId: { itemId: "i1", questionId: "pbq_skill_1" } },
      create: { itemId: "i1", questionId: "pbq_skill_1", answer: "When the month closes." },
      update: { answer: "When the month closes." },
    });
  });

  it("returns 404 for someone else's skill and for a question outside the skill matrix", async () => {
    mocks.findOwnedCustomItem.mockResolvedValueOnce(null);
    expect((await answers.PUT(req("PUT", { answer: "x" }), answerCtx())).status).toBe(404);
    expect((await answers.PUT(req("PUT", { answer: "x" }), answerCtx("pbq_core_1"))).status).toBe(404);
    expect(mocks.answerUpsert).not.toHaveBeenCalled();
  });

  it("rejects an empty update", async () => {
    expect((await answers.PUT(req("PUT", {}), answerCtx())).status).toBe(400);
  });
});

describe("score route", () => {
  it("passes the client revision through", async () => {
    mocks.runItemScoring.mockResolvedValue({ applied: true, revision: 4, answers: [] });
    const res = await score.POST(req("POST", { revision: 4 }), itemCtx);
    expect(res.status).toBe(200);
    expect(mocks.runItemScoring).toHaveBeenCalledWith("p1", "i1", "u1", 4);
    expect((await res.json()).data).toEqual({ applied: true, revision: 4, answers: [] });
  });

  it("returns 404 for someone else's skill before scoring", async () => {
    mocks.findOwnedCustomItem.mockResolvedValue(null);
    expect((await score.POST(req("POST", { revision: 1 }), itemCtx)).status).toBe(404);
    expect(mocks.runItemScoring).not.toHaveBeenCalled();
  });

  it("maps the daily limit to 429 and a missing key to 503", async () => {
    const { LimitReachedError } = await import("@/lib/ai/usage");
    const { AiNotConfiguredError } = await import("@/lib/ai/config");
    mocks.runItemScoring.mockRejectedValueOnce(new LimitReachedError("score", new Date("2026-11-25T00:00:00Z")));
    expect((await score.POST(req("POST", { revision: 1 }), itemCtx)).status).toBe(429);
    mocks.runItemScoring.mockRejectedValueOnce(new AiNotConfiguredError());
    expect((await score.POST(req("POST", { revision: 1 }), itemCtx)).status).toBe(503);
  });

  it("rejects a missing revision", async () => {
    expect((await score.POST(req("POST", {}), itemCtx)).status).toBe(400);
  });
});
