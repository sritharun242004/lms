import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  jobFindFirst: vi.fn(),
  questionFindMany: vi.fn(),
  questionFindFirst: vi.fn(),
  questionUpdateMany: vi.fn(),
  matrixFindFirst: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    skillJob: { findFirst: mocks.jobFindFirst },
    skillJobQuestion: { findMany: mocks.questionFindMany, findFirst: mocks.questionFindFirst, updateMany: mocks.questionUpdateMany },
    promptMatrix: { findFirst: mocks.matrixFindFirst },
  },
}));
vi.mock("@/lib/ai/claude", () => ({ scoreQuestions: vi.fn() }));
vi.mock("@/lib/ai/usage", () => ({ consumeAiUsage: vi.fn() }));

import { JobNotFoundError } from "./errors";
import { jobPerUseInputs, jobQuestionContext, loadJobView, questionOrder, saveJobAnswer, toQuestionAnswer, toQuestionView } from "./jobs";

const NOW = new Date("2026-11-25T12:00:00Z");
const q = (over: Record<string, unknown> = {}) => ({
  id: "q1", jobId: "j1", order: 0, text: "Which template do you start from?", guidance: "Name the file.", wantsFiles: true,
  fileHint: "TEMPLATE", fileNote: "Upload your template.", source: "AI", kind: "FIXED", required: true, legacyQuestionId: null,
  answer: "The 2026 deck", score: 3, reason: "Clear", scoredAt: NOW, createdAt: NOW, updatedAt: NOW, ...over,
});
const perUse = q({ id: "p1", order: 6, kind: "PER_USE", text: "Client name", guidance: "e.g. Acme Ltd", wantsFiles: false, fileHint: null, fileNote: "", answer: "hidden", score: 0, reason: null });
const jobRow = (over: Record<string, unknown> = {}) => ({
  id: "j1", userId: "u1", title: "Client SLA", description: "d", scoreRevision: 0, suggestedAt: null, createdAt: NOW, updatedAt: NOW,
  questionsGeneratedAt: NOW, outputType: "client SLA document",
  questions: [q(), perUse],
  files: [{ id: "f1", jobId: "j1", fileName: "sla.docx", assetName: "sla.docx", kind: "DOCX", mimeType: "x", size: 10, sha256: "a",
    analysis: null, analysisStatus: "READY", analysisStartedAt: null, analysisEdited: false, analysisError: null, deletedAt: null,
    createdAt: NOW, updatedAt: NOW, questionId: "q1" }],
  skills: [],
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe("question views", () => {
  it("maps both kinds and never exposes the answer columns on the question", () => {
    expect(toQuestionView(q() as never)).toEqual({
      id: "q1", order: 0, kind: "FIXED", text: "Which template do you start from?", guidance: "Name the file.", required: true,
      wantsFiles: true, fileHint: "TEMPLATE", fileNote: "Upload your template.", source: "AI",
    });
    expect(toQuestionAnswer(q() as never)).toEqual({ questionId: "q1", answer: "The 2026 deck", score: 3, reason: "Clear", notRelevant: false });
    expect(questionOrder).toEqual([{ order: "asc" }, { createdAt: "asc" }]);
  });
});

describe("loadJobView", () => {
  it("returns questions of both kinds, answers of FIXED questions only, and files' question ids", async () => {
    mocks.jobFindFirst.mockResolvedValue(jobRow());
    const view = await loadJobView("j1", "u1", NOW);
    const args = mocks.jobFindFirst.mock.calls[0][0];
    expect(args.where).toEqual({ id: "j1", userId: "u1" });
    expect(args.include.questions).toEqual({ orderBy: questionOrder });
    expect(args.include.files.omit).toEqual({ data: true, facts: true });
    expect(args.include.answers).toBeUndefined();
    expect(mocks.matrixFindFirst).not.toHaveBeenCalled();
    expect(view?.questions.map((x) => [x.id, x.kind])).toEqual([["q1", "FIXED"], ["p1", "PER_USE"]]);
    expect(view?.answers).toEqual([{ questionId: "q1", answer: "The 2026 deck", score: 3, reason: "Clear", notRelevant: false }]);
    expect(view?.outputType).toBe("client SLA document");
    expect(view?.questionsGeneratedAt).toBe(NOW.toISOString());
    expect(view?.files[0].questionId).toBe("q1");
    expect(view?.matrix.questions).toEqual([{ id: "q1", text: "Which template do you start from?", guidance: "Name the file.", order: 0 }]);
  });

  it("shows a job without questions as not written yet", async () => {
    mocks.jobFindFirst.mockResolvedValue(jobRow({ questions: [], questionsGeneratedAt: null, outputType: null, files: [] }));
    expect(await loadJobView("j1", "u1", NOW)).toMatchObject({ questions: [], answers: [], questionsGeneratedAt: null, outputType: null });
  });
});

describe("saveJobAnswer", () => {
  beforeEach(() => mocks.jobFindFirst.mockResolvedValue({ id: "j1", title: "t", description: "d" }));

  it("writes the answer to the FIXED question row of this task", async () => {
    mocks.questionUpdateMany.mockResolvedValue({ count: 1 });
    expect(await saveJobAnswer("j1", "u1", "q1", { answer: "x", notRelevant: true })).toBe("saved");
    expect(mocks.questionUpdateMany).toHaveBeenCalledWith({ where: { id: "q1", jobId: "j1", kind: "FIXED" }, data: { answer: "x" } });
  });

  it("refuses a per-use or unknown question", async () => {
    mocks.questionUpdateMany.mockResolvedValue({ count: 0 });
    expect(await saveJobAnswer("j1", "u1", "p1", { answer: "x" })).toBe("no-question");
  });

  it("ignores notRelevant but still checks the question exists", async () => {
    mocks.questionFindFirst.mockResolvedValueOnce({ id: "q1" }).mockResolvedValueOnce(null);
    expect(await saveJobAnswer("j1", "u1", "q1", { notRelevant: true })).toBe("saved");
    expect(mocks.questionFindFirst.mock.calls[0][0].where).toEqual({ id: "q1", jobId: "j1", kind: "FIXED" });
    expect(await saveJobAnswer("j1", "u1", "p1", { notRelevant: false })).toBe("no-question");
    expect(mocks.questionUpdateMany).not.toHaveBeenCalled();
  });

  it("refuses someone else's task", async () => {
    mocks.jobFindFirst.mockResolvedValue(null);
    await expect(saveJobAnswer("j1", "u2", "q1", { answer: "x" })).rejects.toBeInstanceOf(JobNotFoundError);
  });
});

describe("prompt context", () => {
  it("pairs FIXED rows with their answers and lists PER_USE rows as inputs", async () => {
    mocks.questionFindMany.mockResolvedValueOnce([q()]).mockResolvedValueOnce([perUse, q({ id: "p2", kind: "PER_USE", text: "Deal value", guidance: "", required: false })]);
    expect(await jobQuestionContext("j1")).toEqual([
      { id: "q1", text: "Which template do you start from?", guidance: "Name the file.", answer: "The 2026 deck", score: 3, notRelevant: false },
    ]);
    expect(mocks.questionFindMany.mock.calls[0][0]).toEqual({ where: { jobId: "j1", kind: "FIXED" }, orderBy: questionOrder });
    expect(await jobPerUseInputs("j1")).toEqual([
      { label: "Client name", hint: "e.g. Acme Ltd", required: true },
      { label: "Deal value", hint: "", required: false },
    ]);
    expect(mocks.questionFindMany.mock.calls[1][0].where).toEqual({ jobId: "j1", kind: "PER_USE" });
  });
});
