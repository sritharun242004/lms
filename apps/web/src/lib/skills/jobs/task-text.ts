import { JOB_LIMITS } from "../limits";

/** Words separated by any whitespace. */
export function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/** The description length the 500-character rule counts (trimmed). */
export function descriptionLength(description: string): number {
  return description.trim().length;
}

export function tooShortMessage(length: number): string {
  return `Add a bit more detail — at least ${JOB_LIMITS.descriptionMinChars} characters (${length}/${JOB_LIMITS.descriptionMinChars})`;
}

/** "Questions for an Instagram carousel"; null when the output type is unknown. */
export function outputTypeHeading(outputType: string | null | undefined): string | null {
  const label = outputType?.trim();
  if (!label) return null;
  return `Questions for ${/^[aeiou]/i.test(label) ? "an" : "a"} ${label}`;
}
