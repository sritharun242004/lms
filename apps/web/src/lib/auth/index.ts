import jwt, { type SignOptions } from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { cookies } from "next/headers";
import type { JwtPayload, AuthUser, UserRole } from "@lms/shared";
import { prisma } from "@/lib/db/prisma";

// ============================================================
// CONFIGURATION
// ============================================================

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production";
const JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || "dev-refresh-secret-change-in-production";
const JWT_ACCESS_EXPIRY_RAW = process.env.JWT_ACCESS_EXPIRY || "15m";
const JWT_REFRESH_EXPIRY_RAW = process.env.JWT_REFRESH_EXPIRY || "7d";
const JWT_REFRESH_EXPIRY_REMEMBER_RAW =
  process.env.JWT_REFRESH_EXPIRY_REMEMBER || "30d";
const JWT_ACCESS_EXPIRY = JWT_ACCESS_EXPIRY_RAW as SignOptions["expiresIn"];
const JWT_REFRESH_EXPIRY = JWT_REFRESH_EXPIRY_RAW as SignOptions["expiresIn"];
const JWT_REFRESH_EXPIRY_REMEMBER =
  JWT_REFRESH_EXPIRY_REMEMBER_RAW as SignOptions["expiresIn"];
const SALT_ROUNDS = 12;

const ACCESS_COOKIE_MAX_AGE = 15 * 60; // 15 minutes, matches JWT_ACCESS_EXPIRY
const REFRESH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days
const REFRESH_COOKIE_MAX_AGE_REMEMBER = 30 * 24 * 60 * 60; // 30 days

// A duration string like "7d" or "15m" parsed to milliseconds, for
// computing the DB-stored refresh token expiry (kept in sync with the
// JWT's own expiresIn so a token isn't rejected by the DB before the
// signature even goes stale, or vice versa).
function parseDurationMs(duration: string): number {
  const match = /^(\d+)([smhd])$/.exec(duration);
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const value = parseInt(match[1], 10);
  const unitMs = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2]]!;
  return value * unitMs;
}

// ============================================================
// PASSWORD HASHING
// ============================================================

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ============================================================
// JWT TOKEN GENERATION
// ============================================================

export function generateAccessToken(user: {
  id: string;
  name: string;
  email: string | null;
  role: UserRole | string;
}): string {
  return jwt.sign(
    {
      sub: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: JWT_ACCESS_EXPIRY }
  );
}

export function generateRefreshToken(
  user: {
    id: string;
    name: string;
    email: string | null;
    role: UserRole | string;
  },
  rememberMe = false
): string {
  return jwt.sign(
    {
      sub: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      rememberMe,
    },
    JWT_REFRESH_SECRET,
    { expiresIn: rememberMe ? JWT_REFRESH_EXPIRY_REMEMBER : JWT_REFRESH_EXPIRY }
  );
}

// ============================================================
// JWT TOKEN VERIFICATION
// ============================================================

export function verifyAccessToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

export function verifyRefreshToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

// ============================================================
// COOKIE MANAGEMENT
// ============================================================

// Shared with proxy.ts, which sets these same cookies on a NextResponse
// (a different API surface than the next/headers `cookies()` store used
// here) when it silently rotates an expired access token.
export function getAccessCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: ACCESS_COOKIE_MAX_AGE,
  };
}

export function getRefreshCookieOptions(rememberMe = false) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: rememberMe ? REFRESH_COOKIE_MAX_AGE_REMEMBER : REFRESH_COOKIE_MAX_AGE,
  };
}

export async function setAuthCookies(
  accessToken: string,
  refreshToken: string,
  rememberMe = false
) {
  const cookieStore = await cookies();

  cookieStore.set("access_token", accessToken, getAccessCookieOptions());
  cookieStore.set("refresh_token", refreshToken, getRefreshCookieOptions(rememberMe));
}

export async function clearAuthCookies() {
  const cookieStore = await cookies();
  cookieStore.delete("access_token");
  cookieStore.delete("refresh_token");
}

export async function getAccessTokenFromCookies(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("access_token")?.value ?? null;
}

export async function getRefreshTokenFromCookies(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("refresh_token")?.value ?? null;
}

// ============================================================
// CURRENT USER
// ============================================================

/**
 * Get the currently authenticated user from cookies.
 * Returns null if not authenticated.
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const token = await getAccessTokenFromCookies();
  if (!token) return null;

  const payload = verifyAccessToken(token);
  if (!payload) return null;

  try {
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatarUrl: true,
        emailVerified: true,
      },
    });

    if (!user) return null;

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role as UserRole,
      avatarUrl: user.avatarUrl,
      emailVerified: user.emailVerified,
    };
  } catch {
    return null;
  }
}

/**
 * Require authentication. Throws if not authenticated.
 */
export async function requireAuth(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("UNAUTHORIZED");
  }
  return user;
}

/**
 * Require a specific role. Throws if role doesn't match.
 */
export async function requireRole(...roles: UserRole[]): Promise<AuthUser> {
  const user = await requireAuth();
  if (!roles.includes(user.role)) {
    throw new Error("FORBIDDEN");
  }
  return user;
}

// ============================================================
// REFRESH TOKEN STORAGE
// ============================================================

export async function storeRefreshToken(
  userId: string,
  token: string,
  rememberMe = false
): Promise<void> {
  const expiresIn = parseDurationMs(
    rememberMe ? JWT_REFRESH_EXPIRY_REMEMBER_RAW : JWT_REFRESH_EXPIRY_RAW
  );

  await prisma.refreshToken.create({
    data: {
      token,
      userId,
      expiresAt: new Date(Date.now() + expiresIn),
    },
  });
}

export async function revokeRefreshToken(token: string): Promise<void> {
  await prisma.refreshToken.deleteMany({
    where: { token },
  });
}

export async function revokeAllUserRefreshTokens(
  userId: string
): Promise<void> {
  await prisma.refreshToken.deleteMany({
    where: { userId },
  });
}

export async function isRefreshTokenValid(token: string): Promise<boolean> {
  const stored = await prisma.refreshToken.findUnique({
    where: { token },
  });

  if (!stored) return false;
  if (stored.expiresAt < new Date()) {
    // Clean up expired token
    await prisma.refreshToken.delete({ where: { id: stored.id } });
    return false;
  }

  return true;
}

// ============================================================
// PASSWORD RESET TOKENS
// ============================================================

const PASSWORD_RESET_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

/**
 * Generates a password reset token pair: a random raw token to email
 * to the user, and its SHA-256 hash to persist in the database.
 * Only the hash is ever stored, so a database leak can't be used
 * to reset accounts.
 */
export function generatePasswordResetToken(): {
  token: string;
  hash: string;
  expiresAt: Date;
} {
  const token = crypto.randomBytes(32).toString("hex");
  const hash = hashPasswordResetToken(token);
  return { token, hash, expiresAt: new Date(Date.now() + PASSWORD_RESET_EXPIRY_MS) };
}

export function hashPasswordResetToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
