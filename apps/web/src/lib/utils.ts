import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  format,
  formatDistanceToNow,
  isToday,
  isYesterday,
  isThisWeek,
  isThisYear,
} from "date-fns";

// ─── Class-name helper (shadcn standard) ──────────────────────
/**
 * Merge Tailwind classes with intelligent deduplication.
 * Wraps `clsx` (conditional joining) + `tailwind-merge` (conflict resolution).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

// ─── Date formatting ──────────────────────────────────────────
/**
 * Formats a date into a human-friendly string.
 * - Today → "Today at 2:30 PM"
 * - Yesterday → "Yesterday at 9:15 AM"
 * - This week → "Monday at 4:00 PM"
 * - This year → "Mar 12 at 10:00 AM"
 * - Older → "Mar 12, 2024"
 */
export function formatDate(date: Date | string | number): string {
  const d = new Date(date);

  if (isToday(d)) {
    return `Today at ${format(d, "h:mm a")}`;
  }
  if (isYesterday(d)) {
    return `Yesterday at ${format(d, "h:mm a")}`;
  }
  if (isThisWeek(d)) {
    return format(d, "EEEE 'at' h:mm a");
  }
  if (isThisYear(d)) {
    return format(d, "MMM d 'at' h:mm a");
  }
  return format(d, "MMM d, yyyy");
}

/**
 * Returns a human-readable relative time string.
 * e.g. "2 hours ago", "in 3 days", "just now"
 */
export function formatRelativeTime(
  date: Date | string | number,
  options?: { addSuffix?: boolean }
): string {
  const d = new Date(date);
  const diffMs = Date.now() - d.getTime();

  // Less than 30 seconds → "just now"
  if (Math.abs(diffMs) < 30_000) {
    return "just now";
  }

  return formatDistanceToNow(d, {
    addSuffix: options?.addSuffix ?? true,
  });
}

// ─── Invite code generator ────────────────────────────────────
/**
 * Generates a random invite code.
 * @param prefix — Defaults to `"LMS"`
 * @param length — Character count after the prefix. Defaults to `4`.
 * @returns e.g. `"LMS-A8KD"` or `"MENTOR-X3P9"`
 */
export function generateInviteCode(
  prefix: string = "LMS",
  length: number = 4
): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/1/O/0 to avoid ambiguity
  let code = "";
  const crypto =
    typeof globalThis.crypto !== "undefined" ? globalThis.crypto : undefined;

  for (let i = 0; i < length; i++) {
    if (crypto) {
      const array = new Uint32Array(1);
      crypto.getRandomValues(array);
      code += chars[array[0] % chars.length];
    } else {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
  }

  return `${prefix}-${code}`;
}

// ─── Text helpers ─────────────────────────────────────────────
/**
 * Truncate text to `maxLength` characters, appending an ellipsis if truncated.
 */
export function truncateText(
  text: string,
  maxLength: number,
  suffix: string = "…"
): string {
  if (text.length <= maxLength) return text;
  // Don't cut in the middle of a word — find the last space before limit
  const trimmed = text.slice(0, maxLength);
  const lastSpace = trimmed.lastIndexOf(" ");
  const cutPoint = lastSpace > maxLength * 0.6 ? lastSpace : maxLength;
  return trimmed.slice(0, cutPoint).trimEnd() + suffix;
}

/**
 * Extract initials from a name string.
 * "John Doe" → "JD", "alice" → "A", "Mary Jane Watson" → "MW"
 */
export function getInitials(name: string, maxInitials: number = 2): string {
  if (!name.trim()) return "";

  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase())
    .slice(0, maxInitials)
    .join("");
}

// ─── Async utilities ──────────────────────────────────────────
/**
 * Returns a promise that resolves after `ms` milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Debounce ─────────────────────────────────────────────────
/**
 * Creates a debounced version of a function.
 * The debounced function delays invoking `fn` until after `delayMs`
 * milliseconds have elapsed since the last time it was called.
 *
 * The returned function also exposes `.cancel()` and `.flush()` methods.
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delayMs: number
): {
  (...args: Parameters<T>): void;
  cancel: () => void;
  flush: () => void;
} {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let latestArgs: Parameters<T> | null = null;

  const debounced = (...args: Parameters<T>) => {
    latestArgs = args;
    if (timeoutId !== null) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      timeoutId = null;
      fn(...args);
      latestArgs = null;
    }, delayMs);
  };

  debounced.cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
      latestArgs = null;
    }
  };

  debounced.flush = () => {
    if (timeoutId !== null && latestArgs !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
      fn(...latestArgs);
      latestArgs = null;
    }
  };

  return debounced;
}
