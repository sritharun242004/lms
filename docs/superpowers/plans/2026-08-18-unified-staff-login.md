# Unified Staff Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace separate coach, Super Admin, and participant credential portals with one staff login at `/admin/login`, name-and-code-only participant entry, canonical role dashboards, and the restored split auth presentation.

**Architecture:** Keep the existing password verification and token lifecycle, but add one server endpoint that accepts only `ADMIN` and `MENTOR` and lets the server-confirmed role select the dashboard. Preserve legacy URLs as redirects, remove participant credential/claim UI, and centralize auth-form contrast styles without recoloring application inputs.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma, React Hook Form, Tailwind CSS, Vitest.

## Global Constraints

- Common staff login is exactly `/admin/login`.
- `ADMIN` redirects to `/admin/dashboard`; `MENTOR` redirects to `/coach/dashboard`.
- Participants enter only through `/` using name and group code.
- A valid `MENTEE` credential must never authenticate through the staff endpoint.
- `/participant/login` must not render a credential form.
- Preserve existing password verification, inactive-account checks, token versioning, safe redirects, and session handling.
- Auth inputs use light surfaces with black entered text and readable placeholders; dashboard/chat inputs remain unchanged.
- Coach signup restores the older split-screen composition but keeps current coach-only fields and wording.
- Do not include `.superpowers/` or `s..jpg` in commits.

---

### Task 1: Common staff authentication and canonical routes

**Files:**
- Create: `apps/web/src/app/(auth)/admin/login/page.tsx`
- Create: `apps/web/src/app/api/v1/auth/admin/login/route.ts`
- Create: `apps/web/src/app/(app)/coach/dashboard/page.tsx`
- Modify: `apps/web/src/app/(app)/mentor/dashboard/page.tsx`
- Modify: `apps/web/src/app/api/v1/auth/login/route.ts`
- Modify: `apps/web/src/components/auth/staff-login-form.tsx`
- Modify: `apps/web/src/lib/api/services/auth-service.ts`
- Modify: `apps/web/src/providers/auth-provider.tsx`
- Modify: `apps/web/src/lib/auth/portal-navigation.ts`
- Modify: `apps/web/src/proxy.ts`
- Modify: associated auth, proxy, service, and form tests.

**Interfaces:**
- Produces: `POST /api/v1/auth/admin/login`, accepting only `ADMIN | MENTOR` after password verification.
- Produces: `/admin/login`, `/admin/dashboard`, and `/coach/dashboard` as canonical routes.
- Preserves: safe same-origin role-appropriate redirect validation.

- [ ] Add failing tests for ADMIN/MENTOR acceptance, MENTEE rejection, common-form role routing, `/admin` behavior, and canonical/legacy dashboard redirects.
- [ ] Run focused tests and confirm failures are due to the missing common portal and coach route.
- [ ] Generalize the login helper to accept a server-owned allowed-role set and add the staff-only admin endpoint.
- [ ] Update the shared login form/provider/service so the returned role selects `/admin/dashboard` or `/coach/dashboard` without a role selector.
- [ ] Add the coach dashboard route and make `/mentor/dashboard` a redirect.
- [ ] Make `/coach/login` and `/super-admin/login` redirect to `/admin/login`; make `/admin` route/proxy behavior preserve safe requested destinations.
- [ ] Run focused tests, full auth/proxy tests, typecheck, and changed-file lint.

### Task 2: Remove participant credentials and claim prompts

**Files:**
- Modify: `apps/web/src/components/landing/landing-page.tsx`
- Modify: `apps/web/src/components/auth/participant-entry-form.tsx`
- Modify: `apps/web/src/app/(auth)/participant/login/page.tsx`
- Delete or disable: `apps/web/src/app/api/v1/auth/participant/login/route.ts`
- Modify: `apps/web/src/app/(app)/profile/page.tsx`
- Modify: `apps/web/src/app/(app)/mentee/dashboard/page.tsx`
- Delete unused: `apps/web/src/components/auth/secure-account-banner.tsx`
- Delete unused: `apps/web/src/components/auth/claim-account-dialog.tsx`
- Remove unused claim methods from `apps/web/src/lib/api/services/auth-service.ts` and `apps/web/src/providers/auth-provider.tsx`.
- Modify: landing, proxy, auth-service, user-menu, and password-flow tests.

**Interfaces:**
- Participant entry remains `join({ name, inviteCode })`.
- `/participant/login` redirects to `/`; participant logout returns to `/`.

- [ ] Add failing tests proving the landing contains neither removed sentence/link, participant login redirects, participant claim prompts are absent, and participant logout returns to `/`.
- [ ] Run focused tests and confirm expected failures.
- [ ] Remove the two landing texts and credential-login UI/route exposure.
- [ ] Remove participant claim prompts and unused client/provider claim wiring while preserving historical records.
- [ ] Update public-route and recovery navigation so no participant credential path is advertised.
- [ ] Run focused tests, full web tests, typecheck, and changed-file lint.

### Task 3: Restore split auth presentation and input contrast

**Files:**
- Modify: `apps/web/src/app/(auth)/layout.tsx`
- Modify: `apps/web/src/app/(auth)/coach/signup/page.tsx`
- Modify: `apps/web/src/components/auth/staff-login-form.tsx`
- Modify: `apps/web/src/components/auth/participant-entry-form.tsx`
- Modify: relevant render/interaction tests.

**Interfaces:**
- Produces: reusable auth-field class names scoped to participant/staff/signup forms.
- Preserves: coach signup request body and approved-email server behavior.

- [ ] Add failing render tests for the responsive two-column shell, current coach signup content, `/admin/login` link, black input text, and readable placeholders.
- [ ] Run focused tests and confirm the old single-card shell fails them.
- [ ] Restore the prior two-column composition with new staff-oriented supporting copy and hide the supporting panel below `lg`.
- [ ] Apply scoped light-field/black-text classes to participant entry, common staff login, and coach signup password/text inputs.
- [ ] Change successful coach signup navigation and sign-in link to `/coach/dashboard` and `/admin/login`.
- [ ] Run focused tests, full web tests, typecheck, lint, and production build.

### Task 4: Verification, commit, and publication

**Files:**
- No product files unless verification identifies a scoped regression.

**Interfaces:**
- Publishes the reviewed commit to `sritharun/main` only after all checks pass.

- [ ] Run `npm.cmd test --workspace @cms/web` and confirm zero failures.
- [ ] Run `npm.cmd run typecheck --workspace @cms/web`.
- [ ] Run `npm.cmd run lint --workspace @cms/web` and distinguish warnings from errors.
- [ ] Run `npm.cmd run build --workspace @cms/web` with approved font-network access if required.
- [ ] Run `git diff --check`, review route/auth changes for role or redirect bypasses, and confirm `.superpowers/` plus `s..jpg` remain excluded.
- [ ] Commit implementation as `Mohanmohan321 <mohanrajthirugnanam@gmail.com>`.
- [ ] Push `main` to `sritharun/main` and verify the remote SHA.

