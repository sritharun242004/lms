"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ApiError,
  AuthUser,
  LoginInput,
  MentorSignupInput,
  MenteeJoinInput,
  ClaimAccountInput,
} from "@lms/shared";
import { authService } from "@/lib/api/services/auth-service";

const AUTH_QUERY_KEY = ["auth", "me"] as const;

// Prefer the specific field-level validation message over the generic
// "Validation failed" summary, so a schema mismatch is debuggable from
// the toast alone instead of failing silently with no useful detail.
function apiErrorMessage(error: ApiError | undefined, fallback: string): string {
  if (error?.details) {
    const firstDetail = Object.values(error.details).flat()[0];
    if (firstDetail) return firstDetail;
  }
  return error?.message || fallback;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (input: LoginInput) => Promise<AuthUser>;
  mentorSignup: (input: MentorSignupInput) => Promise<AuthUser>;
  join: (
    input: MenteeJoinInput
  ) => Promise<{ user: AuthUser; joinedGroup: { id: string; name: string } }>;
  claimAccount: (input: ClaimAccountInput) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: AUTH_QUERY_KEY,
    queryFn: async () => {
      const res = await authService.me();
      return res.success ? res.data!.user : null;
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const login = React.useCallback(
    async (input: LoginInput) => {
      const res = await authService.login(input);
      if (!res.success) {
        throw new Error(apiErrorMessage(res.error, "Login failed"));
      }
      queryClient.setQueryData(AUTH_QUERY_KEY, res.data!.user);
      return res.data!.user;
    },
    [queryClient]
  );

  const mentorSignup = React.useCallback(
    async (input: MentorSignupInput) => {
      const res = await authService.mentorSignup(input);
      if (!res.success) {
        throw new Error(apiErrorMessage(res.error, "Signup failed"));
      }
      queryClient.setQueryData(AUTH_QUERY_KEY, res.data!.user);
      return res.data!.user;
    },
    [queryClient]
  );

  const join = React.useCallback(
    async (input: MenteeJoinInput) => {
      const res = await authService.join(input);
      if (!res.success) {
        throw new Error(apiErrorMessage(res.error, "Failed to join group"));
      }
      queryClient.setQueryData(AUTH_QUERY_KEY, res.data!.user);
      return { user: res.data!.user, joinedGroup: res.data!.joinedGroup };
    },
    [queryClient]
  );

  const claimAccount = React.useCallback(
    async (input: ClaimAccountInput) => {
      const res = await authService.claimAccount(input);
      if (!res.success) {
        throw new Error(apiErrorMessage(res.error, "Failed to set up login credentials"));
      }
      queryClient.setQueryData(AUTH_QUERY_KEY, res.data!.user);
      return res.data!.user;
    },
    [queryClient]
  );

  const logout = React.useCallback(async () => {
    await authService.logout();
    queryClient.setQueryData(AUTH_QUERY_KEY, null);
    queryClient.clear();
  }, [queryClient]);

  const value = React.useMemo<AuthContextValue>(
    () => ({
      user: data ?? null,
      isLoading,
      isAuthenticated: !!data,
      login,
      mentorSignup,
      join,
      claimAccount,
      logout,
    }),
    [data, isLoading, login, mentorSignup, join, claimAccount, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
