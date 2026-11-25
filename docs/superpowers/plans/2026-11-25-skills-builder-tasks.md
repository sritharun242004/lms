# Skills Builder Tasks Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This is a **lean** plan: each task gives files, interfaces, key test cases and acceptance criteria; the implementer writes the code test-first against the spec.

**Goal:** Turn the shipped "jobs" Skills Builder into **Tasks**: three steps (Task · Questions · Skills); a ≥ 500-character description with AI **Enhance**; 5–8 AI questions per task (output type inferred, inputs and assets first, essentials always covered) split into **fixed** questions answered now — every one with its own upload — and **per-use** inputs the generated skill asks for at the start of every run; skills generated from all of it.

**Architecture:** One additive migration adds `skill_job_questions` (fixed questions and per-use inputs in one table, answers as columns), `skill_job_files.question_id` (`SET NULL`), `skill_jobs.questions_generated_at` / `output_type`, and copies each existing job's 8 matrix answers into fixed questions. Two new in-request Claude calls (`enhanceTaskBrief` Haiku, `writeTaskQuestions` Opus). Pure modules own the rules (`questions.ts` clean-up and essentials, `planQuestionChanges` regeneration, `assemble.ts` "Before you start" + style guide by question). The UI is built against the spec's API contract with a mocked client, so server and UI proceed in parallel.

**Tech Stack:** Next.js 16.2 App Router, React 19, TypeScript, Prisma 6 (PostgreSQL), Zod 3, `@anthropic-ai/sdk` 1.13, Vitest 3 + Testing Library (jsdom), LMS UI kit. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-25-skills-builder-tasks-design.md` — the **API Contract** section (view types, routes, client functions, migration outline) is the binding interface between Track A and Track B. Read the whole spec first.

## Tracks

| Track | Owner | Tasks | Depends on | Gate |
|---|---|---|---|---|
| **A — Server** | agent 1 | A0–A11 | spec only | `npx vitest run src/lib src/app/api && npx tsc --noEmit && npx eslint src/ && npx prisma migrate status && npx next build` |
| **B — UI** | agent 2 | B0–B9 | spec only (types + mocked client) | `npx vitest run "src/app/(app)/prompt-bot" src/components && npx tsc --noEmit && npx eslint src/` |
| **C — Integration + E2E** | either, after A and B are green | C1–C3 | A and B merged on the branch | browser run + `quick_validate.py` oracle |

Shared-file rule (to avoid conflicts): **Track A owns** `prisma/**`, `src/lib/**` (except `src/lib/skills/jobs/client.ts`), `src/app/api/**`, `scripts/**`. **Track B owns** `src/app/(app)/prompt-bot/**`, `src/components/prompt-bot/**`, `src/lib/skills/jobs/client.ts`. `src/lib/skills/jobs/types.ts` and `src/lib/skills/jobs/task-text.ts` are written **once, first, by Track A in A1** (the contract's exact types); Track B starts by pulling A1 (or, if running fully in parallel, copies A1's two files verbatim from the spec's contract and drops its copy when A1 lands). Both tracks work on `feat/skills-builder-tasks` in separate worktrees and rebase onto each other only at Track C.

## Global Constraints

- Scope `apps/web` and `docs/`. Do not commit unless the human partner says so (each task ends with the commit command to use then). Conventional Commits, `feat(skills-builder): …`.
- **Naming:** UI copy, server messages, prompts and README say **Task**; internal names (`SkillJob*`, `skill_jobs`, `/skill-jobs/**`, `[jobId]`, error codes) stay `job`. Hash aliases `#job` → `#task`, `#files` → `#questions`.
- **Migrations:** additive only; DDL from `npx prisma migrate diff --from-schema-datamodel <HEAD schema> --to-schema-datamodel prisma/schema.prisma --script`, data block appended verbatim from the spec; apply with `npx prisma migrate deploy`. Never `migrate dev`/`reset`/`db push`/`DROP`/`RENAME`/`ALTER COLUMN`.
- **AI (from the `claude-api` skill, never guessed):** Enhance = `claude-haiku-4-5`, `messages.create`, `output_config: { format: json_schema }`, `max_tokens 3000`, request options `{ timeout: 45_000, maxRetries: 1 }`. Questions = `claude-opus-5-5`, `beta.messages.create`, `betas: ["server-side-fallback-2026-07-01"]`, `fallbacks: "default"`, `output_config: { format, effort: "low" }`, `max_tokens 8000`, `{ timeout: 90_000, maxRetries: 0 }`. No `thinking` param. Both under App Runner's 120 s.
- **Usage:** new `skill_enhance` (30/day), `skill_questions` (20/day); spend after cheap checks, before the call.
- **Limits:** 500-char description (trimmed) to write questions; Enhance from 5 words; ≤ 8 AI fixed questions, ≤ 12 fixed per task; ≤ 10 AI per-use, ≤ 15 per task; text ≤ 300, per-use label ≤ 120, guidance/hint ≤ 300, fileNote ≤ 120, outputType ≤ 60; 10 files per task.
- **Generic:** no per-output-type code paths or lists anywhere; output types, asset questions and the fixed/per-use split come from the prompt (rules + illustrations).
- **Uploads:** every FIXED question takes uploads; `wantsFiles`/`fileHint`/`fileNote` only make it prominent; PER_USE never.
- **Unchanged:** ownership 404, error mapping via `jobErrorResponse`, no prompt/file text in logs (`error.name` only), sniffing/extraction/analysis concurrency + heartbeat + staleness, generation/versions/zips/downloads, `SafeMarkdown`, `ConfirmDialog` only.
- **Tests:** Vitest `src/**/*.test.ts`; components with `React.createElement` and `/** @vitest-environment jsdom */`; Prisma/auth/`after`/Claude mocked with `vi.hoisted`. Prefer **new** test files; when an existing test must change, change only what the task names. Failing test first, every time.
- **UI:** invoke `impeccable` before each B task with UI, then `fixing-accessibility`; LMS design system; 44 px targets on phones; 390 px and 360 px without horizontal scroll; dark mode.

## Review Focus

1. **Existing jobs after deploy** open with 8 fixed questions holding their answers/scores, files under General files, still generate/download; a short old description never locks Questions/Skills (questions exist). → A2 real-Postgres check, A3 view test, B2 `canLeaveTask`.
2. **Regenerate after work** keeps answers/files of questions whose wording returns, the user's own questions and per-use inputs; dropped questions' files land in General files. → A6 `planQuestionChanges`, A2 FK `SET NULL`.
3. **A model that ignores instructions** (missing essential, 12 questions, per-use items mixed in, its own "Before you start") → server still covers every essential within 8, moves per-use items, writes exactly one section. → A5, A9, C1 fake draft.
4. **Double submit / slow calls** → buttons disabled while running, one unit per accepted request, calls under 120 s. → A4 options, B3/B7 disabled states.
5. **Files on the wrong target** (another task's question, a per-use id, stale id) → 404 before the body is read or a unit spent. → A8.

---

## Track A — Server

Run from `apps/web`. Each task: write the listed tests first (watch them fail), implement, run `npx vitest run <tests> && npx tsc --noEmit`, commit.

### A0: Baseline
- [ ] `git status` clean on `feat/skills-builder-tasks` (based on `509eb06`); `npx vitest run && npx tsc --noEmit && npx eslint src/ && npx prisma migrate status` green. Stop and report if not.

### A1: Contract types, limits, usage features, text helpers
**Files:** `src/lib/skills/jobs/types.ts` (add `FileHint`, `FILE_HINTS`, `QuestionKind`, `QuestionSource`, `TaskQuestionView`, `PerUseInput`, `QuestionInput`, `RawTaskQuestions`; `JobView` += `questionsGeneratedAt`, `outputType`, `questions`; `JobFileView` += `questionId`), `src/lib/skills/limits.ts`, `src/lib/ai/usage.ts`, new `src/lib/skills/jobs/task-text.ts`.
**Interfaces produced:** exactly the spec contract types; `JOB_LIMITS` += `descriptionMinChars 500, enhanceMinWords 5, aiQuestionsMax 8, questionsPerTask 12, aiPerUseMax 10, perUseInputsPerTask 15, questionTextChars 300, perUseLabelChars 120, questionGuidanceChars 300, fileNoteChars 120, outputTypeChars 60`; `ENHANCE_TIMEOUT_MS = 45_000`, `QUESTIONS_TIMEOUT_MS = 90_000`; `AiFeature` += `skill_enhance` (30), `skill_questions` (20); `wordCount`, `descriptionLength` (trimmed), `tooShortMessage(312)` → `"Add a bit more detail — at least 500 characters (312/500)"`, `outputTypeHeading("Instagram carousel")` → `"Questions for an Instagram carousel"` (a/an; null for null/blank). Keep `JobView.matrix` for now (A3 fills it as a projection; B9 removes it).
**Key tests (new files `task-limits.test.ts`, `usage-task-features.test.ts`, `task-text.test.ts`):** exact limit values; `ENHANCE_TIMEOUT_MS * 2 < 120_000`; `normalizeLimits({})` has both new defaults; word count over mixed whitespace; heading a/an.
**Accept:** tests green; `tsc` reports only the new required fields missing in existing fixtures — add `questionsGeneratedAt: null, outputType: null, questions: []` to every `JobView` fixture and `questionId: null` to every `JobFileView` fixture helper (grep `suggestedAt: null` and `bundlable:` in `*.test.ts`; Track B owns UI test files — coordinate: A adds the fields there in this one commit and tells B).

### A2: Schema, migration and data migration
**Files:** `prisma/schema.prisma`, `prisma/migrations/20261125150000_add_skill_task_questions/migration.sql`, test `src/lib/skills/jobs/task-migration.test.ts`.
**Do:** model `SkillJobQuestion` and enums exactly as the spec's Data Model; `SkillJob.questionsGeneratedAt/outputType/questions`; `SkillJobFile.questionId` + relation `onDelete: SetNull` + `@@index([questionId])`. Generate DDL with `migrate diff`, append the spec's data block (with `kind`/`required`), `migrate deploy`, `prisma generate`.
**Key tests (read the SQL file as text):** three `CREATE TYPE`s; nullable `question_id`, `output_type`, `questions_generated_at`; `file_note TEXT NOT NULL DEFAULT ''`, `kind … DEFAULT 'FIXED'`, `required … DEFAULT true`; `ON DELETE SET NULL` file FK and `ON DELETE CASCADE` job FK; the data `INSERT … SELECT` with `md5` ids, active `skill-definition` questions, `LEFT JOIN skill_job_answers`, `ON CONFLICT ("id") DO NOTHING`, the `UPDATE … questions_generated_at`; no `DROP`/`RENAME`/`ALTER COLUMN`; `ALTER TABLE` only on `skill_jobs`, `skill_job_files`, `skill_job_questions`.
**Real-Postgres check (no commit):** a `DO $$ … $$` block via `npx prisma db execute` that inserts an old-shape job + one `skill_job_answers` row (`pbq_skill_1`, "Every month", 3), runs the data `INSERT` twice, asserts 8 rows with that answer carried, then `RAISE EXCEPTION 'MIGRATION_CHECK_OK …'` so everything rolls back; and a count of jobs without questions = 0.
**Accept:** test green, `migrate status` up to date, `MIGRATION_CHECK_OK n=8 answered=1`, `JOBS_WITHOUT_QUESTIONS=0`.

### A3: Views and answers on task questions
**Files:** `src/lib/skills/jobs/jobs.ts`; test `task-view.test.ts`; trim superseded tests in `jobs.test.ts`.
**Produces:** `questionOrder = [{order:"asc"},{createdAt:"asc"}]`, `toQuestionView`, `toQuestionAnswer` (notRelevant false), `loadJobView` (includes `questions`, `outputType`, `questionsGeneratedAt`, `answers` from FIXED rows, `files[].questionId`, temporary `matrix` projection of FIXED rows), `saveJobAnswer` (updateMany `{ id, jobId, kind: "FIXED" }`; `notRelevant`-only patch → existence check; `"no-question"` when count 0), `jobQuestionContext` (FIXED rows → `PromptQuestionContext[]`), `jobPerUseInputs` (PER_USE rows → `PerUseInput[]`).
**Key tests:** both kinds returned in order; answers only for FIXED; bytes/facts never read (`omit`); per-use answer save → `no-question`; notRelevant ignored; foreign task → `JobNotFoundError`.
**Accept:** `src/lib/skills/jobs` and `src/app/api/v1/prompt-bot/skill-jobs` suites green.

### A4: Claude calls and prompts
**Files:** `src/lib/skills/jobs/instructions.ts` (`ENHANCE_TASK_SYSTEM`, `QUESTIONS_SYSTEM`, `buildEnhanceTaskMessage`, `buildQuestionsMessage`, private `taskSection(title, description, outputType?)`), `src/lib/ai/claude.ts` (`structured()` gains `effort`; `enhanceTaskBrief`, `writeTaskQuestions`); tests `task-prompts.test.ts`, `claude-task.test.ts`.
**Prompt rules (assert as text):** Enhance sections in order Purpose · When it's used · **Same every time** · **Varies each time** (with a "Varies each time: …" line) · Steps · Output · Audience · Quality bar · Constraints; first person, 150–450 words, never invent, italic questions where nothing to go on. Questions: "Whatever the task is, always do all four" (a) output type from the full taxonomy incl. audio/podcast, contract/policy, financial model, research, code/automation, plan/checklist, **other**; (b) inputs and assets first with `wantsFiles` + `fileHint` + `fileNote`; (c) `kind "fixed"` vs `kind "per_use"` + `perUseInputs`, "Never ask the person to answer these now"; (d) the six essentials (`- triggers:` … `- avoid:`), "Ask 5 to 8 fixed questions"; illustrations (Instagram carousel 1080×1350, explainer video storyboard, client SLA document, monthly financial report) marked "They are not a menu"; keep exact wording on regenerate; never invent.
**Schema:** `{ outputType, perUseInputs[{label,hint,required}], questions[{text,guidance,kind enum[fixed,per_use],wantsFiles,fileHint enum[REFERENCE,INPUT,TEMPLATE,BRAND,NONE],fileNote,covers enum[six essentials]}] }`.
**Key tests:** model ids, beta + `fallbacks: "default"`, `effort: "low"` only on questions, request options exact, `max_tokens`, no `thinking`, schema enums/required, empty brief → `AiResponseError`, brief cut to 20 000, `max_tokens` stop or schema mismatch → `AiResponseError`; `buildQuestionsMessage` lists `- [fixed] … (answered)` / `- [per_use] …` in `<existing_questions>` only when there are some.
**Accept:** `src/lib/ai` and new tests green; existing `claude.test.ts` unchanged and green.

### A5: Question clean-up
**Files:** new `src/lib/skills/jobs/questions.ts`; test `questions.test.ts`.
**Produces:** `ESSENTIALS`, `Essential`, `CleanQuestion {text,guidance,wantsFiles,fileHint,fileNote,covers}`, `FALLBACK_QUESTIONS` (one generic question per essential, e.g. avoid → "What should it never do?"), `normalizeQuestionText` (case, spaces, trailing `?.!:`), `cleanOutputType` (one line ≤ 60, blank → null), `cleanQuestionSet(raw) → { outputType, fixed, perUse }`.
**Rules:** fixed = non-`per_use` questions, one-lined and capped, empty/duplicate dropped, first 8 kept; `wantsFiles` false clears hint and note, true + `NONE` → `REFERENCE`; unknown covers ignored; for each uncovered essential append its fallback, first dropping from the end questions whose essentials others cover so the total stays ≤ 8. Per-use = `per_use` questions (label = text, hint = guidance, required true) + `perUseInputs`; one-lined, label ≤ 120, deduped against each other and the fixed questions, ≤ 10.
**Key tests:** dedupe; hint/note rules; fallback appended; 8 crowded `output` questions → exactly 8 with every essential covered and the model's first three kept; per-use from both sources, dedupe across lists, cap 10, label cut 120.
**Accept:** green; no per-type logic.

### A6: Errors, regeneration plan, write questions
**Files:** `errors.ts` (+`QuestionNotFoundError`, `TooManyQuestionsError(kind)`, `DescriptionTooShortError(length)`, `EnhanceInputTooShortError`), `http.ts` (mapping per the contract; `notFound("Question")`), new `task-questions.ts` (`ExistingRow`, `NextRow`, `QuestionPlan`, `planQuestionChanges`, `generateQuestionsForTask`); tests `task-http.test.ts`, `question-plan.test.ts`, `generate-questions.test.ts`.
**Rules:** plan matches by normalised text across kinds; a match keeps the row (new order; refresh guidance/wantsFiles/fileHint/fileNote only for AI rows of the same kind; PER_USE refresh = guidance only); unmatched → create (source AI); leftover USER rows kept after the new set; leftover AI rows removed. `generateQuestionsForTask`: ownership 404 → `DescriptionTooShortError` before any unit → `consumeAiUsage("skill_questions")` → `writeTaskQuestions(buildQuestionsMessage(… existing with kind/answered))` → `cleanQuestionSet` → **one** `$transaction([deleteMany(remove), updateMany per keep, createMany(create), skillJob.update({ questionsGeneratedAt, outputType })])` → `loadJobView`.
**Key tests:** each error's status/code/message (exact strings in the contract); plan keep/refresh/create/remove/USER-after/duplicate reuse; generate: short description → no unit, unit before AI call, exact transaction ops and orders, AI failure → no transaction.
**Accept:** green.

### A7: Add, edit, move, delete questions
**Files:** `task-questions.ts` (`addQuestion`, `updateQuestion`, `deleteQuestion`); test `question-edit.test.ts`.
**Rules:** caps per kind (`TooManyQuestionsError(kind)`); add → `source: USER`, order after max, per-use never wants files, label ≤ 120; update → kind change checks the target cap; `wantsFiles` false (or PER_USE) clears hint and note; moving FIXED → PER_USE runs `$transaction([update, skillJobFile.updateMany({ jobId, questionId } → null)])`; answer text stays on the row; delete relies on the FK to make files general.
**Key tests:** add fixed/per-use payloads; full kind; foreign task/question 404; move detaches files in one transaction; move into a full kind refused; required toggle.
**Accept:** green.

### A8: Routes — enhance, questions, upload with question
**Files:** new `enhance.ts` (`enhanceTask`: ownership → ≥ 5 words else `EnhanceInputTooShortError` → `skill_enhance` unit → `enhanceTaskBrief(buildEnhanceTaskMessage({ title, description }))`), new `question-input.ts` (zod `QuestionBody`, `QuestionPatch` per the contract), routes `[id]/enhance`, `[id]/questions`, `[id]/questions/generate`, `[id]/questions/[questionId]`; `files.ts` (`assertTaskQuestion` = FIXED of this task else `QuestionNotFoundError`; `storeJobFile` takes `questionId`, checks it before `readUpload`, stores it); `[id]/files/route.ts` reads `?questionId=` and asserts it before reading the body. Tests: `enhance.test.ts`, `enhance-route.test.ts`, `question-routes.test.ts`, `file-question-link.test.ts`, `upload-question-route.test.ts`; existing `file-routes.test.ts` expectation gains `questionId: null`.
**Key tests:** 401/503-before-work/400 bodies (empty, >300, bad enums, per-use label >120, >20 000 description)/201/200/404 "Question not found"/409/400 `DESCRIPTION_TOO_SHORT` message; enhance needs 5 words before spending; upload with a foreign or PER_USE id → 404, body never read, no unit; without `questionId` → general file.
**Accept:** `src/app/api` green; `next build` lists the four new routes.

### A9: Scoring, assembly, suggest/generate
**Files:** `jobs.ts` (`jobScoringBase(job, questions, files)` = `Task:` + `Files for "<q>":` per question + `General files:`, ≤ 12 000; `runJobScoring` on FIXED rows only, `{ applied:false, revision, answers:[] }` and no unit when none; writes `skillJobQuestion.updateMany`), `assemble.ts` (`PlanInputFile.questionId`; `QuestionRef`; `BEFORE_YOU_START_HEADING`; `beforeYouStartSection`; `withBeforeYouStart` (after first `# ` title, replaces a model-written "Before you start" section, unchanged without per-use); style guide `## For "<question>"` → `### <file>` → analysis demoted to `####`, then `## General files`; files-section line `Added for the question "<q>".`; `assembleJobSkill(name, draft, plan, { questions?, perUse? })`), `instructions.ts` (`PromptFile.questionId`; `buildSuggestMessage`/`buildJobGenerateMessage` with `outputType`, `<questions>` blocks holding answer + attached files, `<general_files>`, `<gaps>`, `<ask_each_time>`; updated `SUGGEST_SYSTEM`/`GENERATE_JOB_SYSTEM` with the ask-each-time rule), `skills.ts` and `generate.ts` (select `outputType`, pass `jobPerUseInputs`, questions and `questionId`s). Tests: `task-scoring.test.ts`, `assemble-questions.test.ts`, `task-messages.test.ts`; update `assemble.test.ts` (guide heading levels), `generate.test.ts` (`### Logo.png`, mock `jobPerUseInputs`, new test: per-use reaches prompt and SKILL.md), `skills.test.ts` (mock `jobPerUseInputs`), delete superseded builder tests in `instructions.test.ts`.
**Key tests:** scoring base grouping/cap/no-unit; exact "Before you start" text and `(required)`/`(if available)`; exactly one section when the model wrote one; assembled skill passes `validateJobSkill`; generate prompt contains every per-use input and `GENERATE_JOB_SYSTEM` contains "Never fill them in, guess them or invent values" and 'Do not write a "Before you start" section'.
**Accept:** `src/lib/skills` green.

### A10: Task copy on the server
**Files:** `http.ts` (`notFound` labels Job → "Task"; all "job" messages → "task"), `errors.ts`, `pack-docs.ts` ("## What this task is", "Just ask Claude for the task…"); test `task-copy.test.ts`; update tests that pin old strings (grep `Describe the job first|in this job|A job can have|Job not found|What this job is`).
**Accept:** README contains no word "job"; green.

### A11: Fake Anthropic shapes and cross-type route test
**Files:** new `scripts/fake-anthropic-shapes.mjs` (+ `scripts/fake-anthropic-shapes.d.mts` declaring its exports), `scripts/fake-anthropic.mjs` (route `brief` → `[fake] enhance-task`; `questions`+`perUseInputs` → `[fake] questions <kind>[ (regenerate)]`; generate draft body gains its own "## Before you start — ask the user for" section); tests `src/lib/skills/jobs/fake-questions.test.ts`, `src/app/api/v1/prompt-bot/skill-jobs/task-types.test.ts`.
**Shapes:** `TASK_DESCRIPTIONS` (≥ 500 chars each) and canned replies for five kinds picked by keywords in the `<task>` block — carousel (`Instagram carousel`), video (`explainer video`), sla (`client SLA document`), finance (`monthly financial report`), other (`client dinner wine list`); each has ≥ 1 `wantsFiles` asset question with a specific hint and note, one `per_use` question, `perUseInputs`, and leaves `avoid` uncovered; regenerate repeats the first three fixed texts verbatim. `enhanceReply` returns a ≥ 500-char brief with "## Same every time" and "## Varies each time".
**Key tests:** every reply parses with the real zod schema shape; the carousel reply through `cleanQuestionSet` has BRAND/INPUT/REFERENCE asks and a `1080×1350` format question; `task-types.test.ts` calls the real `POST …/questions/generate` route (Prisma mocked, `writeTaskQuestions` answered by the shapes) for all five descriptions and asserts per type: stored `outputType`, both FIXED and PER_USE rows created, ≥ 1 FIXED row with `wantsFiles` and a hint, every row with a hint has `wantsFiles`, "What should it never do?" appended.
**Accept:** Track A gate green (see Tracks table).

---

## Track B — UI

Build against the spec's API Contract with `@/lib/skills/jobs/client` mocked in every test. Run from `apps/web`. Invoke `impeccable` before each task with UI; finish with `fixing-accessibility`.

### B0: Baseline and contract types
- [ ] Baseline green. If A1 has not landed, copy the contract's types into `types.ts` and `task-text.ts` exactly as the spec writes them (same names) and note it; drop the copy when rebasing onto A1.

### B1: Client calls
**Files:** `src/lib/skills/jobs/client.ts`; test `client-tasks.test.ts` (fetch stubbed as in `client.test.ts`).
**Produces:** `enhanceTask`, `generateQuestions`, `addQuestion`, `patchQuestion`, `deleteQuestion`, `uploadJobFile(jobId, file, questionId?)` per the contract.
**Key tests:** URLs/methods/bodies; `&questionId=` encoded only when given.

### B2: Steps model
**Files:** `[jobId]/job-steps.ts` + its test.
**Produces:** `JobStep = "task" | "questions" | "skills"`, labels Task/Questions/Skills, `stepFromHash` with `#job`→task, `#files`→questions, unknown→task; `canLeaveTask(description, questionCount)` (questions exist OR trimmed ≥ 500); `fixedQuestions(questions)`. Poll helpers unchanged.
**Key tests:** the alias table; 499/500 (trimmed) boundary; old short job with questions passes.

### B3: Task step with Enhance
**Files:** new `[jobId]/task-panel.tsx` (replaces `describe-panel.tsx` in B8) + test.
**Behaviour (spec Step 1):** label "Describe the task"; counter `312 / 500 minimum` below 500 (trimmed) else `1,234 / 20,000`; message "Add a bit more detail — at least 500 characters (312/500)" with id `task-description-${jobId}-short`, in the textarea's `aria-describedby`; **Enhance** (Sparkles) enabled only with AI and ≥ 5 words, "Enhancing…" while running; result panel "Suggested brief" (`SafeMarkdown`) with **Use this** / **Keep mine**; after Use this: "Replaced with the suggested brief." + **Undo**; Undo ends on typing, next Enhance or Keep mine; server error inline (`role="alert"`); hint card "A good brief covers" (purpose, when, same every time, varies each time, steps, output and audience, quality bar, constraints).
**Key tests (stateful harness):** message + describedby; long counter; Enhance enable rule incl. no AI; Use this → `onDescriptionChange(brief)`; Undo restores; typing clears Undo; Keep mine; error alert; `enhanceTask` called with the unsaved box text.

### B4: File card module
**Files:** new `[jobId]/file-card.tsx` (move `FileCard`, `UploadRows`, constants verbatim out of `files-panel.tsx`; add `useUploadQueue({ jobId, questionId, enabled, onFileChange }) → { rows, enqueue, dismiss }` that calls `uploadJobFile(jobId, file, questionId)` only when a question is given); `files-panel.tsx` uses it; test `file-card.test.ts`.
**Accept:** existing `files-panel.test.ts` green unchanged (behaviour preserved); new tests: question id passed, general upload has two args, disabled = no calls, > 20 MB refused on its row.

### B5: Files per question and General files
**Files:** new `[jobId]/question-files.tsx` + test.
**Produces:** `HINT_LABEL` (TEMPLATE "Template or design system", REFERENCE "Reference or example", INPUT "Input data", BRAND "Brand assets"); `QuestionFiles({ jobId, question | null, files, aiConfigured, onFileChange, onFileRemoved })`.
**Behaviour:** every FIXED question: section "Files for this question", hidden input + button; `wantsFiles` → primary **Add files**, hint badge, `fileNote` (fallback "This question asks for a file. Add one if you have it."); otherwise outline **Add files (optional)**; helper "PowerPoint, Word, Excel, PDF, PNG or JPG · up to 20 MB each · 10 files per task"; drop zone (`data-testid="file-drop-zone"`); file cards. `question === null` → "General files" card with the note "…Your skills still use them." and no upload. Disabled without AI and for PER_USE.
**Key tests:** prominent vs optional variants; note fallback; upload sends `questionId`; general has no input; disabled states.

### B6: Question editor
**Files:** new `[jobId]/question-editor.tsx` + test.
**Behaviour:** form (aria-label "Add a question"/"Edit question"): Question (≤ 300, required), "What a good answer includes" (optional), checkbox "Highlight the upload for this question" (+ note "Every question can take files…"), when checked: "Kind of file" select (`HINT_LABEL`) and "What to upload" (≤ 120); Save ("Add question"/"Save question") disabled when empty or saving; Cancel; inline error.
**Key tests:** add payload `{ text, guidance, wantsFiles, fileHint, fileNote }` (hint/note null/"" when not highlighted); edit prefilled; cancel; error shown.

### B7: Per-use checklist
**Files:** new `[jobId]/per-use-list.tsx` + test.
**Behaviour (spec Layout):** card "Claude will ask each time" + help line; rows: label input (aria "Input name", saved on blur, blank reverts), hint input (placeholder "Hint or example, optional", saved on blur), **Required** checkbox (patch `required`), **Move to "Answer now"** (patch `kind: "FIXED"`), **Remove** (`deleteQuestion`, no confirm); **Add input** form (label, hint, Required default on → `addQuestion({ kind: "PER_USE", … })`), disabled at 15; empty state text; errors inline, value reverted. Buttons labelled with the input's name.
**Key tests:** each patch payload; unchanged blur → no call; move/remove callbacks; add; cap; error revert.

### B8: Questions page
**Files:** `src/components/prompt-bot/matrix-panel.tsx` (optional `subheading` under the heading; small new test), `[jobId]/questions-panel.tsx` (rewrite) + new test replacing `questions-panel.test.ts`.
**Props:** `{ job, state: MatrixAnswers, aiConfigured, visible, description, flushSaves, onQuestionsWritten(view), onQuestionChange(q), onQuestionRemoved(id), onFileChange, onFileRemoved }`.
**Behaviour:** no questions → empty card "Questions for this task" + **Write questions** (disabled with the 500 message when short; spinner "Writing questions for this task…"); auto-write **once** when `visible`, AI on, description ≥ 500, no questions and `questionsGeneratedAt` null (schedule via `setTimeout(0)` inside the effect, guard with a ref set inside the callback — no setState in the effect body); calls `flushSaves()` then `generateQuestions`. With questions: `MatrixPanel` heading **"Answer now (same every time)"**, `subheading = outputTypeHeading(outputType)`, FIXED rows only (readiness over FIXED), children: **Add question**, **Regenerate** (one `ConfirmDialog`: "Write new questions?" + the spec's keep/remove text) and the scoring note; right card: selected question label + icon buttons **Edit**, **Move to "Claude will ask each time"**, **Delete** (destructive confirm "Delete this question?" / "Its answer is deleted. Its files move to General files."), answer textarea (guidance placeholder, 4000, ⌘/Ctrl+Enter), `AnswerCheck`, `QuestionFiles` for that question; `QuestionEditor` replaces the card while adding/editing; **General files** card when any file has no FIXED question; full-width `PerUseList` below.
**Key tests (stub `QuestionFiles`/`PerUseList`):** auto-write once (not when short, not when `questionsGeneratedAt` set); Write questions disabled when short; heading + subtitle; readiness counts FIXED only; regenerate confirms then writes; add/edit/move/delete call the right client functions and callbacks; files routed to the selected question vs General.

### B9: Workspace wiring and Task copy
**Files:** `[jobId]/job-workspace.tsx`; delete `describe-panel.tsx(.test)`, `files-panel.tsx`; move `files-panel.test.ts` → `question-files-cards.test.ts` rendering `QuestionFiles` with a FIXED question `q1` (change: import/mount; upload expectations gain `"q1"`; "Upload files" → /Add files/; drop the "No files yet…" assertion); `job-workspace.test.ts` (mock `./task-panel` as `mocks.panels.task`, `./questions-panel` as `mocks.panels.questions` rendering `fileName:status`; rename `panels.describe`→`task`, `panels.files`→`questions`; rewrite the step tests); copy in `skills/page.tsx`, `new-job-form.tsx`, `skills-panel.tsx`, `skill-card.tsx`, `legacy-pack-view.tsx` and their tests; remove `JobView.matrix` (coordinate with Track A: one-line removal in `types.ts` + `jobs.ts`, done in Track C if A has merged).
**Behaviour:** steps **1 Task · 2 Questions (N of M fixed) · 3 Skills (n)**; Questions/Skills buttons and **Next** disabled while `!canLeaveTask` (Next `aria-describedby` = the task panel's short-message id; a locked hash shows Task); `onQuestionsWritten` replaces questions/outputType/questionsGeneratedAt and files' `questionId`, marks stale, and runs **one** `check()` only on the first write (remove the mount-time "never scored" effect); `onQuestionChange`/`onQuestionRemoved` upsert/remove and make affected files general locally; gaps/readiness over FIXED questions. Copy per the spec's UI Summary: "New task", "Task title (optional)", "What's the task?", "Start task", "Your tasks", "Show all tasks", "Turn a task you do every week…", "Rename task", "Delete task" / "Delete this task?", "This task was deleted" / "Back to your tasks", "Skills for this task", "A task can have at most 5 skills.", "No files in this task yet. Add them to your questions.", "Start a new task to build skills from your files.", privacy line "Your task, files and answers…".
**Key tests:** gating (locked/unlocked/old job with questions); `#job`/`#files` links; first-write check exactly once; question move makes files general; badges; renamed labels; `grep -rniw "job\|jobs"` over the touched `.tsx` shows identifiers only.
**Accept:** Track B gate green; `npm run dev` look at 390 × 844 and 360 px, light and dark, on a migrated job (no horizontal scroll, 44 px targets, focus visible).

---

## Track C — Integration and end to end

### C1: Merge and integrate
- [ ] Rebase B onto A (or merge both into the branch); drop any B0 type copy; remove `JobView.matrix` from `types.ts`/`jobs.ts` and its assertion in `task-view.test.ts` if B9 did not.
- [ ] Full gate: `npx vitest run && npx tsc --noEmit && npx eslint src/ && npx prisma migrate status && npx next build`.

### C2: Browser E2E (fake API)
Use the `agent-browser` skill, isolated session, a MENTEE account; `FAKE_FIRST_INVALID=1 node scripts/fake-anthropic.mjs` + `ANTHROPIC_BASE_URL=http://127.0.0.1:4010 ANTHROPIC_API_KEY=test npm run dev`; fixtures from `npx tsx scripts/make-skill-fixtures.ts "$OUT/in"`.
- [ ] **Old job:** open a job created before the migration → 8 questions with its answers and bars, its files under General files, existing versions download; `#job` opens Task, `#files` opens Questions.
- [ ] **Carousel quick check:** new task with `TASK_DESCRIPTIONS.carousel` → Questions shows "Questions for an Instagram carousel", brand-asset/images/past-posts questions with prominent **Add files**, other questions **Add files (optional)**, per-use list has the topic and slide copy.
- [ ] **Main run (monthly financial report):** short description → 500 message, Next disabled → Enhance (`fake.log`: `enhance-task`) → Use this → Undo → Use this → Next → questions auto-written (`questions finance`), last fixed question "What should it never do?" → per-use list: rename one, toggle Required, add "Meeting date", move one fixed question there and back; readiness counts fixed only → answer two, **Check all**, bars move → upload `brief.docx` to the template question, `numbers.xlsx` to the data question, `logo.png` to a non-highlighted question (proves every question takes uploads); analyses READY → add, edit, delete a question → **Regenerate** (confirm; repeated questions keep answers and files; dropped ones' files appear in General files) → Skills: Create my skills, Generate (`generate` then `generate (retry)`) → v1 preview: `SKILL.md` has exactly one "## Before you start — ask the user for" listing every per-use label with "(required)"/"(if available)", and no "The model's own list"; `references/style-guide.md` has `## For "…"` sections and `## General files`.
- [ ] **Oracle:** fetch upload zip, pack zip and task pack (as in the jobs plan's Task 23 snippet); unzip; every skill folder passes `/Users/tharunkumarl/.claude/skills/synced/bfef6136-f152-4b96-834c-6925fa876c60_248f4955-89f1-4681-b216-9881dcea93ad/skill-creator/scripts/quick_validate.py`; `assets/*` SHA-256 equal the fixtures; `grep -c "^## Before you start — ask the user for" SKILL.md` = 1; no unsafe paths.
- [ ] **Mobile and dark:** 390 × 844, each step: `document.documentElement.scrollWidth <= window.innerWidth` is `true`; dark-mode screenshots of the three steps readable.

### C3: Real-API smoke and rollout
- [ ] With a real key: one finance task — Enhance (brief has "Same every time"/"Varies each time"), Write questions (task-specific, essentials covered, sensible per-use inputs, asset questions highlighted), one upload, one generated skill passing the oracle with a correct "Before you start" section. Note elapsed times of Enhance and Write questions (must be well under 120 s).
- [ ] Rollout checklist for the PR description: migration `20261125150000_add_skill_task_questions` (additive + data) runs in `start.sh`; no new env vars; new features `skill_enhance` 30/day, `skill_questions` 20/day; accepted gap (answers saved by the old image during the switch); production check after deploy: open an existing job (8 questions, answers, General files, downloads), create a task end to end.
