# Prompt Bot Enhancer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/prompt-bot`: a Design Think prompt enhancer with live 3-slice status bars and streamed Enhance, plus the shared Claude, usage-limit and matrix foundation that the Skills Builder will reuse.

**Architecture:** Everything lives inside `apps/web`.
- **Data:** Prisma models and one forward-only migration. The migration also seeds the built-in matrices from a single TypeScript source.
- **Server:** pure scoring maths and prompt builders, a thin Claude client using the official SDK with JSON-schema structured output, and route handlers under `/api/v1/prompt-bot` using the LMS response envelope.
- **Client:** pages under `src/app/(app)/prompt-bot`, with small focused components under `src/components/prompt-bot`.

**Tech Stack:** Next.js 16.2 App Router, React 19, TypeScript, Prisma 6 on PostgreSQL, Zod 3, `@anthropic-ai/sdk`, Vitest with Testing Library (jsdom via a `/** @vitest-environment jsdom */` header), and the LMS UI kit (`components/ui`, the `glass` surface, `--primary` tokens).

**Spec:** `docs/superpowers/specs/2026-11-24-prompt-bot-enhancer-design.md`

## Global Constraints

- **Scope:** build entirely inside `apps/web`. No new service. Use the existing PostgreSQL database, and change no existing model column or route behaviour.
- **Migrations** are forward-only. Production applies them through `start.sh` (`prisma migrate deploy`). Never reset or drop the database.
- **Environment:** the only new variable is `ANTHROPIC_API_KEY`. Without it the feature shows "Prompt Bot isn't configured yet" and the rest of the LMS is unaffected.
- **Models:**
  - Fast: `claude-haiku-4-5`, for task detection and scoring.
  - Best: `claude-opus-5-5`, for Enhance. Enhance requests use `betas: ["server-side-fallback-2026-07-01"]` and `fallbacks: "default"`.
- **Access:**
  - Every signed-in role uses Prompt Bot and sees only its own sessions; any other session id returns 404.
  - ADMIN and MENTOR edit matrices. ADMIN edits limits.
- **Default daily limits:** `{ score: 300, enhance: 30, skill_split: 10, skill_generate: 20 }` per user per UTC day.
- **Error codes:**
  - 400 `VALIDATION_ERROR`
  - 403 `FORBIDDEN`
  - 404 `NOT_FOUND`
  - 429 `LIMIT_REACHED`
  - 503 `AI_NOT_CONFIGURED`
  - 502 `AI_FAILED`
- **Scores** are integers 0..3. A question is ticked when its score is 3 and it is not marked not relevant.
- **Core matrix:** the eight Design Think questions are copied verbatim from the spec. `core` can never be deactivated, and built-in matrices can never be deleted.
- **Enhance output sections**, in this order: Persona, Context, Data, Output expectations, Iteration request, Examples. Missing facts become `[bracketed placeholders]`.
- **Privacy:** prompt and answer text is never written to logs.
- **TDD:** every production change follows a witnessed failing-test-first cycle (repository rule).
- **Design:** UI matches the LMS design system: `glass` cards, `components/ui`, `--primary` blue, `rounded-2xl`, lucide icons, dark mode. Before writing UI (Tasks 10–12), invoke the `impeccable` skill, as the user's global CLAUDE.md requires for UI work.
- **Commits:** commit only when the human partner has asked for commits. Otherwise stage the files and report them. The baseline is branch `feat/prompt-bot-enhancer` from `main`.

## Review Focus

1. **A user types while an older score is in flight.** The older result must not overwrite newer bars. Covered by the stale-revision test in Task 7.
2. **The model returns a score for an unknown question id, a score outside 0..3, or a duplicate id.** It must be ignored or clamped, never stored as-is. Covered by `sanitizeScores` tests in Task 3 and the scoring route test in Task 7.
3. **A question marked "not relevant".** It must not count against readiness, must not appear in the Enhance warning, and must be excluded from the Enhance prompt's gaps. Covered by Task 3 `readiness` and `unansweredQuestionIds` tests and the Task 5 builder test.
4. **An admin deactivates the matrix a session uses, or deactivates a question.** Existing sessions keep loading, and deactivated questions disappear from scoring. Covered by the Task 6 `matricesForSession` test.
5. **`ANTHROPIC_API_KEY` missing in production.** Routes must return 503 `AI_NOT_CONFIGURED`, never 500, and pages must render the not-configured panel. Covered by the Task 6 and 7 route tests and the Task 11 page test.

---

### Task 0: Workspace baseline

**Files:** none (environment only).

- [ ] **Step 1: Create the branch and install locked dependencies**

```bash
cd "/Users/tharunkumarl/Full Stack/lms"
git switch -c feat/prompt-bot-enhancer
npm ci
```
Expected: `added N packages`, no errors.

- [ ] **Step 2: Put the API key where the web app reads it**

Next.js in `apps/web` loads `apps/web/.env`, not the repository root `.env`. The user added `ANTHROPIC_API_KEY` to the root `.env`. Copy that one line into `apps/web/.env`, which is git-ignored, without printing the value:

```bash
cd "/Users/tharunkumarl/Full Stack/lms"
grep -q '^ANTHROPIC_API_KEY=' apps/web/.env || grep '^ANTHROPIC_API_KEY=' .env >> apps/web/.env
git check-ignore -q apps/web/.env && echo "apps/web/.env is ignored"
```
Expected: `apps/web/.env is ignored`.

- [ ] **Step 3: Record the baseline**

```bash
cd "/Users/tharunkumarl/Full Stack/lms/apps/web"
npx prisma migrate status
npx vitest run
npx tsc --noEmit
```
Expected: migrations are up to date and the suite passes. If anything fails on untouched `main`, stop and report it before changing code.

---

### Task 1: Dependencies and AI configuration

**Files:**
- Modify: `apps/web/package.json` (via npm)
- Create: `apps/web/src/lib/ai/config.ts`
- Test: `apps/web/src/lib/ai/config.test.ts`

**Interfaces:**
- Produces: `FAST_MODEL`, `BEST_MODEL`, `isAiConfigured(env?)`, `AiNotConfiguredError`

- [ ] **Step 1: Install the SDK**

```bash
cd "/Users/tharunkumarl/Full Stack/lms"
npm install @anthropic-ai/sdk --workspace=apps/web
```

- [ ] **Step 2: Write the failing test**

```ts
// apps/web/src/lib/ai/config.test.ts
import { describe, expect, it } from "vitest";
import { AiNotConfiguredError, BEST_MODEL, FAST_MODEL, isAiConfigured } from "./config";

describe("AI configuration", () => {
  it("uses Haiku 4.5 for fast work and Opus 5.5 for output", () => {
    expect(FAST_MODEL).toBe("claude-haiku-4-5");
    expect(BEST_MODEL).toBe("claude-opus-5-5");
  });

  it("is configured only when ANTHROPIC_API_KEY has a non-blank value", () => {
    expect(isAiConfigured({ ANTHROPIC_API_KEY: "sk-ant-test" })).toBe(true);
    expect(isAiConfigured({ ANTHROPIC_API_KEY: "   " })).toBe(false);
    expect(isAiConfigured({})).toBe(false);
  });

  it("has a dedicated error type for the missing key", () => {
    const error = new AiNotConfiguredError();
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("AiNotConfiguredError");
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `cd apps/web && npx vitest run src/lib/ai/config.test.ts`
Expected: FAIL, "Failed to resolve import ./config".

- [ ] **Step 4: Implement**

```ts
// apps/web/src/lib/ai/config.ts
/** Models chosen with the product owner (spec, 2026-11-24). */
export const FAST_MODEL = "claude-haiku-4-5";
export const BEST_MODEL = "claude-opus-5-5";

export function isAiConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.ANTHROPIC_API_KEY?.trim());
}

export class AiNotConfiguredError extends Error {
  constructor() {
    super("ANTHROPIC_API_KEY is not set");
    this.name = "AiNotConfiguredError";
  }
}
```

- [ ] **Step 5: Run it and watch it pass, then stage**

Run: `npx vitest run src/lib/ai/config.test.ts` → PASS.
```bash
git add apps/web/package.json package-lock.json apps/web/src/lib/ai/config.ts apps/web/src/lib/ai/config.test.ts
```

---

### Task 2: Built-in matrices, schema and migration

**Files:**
- Create: `apps/web/src/lib/prompt-bot/builtin-matrices.ts`
- Create: `apps/web/scripts/prompt-bot-seed-sql.ts`
- Modify: `apps/web/prisma/schema.prisma` (enum, 6 models, `User` relations)
- Create: `apps/web/prisma/migrations/20261124090000_add_prompt_bot/migration.sql`
- Test: `apps/web/src/lib/prompt-bot/builtin-matrices.test.ts`

**Interfaces:**
- Produces:
  - `BUILTIN_MATRICES: BuiltinMatrix[]`, where `BuiltinMatrix = { id: string; slug: string; name: string; description: string; kind: "CORE" | "TASK"; questions: { id: string; text: string; guidance: string; element: string | null }[] }`
  - `CORE_MATRIX_ID = "pbm_core"`
  - Prisma models `PromptMatrix`, `PromptMatrixQuestion`, `PromptBotSession`, `PromptBotAnswer`, `PromptBotEnhancement`, `AiUsageDaily`, `AiSettings`, and enum `PromptMatrixKind`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/prompt-bot/builtin-matrices.test.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BUILTIN_MATRICES, CORE_MATRIX_ID } from "./builtin-matrices";

const CORE_VERBATIM = [
  "Why are we doing this?",
  "What is going on in the background (Context)?",
  "Who is the target audience?",
  "What is needed to do this?",
  "What are the goals and objectives & How do we measure them?",
  "What are the different ways we can approach this?",
  "What does success look like?",
  "What is the systematic plan to work on this?",
];
const IMAGE_VERBATIM = [
  "Why do we need this image?",
  "What is the full context?",
  "Who is the target audience?",
  "What are we trying to express/show using this image?",
  "What are we trying to get people to feel/take away when they see this image?",
  "Where will this image be published?",
];

describe("built-in matrices", () => {
  it("keeps the eight Design Think questions verbatim and in deck order", () => {
    const core = BUILTIN_MATRICES.find((m) => m.id === CORE_MATRIX_ID)!;
    expect(core.slug).toBe("core");
    expect(core.kind).toBe("CORE");
    expect(core.questions.map((q) => q.text)).toEqual(CORE_VERBATIM);
  });

  it("keeps the six image questions verbatim", () => {
    const image = BUILTIN_MATRICES.find((m) => m.slug === "image")!;
    expect(image.kind).toBe("TASK");
    expect(image.questions.map((q) => q.text)).toEqual(IMAGE_VERBATIM);
  });

  it("ships the draft task matrices from the spec", () => {
    expect(BUILTIN_MATRICES.map((m) => m.slug).sort()).toEqual(
      ["code", "core", "data", "image", "presentation", "research", "strategy", "writing"],
    );
    for (const matrix of BUILTIN_MATRICES) {
      expect(matrix.questions.length).toBeGreaterThanOrEqual(6);
      for (const q of matrix.questions) expect(q.guidance.length).toBeGreaterThan(20);
    }
  });

  it("uses unique stable ids", () => {
    const ids = BUILTIN_MATRICES.flatMap((m) => [m.id, ...m.questions.map((q) => q.id)]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("is seeded by the migration exactly as defined", () => {
    const sql = readFileSync(
      path.join(__dirname, "../../../prisma/migrations/20261124090000_add_prompt_bot/migration.sql"),
      "utf8",
    );
    for (const matrix of BUILTIN_MATRICES) {
      expect(sql).toContain(`'${matrix.id}'`);
      for (const q of matrix.questions) expect(sql).toContain(q.text.replace(/'/g, "''"));
    }
    expect(sql).toContain(`'singleton'`);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/prompt-bot/builtin-matrices.test.ts` → FAIL, "Failed to resolve import ./builtin-matrices".

- [ ] **Step 3: Write the matrix source of truth**

```ts
// apps/web/src/lib/prompt-bot/builtin-matrices.ts
/**
 * Built-in question matrices. `core` and `image` are verbatim from the
 * institute's Design Think decks; the other task matrices are drafts the
 * institute edits in /prompt-bot/matrices before launch (spec, 2026-11-24).
 * The migration seeds these rows (scripts/prompt-bot-seed-sql.ts).
 */
export type BuiltinQuestion = { id: string; text: string; guidance: string; element: string | null };
export type BuiltinMatrix = {
  id: string;
  slug: string;
  name: string;
  description: string;
  kind: "CORE" | "TASK";
  questions: BuiltinQuestion[];
};

export const CORE_MATRIX_ID = "pbm_core";

const q = (matrix: string, n: number, text: string, guidance: string, element: string | null = null): BuiltinQuestion => ({
  id: `pbq_${matrix}_${n}`,
  text,
  guidance,
  element,
});

export const BUILTIN_MATRICES: BuiltinMatrix[] = [
  {
    id: CORE_MATRIX_ID,
    slug: "core",
    name: "Design Think",
    description: "The core questions every prompt should answer.",
    kind: "CORE",
    questions: [
      q("core", 1, "Why are we doing this?", "The underlying reason or problem, and why it matters now.", "goal"),
      q("core", 2, "What is going on in the background (Context)?", "Relevant situation: organisation, constraints, history, what has been tried.", "context"),
      q("core", 3, "Who is the target audience?", "Who will read or use the output, how specifically they are described, and what they care about.", "persona"),
      q("core", 4, "What is needed to do this?", "Inputs, data, resources, tools or access the AI or person needs.", "data"),
      q("core", 5, "What are the goals and objectives & How do we measure them?", "Concrete objectives and how success will be measured.", "goal"),
      q("core", 6, "What are the different ways we can approach this?", "Options or angles considered, or permission for the AI to propose options.", "iteration"),
      q("core", 7, "What does success look like?", "A description of the ideal finished output: format, length, tone and quality bar.", "output"),
      q("core", 8, "What is the systematic plan to work on this?", "Steps or sequence, including iteration such as asking clarifying questions first.", "plan"),
    ],
  },
  {
    id: "pbm_image",
    slug: "image",
    name: "Image",
    description: "Creating an image, graphic, illustration or visual.",
    kind: "TASK",
    questions: [
      q("image", 1, "Why do we need this image?", "The purpose the image serves and the decision or action it supports."),
      q("image", 2, "What is the full context?", "Where it sits: campaign, document, brand, surrounding content and constraints."),
      q("image", 3, "Who is the target audience?", "Who will see it and what they already know or expect."),
      q("image", 4, "What are we trying to express/show using this image?", "The subject, message or idea the image must show clearly."),
      q("image", 5, "What are we trying to get people to feel/take away when they see this image?", "The emotion or single takeaway the viewer should leave with."),
      q("image", 6, "Where will this image be published?", "Channel, format, size or aspect ratio, and any brand or platform rules."),
    ],
  },
  {
    id: "pbm_presentation",
    slug: "presentation",
    name: "Presentation",
    description: "Slide decks, pitches, board or team presentations.",
    kind: "TASK",
    questions: [
      q("presentation", 1, "What decision or action should the audience take after this presentation?", "The specific decision, approval or action expected at the end."),
      q("presentation", 2, "What does the audience already know, and what do they doubt?", "Their starting knowledge, objections and concerns."),
      q("presentation", 3, "What is the one key message?", "A single sentence the audience must remember."),
      q("presentation", 4, "What evidence, data or stories support it?", "Facts, figures, examples or cases available to use."),
      q("presentation", 5, "How long is the slot and how many slides?", "Time available and target slide count."),
      q("presentation", 6, "What brand or visual style applies?", "Template, colours, tone and any visual rules."),
    ],
  },
  {
    id: "pbm_writing",
    slug: "writing",
    name: "Writing",
    description: "Emails, posts, articles, announcements and other written pieces.",
    kind: "TASK",
    questions: [
      q("writing", 1, "What should the reader do or feel after reading?", "The action or reaction the piece must produce."),
      q("writing", 2, "Who exactly is the reader and what is your relationship?", "The reader's role, seniority and relationship to the writer."),
      q("writing", 3, "What tone and voice should it have?", "Formality, warmth, confidence and any voice rules."),
      q("writing", 4, "What length and format?", "Word count or length, structure and channel format."),
      q("writing", 5, "What must be included or avoided?", "Mandatory points, facts, links, and topics or phrases to avoid."),
      q("writing", 6, "Is there an example of writing you like?", "A sample or description of a style to match."),
    ],
  },
  {
    id: "pbm_strategy",
    slug: "strategy",
    name: "Strategy",
    description: "Plans, decisions, strategy and prioritisation.",
    kind: "TASK",
    questions: [
      q("strategy", 1, "What decision or plan is needed, and by when?", "The decision to make or plan to produce, and the deadline."),
      q("strategy", 2, "What constraints apply (budget, people, time)?", "Hard limits on money, people, time or technology."),
      q("strategy", 3, "Which options are on the table?", "Alternatives already considered, or none yet."),
      q("strategy", 4, "What criteria decide between them?", "How options will be judged and weighted."),
      q("strategy", 5, "What risks worry you most?", "The main risks and what failure would look like."),
      q("strategy", 6, "Who must agree?", "Stakeholders whose approval or buy-in is needed."),
    ],
  },
  {
    id: "pbm_code",
    slug: "code",
    name: "Code",
    description: "Software, automation and technical work.",
    kind: "TASK",
    questions: [
      q("code", 1, "What should the software do, for whom?", "The behaviour required and who uses it."),
      q("code", 2, "What stack, environment or existing code is involved?", "Languages, frameworks, versions, systems and existing code."),
      q("code", 3, "What are the inputs and outputs?", "Data coming in, results going out, and their formats."),
      q("code", 4, "What edge cases and errors matter?", "Unusual inputs, failures and how they must be handled."),
      q("code", 5, "How will we know it works (tests, acceptance criteria)?", "Tests or acceptance criteria that prove it is done."),
      q("code", 6, "What must it not do (security, performance limits)?", "Security, privacy, performance and compliance constraints."),
    ],
  },
  {
    id: "pbm_research",
    slug: "research",
    name: "Research",
    description: "Investigating, analysing and summarising information.",
    kind: "TASK",
    questions: [
      q("research", 1, "What question must the research answer?", "The precise question and the decision it informs."),
      q("research", 2, "What scope, period and geography?", "Boundaries: topics, time range and regions."),
      q("research", 3, "Which sources are trusted or excluded?", "Preferred, required and forbidden sources."),
      q("research", 4, "How deep: overview or detailed analysis?", "Depth and level of detail expected."),
      q("research", 5, "What format should the findings take?", "Report, table, bullets or brief, and its length."),
      q("research", 6, "How should uncertainty be reported?", "How to flag confidence, gaps and conflicting evidence."),
    ],
  },
  {
    id: "pbm_data",
    slug: "data",
    name: "Data analysis",
    description: "Analysing data, metrics, spreadsheets and reports.",
    kind: "TASK",
    questions: [
      q("data", 1, "What question should the data answer?", "The business question behind the analysis."),
      q("data", 2, "What data is available and in what shape?", "Sources, columns, size, quality and format."),
      q("data", 3, "Which metrics or definitions apply?", "How key metrics are defined and calculated."),
      q("data", 4, "What comparisons or segments matter?", "Periods, groups or benchmarks to compare."),
      q("data", 5, "What output: table, chart, narrative?", "The form of the result and its level of detail."),
      q("data", 6, "Who will act on the result?", "The decision-maker and what they will do with it."),
    ],
  },
];
```

- [ ] **Step 4: Add the Prisma schema**

Append to `apps/web/prisma/schema.prisma`:

```prisma
// ============================================================================
// Prompt Bot
// ============================================================================

enum PromptMatrixKind {
  CORE
  TASK
  SKILL
}

model PromptMatrix {
  id          String           @id @default(cuid())
  slug        String           @unique
  name        String
  description String?
  kind        PromptMatrixKind
  isBuiltIn   Boolean          @default(false) @map("is_built_in")
  isActive    Boolean          @default(true) @map("is_active")
  createdById String?          @map("created_by_id")
  createdAt   DateTime         @default(now()) @map("created_at")
  updatedAt   DateTime         @updatedAt @map("updated_at")
  createdBy   User?            @relation("PromptMatrixCreator", fields: [createdById], references: [id], onDelete: SetNull)
  questions   PromptMatrixQuestion[]
  sessions    PromptBotSession[]
  @@index([kind, isActive])
  @@map("prompt_matrices")
}

model PromptMatrixQuestion {
  id       String          @id @default(cuid())
  matrixId String          @map("matrix_id")
  order    Int
  text     String
  guidance String
  element  String?
  isActive Boolean         @default(true) @map("is_active")
  matrix   PromptMatrix    @relation(fields: [matrixId], references: [id], onDelete: Cascade)
  answers  PromptBotAnswer[]
  @@index([matrixId, order])
  @@map("prompt_matrix_questions")
}

model PromptBotSession {
  id            String        @id @default(cuid())
  userId        String        @map("user_id")
  title         String        @default("Untitled prompt")
  basePrompt    String        @map("base_prompt")
  taskMatrixId  String?       @map("task_matrix_id")
  taskDetected  Boolean       @default(true) @map("task_detected")
  scoreRevision Int           @default(0) @map("score_revision")
  createdAt     DateTime      @default(now()) @map("created_at")
  updatedAt     DateTime      @updatedAt @map("updated_at")
  user          User          @relation("PromptBotSessionOwner", fields: [userId], references: [id], onDelete: Cascade)
  taskMatrix    PromptMatrix? @relation(fields: [taskMatrixId], references: [id], onDelete: SetNull)
  answers       PromptBotAnswer[]
  enhancements  PromptBotEnhancement[]
  @@index([userId, updatedAt])
  @@map("prompt_bot_sessions")
}

model PromptBotAnswer {
  id          String               @id @default(cuid())
  sessionId   String               @map("session_id")
  questionId  String               @map("question_id")
  answer      String               @default("")
  score       Int                  @default(0)
  reason      String?
  notRelevant Boolean              @default(false) @map("not_relevant")
  scoredAt    DateTime?            @map("scored_at")
  session     PromptBotSession     @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  question    PromptMatrixQuestion @relation(fields: [questionId], references: [id], onDelete: Cascade)
  @@unique([sessionId, questionId])
  @@map("prompt_bot_answers")
}

model PromptBotEnhancement {
  id                    String           @id @default(cuid())
  sessionId             String           @map("session_id")
  version               Int
  content               String
  unansweredQuestionIds String[]         @default([]) @map("unanswered_question_ids")
  model                 String
  instructionsVersion   String           @map("instructions_version")
  createdAt             DateTime         @default(now()) @map("created_at")
  session               PromptBotSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  @@unique([sessionId, version])
  @@map("prompt_bot_enhancements")
}

model AiUsageDaily {
  userId  String @map("user_id")
  day     String
  feature String
  count   Int    @default(0)
  user    User   @relation("AiUsageOwner", fields: [userId], references: [id], onDelete: Cascade)
  @@id([userId, day, feature])
  @@map("ai_usage_daily")
}

model AiSettings {
  id        String   @id @default("singleton")
  limits    Json
  updatedAt DateTime @updatedAt @map("updated_at")
  @@map("ai_settings")
}
```

In `model User`'s relation list, after `profilePhoto UserProfilePhoto?`, add:

```prisma
  promptMatrices     PromptMatrix[]     @relation("PromptMatrixCreator")
  promptBotSessions  PromptBotSession[] @relation("PromptBotSessionOwner")
  aiUsage            AiUsageDaily[]     @relation("AiUsageOwner")
```

- [ ] **Step 5: Write the seed SQL generator**

```ts
// apps/web/scripts/prompt-bot-seed-sql.ts
// Prints INSERT statements for the built-in matrices and AI settings.
// Usage: npx tsx scripts/prompt-bot-seed-sql.ts >> prisma/migrations/<dir>/migration.sql
import { BUILTIN_MATRICES } from "../src/lib/prompt-bot/builtin-matrices";

const s = (value: string | null) => (value === null ? "NULL" : `'${value.replace(/'/g, "''")}'`);
const lines: string[] = ["", "-- Seed: built-in Prompt Bot matrices (src/lib/prompt-bot/builtin-matrices.ts)"];
for (const m of BUILTIN_MATRICES) {
  lines.push(
    `INSERT INTO "prompt_matrices" ("id","slug","name","description","kind","is_built_in","is_active","created_at","updated_at") VALUES (${s(m.id)},${s(m.slug)},${s(m.name)},${s(m.description)},'${m.kind}',true,true,NOW(),NOW());`,
  );
  m.questions.forEach((question, order) => {
    lines.push(
      `INSERT INTO "prompt_matrix_questions" ("id","matrix_id","order","text","guidance","element","is_active") VALUES (${s(question.id)},${s(m.id)},${order},${s(question.text)},${s(question.guidance)},${s(question.element)},true);`,
    );
  });
}
lines.push(
  `INSERT INTO "ai_settings" ("id","limits","updated_at") VALUES ('singleton','{"score":300,"enhance":30,"skill_split":10,"skill_generate":20}'::jsonb,NOW());`,
);
console.log(lines.join("\n"));
```

- [ ] **Step 6: Generate the migration and append the seed**

```bash
cd "/Users/tharunkumarl/Full Stack/lms/apps/web"
npx prisma migrate dev --create-only --name add_prompt_bot
# Rename the generated folder to the fixed timestamp used by the test:
mv prisma/migrations/*_add_prompt_bot prisma/migrations/20261124090000_add_prompt_bot
npx tsx scripts/prompt-bot-seed-sql.ts >> prisma/migrations/20261124090000_add_prompt_bot/migration.sql
npx prisma migrate dev
```
Expected: the migration applies to `mentor_connect_lms`, and `prisma generate` runs. Inspect the generated SQL. It must only `CREATE` new types, tables, indexes and foreign keys, and `INSERT` seed rows. If it alters any existing table other than adding foreign keys that reference `users`, stop.

- [ ] **Step 7: Run the test and watch it pass, then stage**

Run: `npx vitest run src/lib/prompt-bot/builtin-matrices.test.ts` → PASS.
```bash
git add apps/web/prisma/schema.prisma apps/web/prisma/migrations/20261124090000_add_prompt_bot apps/web/scripts/prompt-bot-seed-sql.ts apps/web/src/lib/prompt-bot/builtin-matrices.ts apps/web/src/lib/prompt-bot/builtin-matrices.test.ts
```

---

### Task 3: Scoring and readiness maths

**Files:**
- Create: `apps/web/src/lib/prompt-bot/scoring.ts`
- Test: `apps/web/src/lib/prompt-bot/scoring.test.ts`

**Interfaces:**
- Produces:
  - `MAX_SCORE = 3`
  - `type ScoreResult = { questionId: string; score: number; reason: string }`
  - `clampScore(value: unknown): number`
  - `isTicked(a: { score: number; notRelevant: boolean }): boolean`
  - `readiness(answers: { score: number; notRelevant: boolean }[]): { answered: number; relevant: number; ratio: number }`
  - `sanitizeScores(results: unknown[], validIds: ReadonlySet<string>): ScoreResult[]`
  - `shouldApplyRevision(incoming: number, stored: number): boolean`
  - `unansweredQuestionIds(answers: { questionId: string; score: number; notRelevant: boolean }[]): string[]`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/prompt-bot/scoring.test.ts
import { describe, expect, it } from "vitest";
import {
  clampScore,
  isTicked,
  readiness,
  sanitizeScores,
  shouldApplyRevision,
  unansweredQuestionIds,
} from "./scoring";

describe("clampScore", () => {
  it.each([
    [2, 2],
    [3.7, 3],
    [-1, 0],
    [9, 3],
    ["2", 2],
    [Number.NaN, 0],
    [null, 0],
  ])("clamps %s to %s", (input, expected) => {
    expect(clampScore(input)).toBe(expected);
  });
});

describe("isTicked", () => {
  it("ticks only fully answered relevant questions", () => {
    expect(isTicked({ score: 3, notRelevant: false })).toBe(true);
    expect(isTicked({ score: 2, notRelevant: false })).toBe(false);
    expect(isTicked({ score: 3, notRelevant: true })).toBe(false);
  });
});

describe("readiness", () => {
  it("ignores not-relevant questions and counts 3/3 answers", () => {
    const result = readiness([
      { score: 3, notRelevant: false },
      { score: 1, notRelevant: false },
      { score: 0, notRelevant: true },
      { score: 2, notRelevant: false },
    ]);
    expect(result).toEqual({ answered: 1, relevant: 3, ratio: 6 / 9 });
  });

  it("is zero, not NaN, when every question is not relevant", () => {
    expect(readiness([{ score: 0, notRelevant: true }])).toEqual({ answered: 0, relevant: 0, ratio: 0 });
  });
});

describe("sanitizeScores", () => {
  const valid = new Set(["q1", "q2"]);

  it("drops unknown ids and malformed rows, clamps scores and trims reasons", () => {
    const result = sanitizeScores(
      [
        { questionId: "q1", score: 5, reason: "  Fully covered.  " },
        { questionId: "nope", score: 2, reason: "x" },
        { questionId: "q2", score: 1, reason: "a".repeat(400) },
        { nonsense: true },
      ],
      valid,
    );
    expect(result).toEqual([
      { questionId: "q1", score: 3, reason: "Fully covered." },
      { questionId: "q2", score: 1, reason: "a".repeat(160) },
    ]);
  });

  it("keeps the first result when the model repeats an id", () => {
    const result = sanitizeScores(
      [
        { questionId: "q1", score: 1, reason: "first" },
        { questionId: "q1", score: 3, reason: "second" },
      ],
      valid,
    );
    expect(result).toEqual([{ questionId: "q1", score: 1, reason: "first" }]);
  });
});

describe("shouldApplyRevision", () => {
  it("applies equal or newer revisions only", () => {
    expect(shouldApplyRevision(5, 4)).toBe(true);
    expect(shouldApplyRevision(5, 5)).toBe(true);
    expect(shouldApplyRevision(4, 5)).toBe(false);
  });
});

describe("unansweredQuestionIds", () => {
  it("lists relevant questions below 3", () => {
    expect(
      unansweredQuestionIds([
        { questionId: "a", score: 3, notRelevant: false },
        { questionId: "b", score: 2, notRelevant: false },
        { questionId: "c", score: 0, notRelevant: true },
      ]),
    ).toEqual(["b"]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

`npx vitest run src/lib/prompt-bot/scoring.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// apps/web/src/lib/prompt-bot/scoring.ts
export const MAX_SCORE = 3;
const REASON_LIMIT = 160;

export type ScoreResult = { questionId: string; score: number; reason: string };
type Scored = { score: number; notRelevant: boolean };

export function clampScore(value: unknown): number {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(MAX_SCORE, Math.floor(n)));
}

export function isTicked(answer: Scored): boolean {
  return !answer.notRelevant && answer.score >= MAX_SCORE;
}

export function readiness(answers: Scored[]) {
  const relevant = answers.filter((a) => !a.notRelevant);
  if (relevant.length === 0) return { answered: 0, relevant: 0, ratio: 0 };
  const points = relevant.reduce((sum, a) => sum + Math.min(a.score, MAX_SCORE), 0);
  return {
    answered: relevant.filter((a) => a.score >= MAX_SCORE).length,
    relevant: relevant.length,
    ratio: points / (MAX_SCORE * relevant.length),
  };
}

export function sanitizeScores(results: unknown[], validIds: ReadonlySet<string>): ScoreResult[] {
  const seen = new Set<string>();
  const clean: ScoreResult[] = [];
  for (const row of results) {
    if (!row || typeof row !== "object") continue;
    const { questionId, score, reason } = row as Record<string, unknown>;
    if (typeof questionId !== "string" || !validIds.has(questionId) || seen.has(questionId)) continue;
    seen.add(questionId);
    clean.push({
      questionId,
      score: clampScore(score),
      reason: (typeof reason === "string" ? reason.trim() : "").slice(0, REASON_LIMIT),
    });
  }
  return clean;
}

export function shouldApplyRevision(incoming: number, stored: number): boolean {
  return incoming >= stored;
}

export function unansweredQuestionIds(answers: (Scored & { questionId: string })[]): string[] {
  return answers.filter((a) => !a.notRelevant && a.score < MAX_SCORE).map((a) => a.questionId);
}
```

- [ ] **Step 4: Run it and watch it pass, then stage**

`npx vitest run src/lib/prompt-bot/scoring.test.ts` → PASS. Stage both files.

---

### Task 4: Daily usage limits

**Files:**
- Create: `apps/web/src/lib/ai/usage.ts`
- Test: `apps/web/src/lib/ai/usage.test.ts`

**Interfaces:**
- Consumes: `prisma` from `@/lib/db/prisma`
- Produces:
  - `type AiFeature = "score" | "enhance" | "skill_split" | "skill_generate"`
  - `DEFAULT_LIMITS`
  - `utcDay(date?: Date): string`
  - `getLimits(): Promise<Record<AiFeature, number>>`
  - `normalizeLimits(raw: unknown): Record<AiFeature, number>`
  - `consumeAiUsage(userId: string, feature: AiFeature, now?: Date): Promise<void>`
  - `class LimitReachedError extends Error { feature: AiFeature; resetAt: Date }`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/ai/usage.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findSettings: vi.fn(), upsert: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    aiSettings: { findUnique: mocks.findSettings },
    aiUsageDaily: { upsert: mocks.upsert, update: mocks.update },
  },
}));

import { consumeAiUsage, DEFAULT_LIMITS, LimitReachedError, normalizeLimits, utcDay } from "./usage";

const NOW = new Date("2026-11-24T22:30:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findSettings.mockResolvedValue({ limits: { enhance: 2 } });
});

describe("usage limits", () => {
  it("formats the UTC day", () => {
    expect(utcDay(NOW)).toBe("2026-11-24");
  });

  it("merges stored limits over defaults and rejects junk", () => {
    expect(normalizeLimits({ enhance: 5, score: -3, bogus: 1 })).toEqual({ ...DEFAULT_LIMITS, enhance: 5 });
    expect(normalizeLimits(null)).toEqual(DEFAULT_LIMITS);
  });

  it("counts a call within the limit", async () => {
    mocks.upsert.mockResolvedValue({ count: 2 });
    await expect(consumeAiUsage("u1", "enhance", NOW)).resolves.toBeUndefined();
    expect(mocks.upsert).toHaveBeenCalledWith({
      where: { userId_day_feature: { userId: "u1", day: "2026-11-24", feature: "enhance" } },
      create: { userId: "u1", day: "2026-11-24", feature: "enhance", count: 1 },
      update: { count: { increment: 1 } },
    });
  });

  it("refuses and rolls back the increment over the limit", async () => {
    mocks.upsert.mockResolvedValue({ count: 3 });
    const error = await consumeAiUsage("u1", "enhance", NOW).catch((e) => e);
    expect(error).toBeInstanceOf(LimitReachedError);
    expect(error.feature).toBe("enhance");
    expect(error.resetAt.toISOString()).toBe("2026-11-25T00:00:00.000Z");
    expect(mocks.update).toHaveBeenCalledWith({
      where: { userId_day_feature: { userId: "u1", day: "2026-11-24", feature: "enhance" } },
      data: { count: { decrement: 1 } },
    });
  });
});
```

- [ ] **Step 2: Run it and watch it fail** (module not found).

- [ ] **Step 3: Implement**

```ts
// apps/web/src/lib/ai/usage.ts
import { prisma } from "@/lib/db/prisma";

export type AiFeature = "score" | "enhance" | "skill_split" | "skill_generate";
export const AI_FEATURES: AiFeature[] = ["score", "enhance", "skill_split", "skill_generate"];
export const DEFAULT_LIMITS: Record<AiFeature, number> = { score: 300, enhance: 30, skill_split: 10, skill_generate: 20 };

export class LimitReachedError extends Error {
  constructor(
    public feature: AiFeature,
    public resetAt: Date,
  ) {
    super(`Daily limit reached for ${feature}`);
    this.name = "LimitReachedError";
  }
}

export function utcDay(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function nextUtcMidnight(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1));
}

export function normalizeLimits(raw: unknown): Record<AiFeature, number> {
  const limits = { ...DEFAULT_LIMITS };
  if (!raw || typeof raw !== "object") return limits;
  for (const feature of AI_FEATURES) {
    const value = (raw as Record<string, unknown>)[feature];
    if (typeof value === "number" && Number.isInteger(value) && value >= 0) limits[feature] = value;
  }
  return limits;
}

export async function getLimits(): Promise<Record<AiFeature, number>> {
  const settings = await prisma.aiSettings.findUnique({ where: { id: "singleton" } });
  return normalizeLimits(settings?.limits);
}

/** Counts one AI call; throws LimitReachedError (and undoes the count) when over the daily limit. */
export async function consumeAiUsage(userId: string, feature: AiFeature, now = new Date()): Promise<void> {
  const limits = await getLimits();
  const key = { userId, day: utcDay(now), feature };
  const row = await prisma.aiUsageDaily.upsert({
    where: { userId_day_feature: key },
    create: { ...key, count: 1 },
    update: { count: { increment: 1 } },
  });
  if (row.count > limits[feature]) {
    await prisma.aiUsageDaily.update({ where: { userId_day_feature: key }, data: { count: { decrement: 1 } } });
    throw new LimitReachedError(feature, nextUtcMidnight(now));
  }
}
```

- [ ] **Step 4: Run it and watch it pass, then stage.**

---

### Task 5: Prompt Bot instructions and the Claude client

**Files:**
- Create: `apps/web/src/lib/prompt-bot/instructions.ts`
- Create: `apps/web/src/lib/ai/claude.ts`
- Test: `apps/web/src/lib/prompt-bot/instructions.test.ts`
- Test: `apps/web/src/lib/ai/claude.test.ts`

**Interfaces:**
- Consumes: `FAST_MODEL`, `BEST_MODEL`, `isAiConfigured`, `AiNotConfiguredError` (Task 1); `sanitizeScores`, `ScoreResult` (Task 3)
- Produces:
  - `INSTRUCTIONS_VERSION = "prompt-bot-v1"`
  - `type PromptQuestionContext = { id: string; text: string; guidance: string; answer: string; score: number; notRelevant: boolean }`
  - `buildScoringText(basePrompt: string, questions: PromptQuestionContext[]): string`
  - `buildEnhanceMessage(basePrompt: string, questions: PromptQuestionContext[]): string`
  - `detectTaskKind(basePrompt: string, matrices: { slug: string; name: string; description: string | null }[]): Promise<{ slug: string | null; confidence: number }>`
  - `scoreQuestions(text: string, questions: { id: string; text: string; guidance: string }[]): Promise<ScoreResult[]>`
  - `streamEnhancement(message: string, signal?: AbortSignal): { textStream: AsyncIterable<string>; finalModel(): Promise<string> }`
  - `ENHANCE_SYSTEM`, `SCORE_SYSTEM`, `DETECT_SYSTEM`

- [ ] **Step 1: Write the failing instructions test**

```ts
// apps/web/src/lib/prompt-bot/instructions.test.ts
import { describe, expect, it } from "vitest";
import { buildEnhanceMessage, buildScoringText, ENHANCE_SYSTEM, type PromptQuestionContext } from "./instructions";

const questions: PromptQuestionContext[] = [
  { id: "q1", text: "Why are we doing this?", guidance: "Reason", answer: "To win a client", score: 3, notRelevant: false },
  { id: "q2", text: "Who is the target audience?", guidance: "Audience", answer: "", score: 1, notRelevant: false },
  { id: "q3", text: "Where will this image be published?", guidance: "Channel", answer: "", score: 0, notRelevant: true },
];

describe("prompt bot instructions", () => {
  it("scores the base prompt together with every relevant answer", () => {
    const text = buildScoringText("Write a cold email", questions);
    expect(text).toContain("Write a cold email");
    expect(text).toContain("Why are we doing this?\nTo win a client");
    expect(text).not.toContain("Where will this image be published?");
  });

  it("lists answered context and unanswered gaps, excluding not-relevant questions", () => {
    const message = buildEnhanceMessage("Write a cold email", questions);
    expect(message).toContain("<basic_prompt>\nWrite a cold email\n</basic_prompt>");
    expect(message).toContain("To win a client");
    expect(message).toMatch(/<gaps>[\s\S]*Who is the target audience\?[\s\S]*<\/gaps>/);
    expect(message).not.toContain("Where will this image be published?");
  });

  it("asks for the Elements of LLM Prompts sections in order with placeholders for gaps", () => {
    const order = ["Persona", "Context", "Data", "Output expectations", "Iteration request", "Examples"];
    const positions = order.map((h) => ENHANCE_SYSTEM.indexOf(`## ${h}`));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(ENHANCE_SYSTEM).toContain("[bracketed placeholders]");
  });
});
```

- [ ] **Step 2: Run it and watch it fail** (module not found).

- [ ] **Step 3: Implement the instructions**

```ts
// apps/web/src/lib/prompt-bot/instructions.ts
/**
 * Prompt Bot's instructions to Claude. Bump INSTRUCTIONS_VERSION whenever any
 * text here changes; it is stored on every enhancement for comparison.
 */
export const INSTRUCTIONS_VERSION = "prompt-bot-v1";

export type PromptQuestionContext = {
  id: string;
  text: string;
  guidance: string;
  answer: string;
  score: number;
  notRelevant: boolean;
};

export const DETECT_SYSTEM = `You classify what kind of task a person wants an AI assistant to do, so the right follow-up questions can be shown. Pick the single best matching task kind from the list you are given, or "none" if nothing fits well. Return a confidence between 0 and 1.`;

export const SCORE_SYSTEM = `You assess how well a person's prompt and notes answer a set of Design Think questions. Read everything they wrote as one text: an answer to one question often appears in the prompt or under another question.

Score each question 0-3 against its guidance:
0 = not addressed at all
1 = touched on vaguely
2 = partly answered with some specifics
3 = fully answered as the guidance describes

Give a short, specific reason (under 15 words) that tells the person what is present or missing. Be fair, not generous: a 3 needs the specifics the guidance asks for.`;

export const ENHANCE_SYSTEM = `You are Prompt Bot. You turn a person's basic prompt and their answers to Design Think questions into a complete, well-structured prompt they can paste into any AI assistant.

Write the prompt in Markdown with these sections, in this order, omitting a section only when there is truly nothing for it (Persona and Output expectations are always present):

## Persona
## Context
## Data
## Output expectations
## Iteration request
## Examples

Use only facts from the basic prompt and the answers. Never invent numbers, names, credentials or company details. Where information is missing, write [bracketed placeholders] the person can fill in, such as [target audience] or [deadline]. Address the AI directly ("You are…", "Write…"). Output only the prompt.`;

function relevant(questions: PromptQuestionContext[]) {
  return questions.filter((q) => !q.notRelevant);
}

export function buildScoringText(basePrompt: string, questions: PromptQuestionContext[]): string {
  const notes = relevant(questions)
    .filter((q) => q.answer.trim())
    .map((q) => `${q.text}\n${q.answer.trim()}`)
    .join("\n\n");
  return notes ? `${basePrompt.trim()}\n\nNotes:\n${notes}` : basePrompt.trim();
}

export function buildEnhanceMessage(basePrompt: string, questions: PromptQuestionContext[]): string {
  const rel = relevant(questions);
  const answered = rel
    .filter((q) => q.answer.trim())
    .map((q) => `Q: ${q.text}\nA: ${q.answer.trim()}`)
    .join("\n\n");
  const gaps = rel
    .filter((q) => q.score < 3)
    .map((q) => `- ${q.text} (${q.guidance})`)
    .join("\n");
  return [
    `<basic_prompt>\n${basePrompt.trim()}\n</basic_prompt>`,
    `<answers>\n${answered || "(none)"}\n</answers>`,
    `<gaps>\n${gaps || "(none)"}\n</gaps>`,
  ].join("\n\n");
}
```

- [ ] **Step 4: Run it and watch it pass.**

- [ ] **Step 5: Write the failing Claude client test**

```ts
// apps/web/src/lib/ai/claude.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: mocks.create };
    beta = { messages: { stream: vi.fn() } };
  },
}));

import { detectTaskKind, scoreQuestions } from "./claude";
import { AiNotConfiguredError } from "./config";

const reply = (json: unknown) => ({ content: [{ type: "text", text: JSON.stringify(json) }], stop_reason: "end_turn" });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ANTHROPIC_API_KEY = "sk-ant-test";
});

describe("claude client", () => {
  it("refuses to call the API without a key", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(scoreQuestions("x", [])).rejects.toBeInstanceOf(AiNotConfiguredError);
  });

  it("scores with Haiku 4.5 using a JSON schema, and sanitizes the result", async () => {
    mocks.create.mockResolvedValue(
      reply({
        scores: [
          { questionId: "q1", score: 7, reason: "ok" },
          { questionId: "zz", score: 2, reason: "x" },
        ],
      }),
    );
    const result = await scoreQuestions("prompt", [{ id: "q1", text: "Why?", guidance: "Reason" }]);
    expect(result).toEqual([{ questionId: "q1", score: 3, reason: "ok" }]);
    const args = mocks.create.mock.calls[0][0];
    expect(args.model).toBe("claude-haiku-4-5");
    expect(args.output_config.format.type).toBe("json_schema");
  });

  it("returns no task when confidence is low or the slug is unknown", async () => {
    const matrices = [{ slug: "image", name: "Image", description: "Images" }];
    mocks.create.mockResolvedValueOnce(reply({ slug: "image", confidence: 0.4 }));
    await expect(detectTaskKind("p", matrices)).resolves.toEqual({ slug: null, confidence: 0.4 });
    mocks.create.mockResolvedValueOnce(reply({ slug: "video", confidence: 0.9 }));
    await expect(detectTaskKind("p", matrices)).resolves.toEqual({ slug: null, confidence: 0.9 });
    mocks.create.mockResolvedValueOnce(reply({ slug: "image", confidence: 0.8 }));
    await expect(detectTaskKind("p", matrices)).resolves.toEqual({ slug: "image", confidence: 0.8 });
  });
});
```

- [ ] **Step 6: Run it and watch it fail** (module not found).

- [ ] **Step 7: Implement the client**

```ts
// apps/web/src/lib/ai/claude.ts
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { BEST_MODEL, FAST_MODEL, AiNotConfiguredError, isAiConfigured } from "./config";
import { sanitizeScores, type ScoreResult } from "@/lib/prompt-bot/scoring";
import { DETECT_SYSTEM, ENHANCE_SYSTEM, SCORE_SYSTEM } from "@/lib/prompt-bot/instructions";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!isAiConfigured()) throw new AiNotConfiguredError();
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

/** One structured-output call: the JSON schema constrains the reply; zod validates it again. */
async function structured<T>(args: {
  model: string;
  system: string;
  user: string;
  schema: Record<string, unknown>;
  parse: z.ZodType<T>;
  maxTokens: number;
}): Promise<T> {
  const response = await getClient().messages.create({
    model: args.model,
    max_tokens: args.maxTokens,
    system: args.system,
    messages: [{ role: "user", content: args.user }],
    output_config: { format: { type: "json_schema", schema: args.schema } },
  });
  const text = response.content.find((block) => block.type === "text");
  if (!text || text.type !== "text") throw new Error("Claude returned no text");
  return args.parse.parse(JSON.parse(text.text));
}

const Detection = z.object({ slug: z.string(), confidence: z.number() });

export async function detectTaskKind(
  basePrompt: string,
  matrices: { slug: string; name: string; description: string | null }[],
): Promise<{ slug: string | null; confidence: number }> {
  if (matrices.length === 0) return { slug: null, confidence: 0 };
  const list = matrices.map((m) => `- ${m.slug}: ${m.name}${m.description ? ` — ${m.description}` : ""}`).join("\n");
  const result = await structured({
    model: FAST_MODEL,
    system: DETECT_SYSTEM,
    user: `Task kinds:\n${list}\n- none: nothing fits\n\nPrompt:\n${basePrompt}`,
    schema: {
      type: "object",
      properties: { slug: { type: "string" }, confidence: { type: "number" } },
      required: ["slug", "confidence"],
      additionalProperties: false,
    },
    parse: Detection,
    maxTokens: 200,
  });
  const known = matrices.some((m) => m.slug === result.slug);
  return { slug: known && result.confidence >= 0.5 ? result.slug : null, confidence: result.confidence };
}

const Scores = z.object({ scores: z.array(z.unknown()) });

export async function scoreQuestions(
  text: string,
  questions: { id: string; text: string; guidance: string }[],
): Promise<ScoreResult[]> {
  if (!isAiConfigured()) throw new AiNotConfiguredError();
  if (questions.length === 0) return [];
  const list = questions.map((q) => `- id: ${q.id}\n  question: ${q.text}\n  guidance: ${q.guidance}`).join("\n");
  const result = await structured({
    model: FAST_MODEL,
    system: SCORE_SYSTEM,
    user: `Questions:\n${list}\n\nWhat the person wrote:\n<text>\n${text}\n</text>`,
    schema: {
      type: "object",
      properties: {
        scores: {
          type: "array",
          items: {
            type: "object",
            properties: { questionId: { type: "string" }, score: { type: "integer" }, reason: { type: "string" } },
            required: ["questionId", "score", "reason"],
            additionalProperties: false,
          },
        },
      },
      required: ["scores"],
      additionalProperties: false,
    },
    parse: Scores,
    maxTokens: 2000,
  });
  return sanitizeScores(result.scores, new Set(questions.map((q) => q.id)));
}

/** Streams the enhanced prompt from Opus 5.5 with server-side refusal fallback enabled. */
export function streamEnhancement(message: string, signal?: AbortSignal) {
  const stream = getClient().beta.messages.stream(
    {
      model: BEST_MODEL,
      max_tokens: 8000,
      system: ENHANCE_SYSTEM,
      messages: [{ role: "user", content: message }],
      output_config: { effort: "medium" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    },
    { signal },
  );
  async function* textStream() {
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") yield event.delta.text;
    }
  }
  return {
    textStream: textStream(),
    finalModel: async () => (await stream.finalMessage()).model,
  };
}
```

- [ ] **Step 8: Run both tests and watch them pass, and typecheck**

`npx vitest run src/lib/prompt-bot/instructions.test.ts src/lib/ai/claude.test.ts` → PASS. Then `npx tsc --noEmit` → no errors. If the SDK's types reject a field, such as `fallbacks` or `output_config`, check `node_modules/@anthropic-ai/sdk/resources/beta/messages/messages.d.ts` for the exact name rather than casting it away. Stage.

---

### Task 6: Session data layer and session routes

**Files:**
- Create: `apps/web/src/lib/prompt-bot/sessions.ts`
- Create: `apps/web/src/lib/prompt-bot/http.ts`
- Create: `apps/web/src/app/api/v1/prompt-bot/sessions/route.ts`
- Create: `apps/web/src/app/api/v1/prompt-bot/sessions/[id]/route.ts`
- Create: `apps/web/src/app/api/v1/prompt-bot/sessions/[id]/answers/[questionId]/route.ts`
- Test: `apps/web/src/lib/prompt-bot/sessions.test.ts`
- Test: `apps/web/src/app/api/v1/prompt-bot/sessions/session-routes.test.ts`

**Interfaces:**
- Consumes: `prisma`, `getCurrentUser`, `successResponse`, `errorResponse`, `validationErrorResponse`; `detectTaskKind`, `scoreQuestions` (Task 5); `consumeAiUsage`, `LimitReachedError` (Task 4); `AiNotConfiguredError`, `isAiConfigured` (Task 1); `buildScoringText` (Task 5); `CORE_MATRIX_ID` (Task 2)
- Produces:
  - `aiErrorResponse(error: unknown): NextResponse`
  - `type SessionView = { id: string; title: string; basePrompt: string; taskMatrixId: string | null; taskDetected: boolean; scoreRevision: number; matrices: MatrixView[]; answers: AnswerView[]; latestEnhancement: { version: number; content: string; createdAt: string } | null }`
  - `type MatrixView = { id: string; slug: string; name: string; kind: "CORE" | "TASK"; questions: { id: string; text: string; guidance: string; order: number }[] }`
  - `type AnswerView = { questionId: string; answer: string; score: number; reason: string | null; notRelevant: boolean }`
  - `matricesForSession(taskMatrixId: string | null): Promise<MatrixView[]>`
  - `ensureAnswerRows(sessionId: string, questionIds: string[]): Promise<void>`
  - `loadSessionView(id: string, userId: string): Promise<SessionView | null>`
  - `runScoring(sessionId: string, userId: string, revision: number): Promise<{ applied: boolean; revision: number; answers: AnswerView[] }>`
  - `titleFrom(basePrompt: string): string`

- [ ] **Step 1: Write the failing data-layer test**

```ts
// apps/web/src/lib/prompt-bot/sessions.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { promptMatrix: { findMany: mocks.findMany } } }));
vi.mock("@/lib/ai/claude", () => ({ scoreQuestions: vi.fn(), detectTaskKind: vi.fn() }));
vi.mock("@/lib/ai/usage", () => ({ consumeAiUsage: vi.fn() }));

import { matricesForSession, titleFrom } from "./sessions";

beforeEach(() => vi.clearAllMocks());

describe("matricesForSession", () => {
  it("returns core first, then the active task matrix, with only active questions", async () => {
    mocks.findMany.mockResolvedValue([
      { id: "pbm_image", slug: "image", name: "Image", kind: "TASK", questions: [{ id: "i1", text: "Why image?", guidance: "g", order: 0 }] },
      { id: "pbm_core", slug: "core", name: "Design Think", kind: "CORE", questions: [{ id: "c1", text: "Why?", guidance: "g", order: 0 }] },
    ]);
    const result = await matricesForSession("pbm_image");
    expect(result.map((m) => m.id)).toEqual(["pbm_core", "pbm_image"]);
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true, OR: [{ kind: "CORE" }, { id: "pbm_image" }] },
        include: { questions: { where: { isActive: true }, orderBy: { order: "asc" } } },
      }),
    );
  });

  it("drops a task matrix that has since been deactivated", async () => {
    mocks.findMany.mockResolvedValue([{ id: "pbm_core", slug: "core", name: "Design Think", kind: "CORE", questions: [] }]);
    expect((await matricesForSession("pbm_gone")).map((m) => m.id)).toEqual(["pbm_core"]);
  });
});

describe("titleFrom", () => {
  it("uses the first line of the prompt, trimmed to 80 characters", () => {
    expect(titleFrom("  Write a board update\nwith details")).toBe("Write a board update");
    expect(titleFrom("x".repeat(100))).toHaveLength(80);
    expect(titleFrom("   ")).toBe("Untitled prompt");
  });
});
```

- [ ] **Step 2: Run it and watch it fail** (module not found).

- [ ] **Step 3: Implement the HTTP mapping and data layer**

```ts
// apps/web/src/lib/prompt-bot/http.ts
import { errorResponse } from "@/lib/api/response";
import { AiNotConfiguredError } from "@/lib/ai/config";
import { LimitReachedError } from "@/lib/ai/usage";

/** Maps AI-layer failures to the spec's status codes. Never echoes prompt text. */
export function aiErrorResponse(error: unknown) {
  if (error instanceof AiNotConfiguredError) {
    return errorResponse("Prompt Bot isn't configured yet.", "AI_NOT_CONFIGURED", 503);
  }
  if (error instanceof LimitReachedError) {
    return errorResponse(
      `You've reached today's limit. It resets at ${error.resetAt.toISOString()}.`,
      "LIMIT_REACHED",
      429,
      { feature: [error.feature], resetAt: [error.resetAt.toISOString()] },
    );
  }
  console.error("[prompt-bot] AI call failed:", error instanceof Error ? error.name : "unknown");
  return errorResponse("The AI couldn't complete that request. Please try again.", "AI_FAILED", 502);
}
```

```ts
// apps/web/src/lib/prompt-bot/sessions.ts
import { prisma } from "@/lib/db/prisma";
import { scoreQuestions } from "@/lib/ai/claude";
import { consumeAiUsage } from "@/lib/ai/usage";
import { buildScoringText } from "./instructions";
import { shouldApplyRevision } from "./scoring";

export type MatrixView = {
  id: string;
  slug: string;
  name: string;
  kind: "CORE" | "TASK";
  questions: { id: string; text: string; guidance: string; order: number }[];
};
export type AnswerView = { questionId: string; answer: string; score: number; reason: string | null; notRelevant: boolean };
export type SessionView = {
  id: string;
  title: string;
  basePrompt: string;
  taskMatrixId: string | null;
  taskDetected: boolean;
  scoreRevision: number;
  matrices: MatrixView[];
  answers: AnswerView[];
  latestEnhancement: { version: number; content: string; createdAt: string } | null;
};

export function titleFrom(basePrompt: string): string {
  const first = basePrompt.trim().split("\n")[0]?.trim() ?? "";
  return first ? first.slice(0, 80) : "Untitled prompt";
}

export async function matricesForSession(taskMatrixId: string | null): Promise<MatrixView[]> {
  const rows = await prisma.promptMatrix.findMany({
    where: { isActive: true, OR: [{ kind: "CORE" }, ...(taskMatrixId ? [{ id: taskMatrixId }] : [])] },
    include: { questions: { where: { isActive: true }, orderBy: { order: "asc" } } },
  });
  return rows
    .filter((m) => m.kind === "CORE" || m.id === taskMatrixId)
    .sort((a, b) => (a.kind === "CORE" ? -1 : 0) - (b.kind === "CORE" ? -1 : 0))
    .map((m) => ({
      id: m.id,
      slug: m.slug,
      name: m.name,
      kind: m.kind as "CORE" | "TASK",
      questions: m.questions.map((q) => ({ id: q.id, text: q.text, guidance: q.guidance, order: q.order })),
    }));
}

export async function ensureAnswerRows(sessionId: string, questionIds: string[]) {
  if (questionIds.length === 0) return;
  await prisma.promptBotAnswer.createMany({
    data: questionIds.map((questionId) => ({ sessionId, questionId })),
    skipDuplicates: true,
  });
}

function toAnswerView(a: { questionId: string; answer: string; score: number; reason: string | null; notRelevant: boolean }): AnswerView {
  return { questionId: a.questionId, answer: a.answer, score: a.score, reason: a.reason, notRelevant: a.notRelevant };
}

export async function loadSessionView(id: string, userId: string): Promise<SessionView | null> {
  const session = await prisma.promptBotSession.findFirst({
    where: { id, userId },
    include: { answers: true, enhancements: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!session) return null;
  const matrices = await matricesForSession(session.taskMatrixId);
  const activeIds = new Set(matrices.flatMap((m) => m.questions.map((q) => q.id)));
  const latest = session.enhancements[0];
  return {
    id: session.id,
    title: session.title,
    basePrompt: session.basePrompt,
    taskMatrixId: session.taskMatrixId,
    taskDetected: session.taskDetected,
    scoreRevision: session.scoreRevision,
    matrices,
    answers: session.answers.filter((a) => activeIds.has(a.questionId)).map(toAnswerView),
    latestEnhancement: latest ? { version: latest.version, content: latest.content, createdAt: latest.createdAt.toISOString() } : null,
  };
}

/** Scores every active question; applies results only if `revision` is not stale. */
export async function runScoring(sessionId: string, userId: string, revision: number) {
  const view = await loadSessionView(sessionId, userId);
  if (!view) throw new Error("session not found");
  const questions = view.matrices.flatMap((m) => m.questions);
  await ensureAnswerRows(sessionId, questions.map((q) => q.id));
  const byId = new Map(view.answers.map((a) => [a.questionId, a]));
  const context = questions.map((q) => {
    const a = byId.get(q.id);
    return { id: q.id, text: q.text, guidance: q.guidance, answer: a?.answer ?? "", score: a?.score ?? 0, notRelevant: a?.notRelevant ?? false };
  });
  const relevantQuestions = context.filter((q) => !q.notRelevant);

  await consumeAiUsage(userId, "score");
  const results = await scoreQuestions(buildScoringText(view.basePrompt, context), relevantQuestions);

  const current = await prisma.promptBotSession.findFirst({ where: { id: sessionId, userId }, select: { scoreRevision: true } });
  if (!current || !shouldApplyRevision(revision, current.scoreRevision)) {
    return { applied: false, revision: current?.scoreRevision ?? revision, answers: view.answers };
  }
  const scoredAt = new Date();
  await prisma.$transaction([
    ...results.map((r) =>
      prisma.promptBotAnswer.update({
        where: { sessionId_questionId: { sessionId, questionId: r.questionId } },
        data: { score: r.score, reason: r.reason, scoredAt },
      }),
    ),
    prisma.promptBotSession.update({ where: { id: sessionId }, data: { scoreRevision: revision } }),
  ]);
  const fresh = await loadSessionView(sessionId, userId);
  return { applied: true, revision, answers: fresh?.answers ?? [] };
}
```

- [ ] **Step 4: Run it and watch it pass.**

- [ ] **Step 5: Write the failing route test**

```ts
// apps/web/src/app/api/v1/prompt-bot/sessions/session-routes.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  isAiConfigured: vi.fn(),
  detectTaskKind: vi.fn(),
  sessionFindMany: vi.fn(),
  sessionCreate: vi.fn(),
  sessionFindFirst: vi.fn(),
  sessionUpdate: vi.fn(),
  sessionDelete: vi.fn(),
  matrixFindMany: vi.fn(),
  answerUpsert: vi.fn(),
  loadSessionView: vi.fn(),
  ensureAnswerRows: vi.fn(),
  runScoring: vi.fn(),
  matricesForSession: vi.fn(),
  consumeAiUsage: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/ai/config", async (orig) => ({ ...(await orig()), isAiConfigured: mocks.isAiConfigured }));
vi.mock("@/lib/ai/claude", () => ({ detectTaskKind: mocks.detectTaskKind }));
vi.mock("@/lib/ai/usage", async (orig) => ({ ...(await orig()), consumeAiUsage: mocks.consumeAiUsage }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    promptBotSession: {
      findMany: mocks.sessionFindMany,
      create: mocks.sessionCreate,
      findFirst: mocks.sessionFindFirst,
      update: mocks.sessionUpdate,
      delete: mocks.sessionDelete,
    },
    promptMatrix: { findMany: mocks.matrixFindMany },
    promptBotAnswer: { upsert: mocks.answerUpsert },
  },
}));
vi.mock("@/lib/prompt-bot/sessions", async (orig) => ({
  ...(await orig()),
  loadSessionView: mocks.loadSessionView,
  ensureAnswerRows: mocks.ensureAnswerRows,
  runScoring: mocks.runScoring,
  matricesForSession: mocks.matricesForSession,
}));

import * as collection from "./route";
import * as item from "./[id]/route";
import * as answer from "./[id]/answers/[questionId]/route";

const json = (url: string, method: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
const ctx = <T,>(params: T) => ({ params: Promise.resolve(params) });

const VIEW = { id: "s1", title: "Write", basePrompt: "Write", taskMatrixId: null, taskDetected: true, scoreRevision: 0, matrices: [], answers: [], latestEnhancement: null };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "u1", role: "MENTEE" });
  mocks.isAiConfigured.mockReturnValue(true);
  mocks.matrixFindMany.mockResolvedValue([{ id: "pbm_image", slug: "image", name: "Image", description: "Images" }]);
  mocks.detectTaskKind.mockResolvedValue({ slug: "image", confidence: 0.9 });
  mocks.sessionCreate.mockResolvedValue({ id: "s1" });
  mocks.loadSessionView.mockResolvedValue(VIEW);
  mocks.matricesForSession.mockResolvedValue([{ id: "pbm_core", questions: [{ id: "c1" }] }]);
  mocks.runScoring.mockResolvedValue({ applied: true, revision: 0, answers: [] });
});

describe("prompt bot session routes", () => {
  it("requires sign-in", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    expect((await collection.GET()).status).toBe(401);
  });

  it("returns 503 when AI is not configured instead of creating a session", async () => {
    mocks.isAiConfigured.mockReturnValue(false);
    const res = await collection.POST(json("/api/v1/prompt-bot/sessions", "POST", { basePrompt: "Make an image" }));
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("AI_NOT_CONFIGURED");
    expect(mocks.sessionCreate).not.toHaveBeenCalled();
  });

  it("rejects an empty prompt", async () => {
    const res = await collection.POST(json("/api/v1/prompt-bot/sessions", "POST", { basePrompt: "   " }));
    expect(res.status).toBe(400);
  });

  it("creates a session for any role, attaching the detected task matrix and scoring it", async () => {
    const res = await collection.POST(json("/api/v1/prompt-bot/sessions", "POST", { basePrompt: "Make a hero image" }));
    expect(res.status).toBe(201);
    expect(mocks.sessionCreate).toHaveBeenCalledWith({
      data: { userId: "u1", basePrompt: "Make a hero image", title: "Make a hero image", taskMatrixId: "pbm_image", taskDetected: true },
    });
    expect(mocks.runScoring).toHaveBeenCalledWith("s1", "u1", 0);
  });

  it("still creates the session when initial scoring hits the daily limit", async () => {
    const { LimitReachedError } = await import("@/lib/ai/usage");
    mocks.runScoring.mockRejectedValue(new LimitReachedError("score", new Date()));
    const res = await collection.POST(json("/api/v1/prompt-bot/sessions", "POST", { basePrompt: "Make a hero image" }));
    expect(res.status).toBe(201);
  });

  it("hides other users' sessions as 404", async () => {
    mocks.loadSessionView.mockResolvedValue(null);
    const res = await item.GET(json("/api/v1/prompt-bot/sessions/s9", "GET"), ctx({ id: "s9" }));
    expect(res.status).toBe(404);
  });

  it("switching the task matrix marks it manual and creates answer rows", async () => {
    mocks.sessionFindFirst.mockResolvedValue({ id: "s1", userId: "u1" });
    const res = await item.PATCH(json("/api/v1/prompt-bot/sessions/s1", "PATCH", { taskMatrixId: "pbm_code" }), ctx({ id: "s1" }));
    expect(res.status).toBe(200);
    expect(mocks.sessionUpdate).toHaveBeenCalledWith({ where: { id: "s1" }, data: { taskMatrixId: "pbm_code", taskDetected: false } });
    expect(mocks.ensureAnswerRows).toHaveBeenCalledWith("s1", ["c1"]);
  });

  it("saves an answer note and the not-relevant flag for the owner only", async () => {
    mocks.sessionFindFirst.mockResolvedValue(null);
    const denied = await answer.PUT(json("/x", "PUT", { answer: "CEOs" }), ctx({ id: "s9", questionId: "c1" }));
    expect(denied.status).toBe(404);

    mocks.sessionFindFirst.mockResolvedValue({ id: "s1", userId: "u1" });
    const ok = await answer.PUT(json("/x", "PUT", { answer: "CEOs", notRelevant: false }), ctx({ id: "s1", questionId: "c1" }));
    expect(ok.status).toBe(200);
    expect(mocks.answerUpsert).toHaveBeenCalledWith({
      where: { sessionId_questionId: { sessionId: "s1", questionId: "c1" } },
      create: { sessionId: "s1", questionId: "c1", answer: "CEOs", notRelevant: false },
      update: { answer: "CEOs", notRelevant: false },
    });
  });
});
```

- [ ] **Step 6: Run it and watch it fail** (route modules not found).

- [ ] **Step 7: Implement the routes**

```ts
// apps/web/src/app/api/v1/prompt-bot/sessions/route.ts
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse, successResponse, validationErrorResponse } from "@/lib/api/response";
import { isAiConfigured, AiNotConfiguredError } from "@/lib/ai/config";
import { detectTaskKind } from "@/lib/ai/claude";
import { LimitReachedError } from "@/lib/ai/usage";
import { aiErrorResponse } from "@/lib/prompt-bot/http";
import { loadSessionView, runScoring, titleFrom } from "@/lib/prompt-bot/sessions";
import { readiness } from "@/lib/prompt-bot/scoring";

const CreateBody = z.object({ basePrompt: z.string().trim().min(1).max(20000) });

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  const sessions = await prisma.promptBotSession.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: { id: true, title: true, updatedAt: true, answers: { select: { score: true, notRelevant: true } } },
  });
  return successResponse(
    sessions.map((s) => ({ id: s.id, title: s.title, updatedAt: s.updatedAt.toISOString(), readiness: readiness(s.answers).ratio })),
  );
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  if (!isAiConfigured()) return aiErrorResponse(new AiNotConfiguredError());
  const parsed = CreateBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return validationErrorResponse(parsed.error);

  const taskMatrices = await prisma.promptMatrix.findMany({
    where: { kind: "TASK", isActive: true },
    select: { id: true, slug: true, name: true, description: true },
  });
  let taskMatrixId: string | null = null;
  try {
    const detection = await detectTaskKind(parsed.data.basePrompt, taskMatrices);
    taskMatrixId = taskMatrices.find((m) => m.slug === detection.slug)?.id ?? null;
  } catch (error) {
    if (error instanceof AiNotConfiguredError) return aiErrorResponse(error);
    // Detection is a convenience: fall back to core-only rather than failing creation.
  }

  const session = await prisma.promptBotSession.create({
    data: {
      userId: user.id,
      basePrompt: parsed.data.basePrompt,
      title: titleFrom(parsed.data.basePrompt),
      taskMatrixId,
      taskDetected: true,
    },
  });
  try {
    await runScoring(session.id, user.id, 0);
  } catch (error) {
    if (!(error instanceof LimitReachedError)) console.error("[prompt-bot] initial scoring failed");
  }
  return successResponse(await loadSessionView(session.id, user.id), undefined, 201);
}
```

```ts
// apps/web/src/app/api/v1/prompt-bot/sessions/[id]/route.ts
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse, successResponse, validationErrorResponse } from "@/lib/api/response";
import { ensureAnswerRows, loadSessionView, matricesForSession } from "@/lib/prompt-bot/sessions";

type Ctx = { params: Promise<{ id: string }> };

const PatchBody = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    basePrompt: z.string().trim().min(1).max(20000).optional(),
    taskMatrixId: z.string().min(1).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

export async function GET(_req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  const { id } = await params;
  const view = await loadSessionView(id, user.id);
  return view ? successResponse(view) : errorResponse("Session not found", "NOT_FOUND", 404);
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  const { id } = await params;
  const parsed = PatchBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return validationErrorResponse(parsed.error);
  const owned = await prisma.promptBotSession.findFirst({ where: { id, userId: user.id } });
  if (!owned) return errorResponse("Session not found", "NOT_FOUND", 404);

  const data: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) data.title = parsed.data.title;
  if (parsed.data.basePrompt !== undefined) data.basePrompt = parsed.data.basePrompt;
  if (parsed.data.taskMatrixId !== undefined) {
    data.taskMatrixId = parsed.data.taskMatrixId;
    data.taskDetected = false;
  }
  await prisma.promptBotSession.update({ where: { id }, data });
  if (parsed.data.taskMatrixId !== undefined) {
    const matrices = await matricesForSession(parsed.data.taskMatrixId);
    await ensureAnswerRows(id, matrices.flatMap((m) => m.questions.map((q) => q.id)));
  }
  return successResponse(await loadSessionView(id, user.id));
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  const { id } = await params;
  const owned = await prisma.promptBotSession.findFirst({ where: { id, userId: user.id } });
  if (!owned) return errorResponse("Session not found", "NOT_FOUND", 404);
  await prisma.promptBotSession.delete({ where: { id } });
  return successResponse({ deleted: true });
}
```

```ts
// apps/web/src/app/api/v1/prompt-bot/sessions/[id]/answers/[questionId]/route.ts
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse, successResponse, validationErrorResponse } from "@/lib/api/response";

type Ctx = { params: Promise<{ id: string; questionId: string }> };
const Body = z
  .object({ answer: z.string().max(4000).optional(), notRelevant: z.boolean().optional() })
  .refine((v) => v.answer !== undefined || v.notRelevant !== undefined, "Nothing to update");

export async function PUT(req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  const { id, questionId } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return validationErrorResponse(parsed.error);
  const owned = await prisma.promptBotSession.findFirst({ where: { id, userId: user.id } });
  if (!owned) return errorResponse("Session not found", "NOT_FOUND", 404);

  const fields = {
    ...(parsed.data.answer !== undefined ? { answer: parsed.data.answer } : {}),
    ...(parsed.data.notRelevant !== undefined ? { notRelevant: parsed.data.notRelevant } : {}),
  };
  await prisma.promptBotAnswer.upsert({
    where: { sessionId_questionId: { sessionId: id, questionId } },
    create: { sessionId: id, questionId, ...fields },
    update: fields,
  });
  return successResponse({ saved: true });
}
```

- [ ] **Step 8: Run both tests and watch them pass, then typecheck and stage.**

---

### Task 7: Score, Enhance (SSE) and version routes

**Files:**
- Create: `apps/web/src/app/api/v1/prompt-bot/sessions/[id]/score/route.ts`
- Create: `apps/web/src/app/api/v1/prompt-bot/sessions/[id]/enhance/route.ts`
- Create: `apps/web/src/app/api/v1/prompt-bot/sessions/[id]/enhancements/route.ts`
- Test: `apps/web/src/app/api/v1/prompt-bot/sessions/score-enhance-routes.test.ts`

**Interfaces:**
- Consumes: `runScoring`, `loadSessionView` (Task 6); `aiErrorResponse` (Task 6); `streamEnhancement`, `buildEnhanceMessage`, `INSTRUCTIONS_VERSION` (Task 5); `consumeAiUsage` (Task 4); `unansweredQuestionIds` (Task 3)
- Produces: the SSE events `{"type":"delta","text":string}`, `{"type":"done","version":number}` and `{"type":"error","message":string}`, each sent as `data: <json>\n\n`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/app/api/v1/prompt-bot/sessions/score-enhance-routes.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  runScoring: vi.fn(),
  loadSessionView: vi.fn(),
  consumeAiUsage: vi.fn(),
  streamEnhancement: vi.fn(),
  enhancementFindFirst: vi.fn(),
  enhancementCreate: vi.fn(),
  enhancementFindMany: vi.fn(),
  isAiConfigured: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/ai/config", async (orig) => ({ ...(await orig()), isAiConfigured: mocks.isAiConfigured }));
vi.mock("@/lib/ai/usage", async (orig) => ({ ...(await orig()), consumeAiUsage: mocks.consumeAiUsage }));
vi.mock("@/lib/ai/claude", () => ({ streamEnhancement: mocks.streamEnhancement }));
vi.mock("@/lib/prompt-bot/sessions", () => ({ runScoring: mocks.runScoring, loadSessionView: mocks.loadSessionView }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    promptBotEnhancement: { findFirst: mocks.enhancementFindFirst, create: mocks.enhancementCreate, findMany: mocks.enhancementFindMany },
  },
}));

import * as score from "./[id]/score/route";
import * as enhance from "./[id]/enhance/route";

const req = (body?: unknown) =>
  new NextRequest("http://localhost/x", { method: "POST", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
const ctx = { params: Promise.resolve({ id: "s1" }) };
const VIEW = {
  id: "s1",
  basePrompt: "Write",
  matrices: [{ id: "core", questions: [{ id: "q1", text: "Why?", guidance: "g", order: 0 }, { id: "q2", text: "Who?", guidance: "g", order: 1 }] }],
  answers: [
    { questionId: "q1", answer: "Because", score: 3, reason: null, notRelevant: false },
    { questionId: "q2", answer: "", score: 1, reason: null, notRelevant: false },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "u1", role: "MENTOR" });
  mocks.isAiConfigured.mockReturnValue(true);
  mocks.loadSessionView.mockResolvedValue(VIEW);
  mocks.enhancementFindFirst.mockResolvedValue({ version: 1 });
});

describe("score route", () => {
  it("passes the client revision through and reports whether it was applied", async () => {
    mocks.runScoring.mockResolvedValue({ applied: false, revision: 7, answers: [] });
    const res = await score.POST(req({ revision: 5 }), ctx);
    expect(res.status).toBe(200);
    expect(mocks.runScoring).toHaveBeenCalledWith("s1", "u1", 5);
    expect((await res.json()).data).toEqual({ applied: false, revision: 7, answers: [] });
  });

  it("maps the daily limit to 429 LIMIT_REACHED", async () => {
    const { LimitReachedError } = await import("@/lib/ai/usage");
    mocks.runScoring.mockRejectedValue(new LimitReachedError("score", new Date("2026-11-25T00:00:00Z")));
    const res = await score.POST(req({ revision: 1 }), ctx);
    expect(res.status).toBe(429);
    expect((await res.json()).error.code).toBe("LIMIT_REACHED");
  });

  it("rejects a missing revision", async () => {
    expect((await score.POST(req({}), ctx)).status).toBe(400);
  });
});

describe("enhance route", () => {
  it("streams deltas, saves the next version with its gaps, and ends with done", async () => {
    mocks.streamEnhancement.mockReturnValue({
      textStream: (async function* () {
        yield "## Persona\n";
        yield "You are…";
      })(),
      finalModel: async () => "claude-opus-5-5",
    });
    const res = await enhance.POST(req(), ctx);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const body = await res.text();
    expect(body).toContain('data: {"type":"delta","text":"## Persona\\n"}');
    expect(body).toContain('data: {"type":"done","version":2}');
    expect(mocks.enhancementCreate).toHaveBeenCalledWith({
      data: {
        sessionId: "s1",
        version: 2,
        content: "## Persona\nYou are…",
        unansweredQuestionIds: ["q2"],
        model: "claude-opus-5-5",
        instructionsVersion: "prompt-bot-v1",
      },
    });
  });

  it("sends an error event and saves nothing when the model fails mid-stream", async () => {
    mocks.streamEnhancement.mockReturnValue({
      textStream: (async function* () {
        yield "partial";
        throw new Error("boom");
      })(),
      finalModel: async () => "x",
    });
    const body = await (await enhance.POST(req(), ctx)).text();
    expect(body).toContain('"type":"error"');
    expect(mocks.enhancementCreate).not.toHaveBeenCalled();
  });

  it("returns 404 for someone else's session before spending usage", async () => {
    mocks.loadSessionView.mockResolvedValue(null);
    expect((await enhance.POST(req(), ctx)).status).toBe(404);
    expect(mocks.consumeAiUsage).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it and watch it fail** (route modules not found).

- [ ] **Step 3: Implement**

```ts
// apps/web/src/app/api/v1/prompt-bot/sessions/[id]/score/route.ts
import { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse, successResponse, validationErrorResponse } from "@/lib/api/response";
import { aiErrorResponse } from "@/lib/prompt-bot/http";
import { loadSessionView, runScoring } from "@/lib/prompt-bot/sessions";

const Body = z.object({ revision: z.number().int().min(0) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return validationErrorResponse(parsed.error);
  if (!(await loadSessionView(id, user.id))) return errorResponse("Session not found", "NOT_FOUND", 404);
  try {
    return successResponse(await runScoring(id, user.id, parsed.data.revision));
  } catch (error) {
    return aiErrorResponse(error);
  }
}
```

```ts
// apps/web/src/app/api/v1/prompt-bot/sessions/[id]/enhance/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse } from "@/lib/api/response";
import { AiNotConfiguredError, isAiConfigured } from "@/lib/ai/config";
import { streamEnhancement } from "@/lib/ai/claude";
import { consumeAiUsage } from "@/lib/ai/usage";
import { aiErrorResponse } from "@/lib/prompt-bot/http";
import { buildEnhanceMessage, INSTRUCTIONS_VERSION, type PromptQuestionContext } from "@/lib/prompt-bot/instructions";
import { unansweredQuestionIds } from "@/lib/prompt-bot/scoring";
import { loadSessionView } from "@/lib/prompt-bot/sessions";

export const maxDuration = 300;

const sse = (event: unknown) => `data: ${JSON.stringify(event)}\n\n`;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  const { id } = await params;
  const view = await loadSessionView(id, user.id);
  if (!view) return errorResponse("Session not found", "NOT_FOUND", 404);
  if (!isAiConfigured()) return aiErrorResponse(new AiNotConfiguredError());
  try {
    await consumeAiUsage(user.id, "enhance");
  } catch (error) {
    return aiErrorResponse(error);
  }

  const byId = new Map(view.answers.map((a) => [a.questionId, a]));
  const questions: PromptQuestionContext[] = view.matrices.flatMap((m) =>
    m.questions.map((q) => {
      const a = byId.get(q.id);
      return { id: q.id, text: q.text, guidance: q.guidance, answer: a?.answer ?? "", score: a?.score ?? 0, notRelevant: a?.notRelevant ?? false };
    }),
  );
  const gaps = unansweredQuestionIds(questions.map((q) => ({ questionId: q.id, score: q.score, notRelevant: q.notRelevant })));
  const encoder = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: unknown) => controller.enqueue(encoder.encode(sse(event)));
      let content = "";
      try {
        const { textStream, finalModel } = streamEnhancement(buildEnhanceMessage(view.basePrompt, questions), req.signal);
        for await (const text of textStream) {
          content += text;
          send({ type: "delta", text });
        }
        const latest = await prisma.promptBotEnhancement.findFirst({ where: { sessionId: id }, orderBy: { version: "desc" } });
        const version = (latest?.version ?? 0) + 1;
        await prisma.promptBotEnhancement.create({
          data: {
            sessionId: id,
            version,
            content: content.trim(),
            unansweredQuestionIds: gaps,
            model: await finalModel(),
            instructionsVersion: INSTRUCTIONS_VERSION,
          },
        });
        send({ type: "done", version });
      } catch {
        send({ type: "error", message: "The AI couldn't finish your enhanced prompt. Please try again." });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(body, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform" } });
}
```

```ts
// apps/web/src/app/api/v1/prompt-bot/sessions/[id]/enhancements/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse, successResponse } from "@/lib/api/response";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  const { id } = await params;
  const rows = await prisma.promptBotEnhancement.findMany({
    where: { sessionId: id, session: { userId: user.id } },
    orderBy: { version: "desc" },
    select: { version: true, content: true, unansweredQuestionIds: true, createdAt: true },
  });
  return successResponse(rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })));
}
```

- [ ] **Step 4: Run it and watch it pass, then typecheck and stage.**

---

### Task 8: Matrix editing and settings routes

**Files:**
- Create: `apps/web/src/lib/prompt-bot/matrix-input.ts`
- Create: `apps/web/src/app/api/v1/prompt-bot/matrices/route.ts`
- Create: `apps/web/src/app/api/v1/prompt-bot/matrices/[id]/route.ts`
- Create: `apps/web/src/app/api/v1/prompt-bot/settings/route.ts`
- Test: `apps/web/src/app/api/v1/prompt-bot/matrices/matrix-routes.test.ts`

**Interfaces:**
- Consumes: `CORE_MATRIX_ID` (Task 2); `normalizeLimits`, `getLimits` (Task 4)
- Produces:
  - `GET /matrices` → `{ id, slug, name, description, kind, isBuiltIn, isActive, questions: { id, order, text, guidance, element, isActive }[] }[]`. Inactive matrices are included only for ADMIN and MENTOR.
  - `POST /matrices` → creates a TASK matrix.
  - `PATCH /matrices/:id` → updates `{ name?, description?, isActive?, questions? }`. When `questions` is present, it is the full list: rows with an `id` are updated, rows without one are created, and existing rows missing from the list are deactivated.
  - `DELETE /matrices/:id` → returns 400 for built-ins.
  - `GET /settings` and `PATCH /settings` → `Record<AiFeature, number>` (ADMIN only).

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/app/api/v1/prompt-bot/matrices/matrix-routes.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  findMany: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  deleteMatrix: vi.fn(),
  questionUpdate: vi.fn(),
  questionCreate: vi.fn(),
  questionUpdateMany: vi.fn(),
  transaction: vi.fn(),
  settingsUpsert: vi.fn(),
  settingsFind: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    promptMatrix: { findMany: mocks.findMany, findUnique: mocks.findUnique, create: mocks.create, update: mocks.update, delete: mocks.deleteMatrix },
    promptMatrixQuestion: { update: mocks.questionUpdate, create: mocks.questionCreate, updateMany: mocks.questionUpdateMany },
    aiSettings: { upsert: mocks.settingsUpsert, findUnique: mocks.settingsFind },
    $transaction: mocks.transaction,
  },
}));

import * as collection from "./route";
import * as item from "./[id]/route";
import * as settings from "../settings/route";

const json = (method: string, body?: unknown) =>
  new NextRequest("http://localhost/x", { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findMany.mockResolvedValue([]);
  mocks.transaction.mockImplementation(async (ops: unknown[]) => ops);
  mocks.create.mockResolvedValue({ id: "m1" });
});

describe("matrix routes", () => {
  it("lets participants read but not edit", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "p1", role: "MENTEE" });
    expect((await collection.GET()).status).toBe(200);
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true, kind: { not: "SKILL" } } }));
    expect((await collection.POST(json("POST", { name: "Sales", questions: [] }))).status).toBe(403);
  });

  it("lets coaches create a task matrix with questions", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "c1", role: "MENTOR" });
    const res = await collection.POST(
      json("POST", { name: "Sales email", description: "Outbound sales", questions: [{ text: "Who is the buyer?", guidance: "Role, company size and pain." }] }),
    );
    expect(res.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Sales email",
          slug: "sales-email",
          kind: "TASK",
          isBuiltIn: false,
          createdById: "c1",
          questions: { create: [{ order: 0, text: "Who is the buyer?", guidance: "Role, company size and pain.", element: null }] },
        }),
      }),
    );
  });

  it("never deactivates the core matrix or deletes a built-in", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "a1", role: "ADMIN" });
    mocks.findUnique.mockResolvedValue({ id: "pbm_core", slug: "core", isBuiltIn: true, kind: "CORE", questions: [] });
    expect((await item.PATCH(json("PATCH", { isActive: false }), ctx("pbm_core"))).status).toBe(400);
    expect((await item.DELETE(json("DELETE"), ctx("pbm_core"))).status).toBe(400);
  });

  it("deactivates questions removed from the edited list instead of deleting them", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "a1", role: "ADMIN" });
    mocks.findUnique.mockResolvedValue({ id: "pbm_image", slug: "image", isBuiltIn: true, kind: "TASK", questions: [{ id: "q1" }, { id: "q2" }] });
    await item.PATCH(json("PATCH", { questions: [{ id: "q1", text: "Why?", guidance: "Purpose of the image." }] }), ctx("pbm_image"));
    expect(mocks.questionUpdateMany).toHaveBeenCalledWith({ where: { matrixId: "pbm_image", id: { in: ["q2"] } }, data: { isActive: false } });
  });

  it("lets only admins change limits, storing normalised values", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "c1", role: "MENTOR" });
    expect((await settings.PATCH(json("PATCH", { enhance: 50 }))).status).toBe(403);
    mocks.getCurrentUser.mockResolvedValue({ id: "a1", role: "ADMIN" });
    mocks.settingsFind.mockResolvedValue({ limits: { score: 300 } });
    const res = await settings.PATCH(json("PATCH", { enhance: 50 }));
    expect(res.status).toBe(200);
    expect(mocks.settingsUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { limits: expect.objectContaining({ enhance: 50, score: 300 }) } }),
    );
  });
});
```

- [ ] **Step 2: Run it and watch it fail.**

- [ ] **Step 3: Implement**

```ts
// apps/web/src/app/api/v1/prompt-bot/matrices/route.ts
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse, successResponse, validationErrorResponse } from "@/lib/api/response";

import { canEditMatrices, QuestionInput } from "@/lib/prompt-bot/matrix-input";

const CreateBody = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).optional(),
  questions: z.array(QuestionInput).max(20),
});

const slugify = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "matrix";

const include = { questions: { orderBy: { order: "asc" as const } } };

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  const editor = canEditMatrices(user.role);
  const rows = await prisma.promptMatrix.findMany({
    where: editor ? { kind: { not: "SKILL" } } : { isActive: true, kind: { not: "SKILL" } },
    include,
    orderBy: [{ kind: "asc" }, { name: "asc" }],
  });
  return successResponse(
    rows.map((m) => ({ ...m, questions: editor ? m.questions : m.questions.filter((q) => q.isActive) })),
  );
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  if (!canEditMatrices(user.role)) return errorResponse("Only coaches and admins can edit matrices", "FORBIDDEN", 403);
  const parsed = CreateBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return validationErrorResponse(parsed.error);
  const matrix = await prisma.promptMatrix.create({
    data: {
      name: parsed.data.name,
      slug: slugify(parsed.data.name),
      description: parsed.data.description ?? null,
      kind: "TASK",
      isBuiltIn: false,
      createdById: user.id,
      questions: {
        create: parsed.data.questions.map((q, order) => ({ order, text: q.text, guidance: q.guidance, element: q.element ?? null })),
      },
    },
    include,
  });
  return successResponse(matrix, undefined, 201);
}
```

Slug collisions: the `@unique` constraint makes `create` throw. Catch Prisma error code `P2002` and retry once with `slug-${Date.now().toString(36)}`. Add this test:

```ts
it("suffixes the slug when the name is already taken", async () => {
  mocks.getCurrentUser.mockResolvedValue({ id: "c1", role: "MENTOR" });
  mocks.create.mockRejectedValueOnce(Object.assign(new Error("unique"), { code: "P2002" })).mockResolvedValueOnce({ id: "m2" });
  const res = await collection.POST(json("POST", { name: "Image", questions: [] }));
  expect(res.status).toBe(201);
  expect(mocks.create.mock.calls[1][0].data.slug).toMatch(/^image-[a-z0-9]+$/);
});
```

Implement it by replacing the single `create` call with:

```ts
  const data = (slug: string) => ({
    name: parsed.data.name,
    slug,
    description: parsed.data.description ?? null,
    kind: "TASK" as const,
    isBuiltIn: false,
    createdById: user.id,
    questions: { create: parsed.data.questions.map((q, order) => ({ order, text: q.text, guidance: q.guidance, element: q.element ?? null })) },
  });
  let matrix;
  try {
    matrix = await prisma.promptMatrix.create({ data: data(slugify(parsed.data.name)), include });
  } catch (error) {
    if ((error as { code?: string }).code !== "P2002") throw error;
    matrix = await prisma.promptMatrix.create({ data: data(`${slugify(parsed.data.name)}-${Date.now().toString(36)}`), include });
  }
  return successResponse(matrix, undefined, 201);
```

```ts
// apps/web/src/app/api/v1/prompt-bot/matrices/[id]/route.ts
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse, successResponse, validationErrorResponse } from "@/lib/api/response";
import { CORE_MATRIX_ID } from "@/lib/prompt-bot/builtin-matrices";
import { canEditMatrices, QuestionInput } from "@/lib/prompt-bot/matrix-input";

type Ctx = { params: Promise<{ id: string }> };
const PatchBody = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(300).nullable().optional(),
  isActive: z.boolean().optional(),
  questions: z.array(QuestionInput).max(20).optional(),
});

async function guard(id: string) {
  const user = await getCurrentUser();
  if (!user) return { error: errorResponse("Authentication required", "UNAUTHORIZED", 401) };
  if (!canEditMatrices(user.role)) return { error: errorResponse("Only coaches and admins can edit matrices", "FORBIDDEN", 403) };
  const matrix = await prisma.promptMatrix.findUnique({ where: { id }, include: { questions: { select: { id: true } } } });
  if (!matrix || matrix.kind === "SKILL") return { error: errorResponse("Matrix not found", "NOT_FOUND", 404) };
  return { matrix };
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const { matrix, error } = await guard(id);
  if (error) return error;
  const parsed = PatchBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return validationErrorResponse(parsed.error);
  if (matrix!.id === CORE_MATRIX_ID && parsed.data.isActive === false) {
    return errorResponse("The Design Think core matrix must stay active", "VALIDATION_ERROR", 400);
  }

  const ops = [];
  ops.push(
    prisma.promptMatrix.update({
      where: { id },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
        ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
      },
    }),
  );
  if (parsed.data.questions) {
    const keep = new Set<string>();
    parsed.data.questions.forEach((q, order) => {
      const fields = { order, text: q.text, guidance: q.guidance, element: q.element ?? null, isActive: true };
      if (q.id && matrix!.questions.some((existing) => existing.id === q.id)) {
        keep.add(q.id);
        ops.push(prisma.promptMatrixQuestion.update({ where: { id: q.id }, data: fields }));
      } else {
        ops.push(prisma.promptMatrixQuestion.create({ data: { matrixId: id, ...fields } }));
      }
    });
    const removed = matrix!.questions.map((q) => q.id).filter((qid) => !keep.has(qid));
    if (removed.length) {
      ops.push(prisma.promptMatrixQuestion.updateMany({ where: { matrixId: id, id: { in: removed } }, data: { isActive: false } }));
    }
  }
  await prisma.$transaction(ops);
  return successResponse(await prisma.promptMatrix.findUnique({ where: { id }, include: { questions: { orderBy: { order: "asc" } } } }));
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const { matrix, error } = await guard(id);
  if (error) return error;
  if (matrix!.isBuiltIn) return errorResponse("Built-in matrices can be deactivated but not deleted", "VALIDATION_ERROR", 400);
  await prisma.promptMatrix.delete({ where: { id } });
  return successResponse({ deleted: true });
}
```

Route files export only HTTP handlers, so the shared role check and question schema live in their own module, which both matrix routes and the editor page import:

```ts
// apps/web/src/lib/prompt-bot/matrix-input.ts
import { z } from "zod";

export const canEditMatrices = (role?: string) => role === "ADMIN" || role === "MENTOR";

export const QuestionInput = z.object({
  id: z.string().optional(),
  text: z.string().trim().min(3).max(300),
  guidance: z.string().trim().min(3).max(600),
  element: z.string().trim().max(40).nullable().optional(),
});
```

```ts
// apps/web/src/app/api/v1/prompt-bot/settings/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse, successResponse } from "@/lib/api/response";
import { getLimits, normalizeLimits } from "@/lib/ai/usage";

async function admin() {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  if (user.role !== "ADMIN") return errorResponse("Only admins can change AI limits", "FORBIDDEN", 403);
  return null;
}

export async function GET() {
  const denied = await admin();
  if (denied) return denied;
  return successResponse(await getLimits());
}

export async function PATCH(req: NextRequest) {
  const denied = await admin();
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const current = await prisma.aiSettings.findUnique({ where: { id: "singleton" } });
  const limits = normalizeLimits({ ...normalizeLimits(current?.limits), ...body });
  await prisma.aiSettings.upsert({ where: { id: "singleton" }, create: { id: "singleton", limits }, update: { limits } });
  return successResponse(limits);
}
```

- [ ] **Step 4: Run it and watch it pass, then typecheck and stage.**

---

### Task 9: Route access and navigation

**Files:**
- Modify: `apps/web/src/proxy.ts` (`ROLE_ROUTES`)
- Modify: `apps/web/src/lib/auth/portal-navigation.ts` (`PORTAL_PATHS`)
- Modify: `apps/web/src/app/(app)/layout.tsx` (desktop nav link)
- Modify: `apps/web/src/components/layout/mobile-nav.tsx` (mobile link)
- Test: `apps/web/src/lib/auth/portal-navigation.test.ts` (extend)
- Test: `apps/web/src/components/layout/mobile-nav.test.ts` (extend)

- [ ] **Step 1: Write the failing tests**

Append to `portal-navigation.test.ts`:

```ts
import { safePortalDestination } from "./portal-navigation";

describe("prompt bot access", () => {
  it.each(["participant", "coach", "super-admin", "admin"] as const)("allows %s to return to /prompt-bot", (portal) => {
    expect(safePortalDestination(portal, "/prompt-bot/abc")).toBe("/prompt-bot/abc");
  });
});
```

Read the existing `mobile-nav.test.ts` first and follow its render style. Then add a case asserting that a mentee (`isMentee: true`) sees a "Prompt Bot" link to `/prompt-bot`.

- [ ] **Step 2: Run them and watch them fail.**

- [ ] **Step 3: Implement**

```ts
// apps/web/src/lib/auth/portal-navigation.ts: add "/prompt-bot" to every PORTAL_PATHS entry
const PORTAL_PATHS: Record<AuthPortal, readonly string[]> = {
  participant: ["/dashboard", "/chat", "/mentee", "/profile", "/prompt-bot"],
  coach: ["/dashboard", "/coach", "/mentor", "/questions", "/chat", "/profile", "/prompt-bot"],
  "super-admin": ["/dashboard", "/admin", "/questions", "/chat", "/profile", "/prompt-bot"],
  admin: ["/dashboard", "/admin", "/coach", "/mentor", "/questions", "/chat", "/profile", "/prompt-bot"],
};
```

```ts
// apps/web/src/proxy.ts: ROLE_ROUTES gains
  "/prompt-bot": ["ADMIN", "MENTOR", "MENTEE"] as UserRole[],
```

In `(app)/layout.tsx`, add this as the first link inside `<nav>`. It is visible to every role:

```tsx
<Link href="/prompt-bot" className="rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-white/65 hover:text-primary dark:hover:bg-white/10">
  Prompt Bot
</Link>
```

In `mobile-nav.tsx`, import `Sparkles` from `lucide-react` and prepend to `links`:

```ts
{ href: "/prompt-bot", label: "Prompt Bot", icon: Sparkles },
```

Mentees currently have no other mobile links, so check that the `MobileNav` trigger is no longer hidden for mentees, if it is gated on the link count.

- [ ] **Step 4: Run them and watch them pass. Run the full `npx vitest run` to catch layout and proxy test regressions, then stage.**

---

### Task 10: Status components

> Invoke the `impeccable` skill before this task. Follow the LMS look: `glass` surfaces, `--primary`, `rounded-2xl`.

**Files:**
- Create: `apps/web/src/components/prompt-bot/status-bar.tsx`
- Create: `apps/web/src/components/prompt-bot/question-row.tsx`
- Create: `apps/web/src/components/prompt-bot/readiness-meter.tsx`
- Test: `apps/web/src/components/prompt-bot/status-components.test.ts`

**Interfaces:**
- Produces:
  - `StatusBar({ score: number; label: string })`
  - `ReadinessMeter({ answered: number; relevant: number; ratio: number })`
  - `QuestionRow({ index: number; text: string; score: number; reason: string | null; notRelevant: boolean; active: boolean; onSelect(): void; onToggleRelevant(): void })`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/components/prompt-bot/status-components.test.ts
/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StatusBar } from "./status-bar";
import { QuestionRow } from "./question-row";
import { ReadinessMeter } from "./readiness-meter";

afterEach(cleanup);

describe("StatusBar", () => {
  it.each([0, 1, 2, 3])("fills %i of 3 slices and exposes it as a meter", (score) => {
    render(createElement(StatusBar, { score, label: "Why are we doing this?" }));
    const meter = screen.getByRole("meter", { name: "Why are we doing this?" });
    expect(meter.getAttribute("aria-valuenow")).toBe(String(score));
    expect(meter.getAttribute("aria-valuemax")).toBe("3");
    expect(meter.querySelectorAll("[data-filled='true']")).toHaveLength(score);
  });
});

describe("QuestionRow", () => {
  const base = { index: 1, text: "Who is the target audience?", reason: "Audience named but not specific", active: false, onSelect: vi.fn(), onToggleRelevant: vi.fn() };

  it("auto-ticks only at 3/3", () => {
    const { rerender } = render(createElement(QuestionRow, { ...base, score: 2, notRelevant: false }));
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
    rerender(createElement(QuestionRow, { ...base, score: 3, notRelevant: false }));
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText("3/3")).toBeTruthy();
  });

  it("shows not-relevant questions dimmed with a restore action", () => {
    const onToggleRelevant = vi.fn();
    render(createElement(QuestionRow, { ...base, score: 0, notRelevant: true, onToggleRelevant }));
    fireEvent.click(screen.getByRole("button", { name: /mark relevant again/i }));
    expect(onToggleRelevant).toHaveBeenCalled();
    expect(screen.getByText(/not relevant/i)).toBeTruthy();
  });
});

describe("ReadinessMeter", () => {
  it("reads 'N of M answered'", () => {
    render(createElement(ReadinessMeter, { answered: 3, relevant: 14, ratio: 0.4 }));
    expect(screen.getByText("3 of 14 answered")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it and watch it fail.**

- [ ] **Step 3: Implement** (styling follows the LMS: muted track `bg-muted`, filled slices tinted by score, transitions on `background-color` only).

```tsx
// apps/web/src/components/prompt-bot/status-bar.tsx
import { cn } from "@/lib/utils";

const FILL = ["", "bg-amber-400", "bg-primary", "bg-emerald-500"] as const;

/** Three equal slices; fills to `score` (0–3). Colour: amber 1, blue 2, green 3. */
export function StatusBar({ score, label }: { score: number; label: string }) {
  const value = Math.max(0, Math.min(3, Math.round(score)));
  return (
    <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={3} aria-valuenow={value} className="flex w-24 gap-1">
      {[1, 2, 3].map((slice) => (
        <span
          key={slice}
          data-filled={slice <= value}
          className={cn(
            "h-1.5 flex-1 rounded-full transition-colors duration-300",
            slice <= value ? FILL[value] : "bg-muted dark:bg-white/10",
          )}
        />
      ))}
    </div>
  );
}
```

```tsx
// apps/web/src/components/prompt-bot/question-row.tsx
"use client";
import { CheckCircle2, EyeOff, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBar } from "./status-bar";

type Props = {
  index: number;
  text: string;
  score: number;
  reason: string | null;
  notRelevant: boolean;
  active: boolean;
  onSelect(): void;
  onToggleRelevant(): void;
};

export function QuestionRow({ index, text, score, reason, notRelevant, active, onSelect, onToggleRelevant }: Props) {
  const ticked = !notRelevant && score >= 3;
  return (
    <li
      className={cn(
        "group rounded-2xl border p-3 transition-colors",
        active ? "border-primary/40 bg-primary/5" : "border-transparent hover:bg-white/55 dark:hover:bg-white/5",
        notRelevant && "opacity-55",
      )}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={ticked}
          readOnly
          aria-label={ticked ? `${text}: fully answered` : `${text}: not fully answered yet`}
          className="mt-1 size-4 shrink-0 accent-[var(--primary)]"
        />
        <button type="button" onClick={onSelect} className="min-w-0 flex-1 text-left focus-visible:outline-none">
          <p className="text-sm font-medium leading-snug text-foreground">
            <span className="mr-1 text-muted-foreground">{index}.</span>
            {text}
          </p>
          {notRelevant ? (
            <p className="mt-1 text-xs text-muted-foreground">Not relevant for this prompt</p>
          ) : (
            <div className="mt-2 flex items-center gap-2">
              <StatusBar score={score} label={text} />
              <span className="text-xs tabular-nums text-muted-foreground">{score}/3</span>
              {ticked && <CheckCircle2 className="size-3.5 text-emerald-500" aria-hidden />}
            </div>
          )}
          {!notRelevant && reason && <p className="mt-1 text-xs text-muted-foreground">{reason}</p>}
        </button>
        <button
          type="button"
          onClick={onToggleRelevant}
          aria-label={notRelevant ? `Mark relevant again: ${text}` : `Mark not relevant: ${text}`}
          className="rounded-lg p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
        >
          {notRelevant ? <RotateCcw className="size-4" /> : <EyeOff className="size-4" />}
        </button>
      </div>
    </li>
  );
}
```

```tsx
// apps/web/src/components/prompt-bot/readiness-meter.tsx
export function ReadinessMeter({ answered, relevant, ratio }: { answered: number; relevant: number; ratio: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">Readiness</span>
        <span className="text-muted-foreground">{answered} of {relevant} answered</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted dark:bg-white/10">
        <div
          className="h-full origin-left rounded-full bg-primary transition-transform duration-500"
          style={{ transform: `scaleX(${Math.max(0, Math.min(1, ratio))})` }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run it and watch it pass, then stage.**

---

### Task 11: Prompt Bot pages (start and workspace)

> Invoke the `impeccable` skill before this task.

**Files:**
- Create: `apps/web/src/lib/prompt-bot/client.ts`
- Create: `apps/web/src/components/prompt-bot/not-configured.tsx`
- Create: `apps/web/src/components/prompt-bot/enhance-panel.tsx`
- Create: `apps/web/src/app/(app)/prompt-bot/page.tsx`
- Create: `apps/web/src/app/(app)/prompt-bot/start-form.tsx`
- Create: `apps/web/src/app/(app)/prompt-bot/[sessionId]/page.tsx`
- Create: `apps/web/src/app/(app)/prompt-bot/[sessionId]/workspace.tsx`
- Test: `apps/web/src/lib/prompt-bot/client.test.ts`
- Test: `apps/web/src/app/(app)/prompt-bot/prompt-bot-page.test.ts`

**Interfaces:**
- Consumes: the session API (Tasks 6–7); `StatusBar`, `QuestionRow`, `ReadinessMeter` (Task 10); `readiness`, `isTicked` (Task 3); `isAiConfigured` (Task 1)
- Produces:
  - `readEnhanceStream(res: Response, onDelta: (text: string) => void): Promise<{ version: number } | { error: string }>`
  - `createSession(basePrompt: string)`
  - `saveAnswer(sessionId, questionId, patch)`
  - `patchSession(sessionId, patch)`
  - `scoreSession(sessionId, revision)`

- [ ] **Step 1: Write the failing client test**

```ts
// apps/web/src/lib/prompt-bot/client.test.ts
import { describe, expect, it, vi } from "vitest";
import { readEnhanceStream } from "./client";

function sseResponse(chunks: string[]) {
  const stream = new ReadableStream({
    start(c) {
      for (const chunk of chunks) c.enqueue(new TextEncoder().encode(chunk));
      c.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream" } });
}

describe("readEnhanceStream", () => {
  it("joins deltas split across network chunks and returns the version", async () => {
    const onDelta = vi.fn();
    const result = await readEnhanceStream(
      sseResponse(['data: {"type":"delta","text":"## Per', 'sona"}\n\ndata: {"type":"delta","text":"\\nYou"}\n\n', 'data: {"type":"done","version":3}\n\n']),
      onDelta,
    );
    expect(onDelta.mock.calls.map((c) => c[0]).join("")).toBe("## Persona\nYou");
    expect(result).toEqual({ version: 3 });
  });

  it("surfaces server errors", async () => {
    const result = await readEnhanceStream(sseResponse(['data: {"type":"error","message":"Try again"}\n\n']), vi.fn());
    expect(result).toEqual({ error: "Try again" });
  });

  it("reads JSON error bodies from non-stream failures (429, 503)", async () => {
    const res = new Response(JSON.stringify({ success: false, error: { code: "LIMIT_REACHED", message: "You've reached today's limit." } }), {
      status: 429,
      headers: { "content-type": "application/json" },
    });
    expect(await readEnhanceStream(res, vi.fn())).toEqual({ error: "You've reached today's limit." });
  });
});
```

- [ ] **Step 2: Run it and watch it fail.**

- [ ] **Step 3: Implement the client helpers**

```ts
// apps/web/src/lib/prompt-bot/client.ts
import type { AnswerView, SessionView } from "./sessions";

async function call<T>(url: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; code: string; message: string }> {
  const res = await fetch(url, { credentials: "include", headers: { "content-type": "application/json" }, ...init });
  const body = await res.json().catch(() => null);
  if (res.ok && body?.success) return { ok: true, data: body.data as T };
  return { ok: false, code: body?.error?.code ?? "REQUEST_FAILED", message: body?.error?.message ?? "Something went wrong." };
}

export const createSession = (basePrompt: string) =>
  call<SessionView>("/api/v1/prompt-bot/sessions", { method: "POST", body: JSON.stringify({ basePrompt }) });
export const patchSession = (id: string, patch: { title?: string; basePrompt?: string; taskMatrixId?: string | null }) =>
  call<SessionView>(`/api/v1/prompt-bot/sessions/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
export const saveAnswer = (id: string, questionId: string, patch: { answer?: string; notRelevant?: boolean }) =>
  call<{ saved: true }>(`/api/v1/prompt-bot/sessions/${id}/answers/${questionId}`, { method: "PUT", body: JSON.stringify(patch) });
export const scoreSession = (id: string, revision: number) =>
  call<{ applied: boolean; revision: number; answers: AnswerView[] }>(`/api/v1/prompt-bot/sessions/${id}/score`, {
    method: "POST",
    body: JSON.stringify({ revision }),
  });

export async function readEnhanceStream(
  res: Response,
  onDelta: (text: string) => void,
): Promise<{ version: number } | { error: string }> {
  if (!res.ok || !res.body || !res.headers.get("content-type")?.includes("text/event-stream")) {
    const body = await res.json().catch(() => null);
    return { error: body?.error?.message ?? "Enhance failed. Please try again." };
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += value;
    let end: number;
    while ((end = buffer.indexOf("\n\n")) !== -1) {
      const line = buffer.slice(0, end).trim();
      buffer = buffer.slice(end + 2);
      if (!line.startsWith("data:")) continue;
      const event = JSON.parse(line.slice(5).trim()) as { type: string; text?: string; version?: number; message?: string };
      if (event.type === "delta" && event.text) onDelta(event.text);
      if (event.type === "done") return { version: event.version ?? 0 };
      if (event.type === "error") return { error: event.message ?? "Enhance failed." };
    }
  }
  return { error: "The connection closed before the prompt finished." };
}
```

- [ ] **Step 4: Run it and watch it pass.**

- [ ] **Step 5: Write the failing page test** (the not-configured state, plus the start screen for a participant)

```ts
// apps/web/src/app/(app)/prompt-bot/prompt-bot-page.test.ts
/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), isAiConfigured: vi.fn(), findMany: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/ai/config", () => ({ isAiConfigured: mocks.isAiConfigured }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { promptBotSession: { findMany: mocks.findMany } } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), redirect: vi.fn() }));
afterEach(cleanup);

import PromptBotPage from "./page";

describe("Prompt Bot start page", () => {
  it("shows the not-configured panel, with the variable name only for admins", async () => {
    mocks.isAiConfigured.mockReturnValue(false);
    mocks.getCurrentUser.mockResolvedValue({ id: "a1", role: "ADMIN", name: "Admin" });
    mocks.findMany.mockResolvedValue([]);
    render(await PromptBotPage());
    expect(screen.getByText("Prompt Bot isn't configured yet")).toBeTruthy();
    expect(screen.getByText(/ANTHROPIC_API_KEY/)).toBeTruthy();

    cleanup();
    mocks.getCurrentUser.mockResolvedValue({ id: "p1", role: "MENTEE", name: "Ravi" });
    render(await PromptBotPage());
    expect(screen.queryByText(/ANTHROPIC_API_KEY/)).toBeNull();
  });

  it("shows the start form and recent sessions for a participant", async () => {
    mocks.isAiConfigured.mockReturnValue(true);
    mocks.getCurrentUser.mockResolvedValue({ id: "p1", role: "MENTEE", name: "Ravi" });
    mocks.findMany.mockResolvedValue([{ id: "s1", title: "Board update email", updatedAt: new Date("2026-11-24T10:00:00Z") }]);
    render(await PromptBotPage());
    expect(screen.getByRole("heading", { name: "Prompt Bot" })).toBeTruthy();
    expect(screen.getByLabelText("What do you want AI to do?")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Board update email/ }).getAttribute("href")).toBe("/prompt-bot/s1");
  });
});
```

- [ ] **Step 6: Run it and watch it fail.**

- [ ] **Step 7: Implement the pages and components**

```tsx
// apps/web/src/components/prompt-bot/not-configured.tsx
import { Sparkles } from "lucide-react";

export function NotConfigured({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="glass mx-auto max-w-xl rounded-[1.75rem] p-8 text-center">
      <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Sparkles className="size-5" />
      </span>
      <h2 className="mt-4 text-lg font-semibold">Prompt Bot isn&apos;t configured yet</h2>
      <p className="mt-2 text-sm text-muted-foreground">It will be available as soon as an administrator connects the AI service.</p>
      {isAdmin && (
        <p className="mt-4 rounded-xl bg-muted px-3 py-2 text-left font-mono text-xs dark:bg-white/5">
          Set ANTHROPIC_API_KEY in the web service environment (apps/web/.env locally, App Runner in production).
        </p>
      )}
    </div>
  );
}
```

```tsx
// apps/web/src/app/(app)/prompt-bot/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { Clock3 } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { isAiConfigured } from "@/lib/ai/config";
import { prisma } from "@/lib/db/prisma";
import { NotConfigured } from "@/components/prompt-bot/not-configured";
import { StartForm } from "./start-form";

export default async function PromptBotPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const recent = await prisma.promptBotSession.findMany({
    where: { userId: user!.id },
    orderBy: { updatedAt: "desc" },
    take: 8,
    select: { id: true, title: true, updatedAt: true },
  });
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Prompt Bot</h1>
        <p className="mt-2 text-muted-foreground">
          Using a structured approach, the quality, certainty and consistency of AI is massively increased.
        </p>
      </header>
      {isAiConfigured() ? <StartForm /> : <NotConfigured isAdmin={user!.role === "ADMIN"} />}
      {recent.length > 0 && (
        <section className="glass rounded-[1.75rem] p-5">
          <h2 className="text-sm font-medium text-muted-foreground">Recent prompts</h2>
          <ul className="mt-3 divide-y divide-border/60">
            {recent.map((s) => (
              <li key={s.id}>
                <Link href={`/prompt-bot/${s.id}`} className="flex items-center justify-between gap-3 rounded-xl px-2 py-3 hover:bg-white/55 dark:hover:bg-white/5">
                  <span className="truncate font-medium">{s.title}</span>
                  <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                    <Clock3 className="size-3.5" aria-hidden />
                    {s.updatedAt.toLocaleDateString()}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="text-center text-xs text-muted-foreground">
        Your prompts are stored in the LMS and sent to Anthropic&apos;s API to analyse them.
      </p>
    </div>
  );
}
```

```tsx
// apps/web/src/app/(app)/prompt-bot/start-form.tsx
"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createSession } from "@/lib/prompt-bot/client";

export function StartForm() {
  const router = useRouter();
  const [value, setValue] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!value.trim() || busy) return;
    setBusy(true);
    const result = await createSession(value);
    if (result.ok) router.push(`/prompt-bot/${result.data.id}`);
    else {
      toast.error(result.message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="glass rounded-[1.75rem] p-5">
      <label htmlFor="prompt-bot-start" className="text-sm font-medium">
        What do you want AI to do?
      </label>
      <Textarea
        id="prompt-bot-start"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(e);
        }}
        placeholder="e.g. Write an email to my board about our Q3 results"
        className="mt-2 min-h-32 resize-y bg-white/60 dark:bg-white/5"
      />
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">We&apos;ll check it against the Design Think questions.</span>
        <Button type="submit" disabled={!value.trim() || busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
          Start
        </Button>
      </div>
    </form>
  );
}
```

```tsx
// apps/web/src/app/(app)/prompt-bot/[sessionId]/page.tsx
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAiConfigured } from "@/lib/ai/config";
import { prisma } from "@/lib/db/prisma";
import { loadSessionView } from "@/lib/prompt-bot/sessions";
import { NotConfigured } from "@/components/prompt-bot/not-configured";
import { Workspace } from "./workspace";

export default async function PromptBotSessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { sessionId } = await params;
  const view = await loadSessionView(sessionId, user!.id);
  if (!view) notFound();
  if (!isAiConfigured()) return <NotConfigured isAdmin={user!.role === "ADMIN"} />;
  const taskMatrices = await prisma.promptMatrix.findMany({
    where: { kind: "TASK", isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return <Workspace initial={view} taskMatrices={taskMatrices} />;
}
```

```tsx
// apps/web/src/components/prompt-bot/enhance-panel.tsx
"use client";
import { Check, Copy, Loader2, Wand2 } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";

type Props = {
  content: string;
  streaming: boolean;
  version: number | null;
  error: string | null;
  onEnhance(): void;
  unansweredCount: number;
};

export function EnhancePanel({ content, streaming, version, error, onEnhance, unansweredCount }: Props) {
  const [copied, setCopied] = React.useState(false);
  return (
    <section className="glass rounded-[1.75rem] p-5" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Enhanced prompt{version ? ` · v${version}` : ""}</h2>
          {unansweredCount > 0 && !streaming && (
            <p className="text-xs text-muted-foreground">
              {unansweredCount} question{unansweredCount === 1 ? "" : "s"} not answered yet — the enhanced prompt will be higher-level.
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {content && !streaming && (
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await navigator.clipboard.writeText(content);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          )}
          <Button onClick={onEnhance} disabled={streaming}>
            {streaming ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
            {content ? "Enhance again" : "Enhance"}
          </Button>
        </div>
      </div>
      {error && <p className="mt-3 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      {content && (
        <pre className="mt-4 max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-2xl bg-white/60 p-4 font-sans text-sm leading-relaxed dark:bg-white/5">
          {content}
        </pre>
      )}
    </section>
  );
}
```

```tsx
// apps/web/src/app/(app)/prompt-bot/[sessionId]/workspace.tsx
"use client";
import * as React from "react";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { QuestionRow } from "@/components/prompt-bot/question-row";
import { ReadinessMeter } from "@/components/prompt-bot/readiness-meter";
import { EnhancePanel } from "@/components/prompt-bot/enhance-panel";
import { readiness, unansweredQuestionIds } from "@/lib/prompt-bot/scoring";
import { patchSession, readEnhanceStream, saveAnswer, scoreSession } from "@/lib/prompt-bot/client";
import type { AnswerView, SessionView } from "@/lib/prompt-bot/sessions";

const SCORE_DELAY_MS = 1500;

export function Workspace({ initial, taskMatrices }: { initial: SessionView; taskMatrices: { id: string; name: string }[] }) {
  const [view, setView] = React.useState(initial);
  const [answers, setAnswers] = React.useState<Record<string, AnswerView>>(() =>
    Object.fromEntries(initial.answers.map((a) => [a.questionId, a])),
  );
  const [basePrompt, setBasePrompt] = React.useState(initial.basePrompt);
  const [activeId, setActiveId] = React.useState<string | null>(initial.matrices[0]?.questions[0]?.id ?? null);
  const [scoreState, setScoreState] = React.useState<"idle" | "scoring" | "failed">("idle");
  const [enhanced, setEnhanced] = React.useState(initial.latestEnhancement?.content ?? "");
  const [version, setVersion] = React.useState<number | null>(initial.latestEnhancement?.version ?? null);
  const [streaming, setStreaming] = React.useState(false);
  const [enhanceError, setEnhanceError] = React.useState<string | null>(null);
  const revision = React.useRef(initial.scoreRevision);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const questions = view.matrices.flatMap((m) => m.questions);
  const answerFor = (id: string): AnswerView => answers[id] ?? { questionId: id, answer: "", score: 0, reason: null, notRelevant: false };
  const list = questions.map((q) => answerFor(q.id));
  const ready = readiness(list);
  const gaps = unansweredQuestionIds(list);

  const scheduleScore = React.useCallback(() => {
    revision.current += 1;
    const mine = revision.current;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setScoreState("scoring");
      const result = await scoreSession(view.id, mine);
      if (!result.ok) {
        setScoreState("failed");
        if (result.code === "LIMIT_REACHED") toast.error(result.message);
        return;
      }
      setScoreState("idle");
      if (result.data.applied && mine === revision.current) {
        setAnswers((prev) => {
          const next = { ...prev };
          for (const a of result.data.answers) next[a.questionId] = { ...a, answer: prev[a.questionId]?.answer ?? a.answer };
          return next;
        });
      }
    }, SCORE_DELAY_MS);
  }, [view.id]);

  React.useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function updateAnswer(questionId: string, patch: Partial<Pick<AnswerView, "answer" | "notRelevant">>) {
    setAnswers((prev) => ({ ...prev, [questionId]: { ...answerFor(questionId), ...patch } }));
    const saved = await saveAnswer(view.id, questionId, patch);
    if (!saved.ok) toast.error(saved.message);
    scheduleScore();
  }

  async function updateBasePrompt(value: string) {
    setBasePrompt(value);
    if (!value.trim()) return;
    const saved = await patchSession(view.id, { basePrompt: value });
    if (!saved.ok) toast.error(saved.message);
    scheduleScore();
  }

  async function switchTask(taskMatrixId: string | null) {
    const result = await patchSession(view.id, { taskMatrixId });
    if (!result.ok) return toast.error(result.message);
    setView(result.data);
    setAnswers((prev) => ({ ...Object.fromEntries(result.data.answers.map((a) => [a.questionId, a])), ...prev }));
    scheduleScore();
  }

  async function enhance() {
    if (gaps.length > 0 && !window.confirm(`${gaps.length} questions not answered yet — the enhanced prompt will be higher-level. Continue?`)) return;
    setStreaming(true);
    setEnhanceError(null);
    setEnhanced("");
    const res = await fetch(`/api/v1/prompt-bot/sessions/${view.id}/enhance`, { method: "POST", credentials: "include" });
    const result = await readEnhanceStream(res, (text) => setEnhanced((prev) => prev + text));
    setStreaming(false);
    if ("error" in result) {
      setEnhanceError(result.error);
      setEnhanced(initial.latestEnhancement?.content ?? "");
    } else setVersion(result.version);
  }

  const active = questions.find((q) => q.id === activeId) ?? null;
  const task = view.matrices.find((m) => m.kind === "TASK") ?? null;
  let n = 0;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <aside className="glass h-fit rounded-[1.75rem] p-5 lg:sticky lg:top-24">
        <h1 className="text-lg font-semibold">Design Think</h1>
        <div className="mt-3">
          <ReadinessMeter {...ready} />
        </div>
        <p className="mt-2 h-4 text-xs text-muted-foreground" aria-live="polite">
          {scoreState === "scoring" ? "Updating…" : scoreState === "failed" ? "Couldn't update the bars — keep typing to retry." : ""}
        </p>
        {view.matrices.map((matrix) => (
          <section key={matrix.id} className="mt-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{matrix.kind === "CORE" ? "Core" : matrix.name}</h2>
            </div>
            <ul className="mt-2 flex flex-col gap-1">
              {matrix.questions.map((q) => {
                n += 1;
                const a = answerFor(q.id);
                return (
                  <QuestionRow
                    key={q.id}
                    index={n}
                    text={q.text}
                    score={a.score}
                    reason={a.reason}
                    notRelevant={a.notRelevant}
                    active={q.id === activeId}
                    onSelect={() => setActiveId(q.id)}
                    onToggleRelevant={() => updateAnswer(q.id, { notRelevant: !a.notRelevant })}
                  />
                );
              })}
            </ul>
          </section>
        ))}
        <label className="mt-5 flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Task type</span>
          <span className="relative">
            <select
              value={task?.id ?? ""}
              onChange={(e) => switchTask(e.target.value || null)}
              className="appearance-none rounded-xl border border-border bg-white/60 py-1.5 pl-3 pr-8 text-sm dark:bg-white/5"
            >
              <option value="">Core only</option>
              {taskMatrices.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-2 size-4 text-muted-foreground" aria-hidden />
          </span>
        </label>
      </aside>

      <div className="flex min-w-0 flex-col gap-5">
        <section className="glass rounded-[1.75rem] p-5">
          <label htmlFor="base-prompt" className="text-sm font-medium">Your prompt</label>
          <Textarea id="base-prompt" value={basePrompt} onChange={(e) => updateBasePrompt(e.target.value)} className="mt-2 min-h-28 bg-white/60 dark:bg-white/5" />
          {active && (
            <div className="mt-5">
              <label htmlFor="answer" className="text-sm font-medium">{active.text}</label>
              <Textarea
                id="answer"
                value={answerFor(active.id).answer}
                onChange={(e) => updateAnswer(active.id, { answer: e.target.value })}
                placeholder={active.guidance}
                className="mt-2 min-h-24 bg-white/60 dark:bg-white/5"
              />
            </div>
          )}
        </section>
        <EnhancePanel content={enhanced} streaming={streaming} version={version} error={enhanceError} onEnhance={enhance} unansweredCount={gaps.length} />
      </div>
    </div>
  );
}
```

`saveAnswer` and `patchSession` fire on every keystroke here, but scoring is already debounced. Wrap both calls in a 600 ms per-field debounce before shipping, and add this test to `client.test.ts` for a `debounce` helper in `client.ts`:

```ts
import { debounce } from "./client";
it("debounce runs only the last call after the delay", async () => {
  vi.useFakeTimers();
  const fn = vi.fn();
  const d = debounce(fn, 600);
  d("a");
  d("b");
  vi.advanceTimersByTime(599);
  expect(fn).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(fn).toHaveBeenCalledWith("b");
  vi.useRealTimers();
});
```

```ts
// add to apps/web/src/lib/prompt-bot/client.ts
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | null = null;
  return (...args: A) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
```

In `workspace.tsx`, keep the state update immediate, and route the network save through `React.useMemo(() => debounce(...), [view.id])`, keyed per question id: use a `Map<string, debounced>` in a ref.

- [ ] **Step 8: Run the tests and watch them pass, then typecheck, lint and stage**

```bash
npx vitest run src/lib/prompt-bot src/app/\(app\)/prompt-bot
npx tsc --noEmit && npx eslint src/app/\(app\)/prompt-bot src/components/prompt-bot src/lib/prompt-bot
```

---

### Task 12: Matrix editor page (ADMIN/MENTOR)

> Invoke the `impeccable` skill before this task.

**Files:**
- Create: `apps/web/src/app/(app)/prompt-bot/matrices/page.tsx`
- Create: `apps/web/src/app/(app)/prompt-bot/matrices/matrix-editor.tsx`
- Test: `apps/web/src/app/(app)/prompt-bot/matrices/matrices-page.test.ts`

**Interfaces:**
- Consumes: `GET`/`POST`/`PATCH` `/api/v1/prompt-bot/matrices` (Task 8); `canEditMatrices` (Task 8)

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/app/(app)/prompt-bot/matrices/matrices-page.test.ts
/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), redirect: vi.fn(), findMany: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { promptMatrix: { findMany: mocks.findMany } } }));
afterEach(cleanup);

import MatricesPage from "./page";

describe("Prompt Bot matrices page", () => {
  it("sends participants back to Prompt Bot", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "p1", role: "MENTEE" });
    await MatricesPage();
    expect(mocks.redirect).toHaveBeenCalledWith("/prompt-bot");
  });

  it("lists matrices with a built-in badge for coaches", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "c1", role: "MENTOR" });
    mocks.findMany.mockResolvedValue([
      { id: "pbm_core", slug: "core", name: "Design Think", description: null, kind: "CORE", isBuiltIn: true, isActive: true, questions: [] },
    ]);
    render(await MatricesPage());
    expect(screen.getByRole("heading", { name: "Question matrices" })).toBeTruthy();
    expect(screen.getByText("Design Think")).toBeTruthy();
    expect(screen.getByText("Built-in")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it and watch it fail.**

- [ ] **Step 3: Implement**

```tsx
// apps/web/src/app/(app)/prompt-bot/matrices/page.tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { canEditMatrices } from "@/lib/prompt-bot/matrix-input";
import { MatrixEditor } from "./matrix-editor";

export default async function MatricesPage() {
  const user = await getCurrentUser();
  if (!user) return redirect("/login");
  if (!canEditMatrices(user.role)) return redirect("/prompt-bot");
  const matrices = await prisma.promptMatrix.findMany({
    where: { kind: { not: "SKILL" } },
    include: { questions: { orderBy: { order: "asc" } } },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
  });
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Question matrices</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Design Think is always applied. Task matrices add questions when Prompt Bot detects that kind of task.
        </p>
      </header>
      <MatrixEditor initial={JSON.parse(JSON.stringify(matrices))} />
    </div>
  );
}
```

```tsx
// apps/web/src/app/(app)/prompt-bot/matrices/matrix-editor.tsx
"use client";
import * as React from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

type Question = { id?: string; text: string; guidance: string; element: string | null; isActive?: boolean };
type Matrix = { id: string; slug: string; name: string; description: string | null; kind: "CORE" | "TASK"; isBuiltIn: boolean; isActive: boolean; questions: Question[] };

export function MatrixEditor({ initial }: { initial: Matrix[] }) {
  const [matrices, setMatrices] = React.useState(initial);
  const [selectedId, setSelectedId] = React.useState(initial[0]?.id ?? null);
  const selected = matrices.find((m) => m.id === selectedId) ?? null;
  const [draft, setDraft] = React.useState<Question[]>(() => selected?.questions.filter((q) => q.isActive !== false) ?? []);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setDraft(selected?.questions.filter((q) => q.isActive !== false) ?? []);
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save(patch: Record<string, unknown>) {
    if (!selected) return;
    setSaving(true);
    const res = await fetch(`/api/v1/prompt-bot/matrices/${selected.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    const body = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) return toast.error(body?.error?.message ?? "Couldn't save the matrix.");
    setMatrices((prev) => prev.map((m) => (m.id === selected.id ? body.data : m)));
    toast.success("Matrix saved");
  }

  async function addMatrix() {
    const name = window.prompt("Name of the new task matrix (e.g. Sales email)");
    if (!name?.trim()) return;
    const res = await fetch("/api/v1/prompt-bot/matrices", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, questions: [] }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) return toast.error(body?.error?.message ?? "Couldn't create the matrix.");
    setMatrices((prev) => [...prev, body.data]);
    setSelectedId(body.data.id);
  }

  return (
    <div className="grid gap-5 md:grid-cols-[16rem_minmax(0,1fr)]">
      <nav className="glass h-fit rounded-[1.75rem] p-3">
        <ul className="flex flex-col gap-1">
          {matrices.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => setSelectedId(m.id)}
                className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm ${m.id === selectedId ? "bg-primary/10 text-primary" : "hover:bg-white/55 dark:hover:bg-white/5"}`}
              >
                <span className={m.isActive ? "" : "text-muted-foreground line-through"}>{m.name}</span>
                {m.isBuiltIn && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground dark:bg-white/10">Built-in</span>}
              </button>
            </li>
          ))}
        </ul>
        <Button variant="ghost" className="mt-2 w-full justify-start" onClick={addMatrix}>
          <Plus className="size-4" /> New task matrix
        </Button>
      </nav>

      {selected && (
        <section className="glass rounded-[1.75rem] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">{selected.name}</h2>
            {selected.kind !== "CORE" && (
              <label className="flex items-center gap-2 text-sm">
                Active
                <Switch checked={selected.isActive} onCheckedChange={(isActive) => save({ isActive })} />
              </label>
            )}
          </div>
          <ol className="mt-4 flex flex-col gap-3">
            {draft.map((q, i) => (
              <li key={q.id ?? `new-${i}`} className="rounded-2xl border border-border/70 p-3">
                <div className="flex items-start gap-2">
                  <span className="mt-2 text-sm text-muted-foreground">{i + 1}.</span>
                  <div className="flex-1 space-y-2">
                    <Input aria-label={`Question ${i + 1}`} value={q.text} onChange={(e) => setDraft((d) => d.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
                    <Textarea
                      aria-label={`Guidance for question ${i + 1}`}
                      value={q.guidance}
                      placeholder="What does a complete answer contain? The AI scores against this."
                      onChange={(e) => setDraft((d) => d.map((x, j) => (j === i ? { ...x, guidance: e.target.value } : x)))}
                      className="min-h-16"
                    />
                  </div>
                  <Button variant="ghost" size="icon" aria-label={`Remove question ${i + 1}`} onClick={() => setDraft((d) => d.filter((_, j) => j !== i))}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-4 flex justify-between gap-2">
            <Button variant="outline" onClick={() => setDraft((d) => [...d, { text: "", guidance: "", element: null }])}>
              <Plus className="size-4" /> Add question
            </Button>
            <Button onClick={() => save({ questions: draft })} disabled={saving}>
              <Save className="size-4" /> Save questions
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
```

Add a "Manage questions" link on `/prompt-bot`, visible only when `canEditMatrices(user.role)`, pointing to `/prompt-bot/matrices`. Extend the Task 11 page test with that assertion.

- [ ] **Step 4: Run it and watch it pass, then typecheck, lint and stage.**

---

### Task 13: End-to-end verification

**Files:**
- Create: `apps/web/scripts/fake-anthropic.mjs`, a local stand-in that speaks the Messages API wire format (SSE for `stream: true`, JSON otherwise). It answers detection with `{"slug":"writing","confidence":0.9}` and scoring with a score per question id taken from the request text, and streams a fixed Elements-of-LLM-Prompts markdown for enhance.

- [ ] **Step 1: Full suite and static checks**

```bash
cd "/Users/tharunkumarl/Full Stack/lms/apps/web"
npx vitest run && npx tsc --noEmit && npx eslint src/
```
Expected: all green.

- [ ] **Step 2: Fake-API browser run**

```bash
node scripts/fake-anthropic.mjs &                       # listens on 127.0.0.1:4010
ANTHROPIC_BASE_URL=http://127.0.0.1:4010 ANTHROPIC_API_KEY=test npm run dev
```
In an isolated `agent-browser` session:
1. Log in as a participant.
2. Open `/prompt-bot`, enter "write a cold email to win my first client", and press Start.
3. Expect the workspace with a Core section and a Writing section.
4. Type an answer, wait 2 s, and expect the bars to change.
5. Mark one question not relevant: readiness counts must update.
6. Press Enhance and confirm the warning. Expect streamed sections and "v1"; Enhance again gives "v2".
7. As a coach, edit a draft matrix question in `/prompt-bot/matrices` and confirm it appears in a new session.
8. Check the browser console has no errors.

- [ ] **Step 3: Real-API smoke test** (the key is in `apps/web/.env`)

Restart `npm run dev` without the fake overrides. Run one prompt through Start, then one score, then one Enhance. Check the bars update within about 3 s and the enhanced prompt contains all six section headings, with placeholders where answers are missing.

- [ ] **Step 4: Production checklist** (report to the human partner; do not execute)
- Add `ANTHROPIC_API_KEY` to the **web** App Runner service in account 505467908612.
- Merge the PR. `start.sh` applies `20261124090000_add_prompt_bot` on deploy.
- Admins review the draft task matrices at `/prompt-bot/matrices`.
