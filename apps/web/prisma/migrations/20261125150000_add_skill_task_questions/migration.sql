-- CreateEnum
CREATE TYPE "SkillQuestionSource" AS ENUM ('AI', 'USER');

-- CreateEnum
CREATE TYPE "SkillQuestionKind" AS ENUM ('FIXED', 'PER_USE');

-- CreateEnum
CREATE TYPE "SkillFileHint" AS ENUM ('REFERENCE', 'INPUT', 'TEMPLATE', 'BRAND');

-- AlterTable
ALTER TABLE "skill_jobs" ADD COLUMN     "output_type" TEXT,
ADD COLUMN     "questions_generated_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "skill_job_files" ADD COLUMN     "question_id" TEXT;

-- CreateTable
CREATE TABLE "skill_job_questions" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "guidance" TEXT NOT NULL DEFAULT '',
    "wants_files" BOOLEAN NOT NULL DEFAULT false,
    "file_hint" "SkillFileHint",
    "file_note" TEXT NOT NULL DEFAULT '',
    "source" "SkillQuestionSource" NOT NULL DEFAULT 'AI',
    "kind" "SkillQuestionKind" NOT NULL DEFAULT 'FIXED',
    "required" BOOLEAN NOT NULL DEFAULT true,
    "legacy_question_id" TEXT,
    "answer" TEXT NOT NULL DEFAULT '',
    "score" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT,
    "scored_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skill_job_questions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "skill_job_questions_job_id_order_idx" ON "skill_job_questions"("job_id", "order");

-- CreateIndex
CREATE INDEX "skill_job_files_question_id_idx" ON "skill_job_files"("question_id");

-- AddForeignKey
ALTER TABLE "skill_job_files" ADD CONSTRAINT "skill_job_files_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "skill_job_questions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_job_questions" ADD CONSTRAINT "skill_job_questions_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "skill_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Data: every existing job gets the active skill-definition questions as FIXED task questions,
-- carrying its answers, scores and reasons. Deterministic ids make a re-run a no-op.
INSERT INTO "skill_job_questions" ("id", "job_id", "order", "text", "guidance", "wants_files", "file_hint", "source", "kind", "required",
  "legacy_question_id", "answer", "score", "reason", "scored_at", "created_at", "updated_at")
SELECT 'sjq_' || md5(j."id" || ':' || q."id"), j."id", q."order", q."text", q."guidance",
  q."id" IN ('pbq_skill_3', 'pbq_skill_5', 'pbq_skill_7'),
  CASE q."id" WHEN 'pbq_skill_3' THEN 'INPUT'::"SkillFileHint" WHEN 'pbq_skill_5' THEN 'REFERENCE'::"SkillFileHint"
    WHEN 'pbq_skill_7' THEN 'TEMPLATE'::"SkillFileHint" ELSE NULL END,
  'AI'::"SkillQuestionSource", 'FIXED'::"SkillQuestionKind", true, q."id",
  COALESCE(a."answer", ''), COALESCE(a."score", 0), a."reason", a."scored_at", NOW(), NOW()
FROM "skill_jobs" j
JOIN "prompt_matrices" m ON m."slug" = 'skill-definition' AND m."kind" = 'SKILL'
JOIN "prompt_matrix_questions" q ON q."matrix_id" = m."id" AND q."is_active" = true
LEFT JOIN "skill_job_answers" a ON a."job_id" = j."id" AND a."question_id" = q."id"
ON CONFLICT ("id") DO NOTHING;

UPDATE "skill_jobs" j SET "questions_generated_at" = j."created_at"
WHERE j."questions_generated_at" IS NULL AND EXISTS (SELECT 1 FROM "skill_job_questions" sq WHERE sq."job_id" = j."id");
