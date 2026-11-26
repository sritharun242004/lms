import type { NextRequest } from "next/server";
import { errorResponse } from "@/lib/api/response";

// Fixed-window counters held in this server instance's memory. There is no
// shared store (Redis) in this deployment, so each App Runner instance
// counts separately and a deploy resets the counts. That still turns an
// unlimited brute force into a slow one, which is the point; move this to a
// shared store if the service ever runs many instances.
const windows = new Map<string, { count: number; resetAt: number }>();
const MAX_TRACKED_KEYS = 50_000;

export interface RateLimitRule {
  limit: number;
  windowMs: number;
}

const MINUTE = 60_000;

export const RATE_LIMITS = {
  // Per account: guessing one staff member's password.
  loginPerAccount: { limit: 10, windowMs: 15 * MINUTE },
  // Per IP: spraying many accounts.
  loginPerIp: { limit: 60, windowMs: 15 * MINUTE },
  // A whole workshop room joins from one venue Wi-Fi IP within minutes,
  // so this stays generous; it only has to make guessing codes impractical.
  joinPerIp: { limit: 300, windowMs: 10 * MINUTE },
  resetPasswordPerIp: { limit: 20, windowMs: 15 * MINUTE },
  // A whole workshop room can submit from one venue Wi-Fi IP at the end of
  // a session, so this only stops scripted floods.
  publicFormSubmitPerIp: { limit: 120, windowMs: 10 * MINUTE },
  // Same reasoning as publicFormSubmitPerIp, kept separate since an upload
  // is a heavier request than a plain answer submission.
  publicFileUploadPerIp: { limit: 120, windowMs: 10 * MINUTE },
} satisfies Record<string, RateLimitRule>;

/** Counts one attempt against `key`; returns seconds to wait when over the limit. */
export function hitRateLimit(key: string, rule: RateLimitRule, now = Date.now()): number | null {
  const current = windows.get(key);
  if (!current || current.resetAt <= now) {
    if (windows.size >= MAX_TRACKED_KEYS) evictExpired(now);
    windows.set(key, { count: 1, resetAt: now + rule.windowMs });
    return null;
  }
  current.count += 1;
  if (current.count <= rule.limit) return null;
  return Math.ceil((current.resetAt - now) / 1000);
}

/** Forgets a key, e.g. once a login succeeds, so earlier typos don't count. */
export function clearRateLimit(key: string): void {
  windows.delete(key);
}

function evictExpired(now: number) {
  for (const [key, entry] of windows) {
    if (entry.resetAt <= now) windows.delete(key);
  }
  // Still full of live windows: drop the oldest rather than grow unbounded.
  if (windows.size >= MAX_TRACKED_KEYS) {
    const oldest = windows.keys().next().value;
    if (oldest !== undefined) windows.delete(oldest);
  }
}

export function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

export function tooManyAttempts(retryAfterSeconds: number) {
  const response = errorResponse(
    "Too many attempts. Please wait a few minutes and try again.",
    "RATE_LIMITED",
    429
  );
  response.headers.set("Retry-After", String(retryAfterSeconds));
  return response;
}

/** Test seam: forget every window. */
export function resetRateLimitsForTests(): void {
  windows.clear();
}
