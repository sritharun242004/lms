-- Questions can no longer be skipped ("not relevant" toggle removed from the UI).
-- Data-only: clear any existing skips so every question counts again.
UPDATE "prompt_bot_answers" SET "not_relevant" = false WHERE "not_relevant" = true;
UPDATE "skill_job_answers" SET "not_relevant" = false WHERE "not_relevant" = true;
