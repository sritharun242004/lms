import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  hashPassword,
  hashPasswordResetToken,
  revokeAllUserRefreshTokens,
} from "@/lib/auth";
import { successResponse, errorResponse, parseBody } from "@/lib/api/response";
import { resetPasswordSchema, AuditAction } from "@cms/shared";

export async function POST(req: NextRequest) {
  const parsed = await parseBody(req, resetPasswordSchema);
  if (parsed.error) return parsed.error;

  const { token, password } = parsed.data;

  try {
    const hash = hashPasswordResetToken(token);

    const user = await prisma.user.findFirst({
      where: {
        passwordResetToken: hash,
        passwordResetExpiry: { gt: new Date() },
      },
      select: { id: true },
    });

    if (!user) {
      return errorResponse(
        "This password reset link is invalid or has expired",
        "INVALID_RESET_TOKEN",
        400
      );
    }

    const hashedPassword = await hashPassword(password);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          password: hashedPassword,
          passwordResetToken: null,
          passwordResetExpiry: null,
        },
      }),
      prisma.auditLog.create({
        data: {
          userId: user.id,
          action: AuditAction.PASSWORD_RESET,
          entityType: "User",
          entityId: user.id,
        },
      }),
    ]);

    // Force re-authentication on every device after a password reset.
    await revokeAllUserRefreshTokens(user.id);

    return successResponse({
      message: "Password reset successful. Please log in with your new password.",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    return errorResponse(
      "An error occurred while resetting your password",
      "RESET_PASSWORD_ERROR",
      500
    );
  }
}
