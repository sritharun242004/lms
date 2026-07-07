import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/auth";
import type { UserRole } from "@lms/shared";

// Routes that don't require authentication
const PUBLIC_ROUTES = [
  "/",
  "/login",
  "/signup",
  "/join",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
];

// API routes that don't require authentication
const PUBLIC_API_ROUTES = [
  "/api/v1/auth/login",
  "/api/v1/auth/signup",
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

export function proxy(request: NextRequest) {
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

  // Get access token from cookies
  const token = request.cookies.get("access_token")?.value;

  // No token and private route → redirect to login (or 401 JSON for APIs,
  // since a fetch() call following an HTML redirect can't be parsed as JSON)
  if (!token && !isPublicRoute) {
    if (isApiRoute) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        { status: 401 }
      );
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Has token and on public auth page → redirect to dashboard
  if (token && isPublicRoute && pathname !== "/") {
    const payload = verifyAccessToken(token);
    if (payload) {
      const dashboard = ROLE_DASHBOARD[payload.role] || "/dashboard";
      return NextResponse.redirect(new URL(dashboard, request.url));
    }
  }

  // Verify token for protected routes
  if (token && !isPublicRoute) {
    const payload = verifyAccessToken(token);

    if (!payload) {
      // Token invalid/expired
      if (isApiRoute) {
        const response = NextResponse.json(
          { success: false, error: { code: "TOKEN_EXPIRED", message: "Access token expired" } },
          { status: 401 }
        );
        response.cookies.delete("access_token");
        return response;
      }
      // Non-API route → clear cookie and redirect to login
      const response = NextResponse.redirect(
        new URL("/login", request.url)
      );
      response.cookies.delete("access_token");
      return response;
    }

    // Check role-based access
    for (const [prefix, allowedRoles] of Object.entries(ROLE_ROUTES)) {
      if (pathname.startsWith(prefix)) {
        if (!allowedRoles.includes(payload.role as UserRole)) {
          const dashboard = ROLE_DASHBOARD[payload.role] || "/dashboard";
          return NextResponse.redirect(new URL(dashboard, request.url));
        }
        break;
      }
    }

    // Attach user info to headers for downstream use
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-user-id", payload.sub);
    if (payload.email) {
      requestHeaders.set("x-user-email", payload.email);
    }
    requestHeaders.set("x-user-role", payload.role);

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }

  return NextResponse.next();
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
