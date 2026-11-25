/**
 * Real-Postgres check of the migration's data step, rolled back: run with SKILLS_PG_TEST=1 against a migrated database
 * (DATABASE_URL). Skipped otherwise, so the default suite never needs a database.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

const SQL = readFileSync(path.join(__dirname, "../../../../prisma/migrations/20261125170000_add_skill_plugins/migration.sql"), "utf8");
const DATA_STEP = SQL.slice(SQL.indexOf('UPDATE "skill_job_skills"')).trim();
class Rollback extends Error {}

describe.skipIf(!process.env.SKILLS_PG_TEST)("plugin migration on Postgres (rolled back)", () => {
  it("makes the first skill of each job (by order, then creation) MAIN and the rest SUB", async () => {
    const prisma = new PrismaClient();
    let roles: { id: string; role: string }[] = [];
    try {
      await prisma.$transaction(async (tx) => {
        const user = await tx.user.findFirstOrThrow({ select: { id: true } });
        await tx.skillJob.create({ data: { id: "pgcheck-job", userId: user.id } });
        const at = (s: number) => new Date(Date.UTC(2026, 10, 25, 12, 0, s));
        await tx.skillJobSkill.createMany({
          data: [
            { id: "pgcheck-b", jobId: "pgcheck-job", order: 1, name: "b", purpose: "p", createdAt: at(0) },
            { id: "pgcheck-a", jobId: "pgcheck-job", order: 0, name: "a", purpose: "p", createdAt: at(1) },
            { id: "pgcheck-c", jobId: "pgcheck-job", order: 0, name: "c", purpose: "p", createdAt: at(2) },
          ],
        });
        await tx.$executeRawUnsafe(DATA_STEP.replace(/;$/, ""));
        roles = await tx.skillJobSkill.findMany({ where: { jobId: "pgcheck-job" }, select: { id: true, role: true }, orderBy: { id: "asc" } });
        throw new Rollback();
      });
    } catch (error) {
      if (!(error instanceof Rollback)) throw error;
    } finally {
      await prisma.$disconnect();
    }
    expect(roles).toEqual([
      { id: "pgcheck-a", role: "MAIN" },
      { id: "pgcheck-b", role: "SUB" },
      { id: "pgcheck-c", role: "SUB" },
    ]);
  });
});
