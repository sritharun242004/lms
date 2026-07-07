import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  hashPassword,
  generateAccessToken,
  generateRefreshToken,
  setAuthCookies,
  storeRefreshToken,
} from "@/lib/auth";
import {
  successResponse,
  errorResponse,
  parseBody,
} from "@/lib/api/response";
import { mentorSignupSchema, AuditAction } from "@lms/shared";

/**
 * Mentor/admin self-registration. Mentees never use this route — they
 * join a group directly via `/api/v1/auth/join` with just a name and
 * invite code, no account required.
 */
export async function POST(req: NextRequest) {
  const parsed = await parseBody(req, mentorSignupSchema);
  if (parsed.error) return parsed.error;

  const { name, email, password } = parsed.data;

  try {
    const existingEmail = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existingEmail) {
      return errorResponse(
        "An account with this email already exists",
        "EMAIL_EXISTS",
        409
      );
    }

    const hashedPassword = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: "MENTOR",
        status: "ONLINE",
        lastSeenAt: new Date(),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatarUrl: true,
        emailVerified: true,
      },
    });

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    await storeRefreshToken(user.id, refreshToken);
    await setAuthCookies(accessToken, refreshToken);

    await prisma.session.create({
      data: {
        userId: user.id,
        userAgent: req.headers.get("user-agent") || undefined,
        ipAddress:
          req.headers.get("x-forwarded-for")?.split(",")[0] ||
          req.headers.get("x-real-ip") ||
          undefined,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: AuditAction.USER_SIGNUP,
        entityType: "User",
        entityId: user.id,
        metadata: { role: "MENTOR" },
      },
    });

    return successResponse({ user, accessToken, refreshToken }, undefined, 201);
  } catch (error) {
    console.error("Mentor signup error:", error);
    return errorResponse("An error occurred during signup", "SIGNUP_ERROR", 500);
  }
}
