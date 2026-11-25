import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { matrixSeedSql } from "@/lib/prompt-bot/seed-sql";
import { SKILL_MATRIX } from "./builtin-skill-matrix";

/** The already-applied Skills Builder migration: kept as-is, so these tests guard that it never changes. */
const SQL = readFileSync(
  path.join(__dirname, "../../../prisma/migrations/20261124160000_add_skills_builder/migration.sql"),
  "utf8",
);

describe("skills builder migration (applied 2026-11-24)", () => {
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

  it("only adds: nothing is dropped and no existing column changes", () => {
    expect(SQL).not.toMatch(/\bDROP\b/i);
    expect(SQL).not.toMatch(/ALTER TABLE "(users|prompt_[a-z_]+|ai_[a-z_]+)" (ADD|ALTER|DROP) COLUMN/i);
  });
});
