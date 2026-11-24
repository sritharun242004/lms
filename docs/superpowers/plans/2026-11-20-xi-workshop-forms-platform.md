# XI Forms Platform Implementation Plan

> **For agentic workers:** Executed inline, same as the core registration
> plan. Given the size of this module (schema + builder + 2 repositories +
> chat delivery + feedback + analytics), tasks are listed at component
> granularity rather than full bite-sized TDD transcripts — each task still
> gets a real test file, run to green, and its own commit, following the
> exact conventions established in
> `2026-11-20-xi-workshop-core-registration-payment.md` (vi.hoisted mocks,
> NextRequest in route tests, createElement + jsdom pragma in component
> tests, errorResponse/successResponse, requireRole-style `role !== "ADMIN"`
> / `role !== "MENTOR" && role !== "ADMIN"` checks).

**Spec:** `docs/superpowers/specs/2026-11-20-xi-workshop-forms-platform-design.md`

## Global constraints (carried from the spec)

- Generic `FormQuestion.config: Json` / `FormAnswer.value: Json` — no
  per-type tables.
- Publishing a Form does not copy it; the Form row itself is what's filled.
- Duplicate-submission prevention is an application-layer check inside the
  response-insert transaction, not a DB constraint (anonymous responses
  must never collide).
- Anonymous responses never surface `respondentUserId` in any query used
  by a response-list view.
- Staff-only (MENTOR/ADMIN) for builder/repository/analytics; MENTEE can
  only fill assigned forms.
- CSV export only (no `.xlsx` writer introduced for this module).

## Tasks

1. **Schema**: add `FormCategory`, `FormStatus`, `FormQuestionType`,
   `FormInvitationStatus` enums; `Form`, `FormSection`, `FormQuestion`,
   `FormQuestionTemplate`, `FormQuestionOption` (not needed — options live
   in `config`, skip), `FormInvitation`, `FormResponse`, `FormAnswer`,
   `FormAnswerFile` models; add `FORM` to `MessageType`; add
   `themePreference String?` to `User`. Migrate, verify additive-only SQL,
   regenerate client.
2. **Form CRUD service + API**: `lib/forms/form-service.ts`
   (create/get/update/addSection/addQuestion/reorder/publish/archive/
   duplicate), routes under `/api/v1/forms` and `/api/v1/forms/[id]`.
3. **Question template repository**: `lib/forms/question-templates.ts` +
   `/api/v1/forms/question-templates` CRUD + search/filter.
4. **Form filling + response submission**: `lib/forms/responses.ts`
   (validate answers against question config server-side per type,
   duplicate-check, transactional insert), `/api/v1/forms/[id]/responses`
   POST, `/forms/fill/[invitationId]` page (standalone route) +
   `QuestionRenderer` component (shared by builder preview and fill page).
5. **Form builder UI**: `/forms` list page (repository: draft/published/
   archived, search, duplicate) + `/forms/[id]/edit` builder page
   (sections/questions CRUD, reorder via up/down controls — not full
   drag-and-drop, see note below — preview, publish/archive).
6. **Chat delivery**: `MessageType.FORM`, `FormInvitation` creation on
   send, `components/chat/form-invitation-message.tsx` chat card, wire
   into `chat-thread.tsx`'s type switch and a new "Send a form" action
   next to the existing poll/word-cloud/open-question senders.
7. **Feedback layer**: `lib/forms/feedback.ts` (trainer-wise/session-wise
   aggregation queries over Form/FormResponse/FormAnswer where
   category=FEEDBACK), `/feedback` dashboard page.
8. **Word cloud**: `lib/forms/word-cloud.ts` (tokenize + stop-word filter,
   reusing the existing `lib/word-cloud/*` helpers where they already do
   this for live chat word clouds — check before writing new logic),
   `/feedback/word-cloud` page with filters and click-to-drill-in.
9. **Analytics + CSV export**: `lib/forms/analytics.ts` (per-question
   summaries), `/forms/[id]/analytics` page,
   `/api/v1/forms/[id]/responses/export` CSV route.
10. **Theme system**: 4 palettes in `globals.css` under `data-palette`,
    `ThemeToggle`-adjacent palette switcher, `themePreference` persistence
    via a small `/api/v1/profile/theme` PATCH route (mirrors how an
    existing profile field is already updated — check
    `components/profile` for the pattern).
11. **Full regression pass**: typecheck, lint, full test suite, production
    build, one real manual end-to-end check against the dev DB (create
    form → publish → send in chat → fill → submit → see in analytics →
    export CSV), same discipline as the core module's Task 12/13.

**Note on drag-and-drop:** the master prompt asks for drag-and-drop
reordering. No drag-and-drop library is in this codebase's dependencies.
Given "do not introduce unnecessary dependencies," Task 5 ships up/down
reorder buttons (same end result — sections and questions can be
reordered — via the same `order`-integer swap pattern used elsewhere in
this codebase) rather than pulling in `@dnd-kit` or similar for this pass.
This is a scope-reduction decision, called out explicitly rather than
silently substituted.
