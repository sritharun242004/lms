import { apiClient } from "@/lib/api/client";
import type {
  AuthUser,
  LoginInput,
  MenteeJoinInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  ClaimAccountInput,
} from "@cms/shared";
import type { AuthPortal } from "@/lib/auth/portal-navigation";

export interface AuthSession {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

export const authService = {
  login: (input: LoginInput, portal: AuthPortal) =>
    apiClient.post<AuthSession>(`/auth/${portal}/login`, input),

  join: (input: MenteeJoinInput) =>
    apiClient.post<AuthSession & { joinedGroup: { id: string; name: string } }>(
      "/auth/join",
      input
    ),

  logout: () => apiClient.post<{ message: string }>("/auth/logout"),

  me: () => apiClient.get<{ user: AuthUser }>("/auth/me"),

  refresh: () => apiClient.post<AuthSession>("/auth/refresh"),

  forgotPassword: (input: ForgotPasswordInput, portal: AuthPortal) =>
    apiClient.post<{ message: string }>(`/auth/forgot-password?portal=${portal}`, input),

  resetPassword: (input: ResetPasswordInput) =>
    apiClient.post<{ message: string }>("/auth/reset-password", input),

  claimAccount: (input: ClaimAccountInput) =>
    apiClient.post<{ user: AuthUser }>("/auth/claim-account", input),

  socketToken: () => apiClient.get<{ token: string }>("/auth/socket-token"),
};
