# Unified Staff Login and Participant Entry Design

## Goal

Provide one common staff login at `/admin/login` for Super Admins and Coaches, keep participants on a name-and-code-only entry flow, and restore the older split-screen visual treatment for coach signup without restoring obsolete copy.

## Canonical routes

| Purpose | Canonical route | Behavior |
|---|---|---|
| Participant entry | `/` | Name and group code only |
| Common staff login | `/admin/login` | Accepts `ADMIN` and `MENTOR` credentials |
| Super Admin dashboard | `/admin/dashboard` | Post-login destination for `ADMIN` |
| Coach dashboard | `/coach/dashboard` | Post-login destination for `MENTOR` |
| Coach signup | `/coach/signup` | Approved-email signup using the restored split-screen layout |

Legacy routes redirect as follows:

- `/admin` redirects logged-out visitors to `/admin/login`; authenticated staff go to their role dashboard.
- `/super-admin/login` and `/coach/login` redirect to `/admin/login` while preserving a safe internal redirect when applicable.
- `/mentor/dashboard` redirects to `/coach/dashboard`.
- `/participant/login` redirects to `/` and is removed from public navigation.

## Authentication behavior

`/admin/login` uses one staff-only API boundary. After verifying email and password, the server accepts only `ADMIN` or `MENTOR` and returns the existing authenticated user payload. It rejects `MENTEE` credentials even if valid.

The client does not ask users to select a role. It routes from the server-confirmed role:

- `ADMIN` to `/admin/dashboard`
- `MENTOR` to `/coach/dashboard`

Existing safe same-origin redirect validation remains in effect. A redirect is accepted only when it is valid for the authenticated staff role.

## Participant-only behavior

The public landing page keeps the “Let’s get started” participant form with only:

- Name
- Meeting or course code
- Enter meeting action

Remove the “Already claimed your account? Sign in” link and the “Private, invite-only access for every group” footer. Remove participant credential-login UI and public routing. Remove account-claiming prompts from participant views so the supported participant entry path is always name plus code.

Existing participant records and historical data are not deleted. This change removes user-facing credential entry/claiming, not participant history.

## Coach signup presentation

`/coach/signup` restores the earlier two-column auth composition: a focused form panel and a branded supporting panel. It retains the current coach-only content and fields:

- Name
- Approved coach email
- Password
- Confirm password
- Create coach account

The supporting panel must not restore obsolete participant or mentor wording. The page remains responsive: the form is primary on mobile, while the supporting panel appears at desktop widths.

## Input contrast

Authentication and signup inputs use a light input surface, black entered text, and visible neutral placeholder text in both light and dark themes. Password input text follows the same rule. This change is scoped to authentication/participant-entry forms and does not recolor application chat or dashboard inputs.

## Navigation and recovery

- Staff logout returns to `/admin/login` for both `ADMIN` and `MENTOR`.
- Staff password recovery returns to `/admin/login`.
- Coach signup links back to `/admin/login`.
- Participant logout, where exposed, returns to `/`.
- No navigation displays a participant credential-login link.

## Error handling and security

- Wrong credentials use the existing generic authentication error.
- A valid `MENTEE` account is rejected by the staff login endpoint.
- Inactive staff accounts remain blocked.
- Redirect query parameters remain restricted to same-origin role-appropriate paths.
- No password or reset token is logged or returned.

## Verification

Automated coverage must prove:

- Shared staff login accepts `ADMIN` and `MENTOR`, rejects `MENTEE`, and returns role-correct destinations.
- Canonical and legacy redirects behave exactly as specified.
- Participant landing contains only name/code entry and no sign-in/private-access copy.
- `/participant/login` cannot present a credential form.
- Participant claim prompts are absent.
- Coach signup keeps current content in the restored responsive split layout.
- Auth inputs render black entered text with readable placeholders.
- Full web tests, typecheck, lint, and production build pass.

