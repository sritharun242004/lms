import { apiClient } from "@/lib/api/client";
import type {
  AuthUser,
  LoginInput,
  MentorSignupInput,
  MenteeJoinInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  ClaimAccountInput,
} from "@lms/shared";

export interface AuthSession {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

export const authService = {
  login: (input: LoginInput) => apiClient.post<AuthSession>("/auth/login", input),

  // The server's schema still requires confirmPassword (it re-checks the
  // match server-side too) — send the full validated form values as-is.
  mentorSignup: (input: MentorSignupInput) =>
    apiClient.post<AuthSession>("/auth/signup", input),

  join: (input: MenteeJoinInput) =>
    apiClient.post<AuthSession & { joinedGroup: { id: string; name: string } }>(
      "/auth/join",
      input
    ),

  logout: () => apiClient.post<{ message: string }>("/auth/logout"),

  me: () => apiClient.get<{ user: AuthUser }>("/auth/me"),

  refresh: () => apiClient.post<AuthSession>("/auth/refresh"),

  forgotPassword: (input: ForgotPasswordInput) =>
    apiClient.post<{ message: string }>("/auth/forgot-password", input),

  resetPassword: (input: ResetPasswordInput) =>
    apiClient.post<{ message: string }>("/auth/reset-password", input),

  claimAccount: (input: ClaimAccountInput) =>
    apiClient.post<{ user: AuthUser }>("/auth/claim-account", input),

  socketToken: () => apiClient.get<{ token: string }>("/auth/socket-token"),
};
