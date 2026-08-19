# Profile and Group Photos Design

**Date:** 2026-08-19

**Status:** Approved for implementation planning

**Scope:** WhatsApp-style profile and group photo management for Super Admins and Coaches

## Goal

Add secure, durable photo management to the existing AI Empowerment CMS without creating a separate identity or group-management subsystem. Super Admins and Coaches can add, replace, preview, and remove their own profile photo. They can perform the same actions for groups they are already authorized to manage. Participants can see these photos but cannot manage any photo.

## Product Behavior

### Personal profile photo

- The Profile page presents the current avatar as a large, interactive photo control.
- A Super Admin or Coach can select **Add photo** when no photo exists, or **View photo**, **Change photo**, and **Remove photo** when one exists.
- Selecting a file opens a square crop dialog. The user can reposition and zoom the image, preview the circular result, and save or cancel.
- Saving replaces the previous photo atomically. If validation or persistence fails, the previous photo remains unchanged.
- Removing a photo requires confirmation and restores the existing initials fallback.
- A successful change updates the authenticated user cache, profile page, and header avatar immediately. Other avatar surfaces use a versioned URL so navigation or refreshed data cannot show a stale browser-cached image.
- Participants have view-only access and never receive an upload, change, or remove control.

### Group profile photo

- Group cards display a circular group photo next to the group name, with a deterministic initials fallback.
- The active chat header displays the same photo. Selecting an existing photo opens a large preview for any user who can view that group.
- The existing group management menu contains **Add group photo** or **Change group photo**, plus **Remove group photo** when applicable.
- A Super Admin can manage the photo of any group. A Coach can manage only a group for which the existing access rules grant management rights. Participants are view-only.
- Successful changes refresh group cards and the active chat view immediately and use a versioned photo URL to avoid stale image caches.
- Removing a group photo requires confirmation and restores the initials fallback.

## Chosen Architecture

The implementation stores normalized photo bytes in PostgreSQL, matching the repository's existing durable database-backed attachment pattern. It does not introduce S3, Cloudinary, public filesystem writes, data URLs, or external credentials.

Two dedicated one-to-one records keep large binary columns out of ordinary user and group queries:

### `UserProfilePhoto`

- `id`
- `userId` (unique, cascade delete)
- `mimeType`
- `size`
- `width`
- `height`
- `data`
- `createdAt`
- `updatedAt`

### `GroupProfilePhoto`

- `id`
- `groupId` (unique, cascade delete)
- `mimeType`
- `size`
- `width`
- `height`
- `data`
- `createdAt`
- `updatedAt`

The existing `User.avatarUrl` remains the public API contract for user rendering. Uploading sets it to the authenticated internal photo endpoint with a version token; removing clears it. A new nullable `Group.avatarUrl` field provides the equivalent group contract. Binary bytes are selected only by dedicated photo-serving routes.

## Image Processing and Validation

- Accepted input types: JPEG, PNG, and WebP.
- Maximum original upload size: 5 MB.
- Empty files, unsupported formats, malformed image bytes, and images that cannot be decoded are rejected before database mutation.
- Client-side crop controls provide the WhatsApp-style positioning experience, but the server remains authoritative.
- The server decodes and normalizes the submitted crop to a square 512 x 512 WebP image, strips image metadata, and applies a reasonable quality setting.
- Server normalization prevents a forged MIME type, oversized dimensions, embedded metadata, or unoptimized client output from becoming the stored photo.
- Upload endpoints accept exactly one `photo` multipart field.

## API Design

### Personal photo

- `PUT /api/v1/profile/photo` — authenticated Super Admin or Coach replaces their own photo.
- `DELETE /api/v1/profile/photo` — authenticated Super Admin or Coach removes their own photo.
- `GET /api/v1/users/:id/photo` — streams a stored photo only to the photo owner, a Super Admin, or an authenticated user who shares at least one group with the photo owner.

Upload and delete responses return the updated `AuthUser` shape so the existing auth query cache can be updated without re-login.

### Group photo

- `PUT /api/v1/groups/:id/photo` — replaces the photo after the existing group-management authorization check.
- `DELETE /api/v1/groups/:id/photo` — removes it using the same authorization rule.
- `GET /api/v1/groups/:id/photo` — streams it only when the requester can view the group.

Upload and delete responses return the group ID and new nullable versioned `avatarUrl`.

Photo-serving responses include the correct content type, content length, private cache headers, an ETag, and `X-Content-Type-Options: nosniff`. Missing photos return 404. Mutations return existing project-standard success/error envelopes.

## Authorization Rules

| Action | Super Admin | Coach | Participant |
| --- | --- | --- | --- |
| View own or shared-group user's photo | Yes, plus any user | Yes | Yes |
| Manage own profile photo | Yes | Yes | No |
| Manage another user's photo | No | No | No |
| View a group's photo | Any group | Accessible groups | Joined groups |
| Manage a group's photo | Any group | Managed groups only | No |

The server enforces every row in this table. Hidden buttons are a usability measure, not an authorization boundary.

## UI Components

- `PhotoCropDialog`: file selection, crop positioning, zoom, preview, validation feedback, save/cancel state, and object URL cleanup.
- `PhotoPreviewDialog`: large photo preview with management actions supplied only to authorized viewers.
- `EditableAvatar`: shared add/view/change/remove affordance with keyboard and screen-reader support.
- Profile photo panel: client component embedded in the existing server-rendered Profile page.
- Group avatar integration: group card and chat header consume the new `avatarUrl` contract and retain initials fallbacks.

The controls remain usable on mobile and desktop. Icon-only triggers receive accessible names, crop controls are keyboard operable, dialogs restore focus, and destructive removal uses the repository's existing confirmation pattern.

## Data and Cache Flow

1. The user selects an image and adjusts the square crop.
2. The client renders the crop to a blob and submits multipart form data.
3. The API authenticates the user, checks the role or group-management permission, validates the upload, and normalizes it.
4. A database transaction upserts the photo record, updates the versioned URL field, and writes an audit entry.
5. The response updates the local auth or group state, then affected server data is refreshed.
6. The new URL version forces browsers to fetch the new bytes instead of reusing the previous image.

Deletion follows the same flow: delete the photo record, clear the URL, record the audit action, update local state, and show initials.

## Error Handling

- Client validation explains unsupported type, empty file, and files over 5 MB before upload.
- Server validation repeats all security-sensitive checks.
- Upload dialogs remain open after a recoverable error so the user can retry.
- A failed replacement never deletes or overwrites the current photo.
- A failed removal preserves the current photo.
- Network and persistence errors use clear toasts without exposing internal paths, binary data, or stack traces.
- Rapid repeated submissions are disabled while a mutation is active.

## Auditability

The existing audit log records profile photo added/updated/removed and group photo added/updated/removed. Metadata contains only entity IDs, MIME type, and normalized size; it never contains photo bytes or client filesystem names.

## Testing Strategy

Implementation follows test-first red-green-refactor cycles.

- Validation unit tests: allowed formats, malformed bytes, empty input, size limit, normalization output, and deterministic versioned URLs.
- Authorization tests: anonymous, participant, Coach self/managed group, Coach unowned group, and Super Admin any-group cases.
- Route tests: upload, atomic replacement, delete, 404, correct response envelopes, cache/security headers, and preserved previous photo on failure.
- Query/serialization tests: profile and group `avatarUrl` propagation without selecting binary bytes.
- Component tests: correct add/change/remove actions, participant view-only behavior, fallbacks, confirmation, disabled progress state, and successful cache refresh.
- Regression tests: existing profile, group cards, group editing, chat rendering, and authentication remain compatible.
- Browser verification: Super Admin self photo, Coach self photo, Super Admin group photo, Coach managed-group photo, participant view-only behavior, crop interaction, replacement, removal, mobile layout, and stale-cache prevention.

## Migration and Compatibility

- Add the two photo tables and nullable `groups.avatar_url` in one Prisma migration.
- Existing users retain their nullable `avatarUrl`; existing external URLs continue to render until that user uploads or removes a managed photo.
- Existing groups start with no photo and continue to show initials.
- Internal role enums and existing `MENTOR`/`MENTEE` routes remain unchanged; only user-facing labels continue to say Coach and Participant where already established.
- Existing `wallpaperUrl` remains untouched because a chat wallpaper and a group profile photo are different concepts.

## Out of Scope

- Participant-managed profile photos.
- Super Admin editing another person's profile photo.
- Camera capture as a separate native-device workflow; the browser's file chooser may still offer the device camera.
- Animated GIF profile photos.
- Group chat wallpapers.
- External object storage, CDN provisioning, deployment, or production data backfill.
- Name, email, password, role, or group membership changes.

## Acceptance Criteria

1. Super Admins and Coaches can add, crop, replace, preview, and remove their own profile photo.
2. Participants can view visible profile photos but have no photo mutation control or authorized mutation endpoint.
3. Super Admins can manage any group photo; Coaches can manage only groups they already manage.
4. Group photos appear consistently on group cards and the active chat header, with initials fallback.
5. Replacements and removals update the current UI without stale cached images.
6. Invalid or failed replacements preserve the previous photo.
7. All mutation permissions are enforced server-side and actions are audited.
8. Focused automated tests, the relevant full repository checks, Prisma validation, and browser flows pass before completion is claimed.
