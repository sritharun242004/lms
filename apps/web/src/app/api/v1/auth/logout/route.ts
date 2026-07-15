import { prisma } from "@/lib/db/prisma";
import {
  clearAuthCookies,
  getAccessTokenFromCookies,
  getRefreshTokenFromCookies,
  revokeRefreshToken,
  verifyAccessToken,
} from "@/lib/auth";
import { successResponse } from "@/lib/api/response";
import { AuditAction } from "@cms/shared";

export async function POST() {
  try {
    // Get tokens
    const accessToken = await getAccessTokenFromCookies();
    const refreshToken = await getRefreshTokenFromCookies();

    let userId: string | null = null;

    if (accessToken) {
      const payload = verifyAccessToken(accessToken);
      if (payload) {
        userId = payload.sub;
      }
    }

    // Revoke refresh token from database
    if (refreshToken) {
      await revokeRefreshToken(refreshToken);
    }

    // Update user status
    if (userId) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          status: "OFFLINE",
          lastSeenAt: new Date(),
        },
      });

      // Deactivate current session
      await prisma.session.updateMany({
        where: {
          userId,
          isActive: true,
        },
        data: {
          isActive: false,
          lastActiveAt: new Date(),
        },
      });

      // Audit log
      await prisma.auditLog.create({
        data: {
          userId,
          action: AuditAction.USER_LOGOUT,
          entityType: "User",
          entityId: userId,
        },
      });
    }

    // Clear cookies
    await clearAuthCookies();

    return successResponse({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error);
    // Still clear cookies even on error
    await clearAuthCookies();
    return successResponse({ message: "Logged out" });
  }
}
