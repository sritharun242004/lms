# Role Portals and Interactive Questions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the six requested LMS changes together: clearer open questions, case-sensitive word clouds, participant-only entry, separate staff portals with super-admin coach management, card-only chat navigation, and manager-visible group codes.

**Architecture:** Preserve the existing `ADMIN` / `MENTOR` / `MENTEE` authorization model and add role-specific entry routes over shared authentication helpers. Shape open-answer data at the server boundary so participant responses remain anonymous to participants while managers receive display-only author information. Extend coach onboarding with inactive-account state and credential reset operations while retaining historical data.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma/PostgreSQL, Vitest, Socket.IO, Tailwind CSS.

## Global Constraints

- Keep participant, coach, and super-admin authorization enforced server-side; UI hiding is not authorization.
- Participants must never receive another participant's open-answer identity, email, or database user ID.
- Never return, log, store, or display plaintext coach passwords; super-admin may set a new password only.
- Preserve existing group, media, member, poll, question-library, and chat behavior unless this plan explicitly changes it.
- Remove Chats from every shared navigation; manager chat entry remains through each group card.
- Show group codes only to `ADMIN` and `MENTOR`, never `MENTEE`.
- Preserve submitted word casing while applying stop-word and profanity checks case-insensitively.
- Do not add the unrelated untracked `s..jpg` to any commit.

---

### Task 1: Case-sensitive word cloud

**Files:**
- Modify: `apps/web/src/lib/word-cloud/normalize.ts`
- Modify: `apps/web/src/lib/word-cloud/normalize.test.ts`
- Modify: `apps/web/src/lib/word-cloud/stop-words.ts`
- Modify: `apps/web/src/lib/word-cloud/profanity-filter.ts`
- Modify: `apps/web/src/lib/word-cloud/profanity-filter.test.ts`
- Modify: `apps/web/src/lib/word-cloud/react-wordcloud.ts`
- Modify: `apps/web/src/lib/word-cloud/react-wordcloud.test.ts`
- Modify: `apps/web/prisma/schema.prisma` only if its comments promise lowercase storage

**Interfaces:**
- Produces: `normalizeWord(input: string)` that trims and normalizes whitespace/punctuation but preserves letter casing.
- Preserves: existing deterministic placement, horizontal words, frequency sizing, and collision protection.

- [ ] Add failing tests proving `Creative`, `creative`, and `CREATIVE` remain distinct display/storage values while mixed-case prohibited terms remain blocked.
- [ ] Run the focused word-cloud tests and confirm the failures are caused by lowercase normalization.
- [ ] Remove lowercase conversion from the stored/displayed value and introduce a lowercase-only comparison value for moderation.
- [ ] Make deterministic equal-frequency ordering explicitly case-sensitive without random placement.
- [ ] Run focused tests, web typecheck, and lint for the changed files.
- [ ] Commit only Task 1 files.

### Task 2: Clear coloured open-ended questions with role-safe identities

**Files:**
- Modify: `apps/web/src/lib/messages/serialize.ts`
- Modify: `apps/web/src/lib/messages/queries.ts`
- Modify: `apps/web/src/lib/api/services/message-service.ts`
- Modify: `apps/web/src/app/api/v1/groups/[id]/messages/route.ts`
- Modify: `apps/web/src/app/api/v1/groups/[id]/messages/[messageId]/open-question/answer/route.ts`
- Modify: `apps/web/src/components/chat/chat-thread.tsx`
- Modify: `apps/web/src/components/chat/open-question-message.tsx`
- Add focused tests beside the serializer/component modules following repository Vitest conventions.

**Interfaces:**
- Produces: optional `participant: { name: string; avatarUrl: string | null }` on an open answer only for an authorized manager response.
- Consumes: `access.canManage` from existing group access checks.
- Realtime contract: the group-wide socket answer payload remains anonymous; managers refresh role-shaped messages on the event.

- [ ] Add failing serializer/API tests proving managers receive name/avatar/time and participants receive no name, email, user ID, or nested user object.
- [ ] Add failing UI tests for a coloured response wall, explicit response count, textarea character counter, submit/update state, own-answer label, and manager-only participant attribution.
- [ ] Run focused tests and confirm expected failures.
- [ ] Make message serialization viewer-aware and thread `canManage` through initial queries, message GET, and answer POST responses.
- [ ] Redesign the open-question card using the current design tokens: coloured prompt header, clear instructions, accessible textarea, response count, status feedback, and readable response cards.
- [ ] Keep socket payload anonymous; on answer events, let managers immediately refetch authorized message data while participants merge the anonymous update.
- [ ] Run focused tests, web typecheck, lint, and relevant chat tests.
- [ ] Commit only Task 2 files.

### Task 3: Participant-only entry and separate staff login portals

**Files:**
- Modify: `apps/web/src/components/landing/landing-page.tsx`
- Modify: `apps/web/src/components/auth/participant-entry-form.tsx`
- Modify: `apps/web/src/app/(auth)/layout.tsx`
- Create: `apps/web/src/app/(auth)/coach/login/page.tsx`
- Create: `apps/web/src/app/(auth)/coach/signup/page.tsx`
- Create: `apps/web/src/app/(auth)/super-admin/login/page.tsx`
- Create/modify: shared role-login form and server login helper under existing auth modules.
- Modify: `apps/web/src/app/(auth)/login/page.tsx`
- Modify: `apps/web/src/app/(auth)/signup/page.tsx`
- Modify: `apps/web/src/app/join/page.tsx` if present
- Modify: `apps/web/src/app/api/v1/auth/login/route.ts` or replace it with role-specific guarded routes.
- Modify: `apps/web/src/proxy.ts`
- Add role-route and UI tests following current Vitest conventions.

**Interfaces:**
- Canonical URLs: participant `/`, coach `/coach/login`, coach signup `/coach/signup`, super-admin `/super-admin/login`, coach management `/admin/coaches`.
- Login endpoints must reject a valid account of the wrong role.

- [ ] Add failing tests for a single participant entry experience with “Let’s get started” and no staff link/right promotional panel.
- [ ] Add failing tests proving coach and super-admin login routes reject wrong-role credentials and redirect authenticated roles correctly.
- [ ] Run focused tests and confirm expected failures.
- [ ] Simplify `/` and the auth layout to the requested single-column participant entry while preserving invite-code query handling.
- [ ] Create shared form internals with separate coach and super-admin pages and server-enforced expected roles.
- [ ] Move approved coach signup to `/coach/signup`; redirect legacy `/login` to `/` and `/signup` to `/coach/signup`.
- [ ] Update unauthenticated route handling so `/admin/**` goes to `/super-admin/login`, coach manager routes go to `/coach/login`, and participant routes go to `/`.
- [ ] Run focused tests, web typecheck, lint, and build-level route checks.
- [ ] Commit only Task 3 files.

### Task 4: Super-admin coach account and password management

**Files:**
- Modify: `apps/web/prisma/schema.prisma`
- Create: `apps/web/prisma/migrations/<timestamp>_add_coach_account_management/migration.sql`
- Modify: `apps/web/src/app/api/v1/auth/signup/route.ts`
- Modify: `apps/web/src/app/api/v1/auth/login/route.ts` and refresh/session helpers as needed
- Create: `apps/web/src/app/api/v1/admin/coaches/[id]/route.ts`
- Create: `apps/web/src/app/api/v1/admin/coaches/[id]/password/route.ts`
- Modify: `apps/web/src/components/admin/coach-onboarding.tsx`
- Modify: `apps/web/src/app/(app)/admin/coaches/page.tsx`
- Add admin coach service/query modules and focused tests.

**Interfaces:**
- Adds: `User.isActive Boolean @default(true)`, `User.disabledAt DateTime?`, and `CoachEmailApproval.claimedById String? @unique` linked to `User` with `onDelete: SetNull`.
- Produces: admin-only edit, password reset, and deactivate operations constrained to `MENTOR` targets.

- [ ] Add failing tests for approval-to-coach linking, manager-only edit/reset/deactivate, wrong-role targets, duplicate emails, inactive login/refresh denial, password hashing, and token/session revocation.
- [ ] Run focused tests and confirm expected failures.
- [ ] Add the Prisma fields and a migration that backfills claimed approvals by matching normalized approved emails to `MENTOR` accounts.
- [ ] Atomically link newly approved coach signups to their approval record.
- [ ] Add super-admin coach list/edit, password-set, and deactivate APIs. Hash with bcrypt cost 12 and revoke refresh tokens/sessions on reset or deactivate.
- [ ] Enforce active-account checks in login, current-user/session refresh, socket-token issuance, and other centralized auth helpers.
- [ ] Extend `/admin/coaches` into a full page for pending email approvals plus active/inactive coach account management with confirmation states.
- [ ] Run Prisma validation/generation, focused tests, typecheck, lint, and auth regressions.
- [ ] Commit only Task 4 files including migration.

### Task 5: Group-card chat navigation and manager group codes

**Files:**
- Modify: `apps/web/src/app/(app)/layout.tsx`
- Modify: `apps/web/src/components/layout/mobile-nav.tsx`
- Modify: `apps/web/src/app/(app)/chat/page.tsx`
- Modify: `apps/web/src/app/(app)/chat/[groupId]/page.tsx`
- Modify: `apps/web/src/components/chat/chat-thread.tsx`
- Add navigation and role-display tests following current Vitest conventions.

**Interfaces:**
- Consumes: `getActiveInviteCode(groupId)` and `access.canManage`.
- Produces: optional `groupCode` prop shown with copy action only for managers.

- [ ] Add failing tests proving Chats is absent from desktop/mobile navigation, manager `/chat` redirects to `/dashboard`, group cards still open their chats, and participants never receive/render a group code.
- [ ] Run focused tests and confirm expected failures.
- [ ] Remove Chats from all shared nav configurations and redirect the manager chat index to the dashboard.
- [ ] Fetch the active code only after manager access is established and pass it into the chat thread.
- [ ] Render a responsive “Group code” chip with copy feedback in the coach/super-admin chat header; keep the participant header unchanged.
- [ ] Run focused tests, web typecheck, lint, and related chat/group tests.
- [ ] Commit only Task 5 files.

### Task 6: Integrated verification and release readiness

**Files:**
- Modify tests only when a failing integration test reveals a real product defect; production fixes must stay within the six requirements.

**Interfaces:**
- Verifies all prior tasks together without deploying or pushing unless separately requested.

- [ ] Run `npm.cmd test --workspace @cms/web`.
- [ ] Run `npm.cmd run typecheck --workspace @cms/web`.
- [ ] Run `npm.cmd run lint --workspace @cms/web`.
- [ ] Run `npm.cmd run build --workspace @cms/web` with the database-independent environment available to the repository.
- [ ] Verify the generated Prisma client and migration syntax without applying the migration to an unknown database.
- [ ] Run responsive browser checks for participant entry, both staff portals, coach management, manager/participant open-question views, case-sensitive word cloud, nav removal, and group-code visibility.
- [ ] Review the whole diff for authorization/data leakage and confirm `s..jpg` remains untracked and excluded.

