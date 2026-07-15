import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser, hashPassword } from "@/lib/auth";
import { successResponse, errorResponse, parseBody } from "@/lib/api/response";
import { claimAccountSchema, AuditAction } from "@cms/shared";

/**
 * Lets a guest mentee (joined via name + invite code, no email or
 * password) add login credentials to their existing account so they
 * can sign back in from any device later. This updates the same
 * user row in place — it never creates a new account, so every
 * group membership, message, and joined date carries over untouched.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  }
  if (user.email) {
    return errorResponse(
      "Your account already has login credentials",
      "ACCOUNT_ALREADY_CLAIMED",
      409
    );
  }

  const parsed = await parseBody(req, claimAccountSchema);
  if (parsed.error) return parsed.error;

  const { email, password } = parsed.data;

  try {
    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      return errorResponse(
        "An account with this email already exists",
        "EMAIL_EXISTS",
        409
      );
    }

    const hashedPassword = await hashPassword(password);

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { email, password: hashedPassword },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatarUrl: true,
        emailVerified: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: AuditAction.ACCOUNT_CLAIMED,
        entityType: "User",
        entityId: user.id,
      },
    });

    return successResponse({ user: updated });
  } catch (error) {
    console.error("Claim account error:", error);
    return errorResponse("Failed to set up login credentials", "CLAIM_ACCOUNT_ERROR", 500);
  }
}
