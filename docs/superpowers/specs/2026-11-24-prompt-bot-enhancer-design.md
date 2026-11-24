# Prompt Bot — Enhancer Design

## Objective

Give every signed-in LMS user (participants such as CEOs and CTOs, coaches, admins) a **Prompt Bot** at `/prompt-bot` that turns a basic prompt into a properly defined one using the institute's **Design Think** method:

1. The user writes a basic prompt.
2. The AI checks it against a **question matrix**: the core Design Think questions plus questions for the detected kind of task.
3. Each question shows a checkbox and a **3-slice status bar** for how well it is answered. Bars rise and fall live as the user adds short answers.
4. **Enhance** produces a structured prompt built from the *Elements of LLM Prompts*. It works at any time, and anything still unanswered becomes a placeholder.

This spec also defines the **shared AI foundation**: the Claude client, usage limits and configuration. The Skills Builder ([2026-11-24-prompt-bot-skills-builder-design.md](2026-11-24-prompt-bot-skills-builder-design.md)) reuses it.

Product language: everything user-facing is called **Prompt Bot**. Nothing references Prompt Cowboy, which was studied only as a reference product.

## Source Material (institute decks, quoted verbatim)

**Design Think — Our Definition:** Design Think is a structured process / approach towards solving any challenge or problem. Innovation is a natural by-product of Design Think. Design Thinking is the attitude and ability to apply design think to all aspects of life.

**Core questions** ("Questions are often more important than answers"):
1. Why are we doing this?
2. What is going on in the background (Context)?
3. Who is the target audience?
4. What is needed to do this?
5. What are the goals and objectives & How do we measure them?
6. What are the different ways we can approach this?
7. What does success look like?
8. Finally: What is the systematic plan to work on this?

**Elements of LLM Prompts:** Persona, Context, Data, Output Expectations, Iteration Request, Examples.

**Image questions:** Why do we need this image? · What is the full context? · Who is the target audience? · What are we trying to express/show using this image? · What are we trying to get people to feel/take away when they see this image? · Where will this image be published?

Principle shown to users: *Using a structured approach, the quality, certainty and consistency of AI is massively increased.*

## Compatibility Invariants

- Built entirely inside `apps/web`. No new service, database or deploy target.
- **Database:**
  - Uses the existing PostgreSQL database and Prisma client.
  - Migrations are forward-only, matching repository practice.
  - `start.sh` applies them on App Runner deploy.
- **Reused patterns:**
  - Auth: `getCurrentUser()`.
  - Responses: `successResponse`/`errorResponse`.
  - Data fetching: React Query.
  - Design system: the existing `glass` surfaces, `--primary` tokens, `components/ui` and dark mode.
- Existing routes, roles, chat, the Question repository and every existing model stay unchanged.
- **The only new environment variable is `ANTHROPIC_API_KEY`.** Without it the feature degrades to a "not configured" state; nothing else in the LMS breaks.

## Access

| Capability | ADMIN | MENTOR (coach) | MENTEE (participant, incl. guests) |
|---|---|---|---|
| Use Prompt Bot (own sessions) | ✓ | ✓ | ✓ |
| Read active matrices | ✓ | ✓ | ✓ |
| Create / edit / deactivate matrices | ✓ | ✓ | — (403) |
| Edit usage limits | ✓ | — | — |

- **Sessions:** a user can only read and change their own; anyone else's id returns 404.
- **Navigation:** `/prompt-bot` is added to every portal in `PORTAL_PATHS`, the desktop header nav and `MobileNav`.
- **Matrix editing:** the admin editor lives at `/prompt-bot/matrices`.

## Data Model

New Prisma enums and models (cuid ids, snake_case `@map`, timestamps, as in the existing schema).

```prisma
enum PromptMatrixKind {
  CORE
  TASK
  SKILL
}

model PromptMatrix {
  id          String           @id @default(cuid())
  slug        String           @unique            // "core", "image", "presentation", "skill-definition" …
  name        String
  description String?
  kind        PromptMatrixKind
  isBuiltIn   Boolean          @default(false) @map("is_built_in")
  isActive    Boolean          @default(true)  @map("is_active")
  createdById String?          @map("created_by_id")   // null for built-ins
  createdAt   DateTime         @default(now()) @map("created_at")
  updatedAt   DateTime         @updatedAt @map("updated_at")
  questions   PromptMatrixQuestion[]
  @@map("prompt_matrices")
}

model PromptMatrixQuestion {
  id        String   @id @default(cuid())
  matrixId  String   @map("matrix_id")
  order     Int
  text      String                       // shown to the user
  guidance  String                       // what a complete answer contains; the scorer grades against it
  element   String?                      // optional Elements-of-LLM-Prompts tag: persona|context|data|output|iteration|examples|goal|plan
  isActive  Boolean  @default(true) @map("is_active")
  @@index([matrixId, order])
  @@map("prompt_matrix_questions")
}

model PromptBotSession {
  id            String   @id @default(cuid())
  userId        String   @map("user_id")
  title         String   @default("Untitled prompt")
  basePrompt    String   @map("base_prompt")
  taskMatrixId  String?  @map("task_matrix_id")      // the add-on matrix (null = core only)
  taskDetected  Boolean  @default(true) @map("task_detected") // false once the user switches manually
  scoreRevision Int      @default(0) @map("score_revision")
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")
  answers       PromptBotAnswer[]
  enhancements  PromptBotEnhancement[]
  @@index([userId, updatedAt])
  @@map("prompt_bot_sessions")
}

model PromptBotAnswer {
  id          String    @id @default(cuid())
  sessionId   String    @map("session_id")
  questionId  String    @map("question_id")
  answer      String    @default("")
  score       Int       @default(0)            // 0..3
  reason      String?                          // one short line from the scorer
  notRelevant Boolean   @default(false) @map("not_relevant")
  scoredAt    DateTime? @map("scored_at")
  @@unique([sessionId, questionId])
  @@map("prompt_bot_answers")
}

model PromptBotEnhancement {
  id                 String   @id @default(cuid())
  sessionId          String   @map("session_id")
  version            Int
  content            String                    // markdown, Elements-of-LLM-Prompts structure
  unansweredQuestionIds String[] @map("unanswered_question_ids")
  model              String
  instructionsVersion String  @map("instructions_version")
  createdAt          DateTime @default(now()) @map("created_at")
  @@unique([sessionId, version])
  @@map("prompt_bot_enhancements")
}

model AiUsageDaily {
  userId  String @map("user_id")
  day     String                                // YYYY-MM-DD, UTC
  feature String                                // "score" | "enhance" | "skill_split" | "skill_generate"
  count   Int    @default(0)
  @@id([userId, day, feature])
  @@map("ai_usage_daily")
}

model AiSettings {
  id        String   @id @default("singleton")
  limits    Json                                 // { score: 300, enhance: 30, skill_split: 10, skill_generate: 20 }
  updatedAt DateTime @updatedAt @map("updated_at")
  @@map("ai_settings")
}
```

- **Relations:** to `User`, with `onDelete: Cascade` for user-owned rows and `SetNull` for `createdBy`. They are added the same way the existing models declare them.
- **Matrix questions are edited in place,** so answer rows always point at the question as it currently reads.
- **Deactivating a question** hides it from new sessions and from scoring. Answers already saved for it are kept.
- **Built-in matrices can be edited and deactivated, but not deleted.** Built-in `CORE` must stay active: the API rejects deactivating it with HTTP 400.
- **Seed:** the migration SQL inserts the built-in matrices and `AiSettings` defaults, so production has them on first deploy without a seed step.

## Built-in Matrices

**`core` — Design Think (CORE).** These are the eight deck questions, verbatim, in deck order. The scorer grades against the `guidance` text:

| # | Question | Guidance (what "fully answered" means) |
|---|---|---|
| 1 | Why are we doing this? | The underlying reason or problem, and why it matters now. |
| 2 | What is going on in the background (Context)? | Relevant situation: organisation, constraints, history, what has been tried. |
| 3 | Who is the target audience? | Who will read or use the output, how they are described specifically, and what they care about. |
| 4 | What is needed to do this? | Inputs, data, resources, tools or access the AI or person needs. |
| 5 | What are the goals and objectives & How do we measure them? | Concrete objectives and how success will be measured. |
| 6 | What are the different ways we can approach this? | Options or angles considered, or permission for the AI to propose options. |
| 7 | What does success look like? | A description of the ideal finished output: format, length, tone, quality bar. |
| 8 | What is the systematic plan to work on this? | Steps or sequence, including iteration (e.g. ask me questions first). |

**`image` (TASK).** The six deck image questions, verbatim, with guidance.

**Drafts awaiting the institute's wording.** These are marked `isBuiltIn = true`, but their question text is a **draft**: admins edit it in `/prompt-bot/matrices` before launch. The user agreed to this on 2026-11-24.

- **`presentation`:**
  - What decision or action should the audience take after this presentation?
  - What does the audience already know, and what do they doubt?
  - What is the one key message?
  - What evidence, data or stories support it?
  - How long is the slot and how many slides?
  - What brand or visual style applies?
- **`writing`** (emails, posts, articles):
  - What should the reader do or feel after reading?
  - Who exactly is the reader and what is your relationship?
  - What tone and voice should it have?
  - What length and format?
  - What must be included or avoided?
  - Is there an example of writing you like?
- **`strategy`** (plans, decisions):
  - What decision or plan is needed, and by when?
  - What constraints apply (budget, people, time)?
  - Which options are on the table?
  - What criteria decide between them?
  - What risks worry you most?
  - Who must agree?
- **`code`** (software and technical work):
  - What should the software do, for whom?
  - What stack, environment or existing code is involved?
  - What are the inputs and outputs?
  - What edge cases and errors matter?
  - How will we know it works (tests, acceptance criteria)?
  - What must it not do (security, performance limits)?
- **`research`:**
  - What question must the research answer?
  - What scope, period and geography?
  - Which sources are trusted or excluded?
  - How deep: overview or detailed analysis?
  - What format should the findings take?
  - How should uncertainty be reported?
- **`data`** (analysis):
  - What question should the data answer?
  - What data is available and in what shape?
  - Which metrics or definitions apply?
  - What comparisons or segments matter?
  - What output: table, chart, narrative?
  - Who will act on the result?

The `skill-definition` (SKILL) matrix is defined in the Skills Builder spec. It is excluded from task detection.

## Scoring Contract

- **Scale per question:**
  - 0 = not addressed.
  - 1 = touched vaguely.
  - 2 = partly specific.
  - 3 = fully answered per its guidance.
- **What gets scored:** the base prompt plus every answer note, as one text, because an answer to one question often appears inside the prompt or inside another answer.
- **How:** one fast-model call returns `{questionId, score, reason}` for every active question in the session's matrices. It uses structured output, the scores are clamped to 0..3, and unknown ids are ignored.
- **Auto-tick:** a question is ticked when `score === 3` and it is not marked "not relevant".
- **Not relevant:** a question marked not relevant is excluded from readiness and from the Enhance warning. It still shows, greyed out, and can be restored.
- **Readiness:** `sum(min(score,3)) / (3 × relevantCount)`, shown as "N of M answered", where answered means a score of 3.
- **Stale responses:**
  - The client increments a revision on every edit. The server stores `scoreRevision` and applies a score result only if its revision is not older than the stored one.
  - A score that fails keeps the previous scores and shows "couldn't update".

## Enhance Contract

- **Always enabled.** If any relevant question scores below 3, a confirm step shows: "N questions not answered yet — the enhanced prompt will be higher-level." The user can continue anyway.
- **Generation:**
  - The best model streams markdown with these sections, in this order: **Persona**, **Context**, **Data**, **Output expectations**, **Iteration request**, **Examples**. Empty sections are omitted, except Persona and Output expectations, which are always present.
  - Facts come only from the base prompt and answers. Missing facts become `[bracketed placeholders]`. The model never invents numbers, names or credentials.
- **Saving:** each completed enhancement is saved as the next `version`, along with the ids of the questions that were unanswered at that point.
- **Stream protocol:** server-sent events from `POST /api/v1/prompt-bot/sessions/:id/enhance`:
  - `{"type":"delta","text":"…"}` events while generating.
  - `{"type":"done","version":N}` when finished.
  - `{"type":"error","message":"…"}` on failure.

## Task Detection

- **On session create:** the fast model picks one active `TASK` matrix slug, or `none`, given each matrix's name and description, and returns its confidence.
- **Threshold:** a confidence below 0.5 attaches no task matrix, so the session is core only.
- **Manual switch:** the user can switch the task matrix with one click from a chip. That sets `taskDetected = false`, and the session is then re-scored.

## API Contract

Everything lives under `/api/v1/prompt-bot`. It is Zod-validated, uses the existing response envelope, and returns 401 when unauthenticated.

| Method & path | Purpose |
|---|---|
| `GET /sessions` | Own sessions, newest first (id, title, updatedAt, readiness). |
| `POST /sessions` `{basePrompt}` | Create, detect task, initial score. |
| `GET /sessions/:id` | Session + matrices + answers + latest enhancement. |
| `PATCH /sessions/:id` `{title?, basePrompt?, taskMatrixId?}` | Update; switching matrix creates missing answer rows. |
| `DELETE /sessions/:id` | Delete own session. |
| `PUT /sessions/:id/answers/:questionId` `{answer?, notRelevant?}` | Upsert one answer. |
| `POST /sessions/:id/score` `{revision}` | Score now; returns scores + applied revision. |
| `POST /sessions/:id/enhance` | SSE stream (see Enhance Contract). |
| `GET /sessions/:id/enhancements` | Versions list. |
| `GET /matrices` | Active matrices with active questions. |
| `POST /matrices`, `PATCH /matrices/:id`, `PUT /matrices/:id/questions` | ADMIN/MENTOR editing; built-ins not deletable; `core` cannot be deactivated. |
| `GET /settings`, `PATCH /settings` | ADMIN: daily limits. |

Errors:
- 400 for validation failures.
- 403 for the wrong role.
- 404 for a missing resource or one the user doesn't own.
- 429 `LIMIT_REACHED`, with feature and reset time.
- 503 `AI_NOT_CONFIGURED` when `ANTHROPIC_API_KEY` is missing.
- 502 `AI_FAILED`, with a user-safe message.

## AI Foundation (shared)

- **Location:** `src/lib/ai/claude.ts`, server-only. It uses the official `@anthropic-ai/sdk` with `ANTHROPIC_API_KEY`.
- **Models** (user decision, 2026-11-24):
  - **Fast** (`claude-haiku-4-5`): task detection, live scoring, and Skills Builder per-question scoring.
  - **Best** (`claude-opus-5-5`): Enhance, skill split and skill generation.
  - Opus requests enable Anthropic's server-side refusal fallback (`fallbacks: "default"`).
- **Instructions:** they live in `src/lib/prompt-bot/instructions.ts` with an `INSTRUCTIONS_VERSION` constant. That version is stored on every enhancement.
- **Limits:** `src/lib/ai/usage.ts` checks and increments `AiUsageDaily` against `AiSettings.limits` before each AI call. Defaults: score 300, enhance 30, skill_split 10, skill_generate 20 per user per UTC day.
- **Privacy:**
  - Prompt and answer text is never written to logs.
  - The UI shows "Your prompts are stored in the LMS and sent to Anthropic's API to analyse them."

## UI

**`/prompt-bot` start screen:**
- Heading "Prompt Bot", the subtitle "Using a structured approach, the quality, certainty and consistency of AI is massively increased."
- A large textarea ("What do you want AI to do?") with a Start button.
- The user's recent sessions.

**`/prompt-bot/[sessionId]` workspace:**

- **Left column — "Design Think":**
  - An overall readiness bar.
  - A **Core** group, then a **Task** group titled by the matrix name, with a chip to switch or remove the task matrix.
  - Each question row has:
    - A checkbox, ticked automatically, with "not relevant" in a ⋯ menu.
    - The question text.
    - A **3-slice horizontal bar**: three equal segments that fill to the score, coloured amber at 1, blue at 2 and green at 3, with `role="meter"` and `aria-valuenow`, max 3.
    - The score "2/3" and the scorer's one-line reason.
  - Clicking a row focuses its answer box.
- **Right column:**
  - The editable base prompt.
  - A short-answer box for each question, opened from the left. Its placeholder is the question's guidance.
  - Autosave plus re-score about 1.5 s after typing stops.
  - The **Enhance** button, then a result panel that streams in, with Copy and a version switcher.
- **Mobile:** the matrix collapses into a drawer above the workspace.
- **Admin page `/prompt-bot/matrices`** (ADMIN/MENTOR): list matrices; edit the name, description, active flag and questions (text, guidance, element, order); add a matrix.
- **Not configured:** when the key is missing, a "Prompt Bot isn't configured yet" panel replaces the workspace. Admins additionally see the variable name to set.

## Testing

Every production change follows the repository's witnessed failing-test-first rule.

**Unit tests:**
- Readiness and auto-tick maths.
- Score clamping and unknown-id filtering.
- Stale-revision rule.
- Zod schemas.
- Usage-limit check.
- Prompt builders contain every relevant question and guidance, and exclude not-relevant ones.

**Route tests** (AI module mocked, like `question-library-routes.test.ts`):
- Role access matrix.
- Ownership (404).
- 400 / 429 / 503.
- Built-in deletion refused; core deactivation refused.

**Component tests:**
- The 3-slice bar at 0, 1, 2 and 3, including its accessible value.
- Not-relevant toggle.
- The Enhance warning count.

**End to end:**
- A browser run against a local fake Anthropic server: create, score, answer, re-score, enhance stream, version 2.
- One real-API smoke test once the key is configured.

## Rollout

- **Branch and PR:** `feat/prompt-bot-enhancer`, opened as one PR.
- **Migration:** creates the tables, seeds the built-in matrices and the `AiSettings` defaults.
- **Production configuration:** `ANTHROPIC_API_KEY` must be added to the web App Runner service before or with the deploy. Without it the feature shows "not configured".
- **Before launch:** admins review and edit the draft task matrices.

## Out of Scope (this spec)

- Skills Builder (separate spec).
- File attachments to prompts.
- Sharing sessions between users.
- Coaches viewing participants' sessions.
- Non-English UI.
- Billing.
