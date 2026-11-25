/** Pure text helpers for the Task step, shared by the server and the UI (spec 2026-11-25 tasks, Step 1). */
import { JOB_LIMITS } from "../limits";

export function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/** The length the 500-character rule measures: the trimmed description. */
export function descriptionLength(text: string): number {
  return text.trim().length;
}

/** "Add a bit more detail — at least 500 characters (312/500)" (the server appends a full stop). */
export function tooShortMessage(length: number): string {
  const min = JOB_LIMITS.descriptionMinChars;
  return `Add a bit more detail — at least ${min} characters (${length}/${min})`;
}

/** "Questions for an Instagram carousel"; null when the output type is unknown. */
export function outputTypeHeading(outputType: string | null | undefined): string | null {
  const label = outputType?.trim();
  if (!label) return null;
  const article = /^[aeiou]/i.test(label) ? "an" : "a";
  return `Questions for ${article} ${label}`;
}
