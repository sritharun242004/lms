import { z } from "zod";
import type { SkillFile } from "./types";

/** A skill's text files as stored in JSON columns (legacy pack items and job skill versions). */
const StoredFiles = z.array(z.object({ path: z.string(), content: z.string() }));

/** Stored JSON is parsed before it is shown or zipped: null when there are no files or they can't be read. */
export function parseStoredFiles(value: unknown): SkillFile[] | null {
  if (value === null || value === undefined) return null;
  const parsed = StoredFiles.safeParse(value);
  return parsed.success ? parsed.data : null;
}
