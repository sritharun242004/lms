// @lms/shared - Shared types, constants, and validations for Mentor Connect LMS

// Constants & Enums
export {
  UserRole,
  UserStatus,
  MessageType,
  MemberRole,
  InviteCodeStatus,
  AuditAction,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  hasPermission,
} from "./constants";
export type { Permission } from "./constants";

// Validation Schemas
export {
  loginSchema,
  mentorSignupSchema,
  menteeJoinSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  claimAccountSchema,
  updateProfileSchema,
  createMentorSchema,
  createGroupSchema,
  updateGroupSchema,
  joinGroupSchema,
  sendMessageSchema,
  editMessageSchema,
  searchSchema,
  paginationSchema,
} from "./validations";

// Inferred Types from Schemas
export type {
  LoginInput,
  MentorSignupInput,
  MenteeJoinInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  ClaimAccountInput,
  UpdateProfileInput,
  CreateMentorInput,
  CreateGroupInput,
  UpdateGroupInput,
  JoinGroupInput,
  SendMessageInput,
  EditMessageInput,
  SearchInput,
  PaginationInput,
} from "./validations";

// Domain Types
export type {
  ApiResponse,
  ApiError,
  PaginationMeta,
  AuthTokens,
  AuthUser,
  JwtPayload,
  User,
  UserSummary,
  Group,
  GroupDetail,
  GroupSummary,
  GroupMember,
  Message,
  MessageEdit,
  InviteCode,
  Notification,
  NotificationType,
  AdminDashboardStats,
  MentorDashboardStats,
  MenteeDashboardStats,
  ActivityItem,
  ChartDataPoint,
  SocketEvents,
  SearchResults,
} from "./types";
