import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  jobFindFirst: vi.fn(),
  jobUpdate: vi.fn(),
  skillFindFirst: vi.fn(),
  skillCreate: vi.fn(),
  skillCreateMany: vi.fn(),
  skillUpdate: vi.fn(),
  skillDelete: vi.fn(),
  skillDeleteMany: vi.fn(),
  versionUpdate: vi.fn(),
  versionUpdateMany: vi.fn(),
  transaction: vi.fn(),
  consumeAiUsage: vi.fn(),
  suggestJobSkills: vi.fn(),
  activeFiles: vi.fn(),
  jobQuestionContext: vi.fn(),
  jobPerUseInputs: vi.fn(),
  loadJobView: vi.fn(),
  purgeUnreferencedFiles: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    skillJob: { findFirst: mocks.jobFindFirst, update: mocks.jobUpdate },
    skillJobSkill: {
      findFirst: mocks.skillFindFirst,
      create: mocks.skillCreate,
      createMany: mocks.skillCreateMany,
      update: mocks.skillUpdate,
      delete: mocks.skillDelete,
      deleteMany: mocks.skillDeleteMany,
    },
    skillVersion: { update: mocks.versionUpdate, updateMany: mocks.versionUpdateMany },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/ai/usage", async (orig) => ({ ...(await orig<typeof import("@/lib/ai/usage")>()), consumeAiUsage: mocks.consumeAiUsage }));
vi.mock("@/lib/ai/claude", () => ({ suggestJobSkills: mocks.suggestJobSkills }));
vi.mock("./jobs", async (orig) => ({
  ...(await orig<typeof import("./jobs")>()),
  activeFiles: mocks.activeFiles,
  jobQuestionContext: mocks.jobQuestionContext,
  jobPerUseInputs: mocks.jobPerUseInputs,
  loadJobView: mocks.loadJobView,
}));
vi.mock("./files", () => ({ purgeUnreferencedFiles: mocks.purgeUnreferencedFiles }));

import { AiResponseError } from "@/lib/ai/errors";
import {
  AlreadyGeneratingError,
  DuplicateNameError,
  EmptyDescriptionError,
  FilesAnalysingError,
  JobNotFoundError,
  MainRequiredError,
  SkillNotFoundError,
  TooManySkillsError,
} from "./errors";
import { addSkill, deleteSkill, suggestForJob, updateSkill } from "./skills";

const NOW = new Date("2026-11-25T12:00:00Z");
const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60_000);
const fileRow = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  jobId: "j1",
  fileName: `${id}.pptx`,
  assetName: `${id}.pptx`,
  kind: "PPTX",
  mimeType: "x",
  size: 1000,
  sha256: "h",
  analysis: `analysis of ${id}`,
  analysisStatus: "READY",
  analysisStartedAt: minutesAgo(30),
  analysisEdited: false,
  analysisError: null,
  deletedAt: null,
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});
const skill = (over: Record<string, unknown> = {}) => ({
  id: "s1",
  name: "board-deck",
  purpose: "Builds the deck.",
  status: "READY",
  generationStartedAt: null,
  latestVersion: 1,
  order: 0,
  role: "SUB",
  job: { pluginStatus: "DRAFT", pluginGenerationStartedAt: null },
  ...over,
});
const skillViewRow = (over: Record<string, unknown> = {}) => ({
  id: "s9",
  jobId: "j1",
  order: 1,
  name: "new-skill",
  purpose: "Does it.",
  fileIds: [],
  status: "DRAFT",
  validationErrors: [],
  generationStartedAt: null,
  latestVersion: 0,
  role: "SUB",
  label: "",
  focus: "",
  step: "",
  createdAt: NOW,
  updatedAt: NOW,
  versions: [],
  ...over,
});
const JOB = { id: "j1", userId: "u1", title: "Board update", description: "Every month I turn the numbers into a deck. Then I email it.", company: "", pluginStatus: "DRAFT", pluginGenerationStartedAt: null };
const PLUGIN = {
  main: { name: "Quarterly Deck", label: "Quarterly deck", purpose: "Builds the deck.", fileIds: ["f1"] },
  subSkills: [
    { name: "deck-designer", label: "Design", purpose: "Lays out slides.", focus: "Layout only.", step: "Lay out the slides", fileIds: ["f2"] },
    { name: "deck-grammar-check", label: "Grammar", purpose: "Checks wording.", focus: "Wording only.", step: "Check the wording", fileIds: [] },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.activeFiles.mockResolvedValue([fileRow("f1"), fileRow("f2")]);
  mocks.jobQuestionContext.mockResolvedValue([]);
  mocks.jobPerUseInputs.mockResolvedValue([]);
  mocks.loadJobView.mockResolvedValue({ id: "j1", skills: [] });
  mocks.transaction.mockImplementation(async (ops: unknown[]) => ops);
});

describe("suggestForJob", () => {
  it("keeps skills with versions (a kept main stays main), replaces drafts with sub-skills, and records when it suggested", async () => {
    mocks.jobFindFirst.mockResolvedValue({
      ...JOB,
      company: "Acme",
      skills: [skill({ role: "MAIN" }), skill({ id: "s2", name: "old-draft", latestVersion: 0, status: "DRAFT", order: 1 })],
    });
    mocks.suggestJobSkills.mockResolvedValue(PLUGIN);
    await suggestForJob("j1", "u1", NOW);
    expect(mocks.consumeAiUsage).toHaveBeenCalledWith("u1", "skill_split", NOW);
    const message = mocks.suggestJobSkills.mock.calls[0][0];
    expect(message).toContain("- board-deck (main): Builds the deck.");
    expect(message).toContain("company: Acme");
    expect(message).not.toContain("old-draft");
    expect(message).toContain("id: f1");
    expect(mocks.skillDeleteMany).toHaveBeenCalledWith({ where: { jobId: "j1", latestVersion: 0 } });
    expect(mocks.skillCreateMany).toHaveBeenCalledWith({
      data: [
        { jobId: "j1", order: 1, role: "SUB", name: "deck-designer", label: "Design", purpose: "Lays out slides.", focus: "Layout only.", step: "Lay out the slides", fileIds: ["f2"] },
        { jobId: "j1", order: 2, role: "SUB", name: "deck-grammar-check", label: "Grammar", purpose: "Checks wording.", focus: "Wording only.", step: "Check the wording", fileIds: [] },
      ],
    });
    expect(mocks.jobUpdate).toHaveBeenCalledWith({ where: { id: "j1" }, data: { suggestedAt: NOW } });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.loadJobView).toHaveBeenCalledWith("j1", "u1", NOW);
  });

  it("writes one main and the sub-skills in workflow order for a task without skills", async () => {
    mocks.jobFindFirst.mockResolvedValue({ ...JOB, skills: [] });
    mocks.suggestJobSkills.mockResolvedValue(PLUGIN);
    await suggestForJob("j1", "u1", NOW);
    const rows = mocks.skillCreateMany.mock.calls[0][0].data;
    expect(rows.map((r: { name: string; role: string; order: number }) => [r.name, r.role, r.order])).toEqual([
      ["quarterly-deck", "MAIN", 0],
      ["deck-designer", "SUB", 1],
      ["deck-grammar-check", "SUB", 2],
    ]);
  });

  it("maps a unique-index race in the apply transaction (P2002) to DuplicateNameError", async () => {
    mocks.jobFindFirst.mockResolvedValue({ ...JOB, skills: [] });
    mocks.suggestJobSkills.mockResolvedValue(PLUGIN);
    mocks.transaction.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "6" }));
    await expect(suggestForJob("j1", "u1", NOW)).rejects.toBeInstanceOf(DuplicateNameError);
  });

  it("falls back to a main skill from the title plus planner and checker when the model returns nothing usable", async () => {
    mocks.jobFindFirst.mockResolvedValue({ ...JOB, skills: [] });
    mocks.suggestJobSkills.mockResolvedValue({ main: { name: "", label: "", purpose: "", fileIds: [] }, subSkills: [] });
    await suggestForJob("j1", "u1", NOW);
    const rows = mocks.skillCreateMany.mock.calls[0][0].data;
    expect(rows[0]).toEqual({ jobId: "j1", order: 0, role: "MAIN", name: "board-update", label: "Board update", purpose: "Every month I turn the numbers into a deck.", fileIds: ["f1", "f2"] });
    expect(rows.slice(1).map((r: { name: string }) => r.name)).toEqual(["board-update-planner", "board-update-checker"]);
  });

  it("refuses while the plugin is being written", async () => {
    mocks.jobFindFirst.mockResolvedValueOnce({ ...JOB, pluginStatus: "GENERATING", pluginGenerationStartedAt: minutesAgo(1), skills: [] });
    await expect(suggestForJob("j1", "u1", NOW)).rejects.toBeInstanceOf(AlreadyGeneratingError);
    expect(mocks.consumeAiUsage).not.toHaveBeenCalled();
  });

  it("checks every precondition before spending a unit", async () => {
    mocks.jobFindFirst.mockResolvedValueOnce(null);
    await expect(suggestForJob("j1", "u2", NOW)).rejects.toBeInstanceOf(JobNotFoundError);
    mocks.jobFindFirst.mockResolvedValueOnce({ ...JOB, description: "   ", skills: [] });
    await expect(suggestForJob("j1", "u1", NOW)).rejects.toBeInstanceOf(EmptyDescriptionError);
    mocks.jobFindFirst.mockResolvedValueOnce({ ...JOB, skills: [skill({ status: "GENERATING", generationStartedAt: minutesAgo(1) })] });
    await expect(suggestForJob("j1", "u1", NOW)).rejects.toBeInstanceOf(AlreadyGeneratingError);
    mocks.jobFindFirst.mockResolvedValueOnce({ ...JOB, skills: [] });
    mocks.activeFiles.mockResolvedValueOnce([fileRow("f1", { analysisStatus: "PENDING", analysisStartedAt: minutesAgo(1) })]);
    await expect(suggestForJob("j1", "u1", NOW)).rejects.toBeInstanceOf(FilesAnalysingError);
    mocks.jobFindFirst.mockResolvedValueOnce({ ...JOB, skills: Array.from({ length: 6 }, (_, i) => skill({ id: `s${i}`, name: `k${i}` })) });
    await expect(suggestForJob("j1", "u1", NOW)).rejects.toBeInstanceOf(TooManySkillsError);
    expect(mocks.consumeAiUsage).not.toHaveBeenCalled();
  });

  it("an interrupted analysis does not block suggesting", async () => {
    mocks.jobFindFirst.mockResolvedValue({ ...JOB, skills: [] });
    mocks.activeFiles.mockResolvedValue([fileRow("f1", { analysisStatus: "PENDING", analysisStartedAt: minutesAgo(6), analysis: null })]);
    mocks.suggestJobSkills.mockResolvedValue(PLUGIN);
    await suggestForJob("j1", "u1", NOW);
    expect(mocks.suggestJobSkills.mock.calls[0][0]).toContain("(no analysis yet)");
  });

  it("changes nothing when the AI fails", async () => {
    mocks.jobFindFirst.mockResolvedValue({ ...JOB, skills: [] });
    mocks.suggestJobSkills.mockRejectedValue(new AiResponseError("bad"));
    await expect(suggestForJob("j1", "u1", NOW)).rejects.toBeInstanceOf(AiResponseError);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});

describe("addSkill", () => {
  beforeEach(() => {
    mocks.jobFindFirst.mockResolvedValue({ id: "j1", skills: [{ name: "board-deck", order: 0, role: "MAIN" }] });
    mocks.skillCreate.mockResolvedValue(skillViewRow());
  });

  it("adds a normalised sub-skill last in the workflow, with all active files by default", async () => {
    const view = await addSkill("j1", "u1", { name: "New Skill", purpose: "Does\nit." });
    expect(mocks.skillCreate).toHaveBeenCalledWith({
      data: { jobId: "j1", order: 1, role: "SUB", name: "new-skill", label: "", purpose: "Does it.", focus: "", step: "", fileIds: ["f1", "f2"] },
      include: expect.objectContaining({ versions: expect.any(Object) }),
    });
    expect(view.name).toBe("new-skill");
    await addSkill("j1", "u1", { name: "Other", purpose: "p", fileIds: ["f2", "gone"] });
    expect(mocks.skillCreate.mock.calls[1][0].data.fileIds).toEqual(["f2"]);
  });

  it("keeps label, focus and step on one line within their caps", async () => {
    await addSkill("j1", "u1", { name: "deck-designer", label: " Design\nslides ", purpose: "p", focus: `Layout\n${"x".repeat(700)}`, step: "Lay out\nthe slides" });
    expect(mocks.skillCreate.mock.calls[0][0].data).toMatchObject({ label: "Design slides", step: "Lay out the slides" });
    expect(mocks.skillCreate.mock.calls[0][0].data.focus).toHaveLength(600);
  });

  it("refuses a duplicate name, a full job and a foreign job", async () => {
    await expect(addSkill("j1", "u1", { name: "Board Deck", purpose: "p" })).rejects.toEqual(new DuplicateNameError("board-deck"));
    const sixSubs = Array.from({ length: 6 }, (_, i) => ({ name: `k${i}`, order: i + 1, role: "SUB" }));
    mocks.jobFindFirst.mockResolvedValueOnce({ id: "j1", skills: [{ name: "main", order: 0, role: "MAIN" }, ...sixSubs] });
    await expect(addSkill("j1", "u1", { name: "x", purpose: "p" })).rejects.toBeInstanceOf(TooManySkillsError);
    mocks.jobFindFirst.mockResolvedValueOnce({ id: "j1", skills: sixSubs.slice(0, 5) });
    await expect(addSkill("j1", "u1", { name: "x", purpose: "p" })).resolves.toBeDefined();
    mocks.jobFindFirst.mockResolvedValueOnce(null);
    await expect(addSkill("j1", "u2", { name: "x", purpose: "p" })).rejects.toBeInstanceOf(JobNotFoundError);
  });

  it("maps a unique-index race (P2002) to DuplicateNameError", async () => {
    mocks.skillCreate.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "6" }));
    await expect(addSkill("j1", "u1", { name: "Race", purpose: "p" })).rejects.toEqual(new DuplicateNameError("race"));
  });
});

describe("updateSkill", () => {
  beforeEach(() => {
    mocks.skillFindFirst.mockResolvedValueOnce(skill()).mockResolvedValue(skillViewRow({ id: "s1", name: "monthly-deck", latestVersion: 1 }));
  });

  it("renames after v1 by changing only the skill row; versions keep their names (Review Focus 4)", async () => {
    mocks.skillFindFirst.mockReset();
    mocks.skillFindFirst
      .mockResolvedValueOnce(skill())
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(skillViewRow({ id: "s1", name: "monthly-deck", latestVersion: 1, versions: [{ version: 1, name: "board-deck", createdAt: NOW, assetFileIds: [] }] }));
    const view = await updateSkill("j1", "s1", "u1", { name: "Monthly deck" });
    expect(mocks.skillFindFirst.mock.calls[1][0]).toEqual({ where: { jobId: "j1", name: "monthly-deck", id: { not: "s1" } }, select: { id: true } });
    expect(mocks.skillUpdate).toHaveBeenCalledWith({ where: { id: "s1" }, data: { name: "monthly-deck" } });
    expect(mocks.versionUpdate).not.toHaveBeenCalled();
    expect(mocks.versionUpdateMany).not.toHaveBeenCalled();
    expect(view.name).toBe("monthly-deck");
    expect(view.versions[0].name).toBe("board-deck");
  });

  it("updates purpose, order and files (filtered to active files)", async () => {
    await updateSkill("j1", "s1", "u1", { purpose: "New\npurpose", order: 3, fileIds: ["f2", "gone"] });
    expect(mocks.skillUpdate).toHaveBeenCalledWith({ where: { id: "s1" }, data: { purpose: "New purpose", order: 3, fileIds: ["f2"] } });
  });

  it("swaps places with the skill already at the requested order, keeping orders unique", async () => {
    mocks.skillFindFirst.mockReset();
    mocks.skillFindFirst
      .mockResolvedValueOnce(skill({ order: 1 }))
      .mockResolvedValueOnce({ id: "s2" })
      .mockResolvedValue(skillViewRow({ id: "s1", order: 2 }));
    await updateSkill("j1", "s1", "u1", { order: 2 });
    expect(mocks.skillFindFirst.mock.calls[1][0]).toEqual({ where: { jobId: "j1", order: 2, id: { not: "s1" } }, select: { id: true } });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.skillUpdate).toHaveBeenCalledWith({ where: { id: "s2" }, data: { order: 1 } });
    expect(mocks.skillUpdate).toHaveBeenCalledWith({ where: { id: "s1" }, data: { order: 2 } });
  });

  it("moves to a free order without touching other skills", async () => {
    mocks.skillFindFirst.mockReset();
    mocks.skillFindFirst.mockResolvedValueOnce(skill({ order: 1 })).mockResolvedValueOnce(null).mockResolvedValue(skillViewRow({ id: "s1", order: 5 }));
    await updateSkill("j1", "s1", "u1", { order: 5 });
    expect(mocks.skillUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.skillUpdate).toHaveBeenCalledWith({ where: { id: "s1" }, data: { order: 5 } });
  });

  it("updates label, focus and step", async () => {
    await updateSkill("j1", "s1", "u1", { label: "Grammar\ncheck", focus: "Wording only", step: "Check the wording" });
    expect(mocks.skillUpdate).toHaveBeenCalledWith({ where: { id: "s1" }, data: { label: "Grammar check", focus: "Wording only", step: "Check the wording" } });
  });

  it("refuses a rename while the plugin is being written", async () => {
    mocks.skillFindFirst.mockReset();
    mocks.skillFindFirst.mockResolvedValueOnce(skill({ job: { pluginStatus: "GENERATING", pluginGenerationStartedAt: new Date() } }));
    await expect(updateSkill("j1", "s1", "u1", { name: "other" })).rejects.toBeInstanceOf(AlreadyGeneratingError);
  });

  it("refuses a rename while generating and a duplicate name, and 404s a foreign skill", async () => {
    mocks.skillFindFirst.mockReset();
    mocks.skillFindFirst.mockResolvedValueOnce(skill({ status: "GENERATING", generationStartedAt: new Date() }));
    await expect(updateSkill("j1", "s1", "u1", { name: "other" })).rejects.toBeInstanceOf(AlreadyGeneratingError);
    mocks.skillFindFirst.mockResolvedValueOnce(skill()).mockResolvedValueOnce({ id: "s2" });
    await expect(updateSkill("j1", "s1", "u1", { name: "taken" })).rejects.toEqual(new DuplicateNameError("taken"));
    mocks.skillFindFirst.mockResolvedValueOnce(null);
    await expect(updateSkill("j1", "s1", "u2", { purpose: "p" })).rejects.toBeInstanceOf(SkillNotFoundError);
    expect(mocks.skillUpdate).not.toHaveBeenCalled();
  });

  it("maps a P2002 rename race to DuplicateNameError", async () => {
    mocks.skillFindFirst.mockReset();
    mocks.skillFindFirst.mockResolvedValueOnce(skill()).mockResolvedValueOnce(null);
    mocks.skillUpdate.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "6" }));
    await expect(updateSkill("j1", "s1", "u1", { name: "Race" })).rejects.toEqual(new DuplicateNameError("race"));
  });
});

describe("deleteSkill", () => {
  it("deletes the skill (its versions cascade) and purges files only old versions needed", async () => {
    mocks.skillFindFirst.mockResolvedValue(skill());
    await deleteSkill("j1", "s1", "u1");
    expect(mocks.skillDelete).toHaveBeenCalledWith({ where: { id: "s1" } });
    expect(mocks.purgeUnreferencedFiles).toHaveBeenCalledWith("j1");
  });

  it("still succeeds when only the purge fails after the delete, logging the error name only", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.skillFindFirst.mockResolvedValue(skill());
    mocks.purgeUnreferencedFiles.mockRejectedValueOnce(Object.assign(new Error("secret sql"), { name: "PrismaClientKnownRequestError" }));
    await expect(deleteSkill("j1", "s1", "u1")).resolves.toBeUndefined();
    expect(mocks.skillDelete).toHaveBeenCalledWith({ where: { id: "s1" } });
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/^\[skills-builder\] /), "PrismaClientKnownRequestError");
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret sql");
    log.mockRestore();
  });

  it("never removes the main skill", async () => {
    mocks.skillFindFirst.mockResolvedValueOnce(skill({ role: "MAIN" }));
    await expect(deleteSkill("j1", "s1", "u1")).rejects.toBeInstanceOf(MainRequiredError);
    expect(mocks.skillDelete).not.toHaveBeenCalled();
  });

  it("refuses while generating and 404s a foreign skill", async () => {
    mocks.skillFindFirst.mockResolvedValueOnce(skill({ status: "GENERATING", generationStartedAt: new Date() }));
    await expect(deleteSkill("j1", "s1", "u1")).rejects.toBeInstanceOf(AlreadyGeneratingError);
    mocks.skillFindFirst.mockResolvedValueOnce(skill({ job: { pluginStatus: "GENERATING", pluginGenerationStartedAt: new Date() } }));
    await expect(deleteSkill("j1", "s1", "u1")).rejects.toBeInstanceOf(AlreadyGeneratingError);
    mocks.skillFindFirst.mockResolvedValueOnce(skill({ job: { pluginStatus: "GENERATING", pluginGenerationStartedAt: new Date(Date.now() - 11 * 60_000) } }));
    await expect(deleteSkill("j1", "s1", "u1")).resolves.toBeUndefined();
    mocks.skillDelete.mockClear();
    mocks.skillFindFirst.mockResolvedValueOnce(null);
    await expect(deleteSkill("j1", "s1", "u2")).rejects.toBeInstanceOf(SkillNotFoundError);
    expect(mocks.skillDelete).not.toHaveBeenCalled();
  });
});
