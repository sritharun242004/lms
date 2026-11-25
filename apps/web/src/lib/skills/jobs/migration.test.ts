import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const WEB = path.join(__dirname, "../../../..");
const SQL = readFileSync(path.join(WEB, "prisma/migrations/20261125120000_add_skill_jobs/migration.sql"), "utf8");
const SCHEMA = readFileSync(path.join(WEB, "prisma/schema.prisma"), "utf8");
const NEW_TABLES = ["skill_jobs", "skill_job_answers", "skill_job_files", "skill_job_skills", "skill_versions"];

describe("skill jobs migration", () => {
  it("creates the five job tables and both enums", () => {
    for (const table of NEW_TABLES) expect(SQL).toContain(`CREATE TABLE "${table}"`);
    expect(SQL).toContain(`CREATE TYPE "SkillJobFileKind" AS ENUM ('PPTX', 'DOCX', 'XLSX', 'PDF', 'PNG', 'JPEG');`);
    expect(SQL).toContain(`CREATE TYPE "SkillAnalysisStatus" AS ENUM ('PENDING', 'READY', 'FAILED');`);
  });

  it("stores upload bytes and reuses the skill status enum", () => {
    expect(SQL).toContain('"data" BYTEA NOT NULL');
    expect(SQL).toContain(`"status" "SkillItemStatus" NOT NULL DEFAULT 'DRAFT'`);
  });

  it("enforces unique skill names, asset names, versions and answers", () => {
    for (const index of [
      'CREATE UNIQUE INDEX "skill_job_skills_job_id_name_key" ON "skill_job_skills"("job_id", "name");',
      'CREATE UNIQUE INDEX "skill_job_files_job_id_asset_name_key" ON "skill_job_files"("job_id", "asset_name");',
      'CREATE UNIQUE INDEX "skill_versions_skill_id_version_key" ON "skill_versions"("skill_id", "version");',
      'CREATE UNIQUE INDEX "skill_job_answers_job_id_question_id_key" ON "skill_job_answers"("job_id", "question_id");',
    ]) {
      expect(SQL).toContain(index);
    }
  });

  it("cascades every new foreign key, so deleting a user or job leaves nothing behind", () => {
    const keys = SQL.match(/ADD CONSTRAINT "[a-z_]+_fkey" FOREIGN KEY[^;]+;/g) ?? [];
    expect(keys).toHaveLength(6);
    for (const key of keys) expect(key).toContain("ON DELETE CASCADE");
  });

  it("only adds: nothing is dropped and only the new tables are altered", () => {
    expect(SQL).not.toMatch(/\bDROP\b/i);
    expect(SQL).not.toMatch(/ALTER COLUMN|RENAME/i);
    for (const [, table] of SQL.matchAll(/ALTER TABLE "([a-z_]+)"/g)) expect(NEW_TABLES).toContain(table);
  });

  it("keeps the catalog in the schema, marked deprecated, so no later diff drops it", () => {
    expect(SCHEMA).toMatch(/\/\/\/ Deprecated 2026-11-25[^\n]*\nmodel SkillCatalogEntry \{/);
    expect(SCHEMA).toMatch(/\/\/\/ Deprecated 2026-11-25[^\n]*\n\s+catalogEntryId\s+String\?/);
  });

  it("indexes the answer question foreign key in a follow-up additive migration", () => {
    const follow = readFileSync(path.join(WEB, "prisma/migrations/20261125120500_skill_job_answers_question_idx/migration.sql"), "utf8");
    expect(follow).toContain('CREATE INDEX "skill_job_answers_question_id_idx" ON "skill_job_answers"("question_id");');
    expect(follow).not.toMatch(/\bDROP\b/i);
    expect(SCHEMA).toMatch(/@@index\(\[questionId\]\)\n\s+@@map\("skill_job_answers"\)/);
  });
});
