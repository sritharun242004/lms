import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findOwnedCustomItem: vi.fn(),
  loadSkillMatrix: vi.fn(),
  loadItemView: vi.fn(),
  updateMany: vi.fn(),
  update: vi.fn(),
  consumeAiUsage: vi.fn(),
  generateSkillDraft: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { skillPackItem: { updateMany: mocks.updateMany, update: mocks.update } } }));
vi.mock("@/lib/ai/claude", () => ({ generateSkillDraft: mocks.generateSkillDraft, scoreQuestions: vi.fn() }));
vi.mock("@/lib/ai/usage", async (orig) => ({ ...(await orig<typeof import("@/lib/ai/usage")>()), consumeAiUsage: mocks.consumeAiUsage }));
vi.mock("./packs", async (orig) => ({
  ...(await orig<typeof import("./packs")>()),
  findOwnedCustomItem: mocks.findOwnedCustomItem,
  loadSkillMatrix: mocks.loadSkillMatrix,
  loadItemView: mocks.loadItemView,
}));

import { AlreadyGeneratingError, GENERATION_FAILED_MESSAGE, runGeneration, SkillNotFoundError, startGeneration } from "./generate";

const NOW = new Date("2026-11-24T12:00:00Z");
const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60_000);
const ITEM = {
  id: "i1",
  packId: "p1",
  kind: "CUSTOM",
  name: "board-update",
  purpose: "Writes the board update.",
  status: "DRAFT",
  generationStartedAt: null,
  files: null,
  answers: [{ questionId: "pbq_skill_1", answer: "When the month closes.", score: 3, notRelevant: false }],
  pack: { description: "Monthly reporting.", role: "CFO" },
};
const MATRIX = { id: "m", name: "Skill definition", questions: [{ id: "pbq_skill_1", text: "When should this skill be used?", guidance: "Triggers", order: 0 }] };
const GOOD = {
  name: "ignored",
  description: "Writes the monthly board update. Use when the month closes.",
  compatibility: "",
  body: "Write the update.",
  references: [],
  scripts: [],
  assets: [],
};
const BAD = { ...GOOD, description: "Use <this>" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findOwnedCustomItem.mockResolvedValue(ITEM);
  mocks.loadSkillMatrix.mockResolvedValue(MATRIX);
  mocks.loadItemView.mockResolvedValue({ id: "i1", status: "GENERATING" });
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.update.mockResolvedValue({});
});

describe("startGeneration", () => {
  it("returns not found for someone else's skill without spending usage", async () => {
    mocks.findOwnedCustomItem.mockResolvedValue(null);
    await expect(startGeneration("p1", "i1", "u2", NOW)).rejects.toBeInstanceOf(SkillNotFoundError);
    expect(mocks.consumeAiUsage).not.toHaveBeenCalled();
  });

  it("refuses a skill that is being written, before spending usage", async () => {
    mocks.findOwnedCustomItem.mockResolvedValue({ ...ITEM, status: "GENERATING", generationStartedAt: minutesAgo(1) });
    await expect(startGeneration("p1", "i1", "u1", NOW)).rejects.toBeInstanceOf(AlreadyGeneratingError);
    expect(mocks.consumeAiUsage).not.toHaveBeenCalled();
  });

  it("takes over an interrupted generation and counts one skill_generate use", async () => {
    mocks.findOwnedCustomItem.mockResolvedValue({ ...ITEM, status: "GENERATING", generationStartedAt: minutesAgo(20) });
    await expect(startGeneration("p1", "i1", "u1", NOW)).resolves.toEqual({ id: "i1", status: "GENERATING" });
    expect(mocks.consumeAiUsage).toHaveBeenCalledWith("u1", "skill_generate");
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "i1", OR: [{ status: { not: "GENERATING" } }, { generationStartedAt: null }, { generationStartedAt: { lt: minutesAgo(15) } }] },
      data: { status: "GENERATING", validationErrors: [], generationStartedAt: NOW },
    });
  });

  it("does not let an unrelated updatedAt bump keep a stale claim alive", async () => {
    mocks.findOwnedCustomItem.mockResolvedValue({ ...ITEM, status: "GENERATING", generationStartedAt: minutesAgo(20), updatedAt: NOW });
    await expect(startGeneration("p1", "i1", "u1", NOW)).resolves.toBeDefined();
  });

  it("loses the claim to a concurrent request", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    await expect(startGeneration("p1", "i1", "u1", NOW)).rejects.toBeInstanceOf(AlreadyGeneratingError);
  });
});

describe("runGeneration", () => {
  it("writes a valid skill as READY", async () => {
    mocks.generateSkillDraft.mockResolvedValue(GOOD);
    await runGeneration("p1", "i1", "u1");
    expect(mocks.generateSkillDraft).toHaveBeenCalledTimes(1);
    expect(mocks.generateSkillDraft.mock.calls[0][0]).toContain("When the month closes.");
    const { where, data } = mocks.update.mock.calls[0][0];
    expect(where).toEqual({ id: "i1" });
    expect(data.status).toBe("READY");
    expect(data.validationErrors).toEqual([]);
    expect(data.files[0]).toMatchObject({ path: "SKILL.md" });
    expect(data.files[0].content).toContain("name: board-update");
  });

  it("retries once with the validation errors, then marks the skill FAILED", async () => {
    mocks.generateSkillDraft.mockResolvedValue(BAD);
    await runGeneration("p1", "i1", "u1");
    expect(mocks.generateSkillDraft).toHaveBeenCalledTimes(2);
    const retry = mocks.generateSkillDraft.mock.calls[1][0] as string;
    expect(retry).toContain("<validation_errors>");
    expect(retry).toContain("description cannot contain < or >");
    const { data } = mocks.update.mock.calls[0][0];
    expect(data.status).toBe("FAILED");
    expect(data.validationErrors).toEqual(["SKILL.md: description cannot contain < or >"]);
  });

  it("is READY when the retry fixes the problem", async () => {
    mocks.generateSkillDraft.mockResolvedValueOnce(BAD).mockResolvedValueOnce(GOOD);
    await runGeneration("p1", "i1", "u1");
    expect(mocks.update.mock.calls[0][0].data.status).toBe("READY");
  });

  it("turns an AI failure into FAILED with a readable message, without throwing", async () => {
    mocks.generateSkillDraft.mockRejectedValue(new Error("overloaded"));
    await expect(runGeneration("p1", "i1", "u1")).resolves.toBeUndefined();
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "i1" }, data: { status: "FAILED", validationErrors: [GENERATION_FAILED_MESSAGE] } });
  });

  it("logs only the error name, never the message, and reports a failed FAILED-write the same way", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.generateSkillDraft.mockRejectedValue(new Error("secret answer text"));
    mocks.update.mockRejectedValue(new Error("db down with secret"));
    await expect(runGeneration("p1", "i1", "u1")).resolves.toBeUndefined();
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).not.toContain("secret");
    expect(log).toHaveBeenCalledTimes(2);
    log.mockRestore();
  });
});
