import type { UserRole } from "@cms/shared";

export type AuthPortal = "participant" | "coach" | "super-admin";

const LOGIN_PATHS: Record<AuthPortal, string> = {
  participant: "/participant/login",
  coach: "/coach/login",
  "super-admin": "/super-admin/login",
};

const PORTAL_PATHS: Record<AuthPortal, readonly string[]> = {
  participant: ["/dashboard", "/chat", "/mentee", "/profile"],
  coach: ["/dashboard", "/mentor", "/questions", "/chat", "/profile"],
  "super-admin": ["/dashboard", "/admin", "/questions", "/chat", "/profile"],
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
  return value === "coach" || value === "super-admin" || value === "participant"
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
  return sanitizeReturnPath(value, "/dashboard", PORTAL_PATHS[portal]);
}
