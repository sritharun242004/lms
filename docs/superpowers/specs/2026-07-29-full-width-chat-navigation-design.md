# Full-width chat navigation design

Date: 2026-07-29

## Goal

Remove the left-side group list from active chat views for every role. Admins and mentors will choose and switch groups from their dashboard. Mentees will keep their direct chat entry.

## User experience

- Every `/chat/[groupId]` thread fills the available content width on desktop and mobile.
- The group search and group-name sidebar is not rendered in the chat area.
- Admin and mentor desktop navigation no longer shows `Chats`.
- Admin and mentor mobile navigation no longer shows `Chats`.
- Admins and mentors use the existing `Open chat` action on dashboard group cards.
- A direct admin or mentor visit to `/chat` redirects to `/dashboard`.
- Mentees retain the `Chats` navigation item and the existing single-group redirect from `/chat` to `/chat/[groupId]`.
- A mentee with multiple memberships sees a full-width group-selection list at `/chat`, preserving access without restoring the sidebar.
- The mobile back arrow in an admin or mentor chat returns to `/dashboard`.
- A single-group mentee continues to see no back arrow because there is no group selection screen to return to.

## Architecture

### Chat layout

`ChatShell` becomes a full-width content shell and no longer renders `ChatSidebar`. The chat route layout no longer fetches group collections solely to populate that sidebar.

### Role-aware navigation

The authenticated app layout and mobile navigation use the existing mentee-role distinction:

- Mentee: show `Chats`.
- Admin or mentor: show `Dashboard` only.

### Route behavior

`/chat` resolves the current user:

- Admin or mentor: redirect to `/dashboard`.
- Mentee with exactly one group: redirect to that group chat.
- Mentee with multiple groups: render the joined groups as a full-width selection list in the main content area.
- Mentee with no groups: show an appropriate empty state.

The multiple-group mentee selection uses existing group data and links each entry to `/chat/[groupId]`; it must not include management controls or restore the left sidebar.

### Mobile back navigation

`ChatThread` accepts an explicit back destination when a back link is shown. Admin and mentor threads use `/dashboard`. Mentee behavior remains based on whether there is a valid group-selection destination.

## Error and edge-case handling

- Unauthorized access to `/chat/[groupId]` remains handled by the existing access check and `notFound()` behavior.
- Empty admin or mentor dashboards continue to use the existing dashboard empty state.
- Direct `/chat` visits cannot leave admins or mentors on a page that refers to a removed group list.
- Existing message, invite-code, member, attachment, poll, open-question, and word-cloud behavior is unchanged.

## Testing

Tests will be written before production changes and will cover:

- Admin and mentor navigation excludes `Chats`.
- Mentee navigation retains `Chats`.
- Admin and mentor `/chat` access redirects to `/dashboard`.
- The chat shell renders active content without the sidebar.
- A multi-group mentee can still select an accessible group from the full-width `/chat` page.
- Mobile back navigation uses `/dashboard` for manageable chats.
- Existing mentee direct-chat behavior remains intact.

After targeted tests pass, run the web test suite, typecheck, and lint. Browser verification should confirm an admin or mentor dashboard can open a group chat, the thread fills the content width, no group names appear on the left, and mobile navigation returns to Dashboard.

## Out of scope

- Changing dashboard group cards or group management.
- Changing authorization or group membership rules.
- Changing message composition or realtime behavior.
- Adding a new group switcher inside the chat thread.
- Deployment or production data changes.
