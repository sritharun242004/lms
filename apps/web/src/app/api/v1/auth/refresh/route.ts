import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  verifyRefreshToken,
  generateAccessToken,
  generateRefreshToken as generateNewRefreshToken,
  setAuthCookies,
  storeRefreshToken,
  revokeRefreshToken,
  isRefreshTokenValid,
  getRefreshTokenFromCookies,
  clearAuthCookies,
} from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/api/response";

export async function POST(req: NextRequest) {
  try {
    // Get refresh token from cookies or body
    let token: string | null = null;

    try {
      const body = await req.json();
      token = body.refreshToken || null;
    } catch {
      // No body, check cookies
    }

    if (!token) {
      token = await getRefreshTokenFromCookies();
    }

    if (!token) {
      return errorResponse(
        "No refresh token provided",
        "NO_REFRESH_TOKEN",
        401
      );
    }

    // Verify the token cryptographically
    const payload = verifyRefreshToken(token);
    if (!payload) {
      return errorResponse(
        "Invalid or expired refresh token",
        "INVALID_REFRESH_TOKEN",
        401
      );
    }

    // Check if token exists in database (not revoked)
    const isValid = await isRefreshTokenValid(token);
    if (!isValid) {
      return errorResponse(
        "Refresh token has been revoked",
        "REVOKED_REFRESH_TOKEN",
        401
      );
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatarUrl: true,
        emailVerified: true,
        isActive: true,
        authVersion: true,
      },
    });

    if (!user) {
      return errorResponse("User not found", "USER_NOT_FOUND", 401);
    }

    if (!user.isActive) {
      await revokeRefreshToken(token);
      await clearAuthCookies();
      return errorResponse("This account has been deactivated", "ACCOUNT_DISABLED", 401);
    }

    if (payload.authVersion !== user.authVersion) {
      await revokeRefreshToken(token);
      await clearAuthCookies();
      return errorResponse("This session is no longer valid", "STALE_SESSION", 401);
    }

    // Rotate tokens (revoke old, issue new), carrying the original
    // "remember me" choice forward so the new refresh token doesn't
    // silently downgrade to the short-lived expiry.
    const rememberMe = Boolean(payload.rememberMe);
    await revokeRefreshToken(token);

    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateNewRefreshToken(user, rememberMe);

    await storeRefreshToken(user.id, newRefreshToken, rememberMe);
    await setAuthCookies(newAccessToken, newRefreshToken, rememberMe);

    const publicUser = {
      id: user.id, name: user.name, email: user.email, role: user.role,
      avatarUrl: user.avatarUrl, emailVerified: user.emailVerified,
    };

    return successResponse({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      user: publicUser,
    });
  } catch (error) {
    console.error("Token refresh error:", error);
    return errorResponse(
      "An error occurred during token refresh",
      "REFRESH_ERROR",
      500
    );
  }
}
