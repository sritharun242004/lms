// Shared by the public page and its submit route so the two never drift.

/** The field the public page hides from people; only bots fill it in. */
export const HONEYPOT_FIELD = "website";

export function publicFormPath(formId: string): string {
  return `/f/${formId}`;
}
