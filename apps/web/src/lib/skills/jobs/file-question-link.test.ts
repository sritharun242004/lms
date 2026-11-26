import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  jobFindFirst: vi.fn(),
  questionFindFirst: vi.fn(),
  fileCount: vi.fn(),
  fileFindMany: vi.fn(),
  fileCreate: vi.fn(),
  consumeAiUsage: vi.fn(),
  refundAiUsage: vi.fn(),
  readUpload: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    skillJob: { findFirst: mocks.jobFindFirst },
    skillJobQuestion: { findFirst: mocks.questionFindFirst },
    skillJobFile: { count: mocks.fileCount, findMany: mocks.fileFindMany, create: mocks.fileCreate },
    skillJobFileUpload: { count: async () => 0 },
  },
}));
vi.mock("@/lib/ai/usage", () => ({ consumeAiUsage: mocks.consumeAiUsage, refundAiUsage: mocks.refundAiUsage }));
vi.mock("@/lib/ai/claude", () => ({ analyseFile: vi.fn() }));
vi.mock("../files/extract", () => ({ readUpload: mocks.readUpload }));

import { QuestionNotFoundError } from "./errors";
import { assertTaskQuestion, storeJobFile } from "./files";

const NOW = new Date("2026-11-25T12:00:00Z");
const BYTES = new Uint8Array([1, 2, 3, 4]);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.jobFindFirst.mockResolvedValue({ id: "j1", title: "t", description: "d" });
  mocks.questionFindFirst.mockResolvedValue({ id: "q1" });
  mocks.fileCount.mockResolvedValue(0);
  mocks.fileFindMany.mockResolvedValue([]);
  mocks.readUpload.mockResolvedValue({ kind: "PNG", mimeType: "image/png", sha256: "abc", facts: null });
  mocks.fileCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    ...data, id: "f1", analysis: null, analysisEdited: false, analysisError: null, deletedAt: null, createdAt: NOW, updatedAt: NOW,
  }));
});

describe("files on a question", () => {
  it("accepts only a FIXED question of this task", async () => {
    await assertTaskQuestion("j1", "q1");
    expect(mocks.questionFindFirst).toHaveBeenCalledWith({ where: { id: "q1", jobId: "j1", kind: "FIXED" }, select: { id: true } });
    mocks.questionFindFirst.mockResolvedValue(null);
    await expect(assertTaskQuestion("j1", "p1")).rejects.toBeInstanceOf(QuestionNotFoundError);
  });

  it("stores the question id with the file", async () => {
    const view = await storeJobFile({ jobId: "j1", userId: "u1", fileName: "logo.png", bytes: BYTES, questionId: "q1" }, NOW);
    expect(mocks.fileCreate.mock.calls[0][0].data.questionId).toBe("q1");
    expect(view.questionId).toBe("q1");
  });

  it("checks the question before reading the bytes or spending a unit", async () => {
    mocks.questionFindFirst.mockResolvedValue(null);
    await expect(storeJobFile({ jobId: "j1", userId: "u1", fileName: "x.png", bytes: BYTES, questionId: "other" }, NOW)).rejects.toBeInstanceOf(
      QuestionNotFoundError,
    );
    expect(mocks.readUpload).not.toHaveBeenCalled();
    expect(mocks.consumeAiUsage).not.toHaveBeenCalled();
  });

  it("stores a general file without a question", async () => {
    await storeJobFile({ jobId: "j1", userId: "u1", fileName: "x.png", bytes: BYTES }, NOW);
    expect(mocks.questionFindFirst).not.toHaveBeenCalled();
    expect(mocks.fileCreate.mock.calls[0][0].data.questionId).toBeNull();
  });
});
