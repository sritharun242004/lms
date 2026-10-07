# Question Repository Design

## Objective

Restructure the existing CMS quiz repository into a parent Question repository with Quizzes and Questions tabs. Preserve the complete multiple-choice quiz pipeline while adding reusable Word Cloud and Open-ended templates that publish through the existing live-message pipelines.

## Compatibility Invariants

- `/questions` remains the canonical compatible repository route.
- Existing API callers that omit a library type continue to create and retrieve multiple-choice quizzes.
- Existing `QuestionLibraryItem` rows become `MULTIPLE_CHOICE` without changing their identifiers, names, prompts, chart types, options, owners, or timestamps.
- Existing live `POLL`, `WORD_CLOUD`, and `OPEN_QUESTION` records, response tables, message types, API routes, renderers, and authorization remain unchanged.
- Publishing copies template content into the existing live message models. Library rows are not referenced by published messages, so later edits or deletion cannot mutate or invalidate sessions or responses.
- Repository management remains limited to `ADMIN` and `MENTOR`; `MENTEE` users remain forbidden.

## Data Model

Add a Prisma enum:

```prisma
enum QuestionLibraryType {
  MULTIPLE_CHOICE
  WORD_CLOUD
  OPEN_ENDED
}
```

Add `type QuestionLibraryType @default(MULTIPLE_CHOICE)` to `QuestionLibraryItem` and index it. Keep `name`, `question`, `chartType`, `options`, and every existing column and relation unchanged. `chartType` remains non-null for compatibility and is ignored for standalone types. Only multiple-choice rows may have option children.

The migration creates the enum and adds a non-null `type` column with the `MULTIPLE_CHOICE` default. PostgreSQL applies that default to existing rows, preserving all existing data. Prisma migrations do not provide down migrations in this repository; rollback is documented as dropping the index and column before dropping the enum, and is not executed automatically.

## Repository-to-Live Type Mapping

| Library type | Existing live path | Existing live message type |
| --- | --- | --- |
| `MULTIPLE_CHOICE` | Poll/quiz creation | `POLL` |
| `WORD_CLOUD` | Word Cloud creation | `WORD_CLOUD` |
| `OPEN_ENDED` | Open-ended question creation | `OPEN_QUESTION` |

No existing live type is renamed.

## Validation Contract

`normalizeQuizDraft` remains the multiple-choice validator and retains its current 2-to-8-option behavior.

Add a standalone question validator that:

- trims `name` and `question`;
- requires both values;
- accepts only `WORD_CLOUD` or `OPEN_ENDED`;
- rejects any non-empty `options` payload;
- returns an object suitable for persistence with no option children.

The API performs this validation before database writes. Omitting `type` on legacy quiz calls means `MULTIPLE_CHOICE`. Unsupported types return HTTP 400. Participants receive HTTP 403 before database access.

## API Contract

Keep `/api/v1/questions` and `/api/v1/questions/[id]`.

- `GET /api/v1/questions` defaults to `MULTIPLE_CHOICE`, preserving the current quiz response.
- `GET /api/v1/questions?tab=questions` returns `WORD_CLOUD` and `OPEN_ENDED` rows.
- `POST /api/v1/questions` creates a type-aware library item; omitted type is multiple-choice.
- `PUT /api/v1/questions` remains the existing quiz spreadsheet import and always creates multiple-choice rows.
- `GET /api/v1/questions/[id]` returns one authorized library item.
- `PATCH /api/v1/questions/[id]` validates using the persisted/requested type, replaces options only for multiple-choice rows, and supports changing between the two standalone types.
- `DELETE /api/v1/questions/[id]` deletes only the template. Published live records are independent copies.

All responses continue using the project's `successResponse` and `errorResponse` envelope conventions.

## UI and Routing

Rename desktop navigation, mobile navigation, and repository headings to “Question repository.” Dashboard and Coach account management navigation remain untouched.

The `/questions` page uses URL-driven tabs:

- `/questions?tab=quizzes` or bare `/questions`: Quizzes
- `/questions?tab=questions`: Questions

Tab links preserve a valid `returnTo` chat path. The active tab uses the existing primary/accent styling.

The Quizzes tab reuses the current create/edit form, bulk upload, search, listing, deletion, and Use quiz behavior. It continues calling the legacy-compatible API shape.

The Questions tab provides a separate editor with name, prompt, and type. It never renders choice fields. Its list shows name, prompt, friendly type, creator, created/updated timestamps, and Edit/Delete/Use question actions.

## Use Question Integration

“Use question” copies the selected prompt into a type-specific `sessionStorage` template and navigates to the sanitized chat return path:

- `WORD_CLOUD`: `cms-word-cloud-template`, query `openWordCloud=1`
- `OPEN_ENDED`: `cms-open-question-template`, query `openQuestion=1`

`ChatThread` observes these existing-flow launch flags and auto-opens the corresponding existing form dialog. Each dialog consumes and clears only its matching template, preloads the prompt, and submits through the existing `messageService.createWordCloud` or `messageService.createOpenQuestion` method. Multiple choice continues using `cms-poll-template`, `openPoll=1`, and `messageService.createPoll`.

## Data Safety and Deletion

Repository templates are copied, not referenced, when published. Deleting a template therefore cannot cascade into `messages`, `polls`, `open_questions`, `word_clouds`, votes, answers, entries, or submissions. The delete confirmation explains that only the reusable template is removed.

## Testing Strategy

Use strict red-green-refactor cycles.

- Schema/migration contract tests verify the discriminator, default/backfill SQL, and supported enum values.
- Validator tests cover all three types, empty fields, choices rules, and invalid types.
- Route tests cover legacy MCQ behavior, list filters, create/get/edit/delete for standalone types, invalid payloads, and role authorization.
- Component tests cover navigation labels, URL tabs, adaptive editors, deep links, and template handoff.
- Dialog/chat tests verify each template launches and submits through its existing service method.
- Existing poll, open-question, word-cloud, message serialization, authorization, and participant rendering tests remain regression coverage.
- Database migration status/deploy checks use the configured test/development database only; no reset or destructive command is allowed.
- Authenticated browser verification covers desktop and mobile when valid local database credentials and test accounts are available.

## Scope Boundary

Do not modify billing, dashboard behavior, coach management behavior, authentication, unrelated group/member work, or deployment infrastructure. Do not introduce new response tables, session models, or participant renderers.
