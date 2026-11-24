/** Every resource bound of the Skills Builder, in one place. Pure constants: safe for client components. */

/** One generation call (run in after()); a run makes at most two. */
export const GENERATION_TIMEOUT_MS = 240_000;
/**
 * A GENERATING item older than this was interrupted (for example by a deploy) and may be generated again.
 * Two bounded attempts (2 x 240 s) plus database writes fit inside it.
 */
export const GENERATION_STALE_MS = 10 * 60_000;
