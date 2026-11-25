-- CreateEnum
CREATE TYPE "SkillRole" AS ENUM ('MAIN', 'SUB');

-- AlterTable
ALTER TABLE "skill_jobs" ADD COLUMN     "company" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "plugin_display_name" TEXT,
ADD COLUMN     "plugin_generation_started_at" TIMESTAMP(3),
ADD COLUMN     "plugin_latest_version" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "plugin_name" TEXT,
ADD COLUMN     "plugin_status" "SkillItemStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "plugin_validation_errors" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "skill_job_skills" ADD COLUMN     "focus" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "label" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "role" "SkillRole" NOT NULL DEFAULT 'SUB',
ADD COLUMN     "step" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "skill_plugin_versions" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "skills" JSONB NOT NULL,
    "files" JSONB NOT NULL,
    "assets" JSONB NOT NULL,
    "asset_file_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "skill_plugin_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "skill_plugin_versions_job_id_version_key" ON "skill_plugin_versions"("job_id", "version");

-- AddForeignKey
ALTER TABLE "skill_plugin_versions" ADD CONSTRAINT "skill_plugin_versions_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "skill_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Data: every existing task becomes a plugin draft; its first skill (lowest order, then oldest) is the main skill.
UPDATE "skill_job_skills" SET "role" = 'MAIN' WHERE "id" IN (SELECT DISTINCT ON ("job_id") "id" FROM "skill_job_skills" ORDER BY "job_id", "order", "created_at");
