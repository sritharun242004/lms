-- CreateEnum
CREATE TYPE "SkillJobFileKind" AS ENUM ('PPTX', 'DOCX', 'XLSX', 'PDF', 'PNG', 'JPEG');

-- CreateEnum
CREATE TYPE "SkillAnalysisStatus" AS ENUM ('PENDING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "skill_jobs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Untitled job',
    "description" TEXT NOT NULL DEFAULT '',
    "score_revision" INTEGER NOT NULL DEFAULT 0,
    "suggested_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skill_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_job_answers" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "answer" TEXT NOT NULL DEFAULT '',
    "score" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT,
    "not_relevant" BOOLEAN NOT NULL DEFAULT false,
    "scored_at" TIMESTAMP(3),

    CONSTRAINT "skill_job_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_job_files" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "asset_name" TEXT NOT NULL,
    "kind" "SkillJobFileKind" NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "facts" JSONB,
    "analysis" TEXT,
    "analysis_status" "SkillAnalysisStatus" NOT NULL DEFAULT 'PENDING',
    "analysis_started_at" TIMESTAMP(3),
    "analysis_edited" BOOLEAN NOT NULL DEFAULT false,
    "analysis_error" TEXT,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skill_job_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_job_skills" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "file_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "SkillItemStatus" NOT NULL DEFAULT 'DRAFT',
    "validation_errors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "generation_started_at" TIMESTAMP(3),
    "latest_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skill_job_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_versions" (
    "id" TEXT NOT NULL,
    "skill_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "files" JSONB NOT NULL,
    "assets" JSONB NOT NULL,
    "asset_file_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "skill_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "skill_jobs_user_id_updated_at_idx" ON "skill_jobs"("user_id", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "skill_job_answers_job_id_question_id_key" ON "skill_job_answers"("job_id", "question_id");

-- CreateIndex
CREATE INDEX "skill_job_files_job_id_created_at_idx" ON "skill_job_files"("job_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "skill_job_files_job_id_asset_name_key" ON "skill_job_files"("job_id", "asset_name");

-- CreateIndex
CREATE INDEX "skill_job_skills_job_id_order_idx" ON "skill_job_skills"("job_id", "order");

-- CreateIndex
CREATE UNIQUE INDEX "skill_job_skills_job_id_name_key" ON "skill_job_skills"("job_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "skill_versions_skill_id_version_key" ON "skill_versions"("skill_id", "version");

-- AddForeignKey
ALTER TABLE "skill_jobs" ADD CONSTRAINT "skill_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_job_answers" ADD CONSTRAINT "skill_job_answers_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "skill_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_job_answers" ADD CONSTRAINT "skill_job_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "prompt_matrix_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_job_files" ADD CONSTRAINT "skill_job_files_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "skill_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_job_skills" ADD CONSTRAINT "skill_job_skills_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "skill_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_versions" ADD CONSTRAINT "skill_versions_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skill_job_skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

