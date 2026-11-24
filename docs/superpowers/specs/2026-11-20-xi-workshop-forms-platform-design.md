# XI Forms Platform (Feedback, Form Builder, Repositories, Chat Delivery, Analytics) — design

Date: 2026-11-20. Continuation of
`2026-11-20-xi-workshop-platform-design.md` (Modules F–K). Same waived
approval gate as that document — proceeding to implementation plan and
execution directly.

## Data model: generic, data-driven questions

Rather than 12 bespoke question tables, a `FormQuestion` carries a `type`
enum plus a `config: Json` blob (options, min/max selections, character
limits, scale max, grid rows/columns, "other" flag) and a `FormAnswer`
carries a generic `value: Json` (string, string[], number, or a row→value
map for grids). This is the same pattern Prisma/Postgres already supports
well in this codebase (`Message.metadata`-style JSON columns exist on
`Notification`), avoids 12 near-duplicate tables, and lets one
`QuestionRenderer` component switch on `type` for both the builder and the
fill page — one place to add a 13th type later, not twelve.

```prisma
enum FormCategory { GENERIC FEEDBACK }
enum FormStatus { DRAFT PUBLISHED ARCHIVED }
enum FormQuestionType {
  SHORT_ANSWER PARAGRAPH MULTIPLE_CHOICE CHECKBOXES DROPDOWN
  LINEAR_SCALE STAR_RATING DATE TIME FILE_UPLOAD
  MULTIPLE_CHOICE_GRID CHECKBOX_GRID
}
enum FormInvitationStatus { SENT OPENED SUBMITTED }

model Form {
  id, title, description, headerImageUrl String?, themeColor String?
  category FormCategory @default(GENERIC)
  status FormStatus @default(DRAFT)
  createdById -> User
  opensAt DateTime?, closesAt DateTime?
  allowMultipleSubmissions Boolean @default(false)
  feedbackTargetType String? // "TRAINER" | "SESSION" | "STAFF" | "MATERIAL" | "GENERAL"
  feedbackTargetLabel String? // free-text label, e.g. trainer name
  createdAt, updatedAt
  sections FormSection[]
  invitations FormInvitation[]
  responses FormResponse[]
}
model FormSection {
  id, formId -> Form, title, description String?, order Int
  questions FormQuestion[]
}
model FormQuestion {
  id, sectionId -> FormSection, templateId -> FormQuestionTemplate? (nullable)
  type FormQuestionType, title, description String?, required Boolean
  order Int, config Json @default("{}")
}
model FormQuestionTemplate {   // Module H: question repository
  id, title, type FormQuestionType, description String?, config Json @default("{}")
  category String?, tags String[] @default([])
  createdById -> User, createdAt, updatedAt
}
model FormInvitation {
  id, formId -> Form, messageId -> Message? (nullable: a form can be
    assigned without chat, e.g. direct link), groupId String?,
    recipientUserId -> User
  status FormInvitationStatus @default(SENT)
  sentAt, openedAt DateTime?, submittedAt DateTime?
}
model FormResponse {
  id, formId -> Form, invitationId -> FormInvitation? (nullable: anonymous
    or open-link responses), respondentUserId -> User? (nullable if
    anonymous), anonymous Boolean @default(false), submittedAt
  answers FormAnswer[]
  @@unique([formId, respondentUserId], ...) -- see "duplicate prevention" below
}
model FormAnswer { id, responseId -> FormResponse, questionId -> FormQuestion, value Json }
```

`MessageType` gains `FORM`. Zero changes to any existing table.

**Duplicate-submission prevention:** when `allowMultipleSubmissions` is
false (the default), a second response from the same
`respondentUserId` for the same `formId` is rejected at the service layer
with a clear error — enforced in application code (checked inside the
same transaction that inserts the response), not a blanket DB unique
constraint, because anonymous responses (`respondentUserId: null`) must
never collide with each other.

## Form builder (Module G)

Staff create a `Form` in `DRAFT`, add `FormSection`s and `FormQuestion`s
(reorder via an `order` integer, not a separate position table — same
pattern `QuestionLibraryOption.order` already uses), preview, then
transition `status` to `PUBLISHED` (generates nothing extra — the `Form`
row itself is the shareable unit, referenced by id) or `ARCHIVED`.
Publishing is a one-way-until-unpublished status flag, not a copy — unlike
`QuestionLibraryItem`'s "publish copies into a live message" model, because
a Form's *questions* are what participants fill, not a template that gets
cloned into chat each time (only the *invitation* is per-recipient).

**Conditional branching:** kept intentionally minimal for this build — a
question's `config` can carry `{ showIfQuestionId, showIfValue }`; the fill
page evaluates it client-side to hide/show a question. Section-level
skip-logic (jumping whole sections) is out of scope for this pass — noted
as a known limitation, not silently simplified away.

## Question repository (Module H)

`FormQuestionTemplate` CRUD, search by title, filter by `type`/`category`/
`tags`. "Insert into form" copies a template's `type`/`title`/`description`/
`config` into a new `FormQuestion` with `templateId` set for provenance —
editing the template afterward never changes already-inserted questions
(same copy-not-reference discipline as `QuestionLibraryItem`).

## Form repository (Module I)

Listing `/forms` filtered by `status` (draft/published/archived) and
`category`, with search by title and a "Duplicate" action that deep-copies
a `Form` + its sections/questions (fresh ids, `status: DRAFT`,
`createdById` set to the duplicating user) — independent of the original
from that point on.

## Chat delivery (Module J)

Staff, from a group chat, pick a published `Form` → creates
`Message{type: FORM, content: form.title}` + `FormInvitation{formId,
messageId, groupId, recipientUserId, status: SENT}` (one invitation per
recipient the message is visible to — for a group chat this is created
per member at send time, mirroring how a poll is visible to the whole
group but each member's vote is separate). The chat card
(`components/chat/form-invitation-message.tsx`, following the existing
`poll-message.tsx`/`word-cloud-message.tsx` pattern) shows title,
description, sender, and "Click to fill the form" linking to
`/forms/fill/[invitationId]`. That page is a standalone route outside the
chat shell (same `(marketing)`-style isolation as the landing page, but
authenticated). On submit, the invitation flips to `SUBMITTED` and
navigates back to the originating chat (`groupId` from the invitation);
the chat card re-renders via the existing Socket.IO message-update
broadcast path (the same mechanism `pin`/`poll vote` already use) so every
viewer sees "Submitted" without a refresh. Exiting without submitting
leaves the invitation `SENT`/`OPENED` and the card stays clickable — no
data loss, satisfying the master prompt's explicit requirement.

## Feedback (Module F)

A `Form` with `category: FEEDBACK` and `feedbackTargetType`/
`feedbackTargetLabel` set. No separate schema. The feedback-specific
dashboard is a query layer over `FormResponse`/`FormAnswer` grouped by
`feedbackTargetType`/`feedbackTargetLabel`, plus:

- **Word cloud:** tokenize every `FormAnswer.value` belonging to a
  `SHORT_ANSWER`/`PARAGRAPH` question on `FEEDBACK` forms, lowercase,
  strip punctuation, drop a fixed English stop-word list, count
  frequency, render as a word cloud (reusing the already-installed
  `@cp949/react-wordcloud`, same library the live chat word cloud already
  uses). Filterable by form/trainer/date. Clicking a word lists the
  matching raw responses. This is word-frequency only — no sentiment
  scoring, matching the master prompt's explicit instruction to keep them
  separate (and this build adds no sentiment feature at all, since none
  was requested beyond "keep separate").
- Anonymous feedback: `FormResponse.anonymous = true` suppresses
  `respondentUserId` in both storage intent and every response-list view
  (name/email never rendered for that response), even though the column
  exists for referential integrity — anonymity is enforced by not
  *selecting* the field in anonymous-response queries, not just by UI
  hiding.

## Analytics (Module K)

Per form: total responses, completion rate (`responses / invitations
sent`, or just a raw count for forms with no invitations), per-question
breakdown (counts/percentages for choice types, average + distribution for
scale/star, a filterable list for open text), individual response view,
CSV export (a plain `text/csv` route, one row per response, one column per
question — Excel opens CSV natively, so no separate `.xlsx` writer is
introduced; `xlsx` is already a dependency for the existing quiz-import
feature if an `.xlsx` export is wanted later). Access: the form's
`createdById` or any `ADMIN`.

## Theme system (Module L) — unchanged from the original spec

Four palettes (`xi-blue` default = current colors, `slate`, `emerald`,
`violet`), each a `data-palette` attribute value redefining the existing
semantic CSS vars for light and dark, persisted to `User.themePreference`.
No change from the original design doc.

## Explicitly deferred / known limitations

- **Conditional branching is not implemented**, at either the question or
  section level. The schema's `FormQuestion.config` can carry a
  `{showIfQuestionId, showIfValue}` shape (nothing stops a future change
  from writing it), but no builder UI exists to author it and no
  evaluator exists in the fill page to act on it. Earlier drafts of this
  doc described a "minimal" version as implemented; it was not — this is
  the corrected, accurate status.
- Section-level (not just question-level) conditional skip logic — same
  status as above: not implemented.
- `.xlsx` export (CSV only; opens fine in Excel).
- File-upload questions store the uploaded file the same way payment
  proofs do (`Bytes` on a new `FormAnswerFile` row referenced by the
  answer's `value.fileId`) — implemented, but virus/content scanning is
  out of scope (matches the existing attachment upload's own scope).
- Drag-and-drop reordering: shipped as up/down buttons instead (see the
  implementation plan's note) — no drag library was added.
- A staff member who sends a form into their own group chat sees the
  plain-text fallback bubble for that message (no `FormInvitation` row is
  created for the sender), not the form card — participants see the card
  correctly.
