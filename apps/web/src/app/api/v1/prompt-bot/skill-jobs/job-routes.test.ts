import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  isAiConfigured: vi.fn(),
  createJob: vi.fn(),
  loadJobView: vi.fn(),
  updateJob: vi.fn(),
  deleteJob: vi.fn(),
  saveJobAnswer: vi.fn(),
  runJobScoring: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/ai/config", async (orig) => ({ ...(await orig<typeof import("@/lib/ai/config")>()), isAiConfigured: mocks.isAiConfigured }));
vi.mock("@/lib/ai/claude", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/skills/jobs/jobs", () => ({
  createJob: mocks.createJob,
  loadJobView: mocks.loadJobView,
  updateJob: mocks.updateJob,
  deleteJob: mocks.deleteJob,
  saveJobAnswer: mocks.saveJobAnswer,
  runJobScoring: mocks.runJobScoring,
}));

import { AiResponseError } from "@/lib/ai/errors";
import { LimitReachedError } from "@/lib/ai/usage";
import { JobNotFoundError } from "@/lib/skills/jobs/errors";
import * as answer from "./[id]/answers/[questionId]/route";
import * as job from "./[id]/route";
import * as score from "./[id]/score/route";
import * as jobs from "./route";

const req = (method: string, body?: unknown) =>
  new NextRequest("http://localhost/x", { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = { params: Promise.resolve({ id: "j1" }) };
const answerCtx = { params: Promise.resolve({ id: "j1", questionId: "pbq_skill_1" }) };
const VIEW = { id: "j1", title: "Board update" };
const code = async (res: Response) => (await res.json()).error.code;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "u1", role: "MENTEE" });
  mocks.isAiConfigured.mockReturnValue(true);
  mocks.loadJobView.mockResolvedValue(VIEW);
});

describe("POST /skill-jobs", () => {
  it("creates a job without the AI and answers 201 with its view", async () => {
    mocks.isAiConfigured.mockReturnValue(false);
    mocks.createJob.mockResolvedValue("j1");
    const res = await jobs.POST(req("POST", { title: "Board update", description: "I make the deck." }));
    expect(res.status).toBe(201);
    expect((await res.json()).data).toEqual(VIEW);
    expect(mocks.createJob).toHaveBeenCalledWith("u1", { title: "Board update", description: "I make the deck." });
    expect(mocks.loadJobView).toHaveBeenCalledWith("j1", "u1");
  });

  it("validates the body and requires a session", async () => {
    expect((await jobs.POST(req("POST", { title: "" }))).status).toBe(400);
    expect((await jobs.POST(req("POST", { description: "x".repeat(20_001) }))).status).toBe(400);
    expect((await jobs.POST(req("POST", { title: "t".repeat(121) }))).status).toBe(400);
    mocks.getCurrentUser.mockResolvedValue(null);
    expect((await jobs.POST(req("POST", {}))).status).toBe(401);
    expect(mocks.createJob).not.toHaveBeenCalled();
  });
});

describe("/skill-jobs/[id]", () => {
  it("returns the owner's view and 404 for anyone else", async () => {
    const res = await job.GET(req("GET"), ctx);
    expect(res.status).toBe(200);
    expect(mocks.loadJobView).toHaveBeenCalledWith("j1", "u1");
    mocks.loadJobView.mockResolvedValue(null);
    const missing = await job.GET(req("GET"), ctx);
    expect(missing.status).toBe(404);
    expect(await code(missing)).toBe("NOT_FOUND");
  });

  it("patches the title or description and maps ownership to 404", async () => {
    mocks.updateJob.mockResolvedValue({ ...VIEW, title: "New" });
    const res = await job.PATCH(req("PATCH", { title: "New" }), ctx);
    expect(res.status).toBe(200);
    expect(mocks.updateJob).toHaveBeenCalledWith("j1", "u1", { title: "New" });
    expect((await job.PATCH(req("PATCH", {}), ctx)).status).toBe(400);
    expect((await job.PATCH(req("PATCH", { description: "x".repeat(20_001) }), ctx)).status).toBe(400);
    mocks.updateJob.mockRejectedValue(new JobNotFoundError());
    expect((await job.PATCH(req("PATCH", { description: "d" }), ctx)).status).toBe(404);
  });

  it("deletes the owner's job", async () => {
    const res = await job.DELETE(req("DELETE"), ctx);
    expect((await res.json()).data).toEqual({ deleted: true });
    expect(mocks.deleteJob).toHaveBeenCalledWith("j1", "u1");
    mocks.deleteJob.mockRejectedValue(new JobNotFoundError());
    expect((await job.DELETE(req("DELETE"), ctx)).status).toBe(404);
  });

  it("rethrows errors that are not ours", async () => {
    mocks.deleteJob.mockRejectedValue(new Error("db down"));
    await expect(job.DELETE(req("DELETE"), ctx)).rejects.toThrow("db down");
  });
});

describe("PUT /skill-jobs/[id]/answers/[questionId]", () => {
  it("saves an answer, 404s an unknown question or job, and validates the body", async () => {
    mocks.saveJobAnswer.mockResolvedValue("saved");
    const res = await answer.PUT(req("PUT", { answer: "Monthly" }), answerCtx);
    expect((await res.json()).data).toEqual({ saved: true });
    expect(mocks.saveJobAnswer).toHaveBeenCalledWith("j1", "u1", "pbq_skill_1", { answer: "Monthly" });
    mocks.saveJobAnswer.mockResolvedValue("no-question");
    const unknown = await answer.PUT(req("PUT", { answer: "x" }), answerCtx);
    expect(unknown.status).toBe(404);
    expect((await unknown.json()).error.message).toBe("Question not found");
    mocks.saveJobAnswer.mockRejectedValue(new JobNotFoundError());
    expect((await answer.PUT(req("PUT", { answer: "x" }), answerCtx)).status).toBe(404);
    expect((await answer.PUT(req("PUT", {}), answerCtx)).status).toBe(400);
  });
});

describe("POST /skill-jobs/[id]/score", () => {
  it("scores and returns the reply", async () => {
    mocks.runJobScoring.mockResolvedValue({ applied: true, revision: 2, answers: [] });
    const res = await score.POST(req("POST", { revision: 2 }), ctx);
    expect((await res.json()).data).toEqual({ applied: true, revision: 2, answers: [] });
    expect(mocks.runJobScoring).toHaveBeenCalledWith("j1", "u1", 2);
  });

  it("maps 503 up front, then 400, 404, 429 and 502", async () => {
    mocks.isAiConfigured.mockReturnValue(false);
    expect((await score.POST(req("POST", { revision: 1 }), ctx)).status).toBe(503);
    expect(mocks.runJobScoring).not.toHaveBeenCalled();
    mocks.isAiConfigured.mockReturnValue(true);
    expect((await score.POST(req("POST", { revision: -1 }), ctx)).status).toBe(400);
    mocks.runJobScoring.mockRejectedValueOnce(new JobNotFoundError());
    expect((await score.POST(req("POST", { revision: 1 }), ctx)).status).toBe(404);
    mocks.runJobScoring.mockRejectedValueOnce(new LimitReachedError("score", new Date("2026-11-26T00:00:00Z")));
    expect((await score.POST(req("POST", { revision: 1 }), ctx)).status).toBe(429);
    mocks.runJobScoring.mockRejectedValueOnce(new AiResponseError("bad"));
    expect((await score.POST(req("POST", { revision: 1 }), ctx)).status).toBe(502);
  });
});

describe("oversized JSON bodies", () => {
  const big = { description: "x".repeat(70 * 1024) };
  const bigReq = (method: string) =>
    new NextRequest("http://localhost/x", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(big) });

  it("answers 413 before parsing a body over 64 KB on every JSON route", async () => {
    for (const res of [
      await jobs.POST(bigReq("POST")),
      await job.PATCH(bigReq("PATCH"), ctx),
      await answer.PUT(bigReq("PUT"), answerCtx),
      await score.POST(bigReq("POST"), ctx),
    ]) {
      expect(res.status).toBe(413);
      expect(await code(res)).toBe("PAYLOAD_TOO_LARGE");
    }
    expect(mocks.createJob).not.toHaveBeenCalled();
    expect(mocks.updateJob).not.toHaveBeenCalled();
  });
});
