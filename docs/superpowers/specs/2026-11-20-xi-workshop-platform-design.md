# X Intelligence workshop platform — design

Date: 2026-11-20
Status: approved (user explicitly waived the standard brainstorming approval
wait — see request); proceeding straight to writing-plans + implementation.

## Context

The business is running a 2-day "X Intelligence" AI workshop (Thu 26 / Fri 27
Nov 2026, Chennai). We are extending the existing mentor-connect-cms LMS
(Next.js 16 + Prisma 6/Postgres + Socket.IO realtime, npm workspaces monorepo)
to cover: a public landing page, registration, a demo QR payment flow, admin
payment verification, automatic participant onboarding into the existing
LMS, a feedback module with word clouds, a Google-Forms-style form builder,
question/form repositories, chat-delivered forms, response analytics, and a
4-theme system.

Source content: `resource/XI-Workshop-Landing-Page-Brief.md` (authoritative
copy, pricing, FAQs, trainer bios) corroborated by `resource/text.txt`
(WhatsApp message). Pricing confirmed: Day 1 ₹28,250, Day 2 ₹31,275 (rounding
of ₹26,505 × 1.18 = ₹31,275.90 — brief flags this as unconfirmed; kept
configurable, defaulting to the brief's stated ₹31,275), Both days ₹55,490,
all incl. 18% GST.

No payment credentials (UPI ID, gateway) exist yet — explicit instruction not
to invent them. Module C is an explicit dummy/demo QR, not a real payment
integration.

## Existing architecture (reused, not duplicated)

- Auth: JWT access/refresh cookies, bcrypt, `authVersion` session invalidation
  (`apps/web/src/lib/auth`). Reused as-is.
- Roles: `UserRole` enum `ADMIN | MENTOR | MENTEE`, with a UI-level portal
  mapping (`lib/auth/portal-navigation.ts`) treating MENTOR as "coach" and
  MENTEE as "participant". `MemberRole` on `GroupMember` mirrors this.
- Chat: `Group` / `GroupMember` / `Message` with a `MessageType` enum already
  carrying interactive types (`POLL`, `OPEN_QUESTION`, `WORD_CLOUD`, `SCALE`),
  each with its own linked table, rendered via a switch in `chat-thread.tsx`,
  delivered over Socket.IO (`apps/realtime`).
- Question repository (today): `QuestionLibraryItem` — reusable templates for
  the 4 live-session interactive types, with a "publish into chat" flow that
  copies a template into a live `Poll`/`OpenQuestion`/`WordCloud`/`Scale`
  message. **Left untouched.** It serves live, in-session interaction; the
  new Form system (below) serves async, standalone forms. Different UX,
  different tables, no shared mutation surface — merging them would risk a
  tested production feature for no benefit.
- File storage: binary blobs (`Bytes`) stored directly on Postgres rows
  (`UserProfilePhoto`, `GroupProfilePhoto`, `MessageAttachment`). Reused for
  payment proofs.
- Theming: Tailwind v4 `@theme inline` semantic CSS vars + `next-themes`
  (`attribute="class"`, light/dark only today).
- Admin surface: `app/(app)/admin` — coach management/onboarding only today.

## Role model change

**Correction (2026-11-20, during implementation):** this section originally
added a fourth `SUPER_ADMIN` enum value above `ADMIN`. That was wrong and
was reverted after a grep across the codebase turned up 15+ existing call
sites that gate top-authority access with a strict `role === "ADMIN"`
check (`lib/admin/coach-management.ts`, `lib/groups/access.ts`,
`lib/photos/access.ts`, `lib/auth/portal-navigation.ts`, the questions API,
chat management, group management, the admin layout nav) — this app's
existing UI already calls the `ADMIN` role "Super Admin"
(`lib/cms/task-requirements.ts: role === "ADMIN" → "Super Admin"`). A
seed script bootstrap had already promoted one real user
(`official@thebotcompany.in`) to the new `SUPER_ADMIN` value before this
was caught; that user was manually restored to `ADMIN` and a corrective
migration (`20261119223000_revert_super_admin_role`) removed the unused
enum value. No data was lost (the new workshop tables were all empty).

**Corrected design:** no new role value. `ADMIN` is, and remains, the sole
top-authority role (what the master prompt calls "Super Admin" and "Admin"
collapse onto it — this workshop's actual admin team is one or two people,
and the brief never asks for two admin tiers with different powers).
`MENTOR` continues to mean Staff/Trainer, `MENTEE` continues to mean
Participant. The workshop registration/payment-verification endpoints gate
on `role === "ADMIN"`, identically to every other admin-only endpoint in
this codebase.

Permission matrix (enforced via the same `role !== "ADMIN"` check pattern
used by every other admin route in this codebase):

| Capability | ADMIN | MENTOR | MENTEE |
|---|---|---|---|
| View/verify payments | yes | no | no |
| Create/manage forms, feedback | yes | yes | no |
| View form/feedback analytics for own forms | yes | yes | no |
| View all analytics | yes | no | no |
| Fill assigned forms, feedback | yes | yes | yes |
| Everything participants already do | yes | yes | yes |

## New data model (additive only)

```
enum RegistrationStatus {
  PENDING_PAYMENT, PROOF_SUBMITTED, UNDER_VERIFICATION,
  APPROVED, REJECTED, RESUBMISSION_REQUESTED
}
enum WorkshopPackage { DAY1, DAY2, BOTH }
enum AiExperienceLevel { NEW, SOMETIMES, DAILY }

model WorkshopRegistration {
  id, registrationCode (unique, human-readable, e.g. XI-2026-0001)
  fullName, email, whatsappNumber, company, designation
  package: WorkshopPackage
  previousDay1Attendance Boolean?, previousDay1When String?
  aiExperienceLevel, aiUseCase String?
  subscriptions String[] (ChatGPT Business / Claude Pro / Copilot Studio / None)
  needsGstInvoice Boolean, gstCompanyName String?, gstin String?
  referredBy String?, ageConfirmed Boolean
  amountInInr Int (snapshot at submission time, from configurable pricing)
  status: RegistrationStatus
  onboardedUserId String? -> User (set on approval)
  createdAt, updatedAt
}

model PaymentProof {
  id, registrationId -> WorkshopRegistration (1:many — resubmission keeps history)
  mimeType, size, data Bytes (or fileUrl if PDF kept off-row — see plan)
  submittedAt
}

model PaymentVerificationLog {
  id, registrationId -> WorkshopRegistration
  action: APPROVED | REJECTED | RESUBMISSION_REQUESTED
  note String?, adminId -> User, createdAt
}

enum FormCategory { GENERIC, FEEDBACK }
enum FormStatus { DRAFT, PUBLISHED, ARCHIVED }
enum FormQuestionType {
  SHORT_ANSWER, PARAGRAPH, MULTIPLE_CHOICE, CHECKBOXES, DROPDOWN,
  LINEAR_SCALE, STAR_RATING, DATE, TIME, FILE_UPLOAD,
  MULTIPLE_CHOICE_GRID, CHECKBOX_GRID
}

model Form {
  id, title, description, headerImageUrl, themeColor
  category: FormCategory, status: FormStatus
  createdById -> User, opensAt, closesAt
  allowMultipleSubmissions Boolean, feedbackTargetType, feedbackTargetId
  sections FormSection[]
}
model FormSection { id, formId, title, description, order, conditionalRule Json? }
model FormQuestion {
  id, sectionId, templateId -> FormQuestionTemplate? (nullable: inserted-from-repo link)
  type: FormQuestionType, title, description, required, order
  validationRules Json? (char limits, min/max selections, other-option flag)
  imageUrl String?
  options FormQuestionOption[]
}
model FormQuestionOption { id, questionId, text, order, isOtherOption Boolean }

model FormQuestionTemplate {   // "Question repository" for the new builder
  id, title, type, description, options Json?, validationRules Json?
  category String?, tags String[], createdById -> User
}

model FormInvitation {
  id, formId, messageId -> Message?, groupId, recipientUserId
  status: SENT | OPENED | SUBMITTED
  sentAt, submittedAt
}
model FormResponse {
  id, formId, invitationId -> FormInvitation?, respondentUserId?
  anonymous Boolean, submittedAt
  answers FormAnswer[]
}
model FormAnswer { id, responseId, questionId, value Json }
```

`MessageType` gains `FORM`. `User` gains `themePreference String?` (one of
4 palette keys).

All of the above are new tables/enum values — zero changes to existing
tables' columns and zero data migrations on existing rows (see the Role
model change correction above).

## Payment flow (Modules B/C/D/E)

1. Public registration form (`/workshop/x-intelligence/register`) persists a
   `WorkshopRegistration` with status `PENDING_PAYMENT`, computed amount from
   a small `lib/workshop/pricing.ts` config (so the Day-2 rounding figure is
   a one-line change, not a redeploy of copy).
2. Payment screen shows registration code, amount, a demo QR
   (`lib/payments/qr-provider.ts`, swappable), and an upload for
   PNG/JPG/PDF proof (size + mime validated server-side). On upload, status
   -> `PROOF_SUBMITTED` immediately, then an admin review queue
   (`UNDER_VERIFICATION` once an admin opens it) — upload never implies
   approval.
3. Admin dashboard (`/admin/registrations`) lists/filters/searches
   registrations, previews proof, and can Approve / Reject / Request
   resubmission with a note. All transitions write a `PaymentVerificationLog`
   row.
4. Approve runs in a single DB transaction: set `APPROVED`, find-or-create a
   `User` (role `MENTEE`) by email/phone, add them to the relevant workshop
   `Group`(s) as `GroupMember`, set `onboardedUserId`, call
   `NotificationService.sendApproval(...)` (logs today; real send later).
   Reject/resubmission never touch `User`/`GroupMember` at all.

## Forms, feedback, chat delivery, analytics (Modules F–K)

- Form builder: drag-reorder sections/questions, 12 question types above,
  live preview, draft/publish/archive. Staff-only (`MENTOR`/`ADMIN`).
- `FormQuestionTemplate` repository: save/search/filter/tag/insert-into-form,
  editing a template never mutates questions already copied into existing
  forms (same copy-not-reference discipline the existing
  `QuestionLibraryItem` publish flow already uses).
- Feedback = `Form` with `category=FEEDBACK` + target metadata; same
  builder, same response pipeline, analytics queries group by
  `feedbackTargetType/Id` for trainer-wise/session-wise views. Word cloud:
  tokenize `FormAnswer.value` for open-ended questions, stop-word filter,
  frequency count, filterable by form/trainer/date, click-word drills into
  matching responses. Explicitly word-frequency, not sentiment.
- Chat delivery: staff picks a published form in a group chat -> creates a
  `Message{type: FORM}` + `FormInvitation{status: SENT}`. Chat card renders
  title/description/staff name + "Click to fill the form", linking to
  `/forms/fill/[invitationId]`, a standalone page outside the chat shell.
  Submit writes `FormResponse`+`FormAnswer`s transactionally, flips the
  invitation to `SUBMITTED`, and the chat card re-renders (via existing
  Socket.IO message update path) as "Submitted". Closing without submitting
  leaves `SENT`/`OPENED` and the card still clickable — no data loss.
- Analytics per form: response count, completion rate (responses vs.
  invitations sent, or vs. views for public forms), per-question summaries
  (chart for choice types, rating averages, raw list for open text),
  individual response drill-in, CSV/Excel export. Access limited to the
  form's creator plus ADMIN.

## Theme system (Module L)

Four palettes as named token sets (`xi-blue` default = today's colors,
`slate`, `emerald`, `violet`), each defining primary/secondary/accent/
background/surface/text/border for both light and dark, switched via a
`data-palette` attribute on `<html>` alongside the existing `.dark` class
(kept independent of light/dark toggle). Persisted to `User.themePreference`
once logged in, else `localStorage`. Every surface that already consumes the
semantic tokens (`--color-primary`, etc.) repaints automatically — no
component-level changes needed beyond defining the 4 palettes' variable
blocks in `globals.css`.

## Landing page (Module A)

New isolated route group `app/(marketing)/workshop/x-intelligence/page.tsx`,
outside both `(auth)` and `(app)` layouts (no app shell, no auth check).
Reuses existing primitives (`Button`, `Card`, existing blue-primary tokens)
per the brief's 15-section structure verbatim. Registration CTA scrolls to
an embedded registration form on the same page (per brief section 13: "Fill
this in. You'll see the amount and payment options right after" — single-
page flow, not a route change). TBC items from the brief (venue, trainer
photos, cancellation policy) render as explicit placeholders, never invented
copy.

## Testing

Vitest, matching existing repo convention: unit tests for pricing calc,
status-machine transitions, RBAC guards, word-cloud tokenizer; API route
tests for registration/payment/form CRUD/chat-invitation flow (mirroring
existing `*-api.test.ts` patterns); one end-to-end-style test walking
register -> upload proof -> approve -> login -> see chat -> get form
invitation -> submit -> see analytics, using the existing test DB setup.

## Explicitly out of scope / deferred

- Real payment gateway/UPI integration (credentials not provided).
- Real email/WhatsApp sending (provider not chosen) — `NotificationService`
  interface wired, no-op/log implementation only.
- Final venue, trainer photos, cancellation policy — rendered as TBC in copy.
