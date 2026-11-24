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

import { Prisma } from "@prisma/client";
import { LimitReachedError } from "@/lib/ai/usage";
import { AlreadyGeneratingError, GENERATION_FAILED_MESSAGE, runGeneration, SkillNotFoundError, startGeneration } from "./generate";
import { GENERATION_STALE_MS, GENERATION_TIMEOUT_MS } from "./limits";

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
const SAVED_FILES = [
  { path: "SKILL.md", content: '---\nname: "board-update"\ndescription: "My edited board update. Use monthly."\n---\n\nMy edits.\n' },
  { path: "references/context.md", content: "Hand-written context" },
];

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
      where: { id: "i1", OR: [{ status: { not: "GENERATING" } }, { generationStartedAt: null }, { generationStartedAt: { lt: minutesAgo(10) } }] },
      data: { status: "GENERATING", validationErrors: [], generationStartedAt: NOW },
    });
  });

  it("does not let an unrelated updatedAt bump keep a stale claim alive", async () => {
    mocks.findOwnedCustomItem.mockResolvedValue({ ...ITEM, status: "GENERATING", generationStartedAt: minutesAgo(20), updatedAt: NOW });
    await expect(startGeneration("p1", "i1", "u1", NOW)).resolves.toBeDefined();
  });

  it("loses the claim to a concurrent request without spending usage", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    await expect(startGeneration("p1", "i1", "u1", NOW)).rejects.toBeInstanceOf(AlreadyGeneratingError);
    expect(mocks.consumeAiUsage).not.toHaveBeenCalled();
  });

  it("claims the skill before it counts the use", async () => {
    await startGeneration("p1", "i1", "u1", NOW);
    expect(mocks.updateMany.mock.invocationCallOrder[0]).toBeLessThan(mocks.consumeAiUsage.mock.invocationCallOrder[0]);
  });

  it("releases the claim, restoring the previous state, when the daily limit is reached", async () => {
    const limit = new LimitReachedError("skill_generate", NOW);
    mocks.findOwnedCustomItem.mockResolvedValue({ ...ITEM, status: "READY", validationErrors: ["old note"] });
    mocks.consumeAiUsage.mockRejectedValue(limit);
    await expect(startGeneration("p1", "i1", "u1", NOW)).rejects.toBe(limit);
    expect(mocks.updateMany).toHaveBeenCalledTimes(2);
    expect(mocks.updateMany.mock.calls[1][0]).toEqual({
      where: { id: "i1", status: "GENERATING", generationStartedAt: NOW },
      data: { status: "READY", generationStartedAt: null, validationErrors: ["old note"] },
    });
    expect(mocks.loadItemView).not.toHaveBeenCalled();
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
    expect(data.files[0].content).toContain('name: "board-update"');
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

  it("keeps a good skill's files and READY when both attempts of a regeneration fail validation", async () => {
    mocks.findOwnedCustomItem.mockResolvedValue({ ...ITEM, status: "GENERATING", files: SAVED_FILES });
    mocks.generateSkillDraft.mockResolvedValue(BAD);
    await runGeneration("p1", "i1", "u1");
    expect(mocks.generateSkillDraft).toHaveBeenCalledTimes(2);
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "i1" },
      data: { status: "READY", validationErrors: ["SKILL.md: description cannot contain < or >"] },
    });
  });

  it("keeps a good skill's files and READY when a regeneration errors", async () => {
    mocks.findOwnedCustomItem.mockResolvedValue({ ...ITEM, status: "GENERATING", files: SAVED_FILES });
    mocks.generateSkillDraft.mockRejectedValue(new Error("overloaded"));
    await runGeneration("p1", "i1", "u1");
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "i1" }, data: { status: "READY", validationErrors: [GENERATION_FAILED_MESSAGE] } });
  });

  it("replaces a good skill's files when the regeneration is valid", async () => {
    mocks.findOwnedCustomItem.mockResolvedValue({ ...ITEM, status: "GENERATING", files: SAVED_FILES });
    mocks.generateSkillDraft.mockResolvedValue(GOOD);
    await runGeneration("p1", "i1", "u1");
    const { data } = mocks.update.mock.calls[0][0];
    expect(data).toMatchObject({ status: "READY", validationErrors: [] });
    expect(data.files[0].content).toContain("Write the update.");
  });

  it("replaces an earlier invalid draft with the new invalid draft (nothing good to keep)", async () => {
    const invalid = [{ path: "SKILL.md", content: "no frontmatter" }];
    mocks.findOwnedCustomItem.mockResolvedValue({ ...ITEM, status: "GENERATING", files: invalid });
    mocks.generateSkillDraft.mockResolvedValue(BAD);
    await runGeneration("p1", "i1", "u1");
    const { data } = mocks.update.mock.calls[0][0];
    expect(data.status).toBe("FAILED");
    expect(data.files[0].content).toContain("Use <this>");
  });

  it("never stores a draft over the storage limits, even as a FAILED draft", async () => {
    const huge = { ...GOOD, references: [{ path: "big.md", content: "x".repeat(200 * 1024 + 1) }] };
    mocks.generateSkillDraft.mockResolvedValue(huge);
    await runGeneration("p1", "i1", "u1");
    const { data } = mocks.update.mock.calls[0][0];
    expect(data.status).toBe("FAILED");
    expect(data.validationErrors).toEqual([expect.stringContaining("200 KB")]);
    expect(data.files).toBe(Prisma.DbNull);
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

describe("generation window", () => {
  it("is 10 minutes, and both bounded attempts fit inside it", () => {
    expect(GENERATION_STALE_MS).toBe(10 * 60_000);
    expect(2 * GENERATION_TIMEOUT_MS).toBeLessThan(GENERATION_STALE_MS);
  });
});
