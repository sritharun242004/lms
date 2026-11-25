/**
 * The Skills Builder's question matrix (spec, 2026-11-24). Seeded by the
 * 20261124160000_add_skills_builder migration; migration-seed.test.ts checks the seed still matches.
 */
import type { BuiltinMatrix, BuiltinQuestion } from "../prompt-bot/builtin-matrices";

export const SKILL_MATRIX_ID = "pbm_skill_definition";
export const SKILL_MATRIX_SLUG = "skill-definition";

const q = (n: number, text: string, guidance: string): BuiltinQuestion => ({ id: `pbq_skill_${n}`, text, guidance, element: null });

export const SKILL_MATRIX: BuiltinMatrix = {
  id: SKILL_MATRIX_ID,
  slug: SKILL_MATRIX_SLUG,
  name: "Skill definition",
  description: "Questions that turn a task into a reusable AI skill (Skills Builder).",
  kind: "SKILL",
  questions: [
    q(1, "When should this skill be used?", "Situations, requests and phrases that should trigger it, and when it should not be used."),
    q(2, "What context does it need to know?", "Background about the person, team, company or domain that stays true across uses."),
    q(3, "What inputs will it receive?", "What the user provides each time (files, notes, data) and in what shape."),
    q(4, "What are the steps?", "The sequence of work, decisions and checks."),
    q(5, "What does a great output look like?", "Format, structure, length, tone, and an example if possible."),
    q(6, "What is the quality bar?", "Criteria the output must meet before it is done."),
    q(7, "What tools, files or resources does it use?", "Templates, reference documents, scripts, apps or plugins it relies on."),
    q(8, "What should it avoid?", "Mistakes, sensitive areas, things never to do."),
  ],
};
