import { beforeEach, describe, expect, it, vi } from "vitest";
import { JOB_DRAFT, subSkillDraft, subSkillName } from "../../../../scripts/fake-anthropic-shapes.mjs";

const mocks = vi.hoisted(() => ({
  jobFindFirst: vi.fn(),
  jobUpdateMany: vi.fn(),
  txJobUpdateMany: vi.fn(),
  versionCreate: vi.fn(),
  versionDeleteMany: vi.fn(),
  draft: vi.fn(),
  activeFiles: vi.fn(),
  questions: vi.fn(),
  perUse: vi.fn(),
  purge: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    skillJob: { findFirst: mocks.jobFindFirst, updateMany: mocks.jobUpdateMany },
    $transaction: (fn: (tx: unknown) => unknown) =>
      fn({ skillJob: { updateMany: mocks.txJobUpdateMany }, skillPluginVersion: { create: mocks.versionCreate, deleteMany: mocks.versionDeleteMany } }),
  },
}));
vi.mock("@/lib/ai/claude", () => ({ generateJobSkillDraft: mocks.draft }));
vi.mock("./files", () => ({ purgeUnreferencedFiles: mocks.purge }));
vi.mock("./jobs", async (orig) => ({ ...(await orig<typeof import("./jobs")>()), activeFiles: mocks.activeFiles, jobQuestionContext: mocks.questions, jobPerUseInputs: mocks.perUse }));

import { PLUGIN_GENERATION_FAILED_MESSAGE, runPluginGeneration } from "./plugin-generate";

const CLAIM = new Date(Date.now() - 60_000);
const skill = (name: string, role: string, order: number, fileIds: string[] = []) => ({ name, role, label: "", purpose: `Does ${name}.`, focus: "", step: "", fileIds, order });
const JOB = {
  title: "Quarterly deck",
  description: "I build the deck.",
  outputType: null,
  company: "Acme",
  pluginName: null,
  pluginDisplayName: null,
  pluginGenerationStartedAt: CLAIM,
  pluginLatestVersion: 21,
  user: { name: "Dana" },
  skills: [skill("deck-designer", "SUB", 1, ["f1"]), skill("quarterly-deck", "MAIN", 0, ["f1"]), skill("deck-grammar-check", "SUB", 2)],
};
const FILE = { id: "f1", fileName: "Logo.png", assetName: "logo.png", kind: "PNG", size: 1000, analysis: "navy", analysisStatus: "READY", questionId: null };
const byMessage = async (message: string) => {
  const sub = subSkillName(message);
  return sub ? subSkillDraft(sub) : JOB_DRAFT;
};
const ours = { id: "j1", pluginStatus: "GENERATING", pluginGenerationStartedAt: CLAIM };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.jobFindFirst.mockResolvedValue(JOB);
  mocks.activeFiles.mockResolvedValue([FILE]);
  mocks.questions.mockResolvedValue([]);
  mocks.perUse.mockResolvedValue([{ label: "Quarter", hint: "", required: true }]);
  mocks.draft.mockImplementation(byMessage);
  mocks.txJobUpdateMany.mockResolvedValue({ count: 1 });
  mocks.jobUpdateMany.mockResolvedValue({ count: 1 });
  mocks.purge.mockResolvedValue(0);
});

describe("runPluginGeneration", () => {
  it("writes every skill in parallel with the right prompt and stores one claim-guarded version, pruning to 20", async () => {
    let inFlight = 0;
    let peak = 0;
    mocks.draft.mockImplementation(async (message: string) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return byMessage(message);
    });
    await runPluginGeneration("j1", "u1");
    expect(peak).toBe(3);
    expect(mocks.draft.mock.calls.map((c) => c[1]).sort()).toEqual(["main", "sub", "sub"]);
    const mainMessage = mocks.draft.mock.calls.find((c) => c[1] === "main")![0];
    expect(mainMessage).toContain("<sub_skills>\n1. deck-designer: Does deck-designer.\n2. deck-grammar-check: Does deck-grammar-check.\n</sub_skills>");
    expect(mocks.txJobUpdateMany).toHaveBeenCalledWith({ where: ours, data: { pluginStatus: "READY", pluginLatestVersion: 22, pluginValidationErrors: [] } });
    const data = mocks.versionCreate.mock.calls[0][0].data;
    expect(data).toMatchObject({ jobId: "j1", version: 22, name: "acme-quarterly-deck", displayName: "Acme · Quarterly deck", assetFileIds: ["f1"] });
    expect(data.skills.map((s: { name: string; role: string }) => [s.name, s.role])).toEqual([
      ["quarterly-deck", "MAIN"],
      ["deck-designer", "SUB"],
      ["deck-grammar-check", "SUB"],
    ]);
    expect(data.files.map((f: { path: string }) => f.path)).toEqual([
      ".claude-plugin/plugin.json",
      "commands/quarterly-deck.md",
      "commands/deck-designer.md",
      "commands/deck-grammar-check.md",
    ]);
    expect(JSON.parse(data.files[0].content).version).toBe("1.21.0");
    expect(data.assets).toEqual([
      { fileId: "f1", skill: "quarterly-deck", path: "assets/logo.png", fileName: "Logo.png", bytes: 1000 },
      { fileId: "f1", skill: "deck-designer", path: "assets/logo.png", fileName: "Logo.png", bytes: 1000 },
    ]);
    expect(mocks.versionDeleteMany).toHaveBeenCalledWith({ where: { jobId: "j1", version: { lte: 2 } } });
    expect(mocks.purge).toHaveBeenCalledWith("j1");
  });

  it("retries a skill once with its errors, then marks the plugin FAILED with prefixed errors and writes nothing", async () => {
    mocks.draft.mockImplementation(async (message: string) => {
      const draft = await byMessage(message);
      return subSkillName(message) === "deck-designer" ? { ...draft, description: "Uses <angle> brackets" } : draft;
    });
    await runPluginGeneration("j1", "u1");
    const designerCalls = mocks.draft.mock.calls.filter((c) => subSkillName(c[0]) === "deck-designer");
    expect(designerCalls).toHaveLength(2);
    expect(designerCalls[1][0]).toContain("<validation_errors>");
    const failed = mocks.jobUpdateMany.mock.calls[0][0];
    expect(failed.where).toEqual(ours);
    expect(failed.data.pluginStatus).toBe("FAILED");
    expect(failed.data.pluginValidationErrors.every((e: string) => e.startsWith("deck-designer: "))).toBe(true);
    expect(mocks.versionCreate).not.toHaveBeenCalled();
    expect(mocks.txJobUpdateMany).not.toHaveBeenCalled();
  });

  it("reports an AI failure under the skill's name", async () => {
    mocks.draft.mockImplementation(async (message: string) => {
      if (subSkillName(message) === "deck-grammar-check") throw Object.assign(new Error("secret prompt"), { name: "APIConnectionError" });
      return byMessage(message);
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await runPluginGeneration("j1", "u1");
    expect(mocks.jobUpdateMany.mock.calls[0][0].data).toEqual({ pluginStatus: "FAILED", pluginValidationErrors: [`deck-grammar-check: ${PLUGIN_GENERATION_FAILED_MESSAGE}`] });
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret prompt");
    log.mockRestore();
  });

  it("discards the drafts when the claim was lost", async () => {
    mocks.txJobUpdateMany.mockResolvedValue({ count: 0 });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await runPluginGeneration("j1", "u1");
    expect(mocks.versionCreate).not.toHaveBeenCalled();
    expect(mocks.purge).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("never throws: an unexpected error marks FAILED under the claim, and a missing job does nothing", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.activeFiles.mockRejectedValueOnce(new Error("db down"));
    await expect(runPluginGeneration("j1", "u1")).resolves.toBeUndefined();
    expect(mocks.jobUpdateMany).toHaveBeenCalledWith({ where: ours, data: { pluginStatus: "FAILED", pluginValidationErrors: [PLUGIN_GENERATION_FAILED_MESSAGE] } });
    mocks.jobFindFirst.mockResolvedValueOnce(null);
    mocks.jobUpdateMany.mockClear();
    await expect(runPluginGeneration("j1", "u1")).resolves.toBeUndefined();
    expect(mocks.jobUpdateMany).not.toHaveBeenCalled();
    log.mockRestore();
  });
});
