import type { MemberRole } from "@prisma/client";

export type SharedKind = "media" | "documents" | "links";

export const SHARED_KINDS: readonly SharedKind[] = ["media", "documents", "links"];

export function isSharedKind(value: string | null): value is SharedKind {
  return value !== null && (SHARED_KINDS as readonly string[]).includes(value);
}

/** Images and videos are "media"; everything else attached to a message is a document. */
export function isMediaMimeType(mimeType: string): boolean {
  return mimeType.startsWith("image/") || mimeType.startsWith("video/");
}

/** Group-level role label. Owners and mentors manage the group; everyone else participates. */
export function memberRoleLabel(role: MemberRole | string): "Admin" | "Participant" {
  return role === "OWNER" || role === "MENTOR" ? "Admin" : "Participant";
}

export interface ExtractedLink {
  url: string;
  domain: string;
}

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"'`]+/gi;
const TRAILING_PUNCTUATION = /[.,;:!?)\]}'"]+$/;

/**
 * Pull http(s) links out of message text. Trailing sentence punctuation is not
 * part of the link, only absolute http/https URLs are returned (never
 * javascript:, data: or file:), and repeats within one message are collapsed.
 */
export function extractLinks(text: string): ExtractedLink[] {
  const found = new Map<string, ExtractedLink>();
  for (const match of text.matchAll(URL_PATTERN)) {
    const candidate = match[0].replace(TRAILING_PUNCTUATION, "");
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
      if (!found.has(parsed.href)) {
        found.set(parsed.href, { url: parsed.href, domain: parsed.hostname.replace(/^www\./, "") });
      }
    } catch {
      // Not a valid URL after all; ignore it.
    }
  }
  return [...found.values()];
}

export function clampLimit(raw: string | null, fallback = 30, max = 50): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

export function attachmentUrl(groupId: string, messageId: string): string {
  return `/api/v1/groups/${groupId}/messages/${messageId}/attachment`;
}
