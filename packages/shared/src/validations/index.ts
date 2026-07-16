import { z } from "zod";
import { MessageType, PollChartType, MAX_MESSAGE_LENGTH } from "../constants";

// ============================================================
// AUTH VALIDATIONS
// ============================================================

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Invalid email address"),
  password: z
    .string()
    .min(1, "Password is required")
    .min(8, "Password must be at least 8 characters"),
  rememberMe: z.boolean().optional().default(false),
});


// Mentee join flow: no account, no password — just a name and the
// group's invite code. A lightweight session is issued immediately.
export const menteeJoinSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must be at most 100 characters")
    .trim(),
  inviteCode: z
    .string()
    .min(1, "Invite code is required")
    .max(20, "Invalid invite code")
    .trim()
    .toUpperCase(),
});

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Invalid email address")
    .toLowerCase(),
});

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, "Reset token is required"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(128, "Password must be at most 128 characters")
      .regex(/[a-z]/, "Password must contain at least one lowercase letter")
      .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
      .regex(/[0-9]/, "Password must contain at least one number")
      .regex(
        /[^a-zA-Z0-9]/,
        "Password must contain at least one special character"
      ),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

// Lets a guest mentee (joined via name + invite code, no email/password)
// add login credentials to their existing account so they can sign back
// in later — fills in the same row, never creates a new account.
export const claimAccountSchema = z
  .object({
    email: z
      .string()
      .min(1, "Email is required")
      .email("Invalid email address")
      .toLowerCase(),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(128, "Password must be at most 128 characters")
      .regex(/[a-z]/, "Password must contain at least one lowercase letter")
      .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
      .regex(/[0-9]/, "Password must contain at least one number")
      .regex(
        /[^a-zA-Z0-9]/,
        "Password must contain at least one special character"
      ),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

// ============================================================
// USER / PROFILE VALIDATIONS
// ============================================================

export const updateProfileSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must be at most 100 characters")
    .trim()
    .optional(),
  bio: z
    .string()
    .max(500, "Bio must be at most 500 characters")
    .trim()
    .optional(),
  phone: z
    .string()
    .regex(
      /^\+?[1-9]\d{1,14}$/,
      "Invalid phone number format"
    )
    .optional(),
});

export const createMentorSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must be at most 100 characters")
    .trim(),
  email: z
    .string()
    .min(1, "Email is required")
    .email("Invalid email address")
    .toLowerCase(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be at most 128 characters"),
});

// ============================================================
// GROUP VALIDATIONS
// ============================================================

export const createGroupSchema = z.object({
  name: z
    .string()
    .min(1, "Group name is required")
    .min(2, "Group name must be at least 2 characters")
    .max(100, "Group name must be at most 100 characters")
    .trim(),
  description: z
    .string()
    .max(1000, "Description must be at most 1000 characters")
    .trim()
    .optional(),
});

export const updateGroupSchema = z.object({
  name: z
    .string()
    .min(2, "Group name must be at least 2 characters")
    .max(100, "Group name must be at most 100 characters")
    .trim()
    .optional(),
  description: z
    .string()
    .max(1000, "Description must be at most 1000 characters")
    .trim()
    .optional(),
});

export const joinGroupSchema = z.object({
  inviteCode: z
    .string()
    .min(1, "Invite code is required")
    .max(20, "Invalid invite code")
    .trim()
    .toUpperCase(),
});

// ============================================================
// MESSAGE VALIDATIONS
// ============================================================

export const sendMessageSchema = z.object({
  content: z
    .string()
    .min(1, "Message cannot be empty")
    .max(MAX_MESSAGE_LENGTH, `Message must be at most ${MAX_MESSAGE_LENGTH} characters`),
  type: z.nativeEnum(MessageType).optional().default(MessageType.TEXT),
  attachmentUrl: z.string().url("Invalid attachment URL").optional(),
  attachmentName: z.string().max(255).optional(),
});

export const editMessageSchema = z.object({
  content: z
    .string()
    .min(1, "Message cannot be empty")
    .max(MAX_MESSAGE_LENGTH, `Message must be at most ${MAX_MESSAGE_LENGTH} characters`),
});

// ============================================================
// POLL VALIDATIONS
// ============================================================

export const createPollSchema = z.object({
  question: z
    .string()
    .min(1, "Question is required")
    .max(300, "Question must be at most 300 characters")
    .trim(),
  options: z
    .array(
      z
        .string()
        .min(1, "Option cannot be empty")
        .max(100, "Option must be at most 100 characters")
        .trim()
    )
    .min(2, "At least 2 options are required")
    .max(8, "At most 8 options are allowed"),
  chartType: z.nativeEnum(PollChartType).optional().default(PollChartType.BAR),
});

export const castVoteSchema = z.object({
  optionId: z.string().min(1, "An option is required"),
});

// ============================================================
// OPEN QUESTION VALIDATIONS
// ============================================================

export const createOpenQuestionSchema = z.object({
  question: z
    .string()
    .min(1, "Question is required")
    .max(300, "Question must be at most 300 characters")
    .trim(),
});

export const submitAnswerSchema = z.object({
  text: z
    .string()
    .min(1, "Answer cannot be empty")
    .max(280, "Answer must be at most 280 characters")
    .trim(),
});

// ============================================================
// WORD CLOUD VALIDATIONS
// ============================================================

export const createWordCloudSchema = z.object({
  question: z
    .string()
    .min(1, "Question is required")
    .max(300, "Question must be at most 300 characters")
    .trim(),
  maxWordsPerParticipant: z.coerce.number().int().min(1).max(50).optional().default(1),
  allowMultipleSubmissions: z.boolean().optional().default(false),
  profanityFilter: z.boolean().optional().default(true),
});

export const submitWordSchema = z.object({
  text: z.string().trim().min(1, "Enter a word"),
});

export const wordCloudControlSchema = z.object({
  action: z.enum(["reset", "lock", "unlock"]),
});

// ============================================================
// SEARCH VALIDATIONS
// ============================================================

export const searchSchema = z.object({
  query: z
    .string()
    .min(1, "Search query is required")
    .max(200, "Search query too long")
    .trim(),
  type: z
    .enum(["all", "groups", "messages", "users"])
    .optional()
    .default("all"),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

// ============================================================
// PAGINATION VALIDATIONS
// ============================================================

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  sortBy: z.string().optional().default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
});

// ============================================================
// INFERRED TYPES
// ============================================================

export type LoginInput = z.infer<typeof loginSchema>;
export type MenteeJoinInput = z.infer<typeof menteeJoinSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ClaimAccountInput = z.infer<typeof claimAccountSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type CreateMentorInput = z.infer<typeof createMentorSchema>;
export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;
export type JoinGroupInput = z.infer<typeof joinGroupSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type EditMessageInput = z.infer<typeof editMessageSchema>;
export type CreatePollInput = z.infer<typeof createPollSchema>;
export type CastVoteInput = z.infer<typeof castVoteSchema>;
export type CreateOpenQuestionInput = z.infer<typeof createOpenQuestionSchema>;
export type SubmitAnswerInput = z.infer<typeof submitAnswerSchema>;
export type CreateWordCloudInput = z.infer<typeof createWordCloudSchema>;
export type SubmitWordInput = z.infer<typeof submitWordSchema>;
export type WordCloudControlInput = z.infer<typeof wordCloudControlSchema>;
export type SearchInput = z.infer<typeof searchSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
