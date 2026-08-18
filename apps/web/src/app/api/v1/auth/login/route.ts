import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  verifyPassword,
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
import { loginSchema, AuditAction } from "@cms/shared";

type StaffLoginRole = "MENTOR" | "ADMIN";

const ROLE_BY_LOGIN_PATH: Record<string, StaffLoginRole> = {
  "/api/v1/auth/coach/login": "MENTOR",
  "/api/v1/auth/super-admin/login": "ADMIN",
};

export async function loginForRole(req: NextRequest, expectedRole: StaffLoginRole) {
  // Parse and validate body
  const parsed = await parseBody(req, loginSchema);
  if (parsed.error) return parsed.error;

  const { email, password, rememberMe } = parsed.data;

  try {
    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        password: true,
        role: true,
        avatarUrl: true,
        emailVerified: true,
        status: true,
      },
    });

    if (!user || !user.password) {
      // No password hash means this is a guest mentee account (joined via
      // name + invite code) — it has no password to check against.
      return errorResponse("Invalid email or password", "INVALID_CREDENTIALS", 401);
    }

    // Verify password
    const isValid = await verifyPassword(password, user.password);
    if (!isValid) {
      return errorResponse("Invalid email or password", "INVALID_CREDENTIALS", 401);
    }

    if (user.role !== expectedRole) {
      return errorResponse("These credentials belong to a different staff portal", "WRONG_PORTAL", 403);
    }

    // Generate tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user, rememberMe);

    // Store refresh token
    await storeRefreshToken(user.id, refreshToken, rememberMe);

    // Set cookies
    await setAuthCookies(accessToken, refreshToken, rememberMe);

    // Bookkeeping (presence, session record, audit log) is best-effort: the
    // user is already authenticated and cookied above, so a failure here
    // must not turn a successful login into a 500 for the client.
    const ipAddress =
      req.headers.get("x-forwarded-for")?.split(",")[0] ||
      req.headers.get("x-real-ip") ||
      undefined;

    const bookkeeping = await Promise.allSettled([
      prisma.user.update({
        where: { id: user.id },
        data: { status: "ONLINE", lastSeenAt: new Date() },
      }),
      prisma.session.create({
        data: {
          userId: user.id,
          userAgent: req.headers.get("user-agent") || undefined,
          ipAddress,
        },
      }),
      prisma.auditLog.create({
        data: {
          userId: user.id,
          action: AuditAction.USER_LOGIN,
          entityType: "User",
          entityId: user.id,
          ipAddress,
        },
      }),
    ]);
    bookkeeping
      .filter((r) => r.status === "rejected")
      .forEach((r) => console.error("Login bookkeeping failed:", r.reason));

    return successResponse({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatarUrl: user.avatarUrl,
        emailVerified: user.emailVerified,
      },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error("Login error:", error);
    return errorResponse("An error occurred during login", "LOGIN_ERROR", 500);
  }
}

export async function POST(req: NextRequest) {
  const expectedRole = ROLE_BY_LOGIN_PATH[req.nextUrl.pathname];
  if (!expectedRole) {
    return errorResponse("Choose the coach or Super Admin login portal", "PORTAL_REQUIRED", 404);
  }
  return loginForRole(req, expectedRole);
}
