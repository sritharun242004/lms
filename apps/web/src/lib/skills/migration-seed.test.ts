import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { matrixSeedSql } from "@/lib/prompt-bot/seed-sql";
import { SKILL_MATRIX } from "./builtin-skill-matrix";
import { CATALOG_SEED } from "./catalog-seed";
import { catalogSeedSql, sqlTextArray } from "./seed-sql";

const SQL = readFileSync(
  path.join(__dirname, "../../../prisma/migrations/20261124160000_add_skills_builder/migration.sql"),
  "utf8",
);

describe("skills builder migration", () => {
  it("creates the four Skills Builder tables", () => {
    for (const table of ["skill_packs", "skill_pack_items", "skill_item_answers", "skill_catalog_entries"]) {
      expect(SQL).toContain(`CREATE TABLE "${table}"`);
    }
  });

  it("adds the generation heartbeat column", () => {
    expect(SQL).toContain('"generation_started_at" TIMESTAMP(3)');
  });

  it("seeds the skill-definition matrix exactly as defined", () => {
    for (const line of matrixSeedSql(SKILL_MATRIX)) expect(SQL).toContain(line);
  });

  it("seeds the catalog with the verified licenses", () => {
    const lines = catalogSeedSql(CATALOG_SEED);
    expect(lines).toHaveLength(CATALOG_SEED.length);
    for (const line of lines) expect(SQL).toContain(line);
  });

  it("only adds: nothing is dropped and no existing column changes", () => {
    expect(SQL).not.toMatch(/\bDROP\b/i);
    expect(SQL).not.toMatch(/ALTER TABLE "(users|prompt_[a-z_]+|ai_[a-z_]+)" (ADD|ALTER|DROP) COLUMN/i);
  });

  it("writes text arrays as Postgres literals", () => {
    expect(sqlTextArray(["ui", "it's"])).toBe("ARRAY['ui','it''s']::TEXT[]");
    expect(sqlTextArray([])).toBe("ARRAY[]::TEXT[]");
  });
});
