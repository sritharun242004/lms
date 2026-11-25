import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  jobFindFirst: vi.fn(),
  jobCreate: vi.fn(),
  jobUpdate: vi.fn(),
  jobUpdateMany: vi.fn(),
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
    skillJob: { findFirst: mocks.jobFindFirst, create: mocks.jobCreate, update: mocks.jobUpdate, updateMany: mocks.jobUpdateMany, delete: mocks.jobDelete },
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
  loadJobView,
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
  questionId: null,
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
  role: "MAIN",
  label: "Board deck",
  focus: "",
  step: "",
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
  questionsGeneratedAt: null,
  outputType: null,
  company: "",
  pluginName: null,
  pluginDisplayName: null,
  pluginStatus: "DRAFT",
  pluginValidationErrors: [],
  pluginGenerationStartedAt: null,
  pluginLatestVersion: 0,
  pluginVersions: [],
  createdAt: NOW,
  updatedAt: NOW,
  questions: [],
  answers: [answerRow("pbq_skill_1", { answer: "Monthly", score: 3, reason: "Clear" }), answerRow("pbq_old")],
  files: [fileRow()],
  skills: [skillRow()],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.matrixFindFirst.mockResolvedValue(MATRIX);
  mocks.transaction.mockImplementation(async (ops: unknown[]) => ops);
  mocks.jobUpdateMany.mockResolvedValue({ count: 1 });
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
      questionId: null,
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
      role: "MAIN",
      name: "board-deck",
      label: "Board deck",
      purpose: "Builds the deck.",
      focus: "",
      step: "",
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

  it("never reads bytes or facts and skips removed files", async () => {
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
    expect(mocks.jobCreate.mock.calls[1][0].data).toEqual({ userId: "u1", title: "Untitled task", description: "" });
    await createJob("u1", { title: " My job ", description: "x" });
    expect(mocks.jobCreate.mock.calls[2][0].data.title).toBe("My job");
  });

  it("updates only the owner's job and returns the view", async () => {
    mocks.jobFindFirst.mockResolvedValueOnce({ id: "j1", title: "t", description: "d" }).mockResolvedValueOnce(jobRow({ title: "New" }));
    const view = await updateJob("j1", "u1", { title: "New" });
    expect(mocks.jobUpdateMany).toHaveBeenCalledWith({ where: { id: "j1" }, data: { title: "New" } });
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

describe("answers and context", () => {
  it("lists active files without bytes", async () => {
    mocks.fileFindMany.mockResolvedValue([fileRow()]);
    await activeFiles("j1");
    expect(mocks.fileFindMany).toHaveBeenCalledWith({ where: { jobId: "j1", deletedAt: null }, omit: { data: true, facts: true }, orderBy: { createdAt: "asc" } });
  });
});
