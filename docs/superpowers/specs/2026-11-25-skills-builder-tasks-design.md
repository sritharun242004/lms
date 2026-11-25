# Prompt Bot — Skills Builder: Tasks Redesign

## Objective

Make the Skills Builder ask the right things for **each** piece of work. A user describes one recurring **task** in enough detail (with AI help to turn a lazy description into a clear brief), answers 5–8 questions written **for that task** — attaching files to the question they answer — and generates Agent Skills exactly as today.

This spec changes [2026-11-25-skills-builder-jobs-design.md](2026-11-25-skills-builder-jobs-design.md) ("jobs spec"). Everything there still holds unless this document changes it: file sniffing, extraction, analysis, staleness, heartbeat and concurrency limits, generation, versions, zips, downloads, legacy packs, privacy and logging.

## What Changes

| Area | Jobs (today) | Tasks (this spec) |
|---|---|---|
| Name in the UI | Job | **Task** |
| Steps | Job · Files · Questions · Skills | **Task · Questions · Skills** |
| Description | any length | **≥ 500 characters** before questions are written; **✨ Enhance** rewrites it into a brief |
| Questions | the fixed 8-question `skill-definition` matrix | **5–8 AI questions per task**, shaped by the **inferred output type** and focused on the inputs and assets it needs; editable, regenerable; essentials always covered |
| Inputs | everything answered up front | **Fixed (same every time)** questions are answered now; **per-use inputs** (client name, date, scope, figures…) are listed, never answered now, and the generated skill **asks for them at the start of every run** |
| Files | one Files step for the job | **uploaded on the question they answer**; older files under **General files** |
| Scoring | description + all analyses | description + answers + **each question's files** |
| Suggest / generate prompts | answers + flat file list | **each question with its answer and its files' analyses** |
| `references/style-guide.md` | one section per file | **grouped by question**, then per file |

## Naming (decision)

User-facing copy says **Task** everywhere: "New task", "Describe the task", "Your tasks", "Task title", step labels, messages, confirmations, error messages, the pack README and the AI prompts. Internal names stay `job`: tables (`skill_jobs`, …), models (`SkillJob…`), routes (`/api/v1/prompt-bot/skill-jobs/**`), page paths (`/prompt-bot/skills/[jobId]`), TypeScript identifiers and error codes. No route moves, so every existing URL keeps working. Old step hashes map to new steps: `#job` → `#task`, `#files` → `#questions`.

## Compatibility Invariants

- Migrations are additive. No table, column or enum value is dropped or renamed. `skill_job_answers` stays (read only by the data migration; nothing writes it any more). The `skill-definition` matrix stays for legacy packs.
- Every route keeps ownership **404** (never 403), the error-code set below, and `aiErrorResponse` for AI-layer errors. 503 `AI_NOT_CONFIGURED` is returned before any unit is spent.
- Usage units are spent after every cheap check and before the AI call.
- Prompt text, descriptions, briefs, questions, answers, file names, file contents and analyses are never logged. Logs carry `error.name` only, prefix `[skills-builder]`.
- Upload rules, file types, caps (20 MB, **10 files per task**), sniffing, extraction, analysis concurrency (2 binary / 8 text), the queued-claim heartbeat and staleness are unchanged.

## Data Model

Migration `20261125150000_add_skill_task_questions`.

```prisma
enum SkillQuestionSource {
  AI
  USER
}

enum SkillQuestionKind {
  FIXED    // same every time: answered now (text + files) and baked into the skill
  PER_USE  // varies each run: not answered now; the skill asks for it at the start of every run
}

enum SkillFileHint {
  REFERENCE  // reference or past example
  INPUT      // typical input data
  TEMPLATE   // template or design system
  BRAND      // brand assets
}

model SkillJobQuestion {
  id               String              @id @default(cuid())
  jobId            String              @map("job_id")
  order            Int
  text             String
  guidance         String              @default("")
  wantsFiles       Boolean             @default(false) @map("wants_files")
  fileHint         SkillFileHint?      @map("file_hint")
  /// A specific upload prompt when the question asks for files, e.g. "Upload your logo and brand colours".
  fileNote         String              @default("") @map("file_note")
  source           SkillQuestionSource @default(AI)
  kind             SkillQuestionKind   @default(FIXED)
  /// PER_USE only: Claude must have this before it starts (false = ask, but it may proceed without it).
  required         Boolean             @default(true)
  /// The skill-definition question this row was migrated from (jobs made before tasks), else null.
  legacyQuestionId String?             @map("legacy_question_id")
  answer           String              @default("")
  score            Int                 @default(0)
  reason           String?
  scoredAt         DateTime?           @map("scored_at")
  createdAt        DateTime            @default(now()) @map("created_at")
  updatedAt        DateTime            @updatedAt @map("updated_at")
  job              SkillJob            @relation(fields: [jobId], references: [id], onDelete: Cascade)
  files            SkillJobFile[]
  @@index([jobId, order])
  @@map("skill_job_questions")
}
```

- `SkillJob` gains `questionsGeneratedAt DateTime? @map("questions_generated_at")`, `outputType String? @map("output_type")` (the output type inferred when questions were last written, e.g. "Instagram carousel"; one line, ≤ 60 characters; `NULL` for migrated jobs and before questions exist) and `questions SkillJobQuestion[]`.
- `SkillJobFile` gains `questionId String? @map("question_id")` with `question SkillJobQuestion? @relation(fields: [questionId], references: [id], onDelete: SetNull)` and `@@index([questionId])`.

**One table for both kinds (decision).** A `PER_USE` row is a per-use input: `text` is its label ("Client name"), `guidance` its hint or example ("e.g. Acme Ltd"), `required` its flag. It never has an answer, a score or files. Moving a row between kinds is a `kind` update; moving a `FIXED` question to `PER_USE` detaches its files (they become general files) and keeps its answer text hidden (restored if moved back).

**Answers live on the question row (decision).** "Answers keyed to the question" is a one-to-one relation, so the answer, score, reason and `scoredAt` are columns of `skill_job_questions`; a separate table would add a join and nothing else. `notRelevant` is not stored: every task question counts (the "not relevant" toggle was already removed). The answer API still accepts `notRelevant` and ignores it.

**General files (decision).** A file whose `questionId` is `NULL` is a **general file**: files uploaded before this change, and files of a question that was deleted or dropped by a regeneration (the foreign key sets `NULL`). No synthetic "General files" question row exists. Skills keep using general files exactly like attached ones.

**Per task:** every fixed question can take uploads (the cap stays 10 files per task); at most 12 fixed questions (`JOB_LIMITS.questionsPerTask`; at most 8 from the AI per generation, plus a fallback per uncovered essential) and at most 15 per-use inputs (`JOB_LIMITS.perUseInputsPerTask`; at most 10 from the AI). Question text ≤ 300 characters, per-use label ≤ 120, guidance/hint ≤ 300.

### Data migration for existing jobs

In the same migration, after the DDL:

```sql
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
```

- Every existing job gets the 8 active skill-definition questions as task questions, with its answers, scores and reasons. Ids are deterministic (`sjq_` + md5), so re-running is a no-op.
- Existing files keep `question_id = NULL`: they appear under **General files**; nothing is lost. Skills, versions and downloads are untouched (no table they use changes meaning).
- **Accepted gap:** during the deploy switch (old and new image both serving, seconds to minutes), an answer saved by the old image after the migration ran lands in `skill_job_answers` and is not shown. A job created by the old image in that window has no questions; the user presses **Write questions**. Both are rare and lose nothing (the old answer row stays in the database).

## Limits and Time Bounds

Added to `JOB_LIMITS` (`src/lib/skills/limits.ts`): `descriptionMinChars: 500` (trimmed length), `enhanceMinWords: 5`, `aiQuestionsMax: 8`, `questionsPerTask: 12`, `perUseInputsPerTask: 15`, `aiPerUseMax: 10`, `questionTextChars: 300`, `perUseLabelChars: 120`, `questionGuidanceChars: 300`, `fileNoteChars: 120`.

| Call | Runs | Model | SDK options | Worst case |
|---|---|---|---|---|
| Enhance | in the request | `FAST_MODEL` (`claude-haiku-4-5`), structured `{ brief }`, `max_tokens: 3000` | `timeout: 45_000, maxRetries: 1` | 90 s |
| Write questions | in the request | `BEST_MODEL` (`claude-opus-5-5`), `output_config.effort: "low"`, structured, `max_tokens: 8000`, `betas: ["server-side-fallback-2026-07-01"]`, `fallbacks: "default"` | `timeout: 90_000, maxRetries: 0` | 90 s |
| Scoring, analysis, suggest, generation | unchanged | unchanged | unchanged | unchanged |

Both new calls stay under App Runner's 120 s request cap.

## Usage Limits

| Feature | Counted when | Default per day |
|---|---|---|
| `skill_enhance` (**new**) | each **Enhance** press that passes the checks | 30 |
| `skill_questions` (**new**) | each **Write questions** / **Regenerate** | 20 |
| `score`, `skill_split`, `skill_generate`, `skill_analyze` | unchanged | unchanged |

Both are added to `AiFeature`, `AI_FEATURES` and `DEFAULT_LIMITS`; admins change them through the existing settings route. No migration: missing keys fall back to defaults.

## Step 1 — Task

- A textarea "Describe the task" with a live counter. Below 500 characters (trimmed): the counter reads `312 / 500 minimum` and the message **"Add a bit more detail — at least 500 characters (312/500)"** is shown and referenced by `aria-describedby`; at or above: `1,234 / 20,000`.
- **Next: Questions** is disabled while the description is short **and the task has no questions yet**. The step buttons for Questions and Skills follow the same rule (disabled, with the message as their description). A task that already has questions (every migrated job, or a task whose description was shortened later) stays fully navigable — **decision**, so old jobs with short descriptions are never locked out. The server enforces the 500-character rule only where it matters: writing questions.
- **✨ Enhance** (Sparkles icon, label "Enhance"): enabled from 5 words (`wordCount ≥ 5`) when the AI is configured. It sends the textarea's current text (saved or not) and shows **"Enhancing…"**. The result appears under the textarea in a "Suggested brief" panel (rendered with `SafeMarkdown`) with **Use this** and **Keep mine**. **Use this** replaces the description (autosaved as any edit) and shows "Replaced with the suggested brief. **Undo**"; Undo restores the previous text. The Undo offer ends on the next keystroke, the next Enhance, or Keep mine. Errors show inline under the button with the server message.
- A hint card "A good brief covers": purpose, when it's used, inputs, steps, output, who it's for, quality bar, constraints.
- **Enhance prompt** (`ENHANCE_TASK_SYSTEM`): rewrite the person's description into a task brief for building an Agent Skill; Markdown sections in order `## Purpose`, `## When it's used`, `## Same every time` (what stays fixed on every run and defines the work's structure: document structure and sections, company standards, the template, clauses that always apply, brand assets, tone), `## Varies each time` (what changes from one use to the next, as a short list: client name, date, project scope, deal value, contacts, deadlines, specific figures — so question generation can turn them into per-use inputs), `## Steps` (numbered), `## Output`, `## Audience`, `## Quality bar`, `## Constraints`; first person, plain words, 150–450 words; keep every fact, number, name and tool they wrote; **never invent facts**; where a section has nothing to go on, write one short italic question under it (e.g. _Which file do you start from?_) — those get answered in the Questions step. Reply schema `{ brief: string }`; the server trims it, refuses an empty brief (`AiResponseError` → 502) and cuts it to 20 000 characters. Nothing is stored server-side by Enhance.
- Enhance is generic in the same way: any task gets the same sections, with "Same every time" and "Varies each time" filled from what the person wrote (no per-type templates).
- **Enhance is in step 1 only (decision).** The home page's **New task** form just creates the task (title optional, description required, no minimum) and opens step 1.

## Step 2 — Questions

### Writing questions

- First entry to the step with no questions, a description ≥ 500 characters and the AI configured → the questions are written automatically (once per page load). Otherwise the empty state shows **Write questions** (disabled with the 500-character message when short). While writing: "Writing questions for this task…" with a spinner (typically 10–30 s).
- `POST …/questions/generate`. Server: ownership → `DescriptionTooShortError` (400 `DESCRIPTION_TOO_SHORT`, message "Add a bit more detail — at least 500 characters (312/500).") → one `skill_questions` unit → `writeTaskQuestions` → `cleanQuestions` → one transaction → `questionsGeneratedAt = now` → `JobView`.
- **Generic for every task (binding).** For **every** task, whatever it is, the generator always: **(a)** infers the output type; **(b)** asks the input and asset questions that output needs, with `wantsFiles: true` and a specific `fileHint` wherever a file helps; **(c)** splits fixed (answer now) from per-use (Claude asks each time) inputs; **(d)** covers the skill essentials. Nothing in code is per output type: there are no per-type question lists, templates or branches. The prompt carries the behaviour as rules plus a few short **illustrations** that show the pattern and are explicitly not a menu.
- **(a) Output type.** The model first works out what the task produces from a broad taxonomy — image or visual design; social post or carousel; video; audio or podcast; slide deck; document, report, contract or policy (an SLA, ERP specification, proposal); spreadsheet, financial model or data analysis; email or written copy; research or summary; code or automation; plan, process or checklist; or **other** — and names it in a short sentence-case label in the person's terms (`outputType`, e.g. "Instagram carousel", "client SLA document", "monthly financial report"). For **other** it still names the output and asks what a skilled practitioner of it would need first.
- **(b) Inputs and assets first.** Questions a skilled practitioner of that output would ask before starting, prioritising required inputs and assets. The illustrations in the prompt (short few-shot guidance, adapted by the model, never copied): an *Instagram carousel* needs the look (style, mood, references), the format (e.g. 1080×1350, slide count, safe areas), brand assets (logo files and placement, colours, fonts → `BRAND`), the images to use (→ `INPUT`), copy per slide and CTA, past posts to match (→ `REFERENCE`); an *explainer video* needs purpose and platform, duration and aspect ratio, script or storyboard, footage and b-roll (→ `INPUT`), brand assets (logo, intro/outro → `BRAND`), voice-over, music and captions, videos to match (→ `REFERENCE`), output resolution; a *client SLA document* needs the template (→ `TEMPLATE`), the standard sections and clauses that always apply, company standards, past signed examples (→ `REFERENCE`) — while client name, dates and service levels vary per use; a *monthly financial report* needs the report template (→ `TEMPLATE`), the data sources and exports (→ `INPUT`), the KPIs and structure, past reports (→ `REFERENCE`) — while the month and its figures vary per use.
- **(c) Fixed vs per-use.** Every question is classified `kind: "fixed"` (the same every time the skill runs and defines its structure — document structure and sections, company standards, the template, clauses that always apply, brand assets, tone — answered now with text and files and baked into the skill) or `kind: "per_use"` (varies from one use to the next — client name, date, project scope, deal value, contacts, deadlines, specific figures — never answered now). The model also proposes the per-use inputs it can infer from the description as `perUseInputs: [{ label, hint, required }]` (e.g. "Client name", "Agreement date", "Service levels for this client"). (c) is the same for every output type. Questions classified `per_use` and proposed per-use inputs both become `PER_USE` rows (label = question text, hint = guidance, `required` true unless proposed otherwise); duplicates (same normalised text, across both kinds) are dropped. The 5–8 target and the essentials **(d)** apply to **fixed** questions only.
- `outputType` is stored on the task (`one line, ≤ 60 characters`, empty → `NULL`), replaced on every regeneration, shown in the UI and passed to suggest and generate.
- **Questions prompt** (`QUESTIONS_SYSTEM`): ask the 5–8 questions Claude would need answered to write an excellent skill for exactly this task, the way it would ask a colleague — specific, one thing at a time, in the person's words, never asking what the description already answers fully. Together they must cover the **essentials**, each phrased for this task: `triggers` (when to use it and when not), `inputs`, `steps`, `output` (what great looks like), `quality` (the bar), `avoid`. Per question: `text` (one sentence ending in "?"), `guidance` (one sentence: what a strong answer includes), `covers` (essentials it covers), `wantsFiles` (true when a file answers it better than words) and `fileHint` (`TEMPLATE` templates/design systems they produce from, `REFERENCE` past examples or references, `INPUT` typical input data, `BRAND` logos and brand guidelines, `NONE`). When `<existing_questions>` are given, keep the exact wording of every question that still fits (its answer is kept) and change or drop the rest. Never invent facts.
- Structured schema: `{ outputType: string, perUseInputs: [{ label: string, hint: string, required: boolean }], questions: [{ text: string, guidance: string, kind: "fixed"|"per_use", wantsFiles: boolean, fileHint: "REFERENCE"|"INPUT"|"TEMPLATE"|"BRAND"|"NONE", fileNote: string, covers: ("triggers"|"inputs"|"steps"|"output"|"quality"|"avoid")[] }] }`.
- **Essentials guaranteed (decision)** by `cleanQuestionSet` (fixed questions; per-use rows are cleaned separately: one-line label ≤ 120, hint ≤ 300, deduplicated against each other and the fixed questions, at most 10): one-line text and guidance within limits; empty text dropped; duplicates (same normalised text) dropped; at most 8 kept; `wantsFiles: false` clears the hint, `wantsFiles: true` with `NONE` becomes `REFERENCE`; unknown `covers` values ignored. For each essential no question covers, a built-in fallback question is appended (e.g. avoid → "What should it never do?"); to keep within 8, questions whose essentials are all covered by others are dropped from the end first. The 5–8 range is the prompt's target; the guarantee is that every essential is covered.

### Regenerate

**Regenerate** asks once (`ConfirmDialog`): "Write new questions?" — "Questions you added yourself, and answers to questions that come back with the same wording, are kept. Other answers are removed and their files move to General files." The model receives the current questions (`<existing_questions>`, marked "(answered)") and is told to keep fitting wording. Server rules (`planQuestionChanges`, decision, applied across both kinds): a new question or per-use input whose normalised text (lower case, collapsed spaces, trailing `?.!:` removed) equals an existing row's **keeps that row** (id, text, kind, required, answer, score, files) and gets the new order (and, for AI rows of the same kind, the new guidance/`wantsFiles`/`fileHint`); other new questions are inserted as `AI`; existing `USER` questions are always kept, ordered after the AI set; other existing `AI` questions are deleted (their files become general files).

### Editing

- **Add question** (`source: USER`), **Edit** (text, guidance, "Ask for files" + file kind), **Move to "Claude will ask each time"** and **Delete** (confirm, destructive: "Its answer is deleted. Its files move to General files.") on the selected question. Editing keeps the answer and score; the workspace marks the bars stale ("Bars may be out of date. Check all to update them.") — **decision**, no server-side score reset.
- Per-use inputs: **Add input** (label, hint, Required), inline rename and hint edit (saved on blur), Required toggle, **Move to "Answer now"**, **Remove** (no confirm: nothing is answered).
- 409 `TOO_MANY_QUESTIONS` past 12 fixed questions or 15 per-use inputs (the move between kinds checks the target kind's cap).

### Layout

Two sections. **"Answer now (same every time)"** — the fixed questions in the enhancer's two-column layout (stacked on phones), and below it, full width, **"Claude will ask each time"** — the per-use checklist. Fixed:
- **Left:** `MatrixPanel` heading "Questions" with the output type as a quiet subtitle when known ("Questions for an Instagram carousel" — `a`/`an` by the label's first letter; no subtitle when `outputType` is null), readiness ("N of M ready"), **Check all**, rows with 3-slice bars; under the list **Add question** and **Regenerate**, and the note "Scored against your task description, answers and each question's files."
- **Right:** the selected question as a heading with **Edit** and **Delete** icon buttons; the answer textarea (guidance as placeholder, `maxLength` 4000, ⌘/Ctrl+Enter checks); `AnswerCheck` ("Check answer" scores everything, as today); then **Files for this question** — **every** "Answer now" question has its own upload, AI-written or user-added (binding). When `wantsFiles` is true the upload is prominent: a primary **Add files** button, the hint badge ("Template or design system", "Reference or example", "Input data", "Brand assets") and the question's specific `fileNote` (e.g. "Upload your logo and brand colours"; falls back to "This question asks for a file. Add one if you have it."); otherwise a quieter outline **Add files (optional)**. Per-use inputs never take uploads (their values arrive at run time); a per-use item moved to "Answer now" gets the upload. Then the file cards for this question; uploads are **Add files** (multiple; same accepted types, caps, sequential upload queue, per-file progress and error rows as the old Files step). Helper text: "PowerPoint, Word, Excel, PDF, PNG or JPG · up to 20 MB each · 10 files per task".
- **"Claude will ask each time"** card: one line of help ("These change every time — client names, dates, figures. Don't answer them here: your skill will ask for them at the start of every run."), then one row per per-use input: label input (aria-label "Input name"), hint input (placeholder "Hint or example, optional"), **Required** checkbox, **Move to "Answer now"** and **Remove** icon buttons (labelled with the input's name); **Add input** at the end; empty state "Nothing varies between uses yet. Add an input if Claude should ask for something each time."
- **General files** card (only when any exist), under the right column: "Files added before questions had their own uploads, or from removed questions. Your skills still use them." File cards as below.
- File cards are the old Files step's cards unchanged (analysing state, rendered analysis, Edit / Write it yourself, Analyse again with the edited-guide confirm, Remove, "Too large to bundle — the skill will use the analysis only.").

### Scoring

`POST …/score` keeps its contract. **Only fixed questions are scored and counted** (readiness, step badge, "N questions unanswered" confirms); per-use inputs never need answers. The scorer's base text becomes `Task: <title>\n<description>`, then for each question with READY files `Files for "<question>":` and each file's name and first 1 500 analysis characters, then `General files:` likewise; capped at 12 000 characters. Questions and answers come from the task's `FIXED` rows (`answer`, `score`, `reason` written back to them in one transaction with the revision, stale-revision rule unchanged). A task with no questions returns `{ applied: false }` without spending a unit.

The first check runs once automatically right after the first questions are written (replacing the old "never scored" mount check); afterwards scoring runs only on Check answer / Check all, as today. A file becoming READY, an analysis edit, a description edit, a question edit or a regeneration marks the bars stale.

## Step 3 — Skills

Unchanged UI (Create my skills / Redraft, add, rename, purpose, file chips, Generate with one confirm when questions are unanswered, versions, Download for Claude / Download to share, How to use callout), with Task copy. File chips show the file name; general and attached files are listed together.

Both messages' `<task>` section carries `output_type: <outputType>` when known, so suggest and generate write for that kind of output. Both list the per-use inputs in `<ask_each_time>` (`- Client name (required): e.g. Acme Ltd`) and say they are asked for at every run, never answered now.

**Per-use inputs in the skill (binding, server-owned).** When the task has per-use inputs, the server inserts this section into `SKILL.md`'s body (after the body's first `# ` title line, else at the top), removing any section with the same heading the model wrote:

```markdown
## Before you start — ask the user for

These change every time this skill is used. Check the request first, then ask for anything missing in one message before doing any work. Never guess or invent them.

- **Client name** (required): e.g. Acme Ltd
- **Agreement date** (required)
- **Deal value** (if available): in GBP
```

`GENERATE_JOB_SYSTEM` adds: the per-use inputs in `<ask_each_time>` change every run; never fill them in or invent values; refer to them by their labels in the steps where they are used (e.g. "Put the client name on the cover"); do not write a "Before you start" section (the server adds it). Fixed answers and their files become the skill's standing instructions and references.

**Suggest message** (`buildSuggestMessage`): `<task>`, then `<questions>` with one `<question n text>` per question holding `<answer>` (or "(not answered yet)") and its attached files (`- id / name / kind / size / <analysis>` excerpt), `<general_files>`, `<gaps>` (questions scored below 3, with guidance) and `<already_built>`.

**Generate message** (`buildJobGenerateMessage`): `<task>`, `<questions>` (answer plus the skill's files attached to that question as `<file name kind shipping>` with the full analysis), `<general_files>`, `<gaps>`, `<skill>`. `GENERATE_JOB_SYSTEM` adds: each question's answer and files describe that part of the work; a file attached to a question shows what that answer looks like in practice.

**Assembly:** `references/style-guide.md` = `# Style guide`, the note "Taken from the files uploaded for this task, grouped by the question each file answers. Analyses edited by hand are used exactly as written.", then one `## For "<question>"` section per question in question order (then `## General files`), each with `### <file name>`, the bundled/not-bundled line and the analysis (its headings demoted so the top level is `####`). The 200 KB proportional shortening is unchanged. `SKILL.md`'s "Files in this skill" lines add `Added for the question "<question>".` when the file is attached to a question. Assets are bundled exactly as before.

## API Contract (binding for both tracks)

All routes live under `/api/v1/prompt-bot/skill-jobs` (unchanged prefix). Every response uses the existing envelope:

```ts
type Ok<T> = { success: true; data: T };
type Fail = { success: false; error: { code: string; message: string; details?: Record<string, string[]> } };
```

Common failures on every route: 401 `UNAUTHORIZED` ("Authentication required") without a session; 404 `NOT_FOUND` when the task (`"Task not found"`), question (`"Question not found"`), file, skill or version is not the caller's or does not exist; 400 `VALIDATION_ERROR` (zod `details`) for a bad body; 413 `PAYLOAD_TOO_LARGE` for a JSON body over 64 KB. AI routes add 503 `AI_NOT_CONFIGURED` (checked before anything is spent), 429 `LIMIT_REACHED` (`details: { feature: [name], resetAt: [iso] }`) and 502 `AI_FAILED`.

### View types (`src/lib/skills/jobs/types.ts`, consumed by the UI)

```ts
export type FileHint = "REFERENCE" | "INPUT" | "TEMPLATE" | "BRAND";
export type QuestionKind = "FIXED" | "PER_USE";
export type QuestionSource = "AI" | "USER";
export type AnalysisStatus = "PENDING" | "READY" | "FAILED";
export type SkillItemStatus = "DRAFT" | "GENERATING" | "READY" | "FAILED";

/** FIXED = "Answer now (same every time)"; PER_USE = "Claude will ask each time" (text = label, guidance = hint). */
export type TaskQuestionView = {
  id: string;
  order: number;
  kind: QuestionKind;
  text: string;                 // FIXED ≤ 300 chars; PER_USE label ≤ 120
  guidance: string;             // ≤ 300; PER_USE: hint or example
  required: boolean;            // PER_USE only (FIXED rows are always true)
  wantsFiles: boolean;          // FIXED only: make the upload prominent (every FIXED question takes uploads)
  fileHint: FileHint | null;    // set only when wantsFiles
  fileNote: string;             // ≤ 120; "" when none, e.g. "Upload your logo files and brand colours."
  source: QuestionSource;
};

/** Answers exist for FIXED questions only; keyed by question id. notRelevant is always false for tasks. */
export type AnswerView = { questionId: string; answer: string; score: number; reason: string | null; notRelevant: boolean };

export type JobFileView = {
  id: string; fileName: string; assetName: string; kind: "PPTX" | "DOCX" | "XLSX" | "PDF" | "PNG" | "JPEG"; size: number;
  createdAt: string; analysisStatus: AnalysisStatus; analysis: string | null; analysisEdited: boolean; analysisError: string | null;
  bundlable: boolean;
  questionId: string | null;    // the FIXED question it answers; null = General files
};

export type VersionSummary = { version: number; name: string; createdAt: string; assets: number };
export type JobSkillView = {
  id: string; order: number; name: string; purpose: string; fileIds: string[]; status: SkillItemStatus;
  validationErrors: string[]; latestVersion: number; versions: VersionSummary[];   // newest first
};

export type JobView = {
  id: string;
  title: string;
  description: string;
  scoreRevision: number;
  updatedAt: string;
  suggestedAt: string | null;
  questionsGeneratedAt: string | null;   // null until questions were written (UI auto-writes once)
  outputType: string | null;             // e.g. "Instagram carousel"; null for migrated jobs
  questions: TaskQuestionView[];         // both kinds, sorted by order
  answers: AnswerView[];                 // FIXED questions only
  files: JobFileView[];                  // active files, oldest first
  skills: JobSkillView[];
};   // `matrix` is gone

export type ScoreReply = { applied: boolean; revision: number; answers: AnswerView[] };
export type QuestionInput = {
  text: string; guidance?: string; kind?: QuestionKind; required?: boolean;
  wantsFiles?: boolean; fileHint?: FileHint | null; fileNote?: string;
};
```

### Routes

| # | Method & path | Request | Success | Errors (beyond the common ones) |
|---|---|---|---|---|
| 1 | `POST /` | `{ title?: string (1–120), description?: string (≤ 20 000) }` | 201 `JobView` | — (no AI, no minimum length) |
| 2 | `GET /:id` | — | 200 `JobView` | — |
| 3 | `PATCH /:id` | `{ title?: string (1–120), description?: string (≤ 20 000) }`, at least one | 200 `JobView` | — |
| 4 | `DELETE /:id` | — | 200 `{ deleted: true }` | — |
| 5 | `POST /:id/enhance` **new** | `{ description: string (≤ 20 000) }` — the text in the box, saved or not | 200 `{ brief: string }` (Markdown, ≤ 20 000; nothing stored) | 400 `VALIDATION_ERROR` "Write at least 5 words about the task first."; 429 (`skill_enhance`), 502, 503 |
| 6 | `POST /:id/questions/generate` **new** | — (empty body) | 200 `JobView` (questions replaced per the regenerate rules, `outputType` and `questionsGeneratedAt` set) | 400 `DESCRIPTION_TOO_SHORT` "Add a bit more detail — at least 500 characters (312/500)."; 429 (`skill_questions`), 502, 503 |
| 7 | `POST /:id/questions` **new** | `QuestionInput` (`text` 1–300, 1–120 when `kind: "PER_USE"`; `kind` default `FIXED`) | 201 `TaskQuestionView` (`source: "USER"`) | 409 `TOO_MANY_QUESTIONS` |
| 8 | `PATCH /:id/questions/:questionId` **new** | `Partial<QuestionInput>`, at least one field; `kind` moves it between lists | 200 `TaskQuestionView` | 409 `TOO_MANY_QUESTIONS` (target list full) |
| 9 | `DELETE /:id/questions/:questionId` **new** | — | 200 `{ deleted: true }` (its files become general files) | — |
| 10 | `PUT /:id/answers/:questionId` changed | `{ answer?: string (≤ 4000), notRelevant?: boolean (ignored) }`, at least one; `questionId` = a FIXED task question | 200 `{ saved: true }` | 404 for a PER_USE or unknown question |
| 11 | `POST /:id/score` changed | `{ revision: number (int ≥ 0) }` | 200 `ScoreReply` (FIXED questions only; `{ applied: false, revision, answers: [] }` and no unit when there are none) | 429 (`score`), 502, 503 |
| 12 | `POST /:id/files?name=<encoded>&questionId=<id>` changed | raw file bytes; `questionId` optional (must be a FIXED question of this task; checked before the body is read) | 201 `JobFileView` (`analysisStatus: "PENDING"`) | 400 (no name, empty, `UPLOAD_INCOMPLETE`), 409 `TOO_MANY_FILES`/`FILE_NAME_TAKEN`, 413 `FILE_TOO_LARGE`, 415 `UNSUPPORTED_FILE`, 422 `FILE_ENCRYPTED`/`FILE_UNREADABLE`, 429 (`skill_analyze`), 503 |
| 13 | `GET /:id/files/:fileId` | — | 200 `JobFileView & { facts }` | — |
| 14 | `PATCH /:id/files/:fileId` | `{ analysis: string (1–12 000) }` | 200 `JobFileView` | 409 `ALREADY_ANALYSING` |
| 15 | `DELETE /:id/files/:fileId` | — | 200 `{ deleted: true }` | 409 `ALREADY_GENERATING` |
| 16 | `POST /:id/files/:fileId/analyse` | — | 202 `JobFileView` | 409 `ALREADY_ANALYSING`, 429, 503 |
| 17 | `POST /:id/suggest` | — | 200 `JobView` | 400 "Describe the task first.", 409 `FILES_ANALYSING`/`ALREADY_GENERATING`/`TOO_MANY_SKILLS`/`DUPLICATE_NAME`, 429, 502, 503 |
| 18 | `POST /:id/skills` | `{ name: 1–120, purpose: 1–300, fileIds?: string[] (≤ 10) }` | 201 `JobSkillView` | 409 `DUPLICATE_NAME`/`TOO_MANY_SKILLS` |
| 19 | `PATCH /:id/skills/:skillId` | `{ name?, purpose?, fileIds?, order? }` | 200 `JobSkillView` | 409 `DUPLICATE_NAME`/`ALREADY_GENERATING` |
| 20 | `DELETE /:id/skills/:skillId` | — | 200 `{ deleted: true }` | 409 `ALREADY_GENERATING` |
| 21 | `POST /:id/skills/:skillId/generate` | — | 202 `JobSkillView` (`GENERATING`) | 400, 409 `ALREADY_GENERATING`/`FILES_ANALYSING`, 429, 503 |
| 22 | `GET /:id/skills/:skillId/versions/:version` | `version` = int ≥ 1 or `latest` | 200 `VersionDetail` | 400 |
| 23 | `GET /:id/skills/:skillId/versions/:version/download?format=upload\|pack` | — | 200 zip | 409 `ASSET_MISSING`/`PACK_TOO_LARGE` |
| 24 | `GET /:id/download` | — | 200 zip | 409 `NOTHING_TO_DOWNLOAD`/`DUPLICATE_NAME`/`ASSET_MISSING`/`PACK_TOO_LARGE` |

Routes 13–24 are unchanged except for Task wording in messages ("A task can have at most 10 files…", "A skill in this task is being written…", "…is already in this task…"). `TOO_MANY_QUESTIONS` messages: "A task can have at most 12 questions to answer now. Remove one to add another." / "A task can have at most 15 inputs Claude asks for each time. Remove one to add another."

Example — `POST /:id/questions/generate` → 200:

```json
{ "success": true, "data": {
  "id": "ck…", "title": "Client SLA", "description": "…", "scoreRevision": 0, "updatedAt": "…", "suggestedAt": null,
  "questionsGeneratedAt": "2026-11-25T12:00:00.000Z", "outputType": "client SLA document",
  "questions": [
    { "id": "q1", "order": 0, "kind": "FIXED", "text": "Which SLA template do you start from?", "guidance": "Name the file and version.",
      "required": true, "wantsFiles": true, "fileHint": "TEMPLATE", "fileNote": "Upload your SLA template.", "source": "AI" },
    { "id": "p1", "order": 6, "kind": "PER_USE", "text": "Client name", "guidance": "e.g. Acme Ltd", "required": true,
      "wantsFiles": false, "fileHint": null, "fileNote": "", "source": "AI" }
  ],
  "answers": [ { "questionId": "q1", "answer": "", "score": 0, "reason": null, "notRelevant": false } ],
  "files": [], "skills": [] } }
```

### Client functions (`src/lib/skills/jobs/client.ts`, all return `Promise<CallResult<T>>`)

Existing ones keep their names. New or changed: `enhanceTask(jobId, description) → { brief }`, `generateQuestions(jobId) → JobView`, `addQuestion(jobId, input: QuestionInput) → TaskQuestionView`, `patchQuestion(jobId, questionId, patch: Partial<QuestionInput>) → TaskQuestionView`, `deleteQuestion(jobId, questionId) → { deleted: true }`, `uploadJobFile(jobId, file, questionId?) → JobFileView`. `CallResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string; details? }`.

### Migration SQL outline (`20261125150000_add_skill_task_questions`)

1. `CREATE TYPE "SkillQuestionSource" AS ENUM ('AI','USER')`, `"SkillQuestionKind" AS ENUM ('FIXED','PER_USE')`, `"SkillFileHint" AS ENUM ('REFERENCE','INPUT','TEMPLATE','BRAND')`.
2. `ALTER TABLE "skill_jobs" ADD COLUMN "output_type" TEXT, ADD COLUMN "questions_generated_at" TIMESTAMP(3)`.
3. `ALTER TABLE "skill_job_files" ADD COLUMN "question_id" TEXT`.
4. `CREATE TABLE "skill_job_questions"` (`id`, `job_id`, `order`, `text`, `guidance` default `''`, `wants_files` default false, `file_hint`, `file_note` default `''`, `source` default `'AI'`, `kind` default `'FIXED'`, `required` default true, `legacy_question_id`, `answer` default `''`, `score` default 0, `reason`, `scored_at`, `created_at`, `updated_at`).
5. Indexes `skill_job_questions(job_id, order)`, `skill_job_files(question_id)`; FKs `skill_job_questions.job_id → skill_jobs ON DELETE CASCADE`, `skill_job_files.question_id → skill_job_questions ON DELETE SET NULL`.
6. Data: the `INSERT … SELECT` and `UPDATE` in "Data migration for existing jobs" (kind `FIXED`, required true), verbatim. Generated DDL comes from `prisma migrate diff`; nothing is dropped, renamed or retyped.

## UI Summary

- **Home** (`/prompt-bot/skills`): "Turn a task you do every week into your own Agent Skills, built from your own files and templates."; **New task** card ("One piece of work you repeat. Next you'll describe it in detail, answer a few questions and add your files."), **Task title (optional)**, "What's the task?", **Start task**; **Your tasks** ("N skills · M files"); Earlier skill packs unchanged; privacy line "Your task, files and answers are stored in the LMS and sent to Anthropic's API to build your skills."
- **Workspace:** header (rename "Rename task", Download all skills, "Delete task" → "Delete this task?" "This deletes its files, answers, skills and every version. It can't be undone."), step nav **1 Task · 2 Questions (N of M) · 3 Skills (n)**, hash-kept step, Back/Next, deleted-task screen "This task was deleted" / "Back to your tasks".
- Polling, merge rules and the `NotConfigured` notice are unchanged (Enhance, Write questions, uploads, analysis, scoring, suggest and generate are disabled without the key).
- Design: LMS design system, invoke **`impeccable`** before each UI task, 44 px touch targets, works at **390 px** (and 360 px) without horizontal scroll, dark mode, `fixing-accessibility` checks (labels, `aria-describedby` for the 500-character message, `aria-live` for Enhance and question writing, focus returned after editor close and dialogs).

## Removed

- The **Files** step and `files-panel.tsx` (its card, upload queue and rows move to `file-card.tsx` and are reused per question).
- `describe-panel.tsx` (replaced by `task-panel.tsx`).
- `JobView.matrix`, `jobs.ts`'s use of `loadSkillMatrix` and `ensureJobAnswerRows` (the matrix stays for legacy packs).
- The mount-time "never scored" check in the workspace.

## Error Handling

New: 400 `DESCRIPTION_TOO_SHORT`, 409 `TOO_MANY_QUESTIONS` (fixed or per-use cap), 404 `NOT_FOUND` "Question not found". All others as in the jobs spec. Client copy shows the server `message`.

## Testing

Witnessed failing-test-first for every production change (Vitest, `src/**/*.test.ts`, component tests with `React.createElement` and `/** @vitest-environment jsdom */`, Prisma and the AI client mocked with `vi.hoisted`).

- **Unit:** `wordCount`, `tooShortMessage`; `QUESTIONS_SYSTEM` contains the four always-rules (a)–(d), the whole taxonomy including audio/podcast, contract/policy, financial model, research, code/automation, plan/checklist and "other", the words "illustrations"/"not a menu", and the essentials; `QUESTIONS_SYSTEM` contains the fixed/per-use classification wording and `ENHANCE_TASK_SYSTEM` the "Same every time" / "Varies each time" sections; `GENERATE_JOB_SYSTEM` contains the ask-each-time rule; `buildJobGenerateMessage` and `buildSuggestMessage` include `<ask_each_time>` with every per-use input; `beforeYouStartSection` and its insertion (after the title, replacing a model-written copy, absent without per-use inputs); `cleanOutputType` (one line, ≤ 60, empty → null); `outputTypeHeading` (a/an); `cleanQuestionSet` (trim, dedupe, cap 8, hints, covers, fallback per missing essential, redundant-drop; per-use from both sources, deduplicated, cap 10); `planQuestionChanges` (keep matched across kinds, insert new, keep USER after AI, delete unmatched AI, normalisation); instructions (enhance and questions messages, `<existing_questions>`, suggest/generate grouping by question, general files, gaps); `jobScoringBase` grouping and cap; style guide grouping, heading demotion to `####`, files-section question line; Claude calls (Haiku structured `{brief}` with 45 s/1 retry; Opus questions with effort `low`, fallback beta, schema enums, 90 s/0 retries; empty brief and bad JSON → `AiResponseError`).
- **Data layer:** view mapping (questions of both kinds, answers from FIXED rows only, `questionId` on files); answer save to rows; scoring on FIXED rows only (no unit without fixed questions); generate questions (short description refused before any unit; transaction ops); add/edit/delete question (caps per kind, ownership, `wantsFiles` clears hint, move to PER_USE detaches files in one transaction); enhance (word check before unit; unit then call); upload with `questionId` (unknown question 404 before reading the body).
- **Routes:** ownership 404 and 401 on every new route; 503 before spending; 400/409 codes; body validation.
- **Migration:** SQL guards (no `DROP`/`RENAME`/`ALTER COLUMN`, `SET NULL` file FK, cascade from job, the data `INSERT … SELECT` with `LEFT JOIN skill_job_answers` and `ON CONFLICT DO NOTHING`), plus a real-Postgres check on the local database inside a rolled-back transaction (an old-shape job with one answer gets 8 questions with that answer, deterministic ids, re-run inserts nothing).
- **Components:** step model (3 steps, hash aliases, gating), task panel (counter, message, Enhance enable rule, Use this / Keep mine / Undo, error), file card + upload queue (moved tests), question files (upload with `questionId`, hint badge, general files read-only uploads), question editor, per-use checklist (add, rename on blur, hint, required, move, remove), questions panel (fixed and per-use sections, readiness over fixed only, auto-write once, Write questions disabled when short, regenerate confirm, add/edit/delete, files per question), workspace (no Files step, gating, first check after questions), home and skills copy.
- **Fake Anthropic** (`scripts/fake-anthropic.mjs`; reply builders in `scripts/fake-anthropic-shapes.mjs` so Vitest can import them): `brief` in the schema → `[fake] enhance-task` with a ~700-character brief containing "## Same every time" and "## Varies each time"; `questions` in the schema → `[fake] questions <kind>` (`(regenerate)` appended when `<existing_questions>` is present). The fake picks one of five canned replies by keywords in the `<task>` text — **Instagram carousel** (carousel/instagram), **explainer video** (video), **client SLA document** (sla/service level), **monthly financial report** (financial/finance/month-end) and an **other** reply ("client dinner wine list") for anything else. Every reply has an `outputType`, fixed questions with at least one `wantsFiles` asset question with a specific hint, one question with `kind: "per_use"`, `perUseInputs`, and leaves `avoid` uncovered so the server appends "What should it never do?". On regenerate the first three texts repeat verbatim and the rest change. The fake generate draft's body includes its own "## Before you start — ask the user for" section (a model ignoring the instruction), which the server must replace with exactly one server-written section.
- **Across task types:** `task-types.test.ts` calls the real `POST …/questions/generate` route with Prisma mocked and `writeTaskQuestions` answered by the fake builders, for all five descriptions, and asserts per type: the stored `outputType`, both `FIXED` and `PER_USE` rows created, every asset question (`fileHint` set) has `wantsFiles: true`, and the essentials are covered. `fake-questions.test.ts` checks the builders themselves (each reply parses as the real schema).
- **Browser E2E** (isolated `agent-browser` session, MENTEE account, fake API): the main run uses the **monthly financial report** task end to end; a quick second task ("Every week I make an Instagram carousel…") shows "Questions for an Instagram carousel" with brand-asset, images and past-posts questions asking for files. Main run: New task → short description shows the 500 message and Next disabled → Enhance (`fake.log` shows `enhance-task`) → Use this → Undo → Use this → Next → questions written automatically (7 rows, "What should it never do?" last) → answer two, Check all, bars move → the "Claude will ask each time" list shows the per-use inputs (rename one, toggle Required, add "Meeting room", move one fixed question there and back) and readiness counts fixed questions only → upload `deck.pptx` to the template question and `numbers.xlsx` to the input question (analyses READY, `fake.log` `analyse text`) → add a question, edit it, delete it → Regenerate (confirm; the 3 repeated questions keep their answers and files; the others' files appear under General files) → Skills: Create my skills, Generate (retry path) → v1 preview: `SKILL.md` has exactly one "## Before you start — ask the user for" section listing every per-use input with "(required)"/"(if available)", and `references/style-guide.md` has `## For "…"` sections → downloads pass the `quick_validate.py` oracle and asset SHA-256 match. Also: an old job (migrated) shows 8 questions with its answers and its files under General files, and still downloads; `#job` and `#files` URLs open Task and Questions; 390 × 844 walk-through without horizontal scroll; dark mode screenshots of each step.
- **Real API smoke** after the fake run: one task, Enhance, Write questions (check they are task-specific and cover the essentials), one upload, one generated skill passing the oracle.

## Rollout

- Branch `feat/skills-builder-tasks` from `main` (509eb06); one PR.
- Migration `20261125150000_add_skill_task_questions` runs in `start.sh` (`prisma migrate deploy`). Additive: the previous image keeps working against the new schema during the switch (see the accepted gap above). The data migration is one `INSERT … SELECT` over existing jobs (8 rows each) — fast at current volumes.
- No new environment variables. `skill_enhance` (30/day) and `skill_questions` (20/day) use defaults until an admin changes them.
- **Production check after deploy:** open an existing job — 8 questions with its answers, files under General files, versions still download; create a task, Enhance, Write questions, upload one file to a question, generate one skill, download it.

## Out of Scope

- Moving a general file onto a question (re-upload it on the question instead).
- Automatic regeneration when the description changes.
- Per-question file caps (the cap stays 10 per task).
- Changing the legacy pack view or the `skill-definition` matrix.
