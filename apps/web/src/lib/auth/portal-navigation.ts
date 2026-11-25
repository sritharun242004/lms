import type { UserRole } from "@cms/shared";

export type AuthPortal = "participant" | "coach" | "super-admin" | "admin";

const LOGIN_PATHS: Record<AuthPortal, string> = {
  participant: "/login",
  coach: "/admin/login",
  "super-admin": "/admin/login",
  admin: "/admin/login",
};

// Where each portal may send someone back to after signing in. A section
// missing here silently lands people on their dashboard instead (e.g. a coach
// whose session expired mid-edit in the form builder), so add new sections.
const PORTAL_PATHS: Record<AuthPortal, readonly string[]> = {
  participant: ["/dashboard", "/chat", "/mentee", "/profile", "/prompt-bot", "/forms/fill"],
  coach: ["/dashboard", "/coach", "/mentor", "/questions", "/chat", "/profile", "/prompt-bot", "/forms", "/feedback"],
  "super-admin": ["/dashboard", "/admin", "/questions", "/chat", "/profile", "/prompt-bot", "/forms", "/feedback"],
  admin: ["/dashboard", "/admin", "/coach", "/mentor", "/questions", "/chat", "/profile", "/prompt-bot", "/forms", "/feedback"],
};

function pathMatchesPrefix(value: string, prefix: string): boolean {
  const pathname = value.split(/[?#]/, 1)[0];
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function isUnsafePath(value: string): boolean {
  if (!value.startsWith("/") || value.startsWith("//")) return true;
  if (value.includes("\\") || value.includes("//")) return true;
  if (/\s$|^\s|[\u0000-\u001f\u007f]/.test(value)) return true;
  const pathname = value.split(/[?#]/, 1)[0];
  if (pathname.split("/").some((segment) => segment === "." || segment === "..")) return true;
  return /(?:^|[/?#&=])(?:javascript|data|vbscript|https?|ftp):/i.test(value);
}

export function sanitizeReturnPath(
  value: string | null | undefined,
  fallback: string,
  allowedPrefixes?: readonly string[]
): string {
  if (!value || isUnsafePath(value)) return fallback;

  let inspected = value;
  for (let index = 0; index < 4; index += 1) {
    try {
      const decoded = decodeURIComponent(inspected);
      if (decoded === inspected) break;
      inspected = decoded;
      if (isUnsafePath(inspected)) return fallback;
    } catch {
      return fallback;
    }
  }

  if (allowedPrefixes && !allowedPrefixes.some((prefix) => pathMatchesPrefix(value, prefix))) {
    return fallback;
  }
  return value;
}

export function parseAuthPortal(value: string | null | undefined): AuthPortal {
  return value === "coach" || value === "super-admin" || value === "participant" || value === "admin"
    ? value
    : "participant";
}

export function canonicalLoginPath(portal: AuthPortal): string {
  return LOGIN_PATHS[portal];
}

export function portalForRole(role: UserRole | string): AuthPortal {
  if (role === "ADMIN") return "super-admin";
  if (role === "MENTOR") return "coach";
  return "participant";
}

export function safePortalDestination(
  portal: AuthPortal,
  value: string | null | undefined
): string {
  const fallback = portal === "coach"
    ? "/coach/dashboard"
    : portal === "super-admin"
      ? "/admin/dashboard"
      : portal === "participant"
        ? "/"
        : "/admin/login";
  return sanitizeReturnPath(value, fallback, PORTAL_PATHS[portal]);
}

/**
 * Leaves the app with a full page load, dropping the client router cache and
 * every in-memory singleton (socket, query cache) the signed-out user had.
 */
export function leaveToLogin(path: string): void {
  window.location.replace(path);
}

/** Where an old coach / super-admin login link should send someone now. */
export function staffLoginRedirect(returnTo: string | undefined): string {
  const safe = sanitizeReturnPath(returnTo, "");
  return safe ? `/admin/login?redirect=${encodeURIComponent(safe)}` : "/admin/login";
}
