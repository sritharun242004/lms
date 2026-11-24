import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  packFindFirst: vi.fn(),
  packCreate: vi.fn(),
  itemFindFirst: vi.fn(),
  itemUpdate: vi.fn(),
  answerCreateMany: vi.fn(),
  answerUpdate: vi.fn(),
  matrixFindFirst: vi.fn(),
  transaction: vi.fn(),
  scoreQuestions: vi.fn(),
  consumeAiUsage: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    skillPack: { findFirst: mocks.packFindFirst, create: mocks.packCreate },
    skillPackItem: { findFirst: mocks.itemFindFirst, update: mocks.itemUpdate },
    skillItemAnswer: { createMany: mocks.answerCreateMany, update: mocks.answerUpdate },
    promptMatrix: { findFirst: mocks.matrixFindFirst },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/ai/claude", () => ({ scoreQuestions: mocks.scoreQuestions }));
vi.mock("@/lib/ai/usage", () => ({ consumeAiUsage: mocks.consumeAiUsage }));

import { createPackFromSplit, INTERRUPTED_MESSAGE, loadPackView, runItemScoring, toItemView, UNREADABLE_FILES_MESSAGE } from "./packs";

const NOW = new Date("2026-11-24T12:00:00Z");
const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60_000);
const MATRIX_ROW = {
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
  catalogEntryId: null,
  name: "board-update",
  purpose: "Writes the board update.",
  status: "DRAFT",
  files: null,
  validationErrors: [],
  scoreRevision: 0,
  createdAt: NOW,
  updatedAt: NOW,
  generationStartedAt: null,
  answers: [] as ReturnType<typeof answer>[],
  catalogEntry: null,
  pack: { description: "Monthly reporting.", role: null },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.matrixFindFirst.mockResolvedValue(MATRIX_ROW);
  mocks.transaction.mockImplementation(async (ops: unknown[]) => ops);
});

describe("loadPackView", () => {
  it("returns null for a pack the user does not own", async () => {
    mocks.packFindFirst.mockResolvedValue(null);
    expect(await loadPackView("p1", "u2")).toBeNull();
    expect(mocks.packFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "p1", userId: "u2" } }));
  });

  it("maps items with files, active answers only and catalog cards", async () => {
    const files = [{ path: "SKILL.md", content: "x" }];
    mocks.packFindFirst.mockResolvedValue({
      id: "p1",
      title: "My week",
      description: "d",
      role: "CTO",
      items: [
        row({ status: "READY", files, answers: [answer("pbq_skill_1", { answer: "Monthly", score: 2 }), answer("retired_question")] }),
        row({
          id: "i2",
          order: 1,
          kind: "CATALOG",
          name: "pptx",
          purpose: "Decks.",
          catalogEntry: { id: "scat_pptx", slug: "pptx", name: "PowerPoint", sourceUrl: "https://github.com/x", license: "source-available", bundlable: false, installNotes: "n" },
        }),
      ],
    });
    const view = (await loadPackView("p1", "u1", NOW))!;
    expect(view.matrix.questions.map((q) => q.id)).toEqual(["pbq_skill_1", "pbq_skill_2"]);
    expect(view.items[0]).toMatchObject({ status: "READY", files, answers: [{ questionId: "pbq_skill_1", answer: "Monthly", score: 2 }] });
    expect(view.items[0].answers).toHaveLength(1);
    expect(view.items[1].catalog).toEqual({
      id: "scat_pptx",
      slug: "pptx",
      name: "PowerPoint",
      sourceUrl: "https://github.com/x",
      license: "source-available",
      bundlable: false,
      installNotes: "n",
    });
  });
});

describe("toItemView", () => {
  it("reports an interrupted generation as FAILED after 10 minutes, and a recent one as GENERATING", () => {
    expect(toItemView(row({ status: "GENERATING", generationStartedAt: minutesAgo(11) }) as never, ACTIVE, NOW)).toMatchObject({
      status: "FAILED",
      validationErrors: [INTERRUPTED_MESSAGE],
    });
    expect(toItemView(row({ status: "GENERATING", generationStartedAt: minutesAgo(5) }) as never, ACTIVE, NOW).status).toBe("GENERATING");
  });

  it("judges staleness by generationStartedAt, never updatedAt (scoring bumps updatedAt)", () => {
    expect(toItemView(row({ status: "GENERATING", generationStartedAt: minutesAgo(16), updatedAt: NOW }) as never, ACTIVE, NOW).status).toBe("FAILED");
    expect(toItemView(row({ status: "GENERATING", generationStartedAt: null, updatedAt: NOW }) as never, ACTIVE, NOW).status).toBe("FAILED");
  });

  it("reports stored files it cannot read as FAILED", () => {
    expect(toItemView(row({ status: "READY", files: { not: "an array" } }) as never, ACTIVE, NOW)).toMatchObject({
      status: "FAILED",
      files: null,
      validationErrors: [UNREADABLE_FILES_MESSAGE],
    });
  });
});

describe("runItemScoring", () => {
  const owned = row({ answers: [answer("pbq_skill_1", { answer: "On month close" }), answer("pbq_skill_2", { notRelevant: true })] });

  it("scores the purpose plus answers and applies a fresh revision", async () => {
    mocks.itemFindFirst
      .mockResolvedValueOnce(owned)
      .mockResolvedValueOnce({ scoreRevision: 2 })
      .mockResolvedValueOnce(row({ answers: [answer("pbq_skill_1", { answer: "On month close", score: 3, reason: "Clear" })] }));
    mocks.scoreQuestions.mockResolvedValue([{ questionId: "pbq_skill_1", score: 3, reason: "Clear" }]);

    const result = await runItemScoring("p1", "i1", "u1", 3);

    expect(mocks.consumeAiUsage).toHaveBeenCalledWith("u1", "score");
    expect(mocks.answerCreateMany).toHaveBeenCalledWith({
      data: [
        { itemId: "i1", questionId: "pbq_skill_1" },
        { itemId: "i1", questionId: "pbq_skill_2" },
      ],
      skipDuplicates: true,
    });
    const [text, questions] = mocks.scoreQuestions.mock.calls[0];
    expect(text).toContain("Skill: board-update\nPurpose: Writes the board update.");
    expect(text).toContain("When should this skill be used?\nOn month close");
    expect(questions.map((q: { id: string }) => q.id)).toEqual(["pbq_skill_1"]);
    expect(mocks.answerUpdate).toHaveBeenCalledWith({
      where: { itemId_questionId: { itemId: "i1", questionId: "pbq_skill_1" } },
      data: expect.objectContaining({ score: 3, reason: "Clear" }),
    });
    expect(mocks.itemUpdate).toHaveBeenCalledWith({ where: { id: "i1" }, data: { scoreRevision: 3 } });
    expect(result).toMatchObject({ applied: true, revision: 3, answers: [{ questionId: "pbq_skill_1", score: 3 }] });
  });

  it("discards a result computed for an older revision", async () => {
    mocks.itemFindFirst.mockResolvedValueOnce(owned).mockResolvedValueOnce({ scoreRevision: 5 });
    mocks.scoreQuestions.mockResolvedValue([{ questionId: "pbq_skill_1", score: 3, reason: "Clear" }]);
    const result = await runItemScoring("p1", "i1", "u1", 3);
    expect(result.applied).toBe(false);
    expect(result.revision).toBe(5);
    expect(mocks.answerUpdate).not.toHaveBeenCalled();
  });
});

describe("createPackFromSplit", () => {
  it("creates custom items first, then catalog items linked by slug", async () => {
    mocks.packCreate.mockResolvedValue({ id: "p1" });
    const id = await createPackFromSplit({
      userId: "u1",
      title: "My week",
      description: "d",
      role: null,
      split: { customSkills: [{ name: "board-update", purpose: "Writes it." }], catalogMatches: [{ slug: "pptx", why: "Decks." }] },
      catalog: [{ id: "scat_pptx", slug: "pptx" }],
    });
    expect(id).toBe("p1");
    expect(mocks.packCreate).toHaveBeenCalledWith({
      data: {
        userId: "u1",
        title: "My week",
        description: "d",
        role: null,
        items: {
          create: [
            { order: 0, kind: "CUSTOM", name: "board-update", purpose: "Writes it." },
            { order: 1, kind: "CATALOG", catalogEntryId: "scat_pptx", name: "pptx", purpose: "Decks." },
          ],
        },
      },
      select: { id: true },
    });
  });
});
