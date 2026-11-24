-- Prompt Bot asks only the seven Design Think core questions.
-- Data-only and additive: rows are switched off, never deleted, so stored answers
-- and sessions keep their questions. Admins can switch a matrix back on in
-- /prompt-bot/matrices; new prompts still use only the core matrix.

-- Switch off retired built-in Prompt Bot rows (src/lib/prompt-bot/builtin-matrices.ts)
UPDATE "prompt_matrix_questions" SET "is_active" = false WHERE "id" = 'pbq_core_8';
UPDATE "prompt_matrices" SET "is_active" = false, "updated_at" = NOW() WHERE "id" = 'pbm_image';
UPDATE "prompt_matrices" SET "is_active" = false, "updated_at" = NOW() WHERE "id" = 'pbm_presentation';
UPDATE "prompt_matrices" SET "is_active" = false, "updated_at" = NOW() WHERE "id" = 'pbm_writing';
UPDATE "prompt_matrices" SET "is_active" = false, "updated_at" = NOW() WHERE "id" = 'pbm_strategy';
UPDATE "prompt_matrices" SET "is_active" = false, "updated_at" = NOW() WHERE "id" = 'pbm_code';
UPDATE "prompt_matrices" SET "is_active" = false, "updated_at" = NOW() WHERE "id" = 'pbm_research';
UPDATE "prompt_matrices" SET "is_active" = false, "updated_at" = NOW() WHERE "id" = 'pbm_data';

-- Task matrices coaches created themselves are no longer offered either.
UPDATE "prompt_matrices" SET "is_active" = false, "updated_at" = NOW() WHERE "kind" = 'TASK' AND "is_active" = true;
