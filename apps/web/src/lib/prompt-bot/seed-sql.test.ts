import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BUILTIN_MATRICES } from "./builtin-matrices";
import { matrixSeedSql, retirementSql, sqlLiteral } from "./seed-sql";

const ENHANCER_SQL = readFileSync(
  path.join(__dirname, "../../../prisma/migrations/20261124150000_add_prompt_bot/migration.sql"),
  "utf8",
);

describe("seed SQL helpers", () => {
  it("doubles single quotes and writes NULL for null", () => {
    expect(sqlLiteral("it's")).toBe("'it''s'");
    expect(sqlLiteral(null)).toBe("NULL");
  });

  it("reproduces every seed row already in the enhancer migration", () => {
    const lines = BUILTIN_MATRICES.flatMap(matrixSeedSql);
    expect(lines).toHaveLength(BUILTIN_MATRICES.length + BUILTIN_MATRICES.reduce((n, m) => n + m.questions.length, 0));
    for (const line of lines) expect(ENHANCER_SQL).toContain(line);
  });

  it("writes one UPDATE per switched-off matrix or question, and nothing for active ones", () => {
    const lines = retirementSql([
      {
        id: "m1",
        slug: "s",
        name: "N",
        description: "d",
        kind: "TASK",
        isActive: false,
        questions: [
          { id: "q1", text: "t", guidance: "g", element: null },
          { id: "q2", text: "t", guidance: "g", element: null, isActive: false },
        ],
      },
    ]);
    expect(lines).toEqual([
      `UPDATE "prompt_matrices" SET "is_active" = false, "updated_at" = NOW() WHERE "id" = 'm1';`,
      `UPDATE "prompt_matrix_questions" SET "is_active" = false WHERE "id" = 'q2';`,
    ]);
  });
});
