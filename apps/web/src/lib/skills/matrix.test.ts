import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findFirst: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { promptMatrix: { findFirst: mocks.findFirst } } }));

import { loadSkillMatrix } from "./matrix";

beforeEach(() => vi.clearAllMocks());

describe("loadSkillMatrix", () => {
  it("reads the active skill-definition questions in order", async () => {
    mocks.findFirst.mockResolvedValue({
      id: "pbm_skill_definition",
      name: "Skill definition",
      questions: [{ id: "pbq_skill_1", text: "When?", guidance: "Triggers", order: 0, element: null, isActive: true, matrixId: "m" }],
    });
    expect(await loadSkillMatrix()).toEqual({
      id: "pbm_skill_definition",
      name: "Skill definition",
      questions: [{ id: "pbq_skill_1", text: "When?", guidance: "Triggers", order: 0 }],
    });
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { slug: "skill-definition", kind: "SKILL", isActive: true },
      include: { questions: { where: { isActive: true }, orderBy: { order: "asc" } } },
    });
  });

  it("returns an empty matrix when it is not seeded", async () => {
    mocks.findFirst.mockResolvedValue(null);
    expect(await loadSkillMatrix()).toEqual({ id: "", name: "Skill definition", questions: [] });
  });
});
