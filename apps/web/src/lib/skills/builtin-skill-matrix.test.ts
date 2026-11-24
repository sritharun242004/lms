import { describe, expect, it } from "vitest";
import { BUILTIN_MATRICES } from "@/lib/prompt-bot/builtin-matrices";
import { SKILL_MATRIX, SKILL_MATRIX_ID, SKILL_MATRIX_SLUG } from "./builtin-skill-matrix";

const QUESTIONS: [string, string][] = [
  ["When should this skill be used?", "Situations, requests and phrases that should trigger it, and when it should not be used."],
  ["What context does it need to know?", "Background about the person, team, company or domain that stays true across uses."],
  ["What inputs will it receive?", "What the user provides each time (files, notes, data) and in what shape."],
  ["What are the steps?", "The sequence of work, decisions and checks."],
  ["What does a great output look like?", "Format, structure, length, tone, and an example if possible."],
  ["What is the quality bar?", "Criteria the output must meet before it is done."],
  ["What tools, files or resources does it use?", "Templates, reference documents, scripts, apps or plugins it relies on."],
  ["What should it avoid?", "Mistakes, sensitive areas, things never to do."],
];

describe("skill-definition matrix", () => {
  it("is a SKILL matrix with the spec's eight questions and guidance, in order", () => {
    expect(SKILL_MATRIX.id).toBe(SKILL_MATRIX_ID);
    expect(SKILL_MATRIX.slug).toBe(SKILL_MATRIX_SLUG);
    expect(SKILL_MATRIX.kind).toBe("SKILL");
    expect(SKILL_MATRIX.questions.map((q) => [q.text, q.guidance])).toEqual(QUESTIONS);
    expect(SKILL_MATRIX.questions.map((q) => q.id)).toEqual(QUESTIONS.map((_, i) => `pbq_skill_${i + 1}`));
  });

  it("does not collide with the enhancer's built-in matrices", () => {
    const taken = new Set(BUILTIN_MATRICES.flatMap((m) => [m.id, m.slug, ...m.questions.map((q) => q.id)]));
    for (const value of [SKILL_MATRIX.id, SKILL_MATRIX.slug, ...SKILL_MATRIX.questions.map((q) => q.id)]) {
      expect(taken.has(value)).toBe(false);
    }
  });
});
