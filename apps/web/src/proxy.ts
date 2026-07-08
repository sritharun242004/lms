import { NextRequest, NextResponse } from "next/server";
import {
  verifyAccessToken,
  verifyRefreshToken,
  generateAccessToken,
  generateRefreshToken,
  isRefreshTokenValid,
  revokeRefreshToken,
  storeRefreshToken,
  getAccessCookieOptions,
  getRefreshCookieOptions,
} from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import type { UserRole } from "@lms/shared";

// Routes that don't require authentication
const PUBLIC_ROUTES = [
  "/",
  "/login",
  "/join",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
];

// API routes that don't require authentication
const PUBLIC_API_ROUTES = [
  "/api/v1/auth/login",
  "/api/v1/auth/join",
  "/api/v1/auth/refresh",
  "/api/v1/auth/forgot-password",
  "/api/v1/auth/reset-password",
  "/api/v1/auth/verify-email",
];

// Role-based route prefixes
const ROLE_ROUTES: Record<string, UserRole[]> = {
  "/admin": ["ADMIN"] as UserRole[],
  "/mentor": ["ADMIN", "MENTOR"] as UserRole[],
  "/mentee": ["ADMIN", "MENTOR", "MENTEE"] as UserRole[],
  "/dashboard": ["ADMIN", "MENTOR", "MENTEE"] as UserRole[],
};

// Landing page redirect by role — mentees have no dashboard, chat is their home.
const ROLE_DASHBOARD: Record<string, string> = {
  ADMIN: "/admin/dashboard",
  MENTOR: "/mentor/dashboard",
  MENTEE: "/chat",
};

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip static assets and Next.js internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // Check if route is public
  const isPublicRoute = PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );
  const isPublicApi = PUBLIC_API_ROUTES.some(
    (route) => pathname === route
  );

  if (isPublicApi) {
    return NextResponse.next();
  }

  const isApiRoute = pathname.startsWith("/api/");

  const initialToken = request.cookies.get("access_token")?.value ?? null;
  let payload = initialToken ? verifyAccessToken(initialToken) : null;

  // The access token is short-lived (15 min) by design. Rather than
  // bouncing every user back to /login once it expires, silently rotate
  // it here using the long-lived refresh token — the same way login/
  // refresh-route rotation works, just triggered automatically on the
  // next request instead of requiring the client to call /auth/refresh
  // itself (which nothing in the app did, so sessions used to die at
  // the 15-minute mark). Proxy runs on the Node.js runtime in this
  // Next.js version, so a direct Prisma call here is safe.
  let rotated: { accessToken: string; refreshToken: string; rememberMe: boolean } | null = null;
  if (!payload) {
    const refreshCookie = request.cookies.get("refresh_token")?.value;
    if (refreshCookie) {
      const refreshPayload = verifyRefreshToken(refreshCookie);
      if (refreshPayload && (await isRefreshTokenValid(refreshCookie))) {
        const user = await prisma.user.findUnique({
          where: { id: refreshPayload.sub },
          select: { id: true, name: true, email: true, role: true },
        });

        if (user) {
          const rememberMe = Boolean(refreshPayload.rememberMe);
          await revokeRefreshToken(refreshCookie);

          const newAccessToken = generateAccessToken(user);
          const newRefreshToken = generateRefreshToken(user, rememberMe);
          await storeRefreshToken(user.id, newRefreshToken, rememberMe);

          rotated = { accessToken: newAccessToken, refreshToken: newRefreshToken, rememberMe };

          // Reflect the rotated token onto the current request so that
          // server components / route handlers rendered after this
          // proxy call (in this same request) see a valid session
          // instead of the stale expired one.
          request.cookies.set("access_token", newAccessToken);
          request.cookies.set("refresh_token", newRefreshToken);

          payload = verifyAccessToken(newAccessToken);
        }
      }
    }
  }

  const withRotatedCookies = (response: NextResponse) => {
    if (rotated) {
      response.cookies.set("access_token", rotated.accessToken, getAccessCookieOptions());
      response.cookies.set(
        "refresh_token",
        rotated.refreshToken,
        getRefreshCookieOptions(rotated.rememberMe)
      );
    }
    return response;
  };

  const requestHeaders = new Headers(request.headers);
  const nextWithHeaders = (init?: Parameters<typeof NextResponse.next>[0]) =>
    NextResponse.next({ ...init, request: { headers: requestHeaders } });

  // No valid token (missing, expired, or refresh failed) and private
  // route → redirect to login (or 401 JSON for APIs, since a fetch()
  // call following an HTML redirect can't be parsed as JSON).
  if (!payload && !isPublicRoute) {
    const response = isApiRoute
      ? NextResponse.json(
          { success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } },
          { status: 401 }
        )
      : (() => {
          const loginUrl = new URL("/login", request.url);
          loginUrl.searchParams.set("redirect", pathname);
          return NextResponse.redirect(loginUrl);
        })();
    // Clear whatever's left of a dead session so we don't keep
    // attempting (and paying the DB cost of) a doomed refresh on every
    // subsequent request.
    response.cookies.delete("access_token");
    response.cookies.delete("refresh_token");
    return response;
  }

  // Has a valid token and on public auth page → redirect to dashboard
  if (payload && isPublicRoute && pathname !== "/") {
    const dashboard = ROLE_DASHBOARD[payload.role] || "/dashboard";
    return withRotatedCookies(NextResponse.redirect(new URL(dashboard, request.url)));
  }

  // Verify access for protected routes
  if (payload && !isPublicRoute) {
    // Check role-based access
    for (const [prefix, allowedRoles] of Object.entries(ROLE_ROUTES)) {
      if (pathname.startsWith(prefix)) {
        if (!allowedRoles.includes(payload.role as UserRole)) {
          const dashboard = ROLE_DASHBOARD[payload.role] || "/dashboard";
          return withRotatedCookies(NextResponse.redirect(new URL(dashboard, request.url)));
        }
        break;
      }
    }

    // Attach user info to headers for downstream use
    requestHeaders.set("x-user-id", payload.sub);
    if (payload.email) {
      requestHeaders.set("x-user-email", payload.email);
    }
    requestHeaders.set("x-user-role", payload.role);

    return withRotatedCookies(nextWithHeaders());
  }

  return withRotatedCookies(nextWithHeaders());
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
