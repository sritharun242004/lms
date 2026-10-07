# Question Repository Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the existing quiz library into a type-aware Question repository while preserving the existing multiple-choice and participant pipelines.

**Architecture:** Add a defaulted discriminator to `QuestionLibraryItem`, make the current API type-aware without changing legacy request behavior, and add URL-driven Quizzes/Questions tabs. Reusable standalone templates preload and submit through the existing Word Cloud and Open-ended chat dialogs.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma 6/PostgreSQL, Vitest/Testing Library, Playwright-compatible browser verification.

## Global Constraints

- Backward compatibility is the priority; do not rewrite quiz delivery or existing live response models.
- Preserve `/questions`, current `ADMIN`/`MENTOR` authorization, existing MCQ records, and all quiz columns.
- Map `MULTIPLE_CHOICE` to `POLL`, `WORD_CLOUD` to `WORD_CLOUD`, and `OPEN_ENDED` to `OPEN_QUESTION` without renaming live types.
- Publishing copies template data into existing live message models; no live model may reference library rows.
- Do not reset the database or modify unrelated worktree files.
- Production code must follow a witnessed failing-test-first cycle.

---

### Task 1: Library discriminator and validation contract

**Files:**
- Modify: `apps/web/prisma/schema.prisma`
- Create: `apps/web/prisma/migrations/20261007120000_add_question_library_type/migration.sql`
- Modify: `apps/web/src/lib/cms/task-requirements.ts`
- Modify: `apps/web/src/lib/cms/task-requirements.test.ts`
- Create: `apps/web/src/lib/cms/question-library-schema.test.ts`

**Interfaces:**
- Produces `QuestionLibraryType` values `MULTIPLE_CHOICE | WORD_CLOUD | OPEN_ENDED`.
- Produces `normalizeStandaloneQuestionDraft({ name, question, type, options? })` returning trimmed standalone data.
- Preserves `normalizeQuizDraft` unchanged.

- [ ] Write failing validator and migration-contract tests for type values, defaulting/backfill, required fields, invalid types, and forbidden standalone options.
- [ ] Run `npm.cmd test --workspace=apps/web -- src/lib/cms/task-requirements.test.ts src/lib/cms/question-library-schema.test.ts` and confirm failures are caused by missing discriminator/validator behavior.
- [ ] Add the enum, defaulted column, index, migration SQL, and minimal standalone validator.
- [ ] Generate Prisma Client with `npm.cmd run db:generate --workspace=apps/web`.
- [ ] Re-run the focused tests and confirm they pass.

### Task 2: Type-aware API CRUD with legacy MCQ compatibility

**Files:**
- Modify: `apps/web/src/app/api/v1/questions/route.ts`
- Modify: `apps/web/src/app/api/v1/questions/[id]/route.ts`
- Create: `apps/web/src/app/api/v1/questions/question-library-routes.test.ts`

**Interfaces:**
- `GET /api/v1/questions` emits only `MULTIPLE_CHOICE` rows.
- `GET /api/v1/questions?tab=questions` emits standalone rows.
- POST/PATCH accept `type`; omitted type keeps legacy multiple-choice behavior.
- GET/PATCH/DELETE `[id]` remain staff-only.

- [ ] Write failing API tests for legacy MCQ create/list, standalone create/list/get/edit/delete, invalid type/options/empty values, and participant rejection.
- [ ] Run the route test and confirm expected contract failures.
- [ ] Add minimal type-aware query/create/update/get/delete behavior while retaining spreadsheet import and quiz payloads.
- [ ] Re-run route and validator tests until green.

### Task 3: Parent repository navigation and adaptive UI

**Files:**
- Modify: `apps/web/src/app/(app)/layout.tsx`
- Modify: `apps/web/src/app/(app)/layout.test.ts`
- Modify: `apps/web/src/components/layout/mobile-nav.tsx`
- Modify: `apps/web/src/components/layout/mobile-nav.test.ts`
- Modify: `apps/web/src/app/(app)/questions/page.tsx`
- Create: `apps/web/src/app/(app)/questions/page.test.tsx`

**Interfaces:**
- `/questions` defaults to the Quizzes tab.
- `?tab=questions` selects standalone questions.
- The existing quiz editor and calls retain their current shapes.
- The standalone editor sends `{ name, question, type }` without choices.

- [ ] Write failing navigation and repository UI tests for renamed labels, headings, deep-link tabs, active state, editors, CRUD actions, and absence of choices in standalone forms.
- [ ] Run the focused layout/mobile/page tests and confirm the new expectations fail.
- [ ] Rename only repository navigation labels and restructure the page into URL-driven tabs while retaining quiz markup and behavior.
- [ ] Add the standalone create/edit/delete/list UI with responsive existing components.
- [ ] Re-run focused UI tests until green.

### Task 4: Reuse existing live publishing dialogs

**Files:**
- Modify: `apps/web/src/components/chat/chat-thread.tsx`
- Modify: `apps/web/src/components/chat/open-question-form-dialog.tsx`
- Modify: `apps/web/src/components/chat/word-cloud-form-dialog.tsx`
- Modify or create focused tests beside those components.

**Interfaces:**
- `cms-open-question-template` contains `{ question: string }` and opens with `openQuestion=1`.
- `cms-word-cloud-template` contains `{ question: string }` and opens with `openWordCloud=1`.
- Existing service methods create `OPEN_QUESTION` and `WORD_CLOUD`; poll behavior remains unchanged.

- [ ] Write failing tests that hand each template to `ChatThread`, verify the matching existing dialog auto-opens with the prompt, and assert submit uses the existing message service method.
- [ ] Run the focused chat/dialog tests and confirm failures are caused by missing standalone template handoff.
- [ ] Add minimal auto-open/template consumption behavior to the existing dialogs and thread.
- [ ] Re-run focused tests including existing poll/open-question/word-cloud regression tests.

### Task 5: Migration, regression, and end-to-end verification

**Files:**
- Modify only test-support files if a failing verification demonstrates a feature-specific need.

**Interfaces:**
- All prior task contracts are integrated.

- [ ] Run Prisma format and validation, then inspect migration SQL for non-destructive operations.
- [ ] Apply/check the migration against the configured disposable/test database when available and query representative pre-existing rows for `MULTIPLE_CHOICE` plus newly created standalone types.
- [ ] Run all web tests, root tests, lint, typecheck, and production build; record exact results separately.
- [ ] Start the database-backed app without disturbing existing servers and perform authenticated desktop/mobile browser flows for legacy MCQ, Word Cloud, Open-ended, permissions, persistence, edit/delete, and live publishing/participant receipt.
- [ ] Re-read the design acceptance criteria, inspect `git diff --check` and scoped diffs, and report any environment-limited verification honestly.
