import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  packFindFirst: vi.fn(),
  itemFindFirst: vi.fn(),
  itemFindMany: vi.fn(),
  queryRaw: vi.fn(),
  loadSkillMatrix: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    skillPack: { findFirst: mocks.packFindFirst },
    skillPackItem: { findFirst: mocks.itemFindFirst, findMany: mocks.itemFindMany },
    $queryRaw: mocks.queryRaw,
  },
}));
vi.mock("./matrix", () => ({ loadSkillMatrix: mocks.loadSkillMatrix }));

import { loadItemDetail, loadPackView, loadReadySkillFiles, toItemView, UNREADABLE_FILES_MESSAGE } from "./packs";

const NOW = new Date("2026-11-25T12:00:00Z");
const MATRIX = {
  id: "pbm_skill_definition",
  name: "Skill definition",
  questions: [
    { id: "pbq_skill_1", text: "When should this skill be used?", guidance: "Triggers", order: 0 },
    { id: "pbq_skill_2", text: "What context does it need to know?", guidance: "Background", order: 1 },
  ],
};
const ACTIVE = new Set(["pbq_skill_1", "pbq_skill_2"]);
const answer = (questionId: string, over: Record<string, unknown> = {}) => ({
  id: `a-${questionId}`,
  itemId: "i1",
  questionId,
  answer: "",
  score: 0,
  reason: null,
  notRelevant: false,
  scoredAt: null,
  ...over,
});
const row = (over: Record<string, unknown> = {}) => ({
  id: "i1",
  packId: "p1",
  order: 0,
  kind: "CUSTOM",
  name: "board-update",
  purpose: "Writes the board update.",
  status: "READY",
  files: null,
  validationErrors: [],
  scoreRevision: 0,
  createdAt: NOW,
  updatedAt: NOW,
  generationStartedAt: null,
  answers: [] as ReturnType<typeof answer>[],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadSkillMatrix.mockResolvedValue(MATRIX);
});

describe("loadPackView (legacy, read-only)", () => {
  it("returns null for a pack the user does not own", async () => {
    mocks.packFindFirst.mockResolvedValue(null);
    expect(await loadPackView("p1", "u2")).toBeNull();
    expect(mocks.packFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "p1", userId: "u2" } }));
  });

  it("shows only finished custom skills, with file paths and sizes but never contents, and no catalog data", async () => {
    const index = [{ path: "SKILL.md", bytes: 1 }];
    mocks.packFindFirst.mockResolvedValue({
      id: "p1",
      title: "My week",
      description: "d",
      role: "CTO",
      items: [row({ files: undefined, answers: [answer("pbq_skill_1", { answer: "Monthly", score: 2 }), answer("retired_question")] })],
    });
    mocks.queryRaw.mockResolvedValue([{ id: "i1", file_index: index }]);
    const view = (await loadPackView("p1", "u1"))!;
    const include = mocks.packFindFirst.mock.calls[0][0].include;
    expect(include.items.where).toEqual({ kind: "CUSTOM", status: "READY" });
    expect(include.items.omit).toEqual({ files: true });
    expect(include.items.include).toEqual({ answers: true });
    expect(view.items[0]).toMatchObject({ status: "READY", files: index, answers: [{ questionId: "pbq_skill_1", answer: "Monthly", score: 2 }] });
    expect(view.items[0].answers).toHaveLength(1);
    expect(view.items[0]).not.toHaveProperty("catalog");
    expect(view.matrix.questions.map((q) => q.id)).toEqual(["pbq_skill_1", "pbq_skill_2"]);
  });
});

describe("loadItemDetail", () => {
  it("returns one owned finished custom skill with its file contents", async () => {
    const files = [{ path: "SKILL.md", content: "x" }];
    mocks.itemFindFirst.mockResolvedValue(row({ files }));
    const detail = (await loadItemDetail("p1", "i1", "u1"))!;
    expect(mocks.itemFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "i1", packId: "p1", kind: "CUSTOM", status: "READY", pack: { userId: "u1" } } }),
    );
    expect(detail).toMatchObject({ id: "i1", status: "READY", files });
  });

  it("returns null for someone else's item", async () => {
    mocks.itemFindFirst.mockResolvedValue(null);
    expect(await loadItemDetail("p1", "i1", "u2")).toBeNull();
  });
});

describe("loadReadySkillFiles", () => {
  it("loads contents only for the owner's ready custom skills, skipping unreadable files", async () => {
    const files = [{ path: "SKILL.md", content: "x" }];
    mocks.itemFindMany.mockResolvedValue([
      { name: "board-update", purpose: "Writes it.", files },
      { name: "broken", purpose: "Broken.", files: { not: "an array" } },
    ]);
    expect(await loadReadySkillFiles("p1", "u1")).toEqual([{ name: "board-update", purpose: "Writes it.", files }]);
    expect(mocks.itemFindMany).toHaveBeenCalledWith({
      where: { packId: "p1", pack: { userId: "u1" }, kind: "CUSTOM", status: "READY" },
      orderBy: { order: "asc" },
      select: { name: true, purpose: true, files: true },
    });
  });
});

describe("toItemView", () => {
  it("reports stored files it cannot read as FAILED (the database reports a non-array as false)", () => {
    for (const index of [false, [{ path: null, bytes: null }]]) {
      expect(toItemView(row() as never, index, ACTIVE)).toMatchObject({ status: "FAILED", files: null, validationErrors: [UNREADABLE_FILES_MESSAGE] });
    }
  });
});
