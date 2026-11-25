import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  skillFindFirst: vi.fn(),
  skillUpdateMany: vi.fn(),
  skillUpdate: vi.fn(),
  fileFindMany: vi.fn(),
  versionCreate: vi.fn(),
  versionDeleteMany: vi.fn(),
  transaction: vi.fn(),
  consumeAiUsage: vi.fn(),
  generateJobSkillDraft: vi.fn(),
  activeFiles: vi.fn(),
  jobQuestionContext: vi.fn(),
  jobPerUseInputs: vi.fn(),
  purgeUnreferencedFiles: vi.fn(),
  loadSkillView: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    skillJobSkill: { findFirst: mocks.skillFindFirst, updateMany: mocks.skillUpdateMany, update: mocks.skillUpdate },
    skillJobFile: { findMany: mocks.fileFindMany },
    skillVersion: { create: mocks.versionCreate, deleteMany: mocks.versionDeleteMany },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/ai/usage", async (orig) => ({ ...(await orig<typeof import("@/lib/ai/usage")>()), consumeAiUsage: mocks.consumeAiUsage }));
vi.mock("@/lib/ai/claude", () => ({ generateJobSkillDraft: mocks.generateJobSkillDraft }));
vi.mock("./jobs", () => ({ activeFiles: mocks.activeFiles, jobQuestionContext: mocks.jobQuestionContext, jobPerUseInputs: mocks.jobPerUseInputs }));
vi.mock("./files", () => ({ purgeUnreferencedFiles: mocks.purgeUnreferencedFiles }));
vi.mock("./skills", () => ({ loadSkillView: mocks.loadSkillView }));

import { LimitReachedError } from "@/lib/ai/usage";
import { AlreadyGeneratingError, EmptyDescriptionError, FilesAnalysingError, SkillNotFoundError } from "./errors";
import { JOB_GENERATION_FAILED_MESSAGE, runJobSkillGeneration, startJobSkillGeneration } from "./generate";
import type { JobSkillDraft } from "./types";

const NOW = new Date("2026-11-25T12:00:00Z");
const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60_000);
const skillRow = (over: Record<string, unknown> = {}) => ({
  id: "s1",
  name: "board-update",
  purpose: "Writes the monthly board update.",
  status: "DRAFT",
  generationStartedAt: null,
  validationErrors: [],
  fileIds: ["f1"],
  latestVersion: 0,
  job: { title: "Monthly board update", description: "Every month I turn my notes into the board update.", outputType: "board update deck" },
  ...over,
});
const fileRow = (over: Record<string, unknown> = {}) => ({
  id: "f1",
  fileName: "Q3 deck.pptx",
  assetName: "q3-deck.pptx",
  kind: "PPTX",
  size: 2048,
  analysis: "## Colours\n\n- Navy #1F4E79",
  analysisStatus: "READY",
  analysisStartedAt: null,
  questionId: null,
  ...over,
});
const VALID: JobSkillDraft = {
  description: "Writes the monthly board update from notes.\nUse when asked for a board update.",
  compatibility: "",
  body: "# Board update\n\nFollow `references/style-guide.md`.",
  references: [],
  scripts: [],
};
const INVALID: JobSkillDraft = { ...VALID, description: "Uses <angle> brackets" };
/** The claim this run was started with; every final write is guarded by it. */
const CLAIM = new Date("2026-11-25T11:58:00Z");
const OURS = { id: "s1", status: "GENERATING", generationStartedAt: CLAIM };
const running = (over: Record<string, unknown> = {}) => skillRow({ status: "GENERATING", generationStartedAt: CLAIM, ...over });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.skillFindFirst.mockResolvedValue(skillRow());
  mocks.skillUpdateMany.mockResolvedValue({ count: 1 });
  mocks.skillUpdate.mockResolvedValue({});
  mocks.fileFindMany.mockResolvedValue([]);
  mocks.versionCreate.mockResolvedValue({});
  mocks.versionDeleteMany.mockResolvedValue({ count: 0 });
  // Interactive transaction: the callback gets a client whose writes are the same mocks.
  const tx = {
    skillJobSkill: { updateMany: mocks.skillUpdateMany },
    skillVersion: { create: mocks.versionCreate, deleteMany: mocks.versionDeleteMany },
  };
  mocks.transaction.mockImplementation(async (fn: (client: typeof tx) => unknown) => fn(tx));
  mocks.consumeAiUsage.mockResolvedValue(undefined);
  mocks.activeFiles.mockResolvedValue([fileRow()]);
  mocks.jobQuestionContext.mockResolvedValue([]);
  mocks.jobPerUseInputs.mockResolvedValue([]);
  mocks.purgeUnreferencedFiles.mockResolvedValue(0);
  mocks.loadSkillView.mockResolvedValue({ id: "s1", status: "GENERATING" });
});

describe("startJobSkillGeneration", () => {
  it("checks ownership first", async () => {
    mocks.skillFindFirst.mockResolvedValue(null);
    await expect(startJobSkillGeneration("j1", "s1", "u2", NOW)).rejects.toBeInstanceOf(SkillNotFoundError);
    expect(mocks.skillFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "s1", jobId: "j1", job: { userId: "u2" } } }));
    expect(mocks.consumeAiUsage).not.toHaveBeenCalled();
  });

  it("refuses while a recent generation runs, but re-claims one interrupted more than 10 minutes ago", async () => {
    mocks.skillFindFirst.mockResolvedValueOnce(skillRow({ status: "GENERATING", generationStartedAt: minutesAgo(5) }));
    await expect(startJobSkillGeneration("j1", "s1", "u1", NOW)).rejects.toBeInstanceOf(AlreadyGeneratingError);
    mocks.skillFindFirst.mockResolvedValueOnce(skillRow({ status: "GENERATING", generationStartedAt: minutesAgo(11) }));
    await startJobSkillGeneration("j1", "s1", "u1", NOW);
    expect(mocks.skillUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "s1",
        jobId: "j1",
        OR: [{ status: { not: "GENERATING" } }, { generationStartedAt: null }, { generationStartedAt: { lt: minutesAgo(10) } }],
      },
      data: { status: "GENERATING", validationErrors: [], generationStartedAt: NOW },
    });
  });

  it("waits for the skill's own files to finish analysing; an interrupted analysis does not block", async () => {
    mocks.fileFindMany.mockResolvedValueOnce([{ analysisStatus: "PENDING", analysisStartedAt: minutesAgo(1) }]);
    await expect(startJobSkillGeneration("j1", "s1", "u1", NOW)).rejects.toBeInstanceOf(FilesAnalysingError);
    expect(mocks.fileFindMany).toHaveBeenCalledWith({
      where: { jobId: "j1", id: { in: ["f1"] }, deletedAt: null },
      select: { analysisStatus: true, analysisStartedAt: true },
    });
    mocks.fileFindMany.mockResolvedValueOnce([{ analysisStatus: "PENDING", analysisStartedAt: minutesAgo(6) }]);
    await expect(startJobSkillGeneration("j1", "s1", "u1", NOW)).resolves.toEqual({ id: "s1", status: "GENERATING" });
  });

  it("needs a job description", async () => {
    mocks.skillFindFirst.mockResolvedValue(skillRow({ job: { title: "t", description: "   " } }));
    await expect(startJobSkillGeneration("j1", "s1", "u1", NOW)).rejects.toBeInstanceOf(EmptyDescriptionError);
    expect(mocks.skillUpdateMany).not.toHaveBeenCalled();
  });

  it("spends one skill_generate unit only after winning the claim", async () => {
    mocks.skillUpdateMany.mockResolvedValueOnce({ count: 0 });
    await expect(startJobSkillGeneration("j1", "s1", "u1", NOW)).rejects.toBeInstanceOf(AlreadyGeneratingError);
    expect(mocks.consumeAiUsage).not.toHaveBeenCalled();
    await startJobSkillGeneration("j1", "s1", "u1", NOW);
    expect(mocks.consumeAiUsage).toHaveBeenCalledWith("u1", "skill_generate");
    expect(mocks.loadSkillView).toHaveBeenCalledWith("j1", "s1", "u1");
  });

  it("hands the claim back when the daily limit is reached", async () => {
    const limit = new LimitReachedError("skill_generate", new Date("2026-11-26T00:00:00Z"));
    mocks.skillFindFirst.mockResolvedValue(skillRow({ status: "FAILED", validationErrors: ["old"] }));
    mocks.consumeAiUsage.mockRejectedValue(limit);
    await expect(startJobSkillGeneration("j1", "s1", "u1", NOW)).rejects.toBe(limit);
    expect(mocks.skillUpdateMany).toHaveBeenLastCalledWith({
      where: { id: "s1", status: "GENERATING", generationStartedAt: NOW },
      data: { status: "FAILED", generationStartedAt: null, validationErrors: ["old"] },
    });
  });
});

describe("runJobSkillGeneration", () => {
  beforeEach(() => mocks.skillFindFirst.mockResolvedValue(running()));

  it("writes v1 from a valid draft, with the bundled original, then purges unreferenced files", async () => {
    mocks.generateJobSkillDraft.mockResolvedValue(VALID);
    await runJobSkillGeneration("j1", "s1", "u1");
    expect(mocks.generateJobSkillDraft).toHaveBeenCalledTimes(1);
    const data = mocks.versionCreate.mock.calls[0][0].data;
    expect(data).toMatchObject({
      skillId: "s1",
      version: 1,
      name: "board-update",
      description: "Writes the monthly board update from notes. Use when asked for a board update.",
      assets: [{ fileId: "f1", path: "assets/q3-deck.pptx", fileName: "Q3 deck.pptx", bytes: 2048 }],
      assetFileIds: ["f1"],
    });
    expect(data.files.map((f: { path: string }) => f.path)).toEqual(["SKILL.md", "references/style-guide.md"]);
    expect(data.files[0].content).toContain('name: "board-update"');
    expect(mocks.skillUpdateMany).toHaveBeenCalledWith({ where: OURS, data: { status: "READY", latestVersion: 1, validationErrors: [] } });
    // The claim check is the transaction's first write.
    expect(mocks.skillUpdateMany.mock.invocationCallOrder[0]).toBeLessThan(mocks.versionCreate.mock.invocationCallOrder[0]);
    expect(mocks.skillUpdate).not.toHaveBeenCalled();
    expect(mocks.versionDeleteMany).toHaveBeenCalledWith({ where: { skillId: "s1", version: { lte: -19 } } });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.purgeUnreferencedFiles).toHaveBeenCalledWith("j1");
  });

  it("retries once with the validation errors, then records FAILED and leaves older versions alone", async () => {
    mocks.skillFindFirst.mockResolvedValue(running({ latestVersion: 2 }));
    mocks.generateJobSkillDraft.mockResolvedValue(INVALID);
    await runJobSkillGeneration("j1", "s1", "u1");
    expect(mocks.generateJobSkillDraft).toHaveBeenCalledTimes(2);
    const [first] = mocks.generateJobSkillDraft.mock.calls[0];
    const [retry] = mocks.generateJobSkillDraft.mock.calls[1];
    expect(retry).not.toBe(first);
    expect(retry).toContain("cannot contain < or >");
    expect(mocks.versionCreate).not.toHaveBeenCalled();
    expect(mocks.versionDeleteMany).not.toHaveBeenCalled();
    expect(mocks.skillUpdateMany).toHaveBeenCalledWith({
      where: OURS,
      data: { status: "FAILED", validationErrors: [expect.stringMatching(/< or >/)] },
    });
    expect(mocks.skillUpdate).not.toHaveBeenCalled();
  });

  it("numbers a version after the latest one when the retry passes", async () => {
    mocks.skillFindFirst.mockResolvedValue(running({ latestVersion: 3 }));
    mocks.generateJobSkillDraft.mockResolvedValueOnce(INVALID).mockResolvedValueOnce(VALID);
    await runJobSkillGeneration("j1", "s1", "u1");
    expect(mocks.versionCreate.mock.calls[0][0].data.version).toBe(4);
    expect(mocks.skillUpdateMany).toHaveBeenCalledWith({ where: OURS, data: { status: "READY", latestVersion: 4, validationErrors: [] } });
  });

  it("keeps only the last 20 versions", async () => {
    mocks.skillFindFirst.mockResolvedValue(running({ latestVersion: 24 }));
    mocks.generateJobSkillDraft.mockResolvedValue(VALID);
    await runJobSkillGeneration("j1", "s1", "u1");
    expect(mocks.versionDeleteMany).toHaveBeenCalledWith({ where: { skillId: "s1", version: { lte: 5 } } });
  });

  it("uses only active files the skill lists, in the skill's order; a file without a ready analysis is sent as missing", async () => {
    mocks.skillFindFirst.mockResolvedValue(running({ fileIds: ["f2", "gone", "f1"] }));
    mocks.activeFiles.mockResolvedValue([
      fileRow(),
      fileRow({ id: "f2", fileName: "Logo.png", assetName: "logo.png", kind: "PNG", analysis: "stale text", analysisStatus: "FAILED" }),
    ]);
    mocks.generateJobSkillDraft.mockResolvedValue(VALID);
    await runJobSkillGeneration("j1", "s1", "u1");
    const data = mocks.versionCreate.mock.calls[0][0].data;
    expect(data.assetFileIds).toEqual(["f2", "f1"]);
    const guide = data.files.find((f: { path: string }) => f.path === "references/style-guide.md").content;
    expect(guide).toContain("### Logo.png\n\nBundled as assets/logo.png.\n\nNo analysis is available for this file.");
    expect(guide).not.toContain("stale text");
  });

  it("asks for the per-use inputs in the prompt and writes exactly one Before you start section", async () => {
    mocks.jobQuestionContext.mockResolvedValue([
      { id: "q1", text: "Which deck do you start from?", guidance: "Name it.", answer: "The Q3 deck.", score: 3, notRelevant: false },
    ]);
    mocks.jobPerUseInputs.mockResolvedValue([{ label: "Month", hint: "e.g. March 2026", required: true }, { label: "Board chair", hint: "", required: false }]);
    mocks.activeFiles.mockResolvedValue([fileRow({ questionId: "q1" })]);
    mocks.generateJobSkillDraft.mockResolvedValue({
      ...VALID,
      body: "# Board update\n\n## Before you start — ask the user for\n\n- The model's own list\n\n## Steps\n\nFollow `references/style-guide.md`.",
    });
    await runJobSkillGeneration("j1", "s1", "u1");
    const [message] = mocks.generateJobSkillDraft.mock.calls[0];
    expect(message).toContain("output_type: board update deck");
    expect(message).toContain("- Month (required): e.g. March 2026\n- Board chair (if available)");
    expect(message).toContain('<question n="1" text="Which deck do you start from?">');
    expect(message).toMatch(/<question n="1"[^]*<file name="Q3 deck.pptx"[^]*<\/question>/);
    const files = mocks.versionCreate.mock.calls[0][0].data.files;
    const skillMd = files[0].content as string;
    expect(skillMd.match(/^## Before you start — ask the user for$/gm)).toHaveLength(1);
    expect(skillMd).toContain("- **Month** (required): e.g. March 2026\n- **Board chair** (if available)");
    expect(skillMd).not.toContain("The model's own list");
    expect(skillMd).toContain('Added for the question "Which deck do you start from?".');
    expect(files[1].content).toContain('## For "Which deck do you start from?"\n\n### Q3 deck.pptx');
  });

  it("records the generic failure, logs only the error name and never throws", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.generateJobSkillDraft.mockRejectedValue(Object.assign(new Error("secret prompt text"), { name: "APIConnectionError" }));
    await expect(runJobSkillGeneration("j1", "s1", "u1")).resolves.toBeUndefined();
    expect(mocks.skillUpdateMany).toHaveBeenCalledWith({ where: OURS, data: { status: "FAILED", validationErrors: [JOB_GENERATION_FAILED_MESSAGE] } });
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret prompt text");
    expect(JSON.stringify(log.mock.calls)).toContain("APIConnectionError");
    log.mockRestore();
  });

  it("does not mark a written version FAILED when only the purge fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.generateJobSkillDraft.mockResolvedValue(VALID);
    mocks.purgeUnreferencedFiles.mockRejectedValue(new Error("db"));
    await runJobSkillGeneration("j1", "s1", "u1");
    expect(mocks.skillUpdateMany).toHaveBeenCalledTimes(1);
    expect(mocks.skillUpdateMany.mock.calls[0][0].data.status).toBe("READY");
    log.mockRestore();
  });

  it("does nothing for a skill that is not the user's", async () => {
    mocks.skillFindFirst.mockResolvedValue(null);
    await runJobSkillGeneration("j1", "s1", "u2");
    expect(mocks.generateJobSkillDraft).not.toHaveBeenCalled();
    expect(mocks.skillUpdate).not.toHaveBeenCalled();
    expect(mocks.skillUpdateMany).not.toHaveBeenCalled();
  });

  it("writes no version when a newer run took the claim, and never marks that run FAILED", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.generateJobSkillDraft.mockResolvedValue(VALID);
    mocks.skillUpdateMany.mockResolvedValue({ count: 0 });
    await expect(runJobSkillGeneration("j1", "s1", "u1")).resolves.toBeUndefined();
    expect(mocks.skillUpdateMany).toHaveBeenCalledTimes(1);
    expect(mocks.skillUpdateMany.mock.calls[0][0].where).toEqual(OURS);
    expect(mocks.versionCreate).not.toHaveBeenCalled();
    expect(mocks.versionDeleteMany).not.toHaveBeenCalled();
    expect(mocks.purgeUnreferencedFiles).not.toHaveBeenCalled();
    expect(mocks.skillUpdate).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("guards the failure writes with the claim too", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.generateJobSkillDraft.mockRejectedValue(new Error("x"));
    mocks.skillUpdateMany.mockResolvedValue({ count: 0 });
    await runJobSkillGeneration("j1", "s1", "u1");
    expect(mocks.skillUpdateMany.mock.calls.map(([a]) => a.where)).toEqual([OURS]);
    expect(mocks.skillUpdate).not.toHaveBeenCalled();
    log.mockRestore();
  });
});
