import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const WEB = path.join(__dirname, "../../../..");
const FILE = path.join(WEB, "prisma/migrations/20261125170000_add_skill_plugins/migration.sql");
const SQL = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
const SCHEMA = readFileSync(path.join(WEB, "prisma/schema.prisma"), "utf8");

describe("skill plugins migration", () => {
  it("creates the role enum", () => {
    expect(SQL).toContain(`CREATE TYPE "SkillRole" AS ENUM ('MAIN', 'SUB');`);
  });

  it("adds seven defaulted or nullable plugin columns to jobs", () => {
    expect(SQL).toContain(`ADD COLUMN     "company" TEXT NOT NULL DEFAULT ''`);
    expect(SQL).toMatch(/ADD COLUMN\s+"plugin_name" TEXT,/);
    expect(SQL).toMatch(/ADD COLUMN\s+"plugin_display_name" TEXT,/);
    expect(SQL).toMatch(/ADD COLUMN\s+"plugin_status" "SkillItemStatus" NOT NULL DEFAULT 'DRAFT'/);
    expect(SQL).toMatch(/ADD COLUMN\s+"plugin_validation_errors" TEXT\[\] DEFAULT ARRAY\[\]::TEXT\[\]/);
    expect(SQL).toMatch(/ADD COLUMN\s+"plugin_generation_started_at" TIMESTAMP\(3\)/);
    expect(SQL).toMatch(/ADD COLUMN\s+"plugin_latest_version" INTEGER NOT NULL DEFAULT 0/);
  });

  it("adds role, label, focus and step to job skills, defaulting to SUB", () => {
    expect(SQL).toMatch(/ADD COLUMN\s+"role" "SkillRole" NOT NULL DEFAULT 'SUB'/);
    for (const column of ["label", "focus", "step"]) expect(SQL).toMatch(new RegExp(`ADD COLUMN\\s+"${column}" TEXT NOT NULL DEFAULT ''`));
  });

  it("creates the plugin versions table, unique per job and version, deleted with the job", () => {
    expect(SQL).toContain('CREATE TABLE "skill_plugin_versions"');
    expect(SQL).toContain('CREATE UNIQUE INDEX "skill_plugin_versions_job_id_version_key" ON "skill_plugin_versions"("job_id", "version");');
    expect(SQL).toMatch(/FOREIGN KEY \("job_id"\) REFERENCES "skill_jobs"\("id"\) ON DELETE CASCADE/);
  });

  it("makes each job's first skill (by order, then creation) the main skill, after the columns exist", () => {
    expect(SQL).toContain(
      `UPDATE "skill_job_skills" SET "role" = 'MAIN' WHERE "id" IN (SELECT DISTINCT ON ("job_id") "id" FROM "skill_job_skills" ORDER BY "job_id", "order", "created_at");`,
    );
    expect(SQL.indexOf("UPDATE")).toBeGreaterThan(SQL.lastIndexOf("ADD CONSTRAINT"));
  });

  it("is additive", () => {
    expect(SQL).not.toMatch(/\bDROP\b/i);
    expect(SQL).not.toMatch(/\bRENAME\b/i);
    expect(SQL).not.toMatch(/ALTER COLUMN/i);
    const altered = [...SQL.matchAll(/ALTER TABLE "([a-z_]+)"/g)].map((m) => m[1]);
    expect(new Set(altered)).toEqual(new Set(["skill_jobs", "skill_job_skills", "skill_plugin_versions"]));
  });

  it("matches the schema", () => {
    expect(SCHEMA).toContain("enum SkillRole {");
    expect(SCHEMA).toContain("model SkillPluginVersion {");
    expect(SCHEMA).toMatch(/job\s+SkillJob\s+@relation\(fields: \[jobId\], references: \[id\], onDelete: Cascade\)\n\n\s+@@unique\(\[jobId, version\]\)\n\s+@@map\("skill_plugin_versions"\)/);
  });
});
