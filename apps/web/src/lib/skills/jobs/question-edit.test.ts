import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  jobFindFirst: vi.fn(),
  qCount: vi.fn(),
  qAggregate: vi.fn(),
  qCreate: vi.fn(),
  qFindFirst: vi.fn(),
  qUpdate: vi.fn(),
  qDeleteMany: vi.fn(),
  fileUpdateMany: vi.fn((args: unknown) => ({ op: "file.updateMany", args })),
  transaction: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    skillJob: { findFirst: mocks.jobFindFirst },
    skillJobQuestion: { count: mocks.qCount, aggregate: mocks.qAggregate, create: mocks.qCreate, findFirst: mocks.qFindFirst, update: mocks.qUpdate, deleteMany: mocks.qDeleteMany },
    skillJobFile: { updateMany: mocks.fileUpdateMany },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/ai/claude", () => ({ writeTaskQuestions: vi.fn(), scoreQuestions: vi.fn() }));
vi.mock("@/lib/ai/usage", () => ({ consumeAiUsage: vi.fn() }));

import { JobNotFoundError, PerUseLabelTooLongError, QuestionNotFoundError, TooManyQuestionsError } from "./errors";
import { addQuestion, deleteQuestion, updateQuestion } from "./task-questions";

const NOW = new Date("2026-11-25T12:00:00Z");
const row = (over: Record<string, unknown> = {}) => ({
  id: "q1", jobId: "j1", order: 2, text: "Which template?", guidance: "Name it.", wantsFiles: true, fileHint: "TEMPLATE", fileNote: "Upload it.",
  source: "AI", kind: "FIXED", required: true, legacyQuestionId: null, answer: "The deck", score: 3, reason: null, scoredAt: null,
  createdAt: NOW, updatedAt: NOW, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.jobFindFirst.mockResolvedValue({ id: "j1", title: "t", description: "d" });
  mocks.qCount.mockResolvedValue(0);
  mocks.qAggregate.mockResolvedValue({ _max: { order: 6 } });
  mocks.qCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => row({ id: "new", ...data }));
  mocks.qUpdate.mockImplementation((args: { data: Record<string, unknown> }) => ({ op: "q.update", args, then: undefined }));
  mocks.transaction.mockImplementation(async (ops: unknown[]) => [row({ kind: "PER_USE", wantsFiles: false, fileHint: null, fileNote: "" }), { count: 2 }]);
});

describe("addQuestion", () => {
  it("adds the person's own fixed question after the others", async () => {
    const view = await addQuestion("j1", "u1", { text: " My question? ", guidance: "g", wantsFiles: true, fileHint: "BRAND", fileNote: "Logo" });
    expect(mocks.qCount).toHaveBeenCalledWith({ where: { jobId: "j1", kind: "FIXED" } });
    expect(mocks.qCreate.mock.calls[0][0].data).toEqual({
      jobId: "j1", order: 7, kind: "FIXED", source: "USER", text: "My question?", guidance: "g", required: true,
      wantsFiles: true, fileHint: "BRAND", fileNote: "Logo",
    });
    expect(view).toMatchObject({ id: "new", source: "USER", kind: "FIXED", fileHint: "BRAND" });
  });

  it("adds a per-use input that never takes files", async () => {
    mocks.qAggregate.mockResolvedValue({ _max: { order: null } });
    await addQuestion("j1", "u1", { text: "Client name", kind: "PER_USE", required: false, wantsFiles: true, fileHint: "INPUT", fileNote: "x" });
    expect(mocks.qCreate.mock.calls[0][0].data).toMatchObject({ order: 0, kind: "PER_USE", required: false, wantsFiles: false, fileHint: null, fileNote: "" });
  });

  it("clears the hint and note when files are not highlighted", async () => {
    await addQuestion("j1", "u1", { text: "Q?", wantsFiles: false, fileHint: "BRAND", fileNote: "x" });
    expect(mocks.qCreate.mock.calls[0][0].data).toMatchObject({ wantsFiles: false, fileHint: null, fileNote: "" });
  });

  it("refuses a full list per kind and someone else's task", async () => {
    mocks.qCount.mockResolvedValue(12);
    await expect(addQuestion("j1", "u1", { text: "Q?" })).rejects.toEqual(new TooManyQuestionsError("FIXED"));
    mocks.qCount.mockResolvedValue(15);
    await expect(addQuestion("j1", "u1", { text: "X", kind: "PER_USE" })).rejects.toMatchObject({ kind: "PER_USE" });
    mocks.qCount.mockResolvedValue(14);
    await expect(addQuestion("j1", "u1", { text: "X", kind: "PER_USE" })).resolves.toBeTruthy();
    mocks.jobFindFirst.mockResolvedValue(null);
    await expect(addQuestion("j1", "u2", { text: "Q?" })).rejects.toBeInstanceOf(JobNotFoundError);
    expect(mocks.qCreate).toHaveBeenCalledTimes(1);
  });
});

describe("updateQuestion", () => {
  it("edits the text and keeps the answer", async () => {
    mocks.qFindFirst.mockResolvedValue(row());
    mocks.qUpdate.mockResolvedValue(row({ text: "New?" }));
    const view = await updateQuestion("j1", "u1", "q1", { text: " New? " });
    expect(mocks.qFindFirst.mock.calls[0][0].where).toEqual({ id: "q1", jobId: "j1" });
    expect(mocks.qUpdate.mock.calls[0][0]).toEqual({
      where: { id: "q1" },
      data: { text: "New?", guidance: "Name it.", kind: "FIXED", required: true, wantsFiles: true, fileHint: "TEMPLATE", fileNote: "Upload it." },
    });
    expect(view.text).toBe("New?");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("clears the hint and note when files are switched off", async () => {
    mocks.qFindFirst.mockResolvedValue(row());
    mocks.qUpdate.mockResolvedValue(row());
    await updateQuestion("j1", "u1", "q1", { wantsFiles: false });
    expect(mocks.qUpdate.mock.calls[0][0].data).toMatchObject({ wantsFiles: false, fileHint: null, fileNote: "" });
  });

  it("moves a fixed question to per-use and detaches its files in one transaction", async () => {
    mocks.qFindFirst.mockResolvedValue(row());
    const view = await updateQuestion("j1", "u1", "q1", { kind: "PER_USE" });
    expect(mocks.qCount).toHaveBeenCalledWith({ where: { jobId: "j1", kind: "PER_USE" } });
    const ops = mocks.transaction.mock.calls[0][0];
    expect(ops[0].args).toEqual({
      where: { id: "q1" },
      data: { text: "Which template?", guidance: "Name it.", kind: "PER_USE", required: true, wantsFiles: false, fileHint: null, fileNote: "" },
    });
    expect(ops[1].args).toEqual({ where: { jobId: "j1", questionId: "q1" }, data: { questionId: null } });
    expect(view.kind).toBe("PER_USE");
  });

  it("moves a per-use input to answer now as a required fixed question", async () => {
    mocks.qFindFirst.mockResolvedValue(row({ kind: "PER_USE", required: false, wantsFiles: false, fileHint: null, fileNote: "" }));
    mocks.qUpdate.mockResolvedValue(row());
    await updateQuestion("j1", "u1", "q1", { kind: "FIXED" });
    expect(mocks.qUpdate.mock.calls[0][0].data).toMatchObject({ kind: "FIXED", required: true });
    expect(mocks.fileUpdateMany).not.toHaveBeenCalled();
  });

  it("refuses a per-use label over 120 characters", async () => {
    mocks.qFindFirst.mockResolvedValue(row({ kind: "PER_USE", wantsFiles: false, fileHint: null, fileNote: "" }));
    await expect(updateQuestion("j1", "u1", "q1", { text: "x".repeat(121) })).rejects.toBeInstanceOf(PerUseLabelTooLongError);
    expect(mocks.qUpdate).not.toHaveBeenCalled();
  });

  it("toggles required on a per-use input", async () => {
    mocks.qFindFirst.mockResolvedValue(row({ kind: "PER_USE", wantsFiles: false, fileHint: null, fileNote: "" }));
    mocks.qUpdate.mockResolvedValue(row({ kind: "PER_USE", required: false }));
    expect((await updateQuestion("j1", "u1", "q1", { required: false })).required).toBe(false);
    expect(mocks.qUpdate.mock.calls[0][0].data.required).toBe(false);
  });

  it("refuses a move into a full list, an unknown question and someone else's task", async () => {
    mocks.qFindFirst.mockResolvedValue(row());
    mocks.qCount.mockResolvedValue(15);
    await expect(updateQuestion("j1", "u1", "q1", { kind: "PER_USE" })).rejects.toMatchObject({ kind: "PER_USE" });
    mocks.qFindFirst.mockResolvedValue(null);
    await expect(updateQuestion("j1", "u1", "q9", { text: "x" })).rejects.toBeInstanceOf(QuestionNotFoundError);
    mocks.jobFindFirst.mockResolvedValue(null);
    await expect(updateQuestion("j1", "u2", "q1", { text: "x" })).rejects.toBeInstanceOf(JobNotFoundError);
    expect(mocks.qUpdate).not.toHaveBeenCalled();
  });
});

describe("deleteQuestion", () => {
  it("deletes only this task's question; the foreign key makes its files general", async () => {
    mocks.qDeleteMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    await deleteQuestion("j1", "u1", "q1");
    expect(mocks.qDeleteMany).toHaveBeenCalledWith({ where: { id: "q1", jobId: "j1" } });
    await expect(deleteQuestion("j1", "u1", "q9")).rejects.toBeInstanceOf(QuestionNotFoundError);
    mocks.jobFindFirst.mockResolvedValue(null);
    await expect(deleteQuestion("j1", "u2", "q1")).rejects.toBeInstanceOf(JobNotFoundError);
  });
});
