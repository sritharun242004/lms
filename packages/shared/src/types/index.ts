import { UserRole, UserStatus, MessageType, MemberRole } from "../constants";

// ============================================================
// API RESPONSE TYPES
// ============================================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: PaginationMeta;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, string[]>;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// ============================================================
// AUTH TYPES
// ============================================================

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthUser {
  id: string;
  name: string;
  // Null for guest mentees who joined with just a name + invite code.
  email: string | null;
  role: UserRole;
  avatarUrl: string | null;
  emailVerified: boolean;
}

export interface JwtPayload {
  sub: string;
  name: string;
  email: string | null;
  role: UserRole;
  // Only present on refresh tokens — carried across rotations so a
  // "remember me" session keeps its long expiry instead of resetting
  // to the default on every silent refresh.
  rememberMe?: boolean;
  iat: number;
  exp: number;
}

// ============================================================
// USER TYPES
// ============================================================

export interface User {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: UserRole;
  bio: string | null;
  avatarUrl: string | null;
  status: UserStatus;
  lastSeenAt: string | null;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserSummary {
  id: string;
  name: string;
  email: string | null;
  role: UserRole;
  avatarUrl: string | null;
  status: UserStatus;
}

// ============================================================
// GROUP TYPES
// ============================================================

export interface Group {
  id: string;
  name: string;
  description: string | null;
  wallpaperUrl: string | null;
  createdById: string;
  createdBy: UserSummary;
  memberCount: number;
  messageCount: number;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GroupDetail extends Group {
  inviteCode: InviteCode | null;
  pinnedMessages: Message[];
  members: GroupMember[];
}

export interface GroupSummary {
  id: string;
  name: string;
  wallpaperUrl: string | null;
  memberCount: number;
  lastMessage: Message | null;
  unreadCount: number;
}

// ============================================================
// GROUP MEMBER TYPES
// ============================================================

export interface GroupMember {
  id: string;
  userId: string;
  groupId: string;
  role: MemberRole;
  user: UserSummary;
  joinedAt: string;
}

// ============================================================
// MESSAGE TYPES
// ============================================================

export interface Message {
  id: string;
  content: string;
  type: MessageType;
  groupId: string;
  senderId: string;
  sender: UserSummary;
  attachmentUrl: string | null;
  attachmentName: string | null;
  isPinned: boolean;
  isEdited: boolean;
  isDeleted: boolean;
  editHistory: MessageEdit[];
  createdAt: string;
  updatedAt: string;
}

export interface MessageEdit {
  id: string;
  messageId: string;
  previousContent: string;
  editedAt: string;
}

// ============================================================
// INVITE CODE TYPES
// ============================================================

export interface InviteCode {
  id: string;
  code: string;
  groupId: string;
  isActive: boolean;
  usageCount: number;
  createdAt: string;
  expiresAt: string | null;
}

// ============================================================
// NOTIFICATION TYPES
// ============================================================

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
  isRead: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export type NotificationType =
  | "message"
  | "group_invite"
  | "member_joined"
  | "member_removed"
  | "announcement"
  | "system";

// ============================================================
// DASHBOARD / ANALYTICS TYPES
// ============================================================

export interface AdminDashboardStats {
  totalGroups: number;
  totalMentors: number;
  totalStudents: number;
  totalMessages: number;
  storageUsed: string;
  recentActivity: ActivityItem[];
}

export interface MentorDashboardStats {
  myGroups: number;
  totalStudents: number;
  messagesToday: number;
  pinnedMessages: number;
  recentActivity: ActivityItem[];
}

export interface MenteeDashboardStats {
  joinedGroups: number;
  unreadMessages: number;
  recentAnnouncements: Message[];
}

export interface ActivityItem {
  id: string;
  action: string;
  description: string;
  userId: string;
  userName: string;
  userAvatar: string | null;
  timestamp: string;
}

export interface ChartDataPoint {
  label: string;
  value: number;
}

// ============================================================
// SOCKET EVENT TYPES
// ============================================================

export interface SocketEvents {
  // Client → Server
  "group:join": (groupId: string) => void;
  "group:leave": (groupId: string) => void;
  "user:typing": (data: { groupId: string; userId: string }) => void;

  // Server → Client
  "message:new": (message: Message) => void;
  "message:edit": (message: Message) => void;
  "message:delete": (data: { messageId: string; groupId: string }) => void;
  "message:pin": (data: {
    messageId: string;
    groupId: string;
    isPinned: boolean;
  }) => void;
  "member:join": (data: { groupId: string; member: GroupMember }) => void;
  "member:leave": (data: { groupId: string; userId: string }) => void;
  "user:online": (data: { userId: string; status: UserStatus }) => void;
  // Someone opened this group's chat and is now in the room. Distinct from
  // "member:join", which is about being added to the group's roster: this is
  // ephemeral presence, fires on every join (including socket reconnects),
  // and is never persisted. Emitted to the room excluding the joiner.
  "presence:join": (data: {
    groupId: string;
    userId: string;
    userName: string;
    role: UserRole;
  }) => void;
  "notification:new": (notification: Notification) => void;
  // Counts-only update — never carries a viewer-specific "my vote", so
  // it's safe to broadcast the exact same payload to every client.
  "poll:vote": (data: {
    messageId: string;
    pollId: string;
    options: { id: string; voteCount: number }[];
    totalVotes: number;
  }) => void;
  // Anonymous — carries the answer text but never who submitted it, so
  // it's identical for every viewer regardless of who's asking.
  "open-question:answer": (data: {
    messageId: string;
    openQuestionId: string;
    answer: { id: string; text: string; createdAt: string };
  }) => void;
  // A single entry's new count (and color, on first appearance) — the
  // client merges this into its local list rather than replacing it,
  // so existing word positions in the layout stay stable.
  "word-cloud:update": (data: {
    messageId: string;
    wordCloudId: string;
    entry: { id: string; text: string; count: number; color: string };
  }) => void;
  "word-cloud:reset": (data: { messageId: string; wordCloudId: string }) => void;
  "word-cloud:lock": (data: { messageId: string; wordCloudId: string; isLocked: boolean }) => void;
}

// ============================================================
// SEARCH TYPES
// ============================================================

export interface SearchResults {
  groups: GroupSummary[];
  messages: Message[];
  users: UserSummary[];
  total: number;
}
