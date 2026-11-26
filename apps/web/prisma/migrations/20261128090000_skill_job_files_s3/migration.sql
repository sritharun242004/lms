-- Skills Builder files up to 100 MB go straight from the browser to S3; the row keeps only the object key.
-- Existing rows keep their bytes in `data`, so nothing is moved or lost.
ALTER TABLE "skill_job_files" ADD COLUMN     "storage_key" TEXT,
ALTER COLUMN "data" DROP NOT NULL;

-- A direct-to-S3 upload the browser has not finished yet.
CREATE TABLE "skill_job_file_uploads" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "kind" "SkillJobFileKind" NOT NULL,
    "size" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL,
    "question_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "skill_job_file_uploads_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "skill_job_file_uploads_storage_key_key" ON "skill_job_file_uploads"("storage_key");
CREATE INDEX "skill_job_file_uploads_job_id_idx" ON "skill_job_file_uploads"("job_id");
CREATE INDEX "skill_job_file_uploads_created_at_idx" ON "skill_job_file_uploads"("created_at");
CREATE UNIQUE INDEX "skill_job_files_storage_key_key" ON "skill_job_files"("storage_key");

ALTER TABLE "skill_job_file_uploads" ADD CONSTRAINT "skill_job_file_uploads_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "skill_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
