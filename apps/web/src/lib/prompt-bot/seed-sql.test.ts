import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BUILTIN_MATRICES } from "./builtin-matrices";
import { matrixSeedSql, sqlLiteral } from "./seed-sql";

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
});
