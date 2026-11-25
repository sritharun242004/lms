import { NextRequest, NextResponse } from "next/server";
import {
  verifyAccessToken,
  verifyRefreshToken,
  generateAccessToken,
  generateRefreshToken,
  claimRefreshToken,
  revokeRefreshToken,
  storeRefreshToken,
  getAccessCookieOptions,
  getRefreshCookieOptions,
} from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { isAuthVersionCurrent, isValidJwtSessionClaims, type UserRole } from "@cms/shared";
import { sanitizeReturnPath } from "@/lib/auth/portal-navigation";
import { PROMPT_BOT_DISABLED_MESSAGE, canUsePromptBot } from "@/lib/prompt-bot/access";

// Routes that don't require authentication
const PUBLIC_ROUTES = [
  "/",
  "/login",
  "/signup",
  "/join",
  "/admin/login",
  "/participant/login",
  "/coach/login",
  "/super-admin/login",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  // Legacy address of the landing page (now "/"); next.config redirects it
  // before the proxy runs, kept here so a missed redirect still never
  // bounces a visitor to login.
  "/workshop/x-intelligence",
];

// Public pages a signed-in browser must still reach: emailed links are
// opened on whatever device is handy, which may hold someone else's session.
const SIGNED_IN_REACHABLE_ROUTES = ["/", "/forgot-password", "/reset-password", "/verify-email"];

// API routes that don't require authentication
const PUBLIC_API_ROUTES = [
  "/api/v1/auth/login",
  "/api/v1/auth/admin/login",
  "/api/v1/auth/coach/login",
  "/api/v1/auth/super-admin/login",
  "/api/v1/auth/join",
  "/api/v1/auth/refresh",
  "/api/v1/auth/forgot-password",
  "/api/v1/auth/reset-password",
  "/api/v1/auth/verify-email",
  // Non-secret workshop config (the general post-registration WhatsApp
  // link) — the public registration flow reads this before any auth
  // exists.
  "/api/v1/workshop/config",
];

// API route prefixes that don't require authentication — unlike
// PUBLIC_API_ROUTES' exact matches, these cover a family of routes with
// dynamic segments (a registration code, etc).
const PUBLIC_API_ROUTE_PREFIXES = [
  // Registration creation/lookup, the "Payment Done" self-report, and
  // QR — all used by an anonymous visitor before any account exists.
  // Does not cover /api/v1/admin/registrations, a different, protected
  // prefix.
  "/api/v1/workshop/registrations",
  // Anonymous submissions to a form shared by public link.
  "/api/v1/public/forms",
];

// Pages anyone may open, signed in or not, without being redirected: a
// public form link is opened by participants and staff alike.
const OPEN_ROUTE_PREFIXES = ["/f"];

// Role-based route prefixes
const ROLE_ROUTES: Record<string, UserRole[]> = {
  "/admin": ["ADMIN"] as UserRole[],
  "/mentor": ["ADMIN", "MENTOR"] as UserRole[],
  "/coach": ["ADMIN", "MENTOR"] as UserRole[],
  "/mentee": ["ADMIN", "MENTOR", "MENTEE"] as UserRole[],
  "/dashboard": ["ADMIN", "MENTOR", "MENTEE"] as UserRole[],
  "/questions": ["ADMIN", "MENTOR"] as UserRole[],
  "/prompt-bot": ["ADMIN", "MENTOR", "MENTEE"] as UserRole[],
};

// Prompt Bot pages and APIs: participants need a group an admin turned it on for.
const PROMPT_BOT_PREFIXES = ["/prompt-bot", "/api/v1/prompt-bot"];

function isPromptBotPath(pathname: string): boolean {
  return PROMPT_BOT_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix + "/"));
}

// Landing page redirect by role — mentees have no dashboard, chat is their home.
const ROLE_DASHBOARD: Record<string, string> = {
  ADMIN: "/admin/dashboard",
  MENTOR: "/coach/dashboard",
  MENTEE: "/chat",
};

function unauthenticatedEntry(pathname: string): string {
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return "/admin/login";
  }
  if (pathname === "/mentor" || pathname.startsWith("/mentor/")) {
    return "/admin/login";
  }
  if (pathname === "/coach" || pathname.startsWith("/coach/")) {
    return "/admin/login";
  }
  if (pathname === "/questions" || pathname.startsWith("/questions/") || pathname === "/dashboard") {
    return "/admin/login";
  }
  return "/login";
}

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
  const isPublicApi =
    PUBLIC_API_ROUTES.some((route) => pathname === route) ||
    PUBLIC_API_ROUTE_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(prefix + "/")
    );

  const isOpenRoute = OPEN_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix + "/"));

  if (isPublicApi || isOpenRoute) {
    return NextResponse.next();
  }

  const isApiRoute = pathname.startsWith("/api/");

  const initialToken = request.cookies.get("access_token")?.value ?? null;
  let payload = initialToken ? verifyAccessToken(initialToken) : null;
  let shouldClearAuthCookies = false;
  if (payload && !isValidJwtSessionClaims(payload)) {
    payload = null;
    shouldClearAuthCookies = true;
  }

  // A valid signature is not enough: password resets and deactivation bump
  // authVersion so already-issued access tokens stop authorizing immediately.
  if (payload) {
    const accessUser = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, isActive: true, authVersion: true },
    });
    if (!accessUser?.isActive || !isAuthVersionCurrent(payload.authVersion, accessUser.authVersion)) {
      payload = null;
      shouldClearAuthCookies = true;
    }
  }

  // The access token is short-lived (15 min) by design. Rather than
  // bouncing every user back to /login once it expires, silently rotate
  // it here using the long-lived refresh token — the same way login/
  // refresh-route rotation works, just triggered automatically on the
  // next request instead of requiring the client to call /auth/refresh
  // itself (which nothing in the app did, so sessions used to die at
  // the 15-minute mark). Proxy runs on the Node.js runtime in this
  // Next.js version, so a direct Prisma call here is safe.
  let rotated: { accessToken: string; refreshToken: string; rememberMe: boolean; isNewRefresh: boolean } | null = null;
  if (!payload) {
    const refreshCookie = request.cookies.get("refresh_token")?.value;
    if (refreshCookie) {
      const refreshPayload = verifyRefreshToken(refreshCookie);
      const claim =
        refreshPayload && isValidJwtSessionClaims(refreshPayload)
          ? await claimRefreshToken(refreshCookie)
          : "invalid";
      if (refreshPayload && claim !== "invalid") {
        const user = await prisma.user.findUnique({
          where: { id: refreshPayload.sub },
          select: {
            id: true, name: true, email: true, role: true, isActive: true, authVersion: true,
          },
        });

        if (user?.isActive && isAuthVersionCurrent(refreshPayload.authVersion, user.authVersion)) {
          const rememberMe = Boolean(refreshPayload.rememberMe);
          const newAccessToken = generateAccessToken(user);
          // A request that lost the rotation race keeps the old refresh
          // token: the winner's response is setting its successor.
          let newRefreshToken = refreshCookie;
          if (claim === "rotate") {
            newRefreshToken = generateRefreshToken(user, rememberMe);
            await storeRefreshToken(user.id, newRefreshToken, rememberMe);
          }

          rotated = { accessToken: newAccessToken, refreshToken: newRefreshToken, rememberMe, isNewRefresh: claim === "rotate" };

          // Reflect the rotated token onto the current request so that
          // server components / route handlers rendered after this
          // proxy call (in this same request) see a valid session
          // instead of the stale expired one.
          request.cookies.set("access_token", newAccessToken);
          request.cookies.set("refresh_token", newRefreshToken);

          payload = verifyAccessToken(newAccessToken);
        } else {
          await revokeRefreshToken(refreshCookie);
          shouldClearAuthCookies = true;
        }
      }
    }
  }

  const withRotatedCookies = (response: NextResponse) => {
    if (shouldClearAuthCookies) {
      response.cookies.delete("access_token");
      response.cookies.delete("refresh_token");
    }
    if (rotated) {
      response.cookies.set("access_token", rotated.accessToken, getAccessCookieOptions());
      if (rotated.isNewRefresh) {
        response.cookies.set(
          "refresh_token",
          rotated.refreshToken,
          getRefreshCookieOptions(rotated.rememberMe)
        );
      }
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
          const entryPath = unauthenticatedEntry(pathname);
          const loginUrl = new URL(entryPath, request.url);
          if (entryPath !== "/login") {
            const requestedPath = `${pathname}${request.nextUrl.search}`;
            loginUrl.searchParams.set("redirect", sanitizeReturnPath(requestedPath, pathname));
          }
          return NextResponse.redirect(loginUrl);
        })();
    // Clear whatever's left of a dead session so we don't keep
    // attempting (and paying the DB cost of) a doomed refresh on every
    // subsequent request.
    response.cookies.delete("access_token");
    response.cookies.delete("refresh_token");
    return response;
  }

  // Has a valid token and on public auth page → redirect to dashboard.
  if (payload && isPublicRoute && !SIGNED_IN_REACHABLE_ROUTES.includes(pathname)) {
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

    // Only participants on Prompt Bot paths pay for this lookup; staff skip it.
    if (payload.role === "MENTEE" && isPromptBotPath(pathname)) {
      if (!(await canUsePromptBot({ id: payload.sub, role: payload.role }))) {
        return withRotatedCookies(
          isApiRoute
            ? NextResponse.json(
                { success: false, error: { code: "FORBIDDEN", message: PROMPT_BOT_DISABLED_MESSAGE } },
                { status: 403 }
              )
            : NextResponse.redirect(new URL("/chat", request.url))
        );
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
