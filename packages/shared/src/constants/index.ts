// ============================================================
// USER ROLES & PERMISSIONS
// ============================================================

export enum UserRole {
  ADMIN = "ADMIN",
  MENTOR = "MENTOR",
  MENTEE = "MENTEE",
}

export enum UserStatus {
  ONLINE = "ONLINE",
  OFFLINE = "OFFLINE",
  AWAY = "AWAY",
}

export enum MessageType {
  TEXT = "TEXT",
  IMAGE = "IMAGE",
  FILE = "FILE",
  ANNOUNCEMENT = "ANNOUNCEMENT",
  POLL = "POLL",
  OPEN_QUESTION = "OPEN_QUESTION",
  WORD_CLOUD = "WORD_CLOUD",
}

export enum PollChartType {
  BAR = "BAR",
  DONUT = "DONUT",
  PIE = "PIE",
}

// ============================================================
// FILE ATTACHMENTS
// ============================================================

export const MAX_ATTACHMENT_SIZE_BYTES = 50 * 1024 * 1024;
export const MAX_ATTACHMENT_SIZE_MB = 50;

// ============================================================
// MESSAGE LIMITS
// ============================================================

// Character cap for a single text message / edit. Sized to comfortably
// hold ~3000 words (avg ~6 chars incl. spacing) so mentors can post long
// announcements in one message.
export const MAX_MESSAGE_LENGTH = 20000;

export enum MemberRole {
  OWNER = "OWNER",
  MENTOR = "MENTOR",
  MENTEE = "MENTEE",
}

export enum InviteCodeStatus {
  ACTIVE = "ACTIVE",
  DISABLED = "DISABLED",
  EXPIRED = "EXPIRED",
}

export enum AuditAction {
  // Auth
  USER_LOGIN = "USER_LOGIN",
  USER_LOGOUT = "USER_LOGOUT",
  USER_SIGNUP = "USER_SIGNUP",
  PASSWORD_RESET = "PASSWORD_RESET",
  PASSWORD_CHANGED = "PASSWORD_CHANGED",
  ACCOUNT_CLAIMED = "ACCOUNT_CLAIMED",

  // Group
  GROUP_CREATED = "GROUP_CREATED",
  GROUP_UPDATED = "GROUP_UPDATED",
  GROUP_DELETED = "GROUP_DELETED",

  // Member
  MEMBER_JOINED = "MEMBER_JOINED",
  MEMBER_REMOVED = "MEMBER_REMOVED",
  MEMBER_LEFT = "MEMBER_LEFT",

  // Message
  MESSAGE_SENT = "MESSAGE_SENT",
  MESSAGE_EDITED = "MESSAGE_EDITED",
  MESSAGE_DELETED = "MESSAGE_DELETED",
  MESSAGE_PINNED = "MESSAGE_PINNED",
  MESSAGE_UNPINNED = "MESSAGE_UNPINNED",
  POLL_CREATED = "POLL_CREATED",
  OPEN_QUESTION_CREATED = "OPEN_QUESTION_CREATED",
  WORD_CLOUD_CREATED = "WORD_CLOUD_CREATED",
  WORD_CLOUD_RESET = "WORD_CLOUD_RESET",

  // Invite
  INVITE_GENERATED = "INVITE_GENERATED",
  INVITE_DISABLED = "INVITE_DISABLED",

  // Profile
  PROFILE_UPDATED = "PROFILE_UPDATED",
  AVATAR_UPDATED = "AVATAR_UPDATED",

  // Admin
  MENTOR_CREATED = "MENTOR_CREATED",
  MENTOR_DELETED = "MENTOR_DELETED",
  STUDENT_REMOVED = "STUDENT_REMOVED",
  SETTINGS_UPDATED = "SETTINGS_UPDATED",
}

// ============================================================
// PERMISSION DEFINITIONS
// ============================================================

export const PERMISSIONS = {
  // Group permissions
  GROUP_CREATE: "group:create",
  GROUP_EDIT: "group:edit",
  GROUP_DELETE: "group:delete",
  GROUP_VIEW: "group:view",
  GROUP_VIEW_ALL: "group:view_all",
  GROUP_WALLPAPER: "group:wallpaper",

  // Member permissions
  MEMBER_INVITE: "member:invite",
  MEMBER_REMOVE: "member:remove",
  MEMBER_VIEW: "member:view",
  MEMBER_EXPORT: "member:export",

  // Message permissions
  MESSAGE_SEND: "message:send",
  MESSAGE_EDIT: "message:edit",
  MESSAGE_DELETE: "message:delete",
  MESSAGE_PIN: "message:pin",
  MESSAGE_READ: "message:read",
  MESSAGE_COPY: "message:copy",
  MESSAGE_SEARCH: "message:search",

  // User management
  MENTOR_CREATE: "mentor:create",
  MENTOR_EDIT: "mentor:edit",
  MENTOR_DELETE: "mentor:delete",
  STUDENT_VIEW_ALL: "student:view_all",
  STUDENT_REMOVE: "student:remove",

  // Analytics
  ANALYTICS_VIEW: "analytics:view",
  AUDIT_VIEW: "audit:view",

  // System
  SETTINGS_MANAGE: "settings:manage",
  BROADCAST: "broadcast",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  [UserRole.ADMIN]: Object.values(PERMISSIONS),
  [UserRole.MENTOR]: [
    PERMISSIONS.GROUP_CREATE,
    PERMISSIONS.GROUP_EDIT,
    PERMISSIONS.GROUP_DELETE,
    PERMISSIONS.GROUP_VIEW,
    PERMISSIONS.GROUP_WALLPAPER,
    PERMISSIONS.MEMBER_INVITE,
    PERMISSIONS.MEMBER_REMOVE,
    PERMISSIONS.MEMBER_VIEW,
    PERMISSIONS.MEMBER_EXPORT,
    PERMISSIONS.MESSAGE_SEND,
    PERMISSIONS.MESSAGE_EDIT,
    PERMISSIONS.MESSAGE_DELETE,
    PERMISSIONS.MESSAGE_PIN,
    PERMISSIONS.MESSAGE_READ,
    PERMISSIONS.MESSAGE_COPY,
    PERMISSIONS.MESSAGE_SEARCH,
  ],
  [UserRole.MENTEE]: [
    PERMISSIONS.GROUP_VIEW,
    PERMISSIONS.MESSAGE_READ,
    PERMISSIONS.MESSAGE_COPY,
    PERMISSIONS.MESSAGE_SEARCH,
  ],
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
