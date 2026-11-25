import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  jobFindFirst: vi.fn(),
  jobUpdateMany: vi.fn(),
  fileFindMany: vi.fn(),
  consumeAiUsage: vi.fn(),
  loadJobView: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { skillJob: { findFirst: mocks.jobFindFirst, updateMany: mocks.jobUpdateMany }, skillJobFile: { findMany: mocks.fileFindMany } },
}));
vi.mock("@/lib/ai/usage", async (orig) => ({ ...(await orig<typeof import("@/lib/ai/usage")>()), consumeAiUsage: mocks.consumeAiUsage }));
vi.mock("@/lib/ai/claude", () => ({ generateJobSkillDraft: vi.fn() }));
vi.mock("./jobs", async (orig) => ({ ...(await orig<typeof import("./jobs")>()), loadJobView: mocks.loadJobView }));

import { LimitReachedError } from "@/lib/ai/usage";
import { EmptyDescriptionError, FilesAnalysingError, JobNotFoundError, PluginGeneratingError, PluginInvalidError } from "./errors";
import { pluginStructureErrors, startPluginGeneration } from "./plugin-generate";

const NOW = new Date();
const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60_000);
const skills = (subs: number) => [{ role: "MAIN", fileIds: ["f1"] }, ...Array.from({ length: subs }, () => ({ role: "SUB", fileIds: ["f1", "f2"] }))];
const job = (over: Record<string, unknown> = {}) => ({
  description: "I build the deck.",
  pluginStatus: "READY",
  pluginGenerationStartedAt: minutesAgo(30),
  pluginValidationErrors: [],
  skills: skills(2),
  ...over,
});
const PLUGIN = { name: "acme-deck", status: "GENERATING" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.jobFindFirst.mockResolvedValue(job());
  mocks.fileFindMany.mockResolvedValue([{ analysisStatus: "READY", analysisStartedAt: minutesAgo(30) }]);
  mocks.jobUpdateMany.mockResolvedValue({ count: 1 });
  mocks.loadJobView.mockResolvedValue({ plugin: PLUGIN });
});

describe("pluginStructureErrors", () => {
  it("needs one main and 2 to 6 sub-skills", () => {
    expect(pluginStructureErrors(skills(2))).toEqual([]);
    expect(pluginStructureErrors(skills(6))).toEqual([]);
    expect(pluginStructureErrors(skills(1))).toEqual(["Add at least 2 sub-skills."]);
    expect(pluginStructureErrors(skills(7))).toEqual(["A plugin can have at most 6 sub-skills."]);
    expect(pluginStructureErrors([{ role: "SUB" }, { role: "SUB" }])).toContain("Add a main skill first: use Create my skills.");
  });
});

describe("startPluginGeneration", () => {
  it("claims the plugin, spends one plugin_generate unit and returns the plugin", async () => {
    expect(await startPluginGeneration("j1", "u1", NOW)).toBe(PLUGIN);
    const claim = mocks.jobUpdateMany.mock.calls[0][0];
    expect(claim.where).toMatchObject({ id: "j1", userId: "u1" });
    expect(claim.data).toEqual({ pluginStatus: "GENERATING", pluginValidationErrors: [], pluginGenerationStartedAt: NOW });
    expect(mocks.consumeAiUsage).toHaveBeenCalledWith("u1", "plugin_generate", NOW);
    expect(mocks.fileFindMany.mock.calls[0][0].where).toEqual({ jobId: "j1", id: { in: ["f1", "f2"] }, deletedAt: null });
  });

  it("checks ownership, description, files and structure in order, before claiming or spending", async () => {
    mocks.jobFindFirst.mockResolvedValueOnce(null);
    await expect(startPluginGeneration("j1", "u2", NOW)).rejects.toBeInstanceOf(JobNotFoundError);
    mocks.jobFindFirst.mockResolvedValueOnce(job({ description: "  ", skills: skills(0) }));
    await expect(startPluginGeneration("j1", "u1", NOW)).rejects.toBeInstanceOf(EmptyDescriptionError);
    mocks.fileFindMany.mockResolvedValueOnce([{ analysisStatus: "PENDING", analysisStartedAt: minutesAgo(1) }]);
    mocks.jobFindFirst.mockResolvedValueOnce(job({ skills: skills(1) }));
    await expect(startPluginGeneration("j1", "u1", NOW)).rejects.toBeInstanceOf(FilesAnalysingError);
    mocks.jobFindFirst.mockResolvedValueOnce(job({ skills: skills(1) }));
    const invalid = await startPluginGeneration("j1", "u1", NOW).catch((e: unknown) => e);
    expect(invalid).toBeInstanceOf(PluginInvalidError);
    expect((invalid as PluginInvalidError).reasons).toEqual(["Add at least 2 sub-skills."]);
    mocks.jobFindFirst.mockResolvedValueOnce(job({ pluginStatus: "GENERATING", pluginGenerationStartedAt: minutesAgo(1) }));
    await expect(startPluginGeneration("j1", "u1", NOW)).rejects.toBeInstanceOf(PluginGeneratingError);
    expect(mocks.jobUpdateMany).not.toHaveBeenCalled();
    expect(mocks.consumeAiUsage).not.toHaveBeenCalled();
  });

  it("lets a stale generation be claimed again, and loses a race without spending", async () => {
    mocks.jobFindFirst.mockResolvedValueOnce(job({ pluginStatus: "GENERATING", pluginGenerationStartedAt: minutesAgo(11) }));
    await expect(startPluginGeneration("j1", "u1", NOW)).resolves.toBe(PLUGIN);
    mocks.jobUpdateMany.mockResolvedValueOnce({ count: 0 });
    await expect(startPluginGeneration("j1", "u1", NOW)).rejects.toBeInstanceOf(PluginGeneratingError);
    expect(mocks.consumeAiUsage).toHaveBeenCalledTimes(1);
  });

  it("hands the claim back when the daily limit is reached", async () => {
    const limit = new LimitReachedError("plugin_generate", new Date());
    mocks.consumeAiUsage.mockRejectedValueOnce(limit);
    await expect(startPluginGeneration("j1", "u1", NOW)).rejects.toBe(limit);
    expect(mocks.jobUpdateMany.mock.calls[1][0]).toEqual({
      where: { id: "j1", pluginStatus: "GENERATING", pluginGenerationStartedAt: NOW },
      data: { pluginStatus: "READY", pluginGenerationStartedAt: minutesAgo(30), pluginValidationErrors: [] },
    });
  });
});
