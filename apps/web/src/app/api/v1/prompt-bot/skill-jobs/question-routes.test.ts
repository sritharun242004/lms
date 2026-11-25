import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  isAiConfigured: vi.fn(),
  enhanceTask: vi.fn(),
  generateQuestionsForTask: vi.fn(),
  addQuestion: vi.fn(),
  updateQuestion: vi.fn(),
  deleteQuestion: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/ai/config", async (orig) => ({ ...(await orig<typeof import("@/lib/ai/config")>()), isAiConfigured: mocks.isAiConfigured }));
vi.mock("@/lib/ai/claude", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/skills/jobs/enhance", () => ({ enhanceTask: mocks.enhanceTask }));
vi.mock("@/lib/skills/jobs/task-questions", () => ({
  generateQuestionsForTask: mocks.generateQuestionsForTask,
  addQuestion: mocks.addQuestion,
  updateQuestion: mocks.updateQuestion,
  deleteQuestion: mocks.deleteQuestion,
}));

import { AiResponseError } from "@/lib/ai/errors";
import { LimitReachedError } from "@/lib/ai/usage";
import { DescriptionTooShortError, EnhanceInputTooShortError, JobNotFoundError, QuestionNotFoundError, TooManyQuestionsError } from "@/lib/skills/jobs/errors";
import * as enhance from "./[id]/enhance/route";
import * as one from "./[id]/questions/[questionId]/route";
import * as generate from "./[id]/questions/generate/route";
import * as questions from "./[id]/questions/route";

const ctx = { params: Promise.resolve({ id: "j1" }) };
const qctx = { params: Promise.resolve({ id: "j1", questionId: "q1" }) };
const req = (method: string, body?: unknown) =>
  new NextRequest("http://localhost/x", { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const result = async (res: Response) => ({ status: res.status, ...(await res.json()) });
const QV = { id: "q1", kind: "FIXED", text: "Q?", source: "USER" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "u1", role: "MENTEE" });
  mocks.isAiConfigured.mockReturnValue(true);
  mocks.enhanceTask.mockResolvedValue({ brief: "## Purpose" });
  mocks.generateQuestionsForTask.mockResolvedValue({ id: "j1", questions: [] });
  mocks.addQuestion.mockResolvedValue(QV);
  mocks.updateQuestion.mockResolvedValue(QV);
});

describe("every new route needs a session", () => {
  it("answers 401 without one", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    for (const res of [
      await enhance.POST(req("POST", { description: "a b c d e" }), ctx),
      await generate.POST(req("POST"), ctx),
      await questions.POST(req("POST", { text: "Q?" }), ctx),
      await one.PATCH(req("PATCH", { text: "Q?" }), qctx),
      await one.DELETE(req("DELETE"), qctx),
    ]) {
      expect(await result(res)).toMatchObject({ status: 401, error: { code: "UNAUTHORIZED", message: "Authentication required" } });
    }
  });
});

describe("POST /:id/enhance", () => {
  it("returns the brief for the text in the box", async () => {
    expect(await result(await enhance.POST(req("POST", { description: "one two three four five" }), ctx))).toEqual({
      status: 200, success: true, data: { brief: "## Purpose" },
    });
    expect(mocks.enhanceTask).toHaveBeenCalledWith("j1", "u1", "one two three four five");
  });

  it("answers 503 before any work, and 400/404/429/502 from the layers below", async () => {
    mocks.isAiConfigured.mockReturnValueOnce(false);
    expect((await result(await enhance.POST(req("POST", { description: "x" }), ctx))).error.code).toBe("AI_NOT_CONFIGURED");
    expect(mocks.enhanceTask).not.toHaveBeenCalled();
    expect((await enhance.POST(req("POST", {}), ctx)).status).toBe(400);
    expect((await enhance.POST(req("POST", { description: "x".repeat(20_001) }), ctx)).status).toBe(400);
    mocks.enhanceTask.mockRejectedValueOnce(new EnhanceInputTooShortError());
    expect(await result(await enhance.POST(req("POST", { description: "a b" }), ctx))).toMatchObject({
      status: 400, error: { code: "VALIDATION_ERROR", message: "Write at least 5 words about the task first." },
    });
    mocks.enhanceTask.mockRejectedValueOnce(new JobNotFoundError());
    expect((await enhance.POST(req("POST", { description: "a b c d e" }), ctx)).status).toBe(404);
    mocks.enhanceTask.mockRejectedValueOnce(new LimitReachedError("skill_enhance", new Date("2026-11-26T00:00:00Z")));
    expect(await result(await enhance.POST(req("POST", { description: "a b c d e" }), ctx))).toMatchObject({
      status: 429, error: { code: "LIMIT_REACHED", details: { feature: ["skill_enhance"] } },
    });
    mocks.enhanceTask.mockRejectedValueOnce(new AiResponseError("bad"));
    expect((await enhance.POST(req("POST", { description: "a b c d e" }), ctx)).status).toBe(502);
  });
});

describe("POST /:id/questions/generate", () => {
  it("writes the questions and returns the view", async () => {
    expect(await result(await generate.POST(req("POST"), ctx))).toMatchObject({ status: 200, data: { id: "j1" } });
    expect(mocks.generateQuestionsForTask).toHaveBeenCalledWith("j1", "u1");
  });

  it("answers 503 first, 400 for a short description and 404 for someone else's task", async () => {
    mocks.isAiConfigured.mockReturnValueOnce(false);
    expect((await generate.POST(req("POST"), ctx)).status).toBe(503);
    expect(mocks.generateQuestionsForTask).not.toHaveBeenCalled();
    mocks.generateQuestionsForTask.mockRejectedValueOnce(new DescriptionTooShortError(312));
    expect(await result(await generate.POST(req("POST"), ctx))).toMatchObject({
      status: 400, error: { code: "DESCRIPTION_TOO_SHORT", message: "Add a bit more detail — at least 500 characters (312/500)." },
    });
    mocks.generateQuestionsForTask.mockRejectedValueOnce(new JobNotFoundError());
    expect((await generate.POST(req("POST"), ctx)).status).toBe(404);
  });
});

describe("POST /:id/questions", () => {
  it("adds a question with 201", async () => {
    const body = { text: "Q?", guidance: "g", wantsFiles: true, fileHint: "BRAND", fileNote: "Logo" };
    expect(await result(await questions.POST(req("POST", body), ctx))).toEqual({ status: 201, success: true, data: QV });
    expect(mocks.addQuestion).toHaveBeenCalledWith("j1", "u1", body);
  });

  it("validates the body", async () => {
    for (const body of [
      {}, { text: "" }, { text: "   " }, { text: "x".repeat(301) }, { text: "x".repeat(121), kind: "PER_USE" }, { text: "Q?", kind: "SOMETIMES" },
      { text: "Q?", fileHint: "LOGO" }, { text: "Q?", guidance: "g".repeat(301) }, { text: "Q?", fileNote: "n".repeat(121) }, { text: "Q?", required: "yes" },
    ]) {
      expect(await result(await questions.POST(req("POST", body), ctx))).toMatchObject({ status: 400, error: { code: "VALIDATION_ERROR" } });
    }
    expect((await questions.POST(req("POST", { text: "x".repeat(120), kind: "PER_USE" }), ctx)).status).toBe(201);
    expect(mocks.addQuestion).toHaveBeenCalledTimes(1);
  });

  it("answers 409 when the list is full and 404 for someone else's task", async () => {
    mocks.addQuestion.mockRejectedValueOnce(new TooManyQuestionsError("PER_USE"));
    expect(await result(await questions.POST(req("POST", { text: "Client", kind: "PER_USE" }), ctx))).toMatchObject({
      status: 409, error: { code: "TOO_MANY_QUESTIONS", message: "A task can have at most 15 inputs Claude asks for each time. Remove one to add another." },
    });
    mocks.addQuestion.mockRejectedValueOnce(new JobNotFoundError());
    expect((await questions.POST(req("POST", { text: "Q?" }), ctx)).status).toBe(404);
  });
});

describe("PATCH and DELETE /:id/questions/:questionId", () => {
  it("edits with at least one field", async () => {
    expect(await result(await one.PATCH(req("PATCH", { kind: "PER_USE" }), qctx))).toMatchObject({ status: 200, data: QV });
    expect(mocks.updateQuestion).toHaveBeenCalledWith("j1", "u1", "q1", { kind: "PER_USE" });
    expect((await one.PATCH(req("PATCH", {}), qctx)).status).toBe(400);
    expect((await one.PATCH(req("PATCH", { text: "" }), qctx)).status).toBe(400);
    expect((await one.PATCH(req("PATCH", { text: "x".repeat(121), kind: "PER_USE" }), qctx)).status).toBe(400);
    expect((await one.PATCH(req("PATCH", { fileHint: null }), qctx)).status).toBe(200);
  });

  it("maps 404 Question not found and 409", async () => {
    mocks.updateQuestion.mockRejectedValueOnce(new QuestionNotFoundError());
    expect(await result(await one.PATCH(req("PATCH", { text: "Q?" }), qctx))).toMatchObject({ status: 404, error: { code: "NOT_FOUND", message: "Question not found" } });
    mocks.updateQuestion.mockRejectedValueOnce(new TooManyQuestionsError("FIXED"));
    expect((await one.PATCH(req("PATCH", { kind: "FIXED" }), qctx)).status).toBe(409);
  });

  it("deletes", async () => {
    expect(await result(await one.DELETE(req("DELETE"), qctx))).toEqual({ status: 200, success: true, data: { deleted: true } });
    expect(mocks.deleteQuestion).toHaveBeenCalledWith("j1", "u1", "q1");
    mocks.deleteQuestion.mockRejectedValueOnce(new QuestionNotFoundError());
    expect((await one.DELETE(req("DELETE"), qctx)).status).toBe(404);
  });
});
