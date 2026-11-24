import { prisma } from "@/lib/db/prisma";
import { SKILL_MATRIX_SLUG } from "./builtin-skill-matrix";
import type { SkillMatrixView } from "./types";

/** The active skill-definition questions, shared by jobs and legacy packs. */
export async function loadSkillMatrix(): Promise<SkillMatrixView> {
  const matrix = await prisma.promptMatrix.findFirst({
    where: { slug: SKILL_MATRIX_SLUG, kind: "SKILL", isActive: true },
    include: { questions: { where: { isActive: true }, orderBy: { order: "asc" } } },
  });
  return {
    id: matrix?.id ?? "",
    name: matrix?.name ?? "Skill definition",
    questions: matrix?.questions.map((q) => ({ id: q.id, text: q.text, guidance: q.guidance, order: q.order })) ?? [],
  };
}
