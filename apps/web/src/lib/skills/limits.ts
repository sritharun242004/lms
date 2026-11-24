/** Every resource bound of the Skills Builder, in one place. Pure constants: safe for client components. */

/** Agent Skills rules (Anthropic skill-creator validator, verified 2026-11-24) and the stored-size limits. */
export const SKILL_LIMITS = {
  /** The spec's per-file limit. */
  fileBytes: 200 * 1024,
  /** Tighter than the spec's 1 MB ceiling: a pack of PACK_LIMITS.items skills stays near 10 MB in memory. */
  skillBytes: 512 * 1024,
  files: 100,
  pathChars: 200,
  nameChars: 64,
  descriptionChars: 1024,
  compatibilityChars: 500,
} as const;

/** Items (custom and catalog) per pack; the split's own caps fit inside it. */
export const PACK_LIMITS = { items: 20 } as const;
export const MAX_CUSTOM_SKILLS = 8;
export const MAX_CATALOG_MATCHES = 6;

/** PATCH /files body: one skill's bytes plus JSON escaping headroom, checked before the body is parsed. */
export const FILES_REQUEST_BYTES = 2 * 1024 * 1024;

/** One generation call (run in after()); a run makes at most two. */
export const GENERATION_TIMEOUT_MS = 240_000;
/**
 * A GENERATING item older than this was interrupted (for example by a deploy) and may be generated again.
 * Two bounded attempts (2 x 240 s) plus database writes fit inside it.
 */
export const GENERATION_STALE_MS = 10 * 60_000;
