import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  jobFindFirst: vi.fn(),
  jobCreate: vi.fn(),
  jobUpdate: vi.fn(),
  jobDelete: vi.fn(),
  answerCreateMany: vi.fn(),
  answerUpdate: vi.fn(),
  answerUpsert: vi.fn(),
  answerFindMany: vi.fn(),
  fileFindMany: vi.fn(),
  matrixFindFirst: vi.fn(),
  transaction: vi.fn(),
  scoreQuestions: vi.fn(),
  consumeAiUsage: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    skillJob: { findFirst: mocks.jobFindFirst, create: mocks.jobCreate, update: mocks.jobUpdate, delete: mocks.jobDelete },
    skillJobAnswer: { createMany: mocks.answerCreateMany, update: mocks.answerUpdate, upsert: mocks.answerUpsert, findMany: mocks.answerFindMany },
    skillJobFile: { findMany: mocks.fileFindMany },
    promptMatrix: { findFirst: mocks.matrixFindFirst },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/ai/claude", () => ({ scoreQuestions: mocks.scoreQuestions }));
vi.mock("@/lib/ai/usage", () => ({ consumeAiUsage: mocks.consumeAiUsage }));

import { JobNotFoundError } from "./errors";
import {
  activeFiles,
  createJob,
  deleteJob,
  jobQuestionContext,
  jobScoringBase,
  loadJobView,
  runJobScoring,
  saveJobAnswer,
  toFileView,
  toSkillView,
  updateJob,
} from "./jobs";
import { ANALYSIS_INTERRUPTED_MESSAGE, GENERATION_INTERRUPTED_MESSAGE } from "./staleness";

const NOW = new Date("2026-11-25T12:00:00Z");
const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60_000);
const MATRIX = {
  id: "pbm_skill_definition",
  name: "Skill definition",
  questions: [
    { id: "pbq_skill_1", text: "When should this skill be used?", guidance: "Triggers", order: 0 },
    { id: "pbq_skill_2", text: "What inputs will it receive?", guidance: "Inputs", order: 1 },
  ],
};
const fileRow = (over: Record<string, unknown> = {}) => ({
  id: "f1",
  jobId: "j1",
  fileName: "Q3 deck.pptx",
  assetName: "q3-deck.pptx",
  kind: "PPTX",
  mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  size: 2_000_000,
  sha256: "abc",
  analysis: "## Colours\n- #1F4E79",
  analysisStatus: "READY",
  analysisStartedAt: minutesAgo(30),
  analysisEdited: false,
  analysisError: null,
  deletedAt: null,
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
}) as never;
const skillRow = (over: Record<string, unknown> = {}) => ({
  id: "s1",
  jobId: "j1",
  order: 0,
  name: "board-deck",
  purpose: "Builds the deck.",
  fileIds: ["f1"],
  status: "READY",
  validationErrors: [],
  generationStartedAt: null,
  latestVersion: 2,
  createdAt: NOW,
  updatedAt: NOW,
  versions: [
    { version: 2, name: "board-deck", createdAt: NOW, assetFileIds: ["f1"] },
    { version: 1, name: "old-name", createdAt: minutesAgo(60), assetFileIds: [] },
  ],
  ...over,
}) as never;
const answerRow = (questionId: string, over: Record<string, unknown> = {}) => ({
  id: `a-${questionId}`,
  jobId: "j1",
  questionId,
  answer: "",
  score: 0,
  reason: null,
  notRelevant: false,
  scoredAt: null,
  ...over,
});
const jobRow = (over: Record<string, unknown> = {}) => ({
  id: "j1",
  userId: "u1",
  title: "Board update",
  description: "Every month I turn the numbers into a deck.",
  scoreRevision: 3,
  suggestedAt: null,
  createdAt: NOW,
  updatedAt: NOW,
  answers: [answerRow("pbq_skill_1", { answer: "Monthly", score: 3, reason: "Clear" }), answerRow("pbq_old")],
  files: [fileRow()],
  skills: [skillRow()],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.matrixFindFirst.mockResolvedValue(MATRIX);
  mocks.transaction.mockImplementation(async (ops: unknown[]) => ops);
});

describe("toFileView", () => {
  it("shows a fresh analysis as pending and an old one as interrupted (Review Focus 1)", () => {
    expect(toFileView(fileRow({ analysisStatus: "PENDING", analysisStartedAt: minutesAgo(1), analysis: null }), NOW)).toMatchObject({
      analysisStatus: "PENDING",
      analysisError: null,
    });
    expect(toFileView(fileRow({ analysisStatus: "PENDING", analysisStartedAt: minutesAgo(6), analysis: null }), NOW)).toMatchObject({
      analysisStatus: "FAILED",
      analysisError: ANALYSIS_INTERRUPTED_MESSAGE,
    });
  });

  it("marks files over 10 MB as not bundlable and serialises dates", () => {
    expect(toFileView(fileRow(), NOW)).toEqual({
      id: "f1",
      fileName: "Q3 deck.pptx",
      assetName: "q3-deck.pptx",
      kind: "PPTX",
      size: 2_000_000,
      createdAt: NOW.toISOString(),
      analysisStatus: "READY",
      analysis: "## Colours\n- #1F4E79",
      analysisEdited: false,
      analysisError: null,
      bundlable: true,
    });
    expect(toFileView(fileRow({ size: 10 * 1024 * 1024 + 1 }), NOW).bundlable).toBe(false);
    expect(toFileView(fileRow({ size: 10 * 1024 * 1024 }), NOW).bundlable).toBe(true);
  });
});

describe("toSkillView", () => {
  it("lists versions newest first with their asset counts", () => {
    expect(toSkillView(skillRow(), NOW)).toEqual({
      id: "s1",
      order: 0,
      name: "board-deck",
      purpose: "Builds the deck.",
      fileIds: ["f1"],
      status: "READY",
      validationErrors: [],
      latestVersion: 2,
      versions: [
        { version: 2, name: "board-deck", createdAt: NOW.toISOString(), assets: 1 },
        { version: 1, name: "old-name", createdAt: minutesAgo(60).toISOString(), assets: 0 },
      ],
    });
  });

  it("shows an interrupted generation as failed and retryable", () => {
    expect(toSkillView(skillRow({ status: "GENERATING", generationStartedAt: minutesAgo(11) }), NOW)).toMatchObject({
      status: "FAILED",
      validationErrors: [GENERATION_INTERRUPTED_MESSAGE],
    });
    expect(toSkillView(skillRow({ status: "GENERATING", generationStartedAt: minutesAgo(2) }), NOW).status).toBe("GENERATING");
  });
});

describe("loadJobView", () => {
  it("returns null when the job is not the caller's", async () => {
    mocks.jobFindFirst.mockResolvedValue(null);
    expect(await loadJobView("j1", "u2", NOW)).toBeNull();
    expect(mocks.jobFindFirst.mock.calls[0][0].where).toEqual({ id: "j1", userId: "u2" });
  });

  it("never reads bytes or facts, skips removed files, and keeps only active answers", async () => {
    mocks.jobFindFirst.mockResolvedValue(jobRow());
    const view = await loadJobView("j1", "u1", NOW);
    const include = mocks.jobFindFirst.mock.calls[0][0].include;
    expect(include.files).toEqual({ where: { deletedAt: null }, omit: { data: true, facts: true }, orderBy: { createdAt: "asc" } });
    expect(include.skills.orderBy).toEqual({ order: "asc" });
    expect(include.skills.include.versions).toEqual({
      select: { version: true, name: true, createdAt: true, assetFileIds: true },
      orderBy: { version: "desc" },
    });
    expect(view).toMatchObject({
      id: "j1",
      title: "Board update",
      scoreRevision: 3,
      updatedAt: NOW.toISOString(),
      suggestedAt: null,
      matrix: MATRIX,
      answers: [{ questionId: "pbq_skill_1", answer: "Monthly", score: 3, reason: "Clear", notRelevant: false }],
    });
    expect(view?.files).toHaveLength(1);
    expect(view?.skills[0].versions).toHaveLength(2);
  });
});

describe("create, update and delete", () => {
  it("creates a job titled from the description's first line when no title is given", async () => {
    mocks.jobCreate.mockResolvedValue({ id: "j9" });
    expect(await createJob("u1", { description: "  Monthly board update\nwith numbers" })).toBe("j9");
    expect(mocks.jobCreate).toHaveBeenCalledWith({
      data: { userId: "u1", title: "Monthly board update", description: "Monthly board update\nwith numbers" },
      select: { id: true },
    });
    await createJob("u1", {});
    expect(mocks.jobCreate.mock.calls[1][0].data).toEqual({ userId: "u1", title: "Untitled job", description: "" });
    await createJob("u1", { title: " My job ", description: "x" });
    expect(mocks.jobCreate.mock.calls[2][0].data.title).toBe("My job");
  });

  it("updates only the owner's job and returns the view", async () => {
    mocks.jobFindFirst.mockResolvedValueOnce({ id: "j1", title: "t", description: "d" }).mockResolvedValueOnce(jobRow({ title: "New" }));
    const view = await updateJob("j1", "u1", { title: "New" });
    expect(mocks.jobUpdate).toHaveBeenCalledWith({ where: { id: "j1" }, data: { title: "New" } });
    expect(view.title).toBe("New");
    mocks.jobFindFirst.mockResolvedValueOnce(null);
    await expect(updateJob("j1", "u2", { title: "x" })).rejects.toBeInstanceOf(JobNotFoundError);
  });

  it("deletes only the owner's job", async () => {
    mocks.jobFindFirst.mockResolvedValueOnce({ id: "j1", title: "t", description: "d" });
    await deleteJob("j1", "u1");
    expect(mocks.jobDelete).toHaveBeenCalledWith({ where: { id: "j1" } });
    mocks.jobFindFirst.mockResolvedValueOnce(null);
    await expect(deleteJob("j1", "u2")).rejects.toBeInstanceOf(JobNotFoundError);
  });
});

describe("jobScoringBase", () => {
  it("reads the title, description and the start of each ready analysis", () => {
    const base = jobScoringBase({ title: "Board update", description: "I make the deck." }, [
      { fileName: "deck.pptx", analysis: "a".repeat(2000), analysisStatus: "READY" },
      { fileName: "broken.pdf", analysis: "should not appear", analysisStatus: "FAILED" },
      { fileName: "pending.png", analysis: null, analysisStatus: "PENDING" },
    ]);
    expect(base.startsWith("Job: Board update\nI make the deck.")).toBe(true);
    expect(base).toContain(`File: deck.pptx\n${"a".repeat(1500)}`);
    expect(base).not.toContain("a".repeat(1501));
    expect(base).not.toContain("broken.pdf");
    expect(base).not.toContain("pending.png");
  });

  it("caps the whole base at 12 000 characters", () => {
    const files = Array.from({ length: 10 }, (_, i) => ({ fileName: `f${i}`, analysis: "b".repeat(1500), analysisStatus: "READY" }));
    expect(jobScoringBase({ title: "t", description: "c".repeat(5000) }, files)).toHaveLength(12_000);
  });
});

describe("runJobScoring", () => {
  it("scores the job with its files and applies the result when the revision is current", async () => {
    mocks.jobFindFirst
      .mockResolvedValueOnce(jobRow({ files: [{ fileName: "deck.pptx", analysis: "#1F4E79 headings", analysisStatus: "READY" }] }))
      .mockResolvedValueOnce({ scoreRevision: 3 })
      .mockResolvedValueOnce(jobRow());
    mocks.scoreQuestions.mockResolvedValue([{ questionId: "pbq_skill_2", score: 2, reason: "Partly" }]);
    const result = await runJobScoring("j1", "u1", 3);
    expect(mocks.answerCreateMany).toHaveBeenCalledWith({
      data: [
        { jobId: "j1", questionId: "pbq_skill_1" },
        { jobId: "j1", questionId: "pbq_skill_2" },
      ],
      skipDuplicates: true,
    });
    expect(mocks.consumeAiUsage).toHaveBeenCalledWith("u1", "score");
    expect(mocks.scoreQuestions.mock.calls[0][0]).toContain("#1F4E79 headings");
    expect(mocks.answerUpdate).toHaveBeenCalledWith({
      where: { jobId_questionId: { jobId: "j1", questionId: "pbq_skill_2" } },
      data: { score: 2, reason: "Partly", scoredAt: expect.any(Date) },
    });
    expect(mocks.jobUpdate).toHaveBeenCalledWith({ where: { id: "j1" }, data: { scoreRevision: 3 } });
    expect(result.applied).toBe(true);
  });

  it("does not apply a stale revision", async () => {
    mocks.jobFindFirst.mockResolvedValueOnce(jobRow()).mockResolvedValueOnce({ scoreRevision: 7 });
    mocks.scoreQuestions.mockResolvedValue([]);
    expect(await runJobScoring("j1", "u1", 3)).toMatchObject({ applied: false, revision: 7 });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("refuses someone else's job before spending a unit", async () => {
    mocks.jobFindFirst.mockResolvedValueOnce(null);
    await expect(runJobScoring("j1", "u2", 0)).rejects.toBeInstanceOf(JobNotFoundError);
    expect(mocks.consumeAiUsage).not.toHaveBeenCalled();
  });
});

describe("answers and context", () => {
  it("saves only the fields sent, and only for an active question", async () => {
    mocks.jobFindFirst.mockResolvedValue({ id: "j1", title: "t", description: "d" });
    expect(await saveJobAnswer("j1", "u1", "pbq_skill_1", { notRelevant: true })).toBe("saved");
    expect(mocks.answerUpsert).toHaveBeenCalledWith({
      where: { jobId_questionId: { jobId: "j1", questionId: "pbq_skill_1" } },
      create: { jobId: "j1", questionId: "pbq_skill_1", notRelevant: true },
      update: { notRelevant: true },
    });
    expect(await saveJobAnswer("j1", "u1", "pbq_core_1", { answer: "x" })).toBe("no-question");
    mocks.jobFindFirst.mockResolvedValue(null);
    await expect(saveJobAnswer("j1", "u2", "pbq_skill_1", { answer: "x" })).rejects.toBeInstanceOf(JobNotFoundError);
  });

  it("lists active files without bytes and builds the question context", async () => {
    mocks.fileFindMany.mockResolvedValue([fileRow()]);
    await activeFiles("j1");
    expect(mocks.fileFindMany).toHaveBeenCalledWith({ where: { jobId: "j1", deletedAt: null }, omit: { data: true, facts: true }, orderBy: { createdAt: "asc" } });
    mocks.answerFindMany.mockResolvedValue([answerRow("pbq_skill_1", { answer: "Monthly", score: 3 })]);
    expect(await jobQuestionContext("j1")).toEqual([
      { id: "pbq_skill_1", text: "When should this skill be used?", guidance: "Triggers", answer: "Monthly", score: 3, notRelevant: false },
      { id: "pbq_skill_2", text: "What inputs will it receive?", guidance: "Inputs", answer: "", score: 0, notRelevant: false },
    ]);
  });
});
