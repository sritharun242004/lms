-- Prompt Bot asks all eight Design Think core questions: the seven on the deck, then
-- "Finally: What is the systematic plan to work on this?". 20261125090000_prompt_bot_core_seven
-- switched pbq_core_8 off by mistake; this switches it back on as the last core question
-- ("order" is 0-based, so 7 is eighth). Data-only and additive: no row is inserted or deleted,
-- and the task matrices stay switched off.

-- Switch built-in core questions back on (src/lib/prompt-bot/builtin-matrices.ts)
UPDATE "prompt_matrix_questions" SET "is_active" = true, "text" = 'What is the systematic plan to work on this?', "order" = 7 WHERE "id" = 'pbq_core_8';
