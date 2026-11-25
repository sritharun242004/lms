import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const WEB = path.join(__dirname, "../../../..");
const FILE = path.join(WEB, "prisma/migrations/20261125150000_add_skill_task_questions/migration.sql");
const SQL = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
const SCHEMA = readFileSync(path.join(WEB, "prisma/schema.prisma"), "utf8");

describe("task questions migration", () => {
  it("creates the three enums", () => {
    expect(SQL).toContain(`CREATE TYPE "SkillQuestionSource" AS ENUM ('AI', 'USER');`);
    expect(SQL).toContain(`CREATE TYPE "SkillQuestionKind" AS ENUM ('FIXED', 'PER_USE');`);
    expect(SQL).toContain(`CREATE TYPE "SkillFileHint" AS ENUM ('REFERENCE', 'INPUT', 'TEMPLATE', 'BRAND');`);
  });

  it("adds nullable columns to jobs and files", () => {
    expect(SQL).toMatch(/ADD COLUMN\s+"output_type" TEXT,/);
    expect(SQL).toMatch(/ADD COLUMN\s+"questions_generated_at" TIMESTAMP\(3\)/);
    expect(SQL).toMatch(/ADD COLUMN\s+"question_id" TEXT;/);
  });

  it("creates the questions table with the spec's defaults", () => {
    expect(SQL).toContain('CREATE TABLE "skill_job_questions"');
    expect(SQL).toContain(`"file_note" TEXT NOT NULL DEFAULT ''`);
    expect(SQL).toContain(`"kind" "SkillQuestionKind" NOT NULL DEFAULT 'FIXED'`);
    expect(SQL).toContain(`"source" "SkillQuestionSource" NOT NULL DEFAULT 'AI'`);
    expect(SQL).toContain(`"required" BOOLEAN NOT NULL DEFAULT true`);
    expect(SQL).toContain(`"wants_files" BOOLEAN NOT NULL DEFAULT false`);
    expect(SQL).toContain(`"answer" TEXT NOT NULL DEFAULT ''`);
    expect(SQL).toContain('"file_hint" "SkillFileHint",');
    expect(SQL).toContain('"legacy_question_id" TEXT,');
  });

  it("indexes and links the tables: files fall back to general, questions go with the job", () => {
    expect(SQL).toContain('CREATE INDEX "skill_job_questions_job_id_order_idx" ON "skill_job_questions"("job_id", "order");');
    expect(SQL).toContain('CREATE INDEX "skill_job_files_question_id_idx" ON "skill_job_files"("question_id");');
    expect(SQL).toMatch(/FOREIGN KEY \("job_id"\) REFERENCES "skill_jobs"\("id"\) ON DELETE CASCADE/);
    expect(SQL).toMatch(/FOREIGN KEY \("question_id"\) REFERENCES "skill_job_questions"\("id"\) ON DELETE SET NULL/);
  });

  it("copies every job's active skill-definition answers into fixed questions, idempotently", () => {
    expect(SQL).toContain(`SELECT 'sjq_' || md5(j."id" || ':' || q."id")`);
    expect(SQL).toContain(`JOIN "prompt_matrices" m ON m."slug" = 'skill-definition' AND m."kind" = 'SKILL'`);
    expect(SQL).toContain(`q."is_active" = true`);
    expect(SQL).toContain(`LEFT JOIN "skill_job_answers" a ON a."job_id" = j."id" AND a."question_id" = q."id"`);
    expect(SQL).toContain(`'FIXED'::"SkillQuestionKind", true, q."id"`);
    expect(SQL).toContain('ON CONFLICT ("id") DO NOTHING;');
    expect(SQL).toContain(`UPDATE "skill_jobs" j SET "questions_generated_at" = j."created_at"`);
    expect(SQL.indexOf("INSERT INTO")).toBeGreaterThan(SQL.lastIndexOf("ADD CONSTRAINT"));
  });

  it("is additive", () => {
    expect(SQL).not.toMatch(/\bDROP\b/i);
    expect(SQL).not.toMatch(/\bRENAME\b/i);
    expect(SQL).not.toMatch(/ALTER COLUMN/i);
    const altered = [...SQL.matchAll(/ALTER TABLE "([a-z_]+)"/g)].map((m) => m[1]);
    expect(new Set(altered)).toEqual(new Set(["skill_jobs", "skill_job_files", "skill_job_questions"]));
  });

  it("matches the schema", () => {
    expect(SCHEMA).toContain("model SkillJobQuestion {");
    expect(SCHEMA).toMatch(/question\s+SkillJobQuestion\?\s+@relation\(fields: \[questionId\], references: \[id\], onDelete: SetNull\)/);
  });
});
