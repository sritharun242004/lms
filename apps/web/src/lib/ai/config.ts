/** Models chosen with the product owner (spec, 2026-11-24). */
export const FAST_MODEL = "claude-haiku-4-5";
export const BEST_MODEL = "claude-opus-5-5";

export function isAiConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.ANTHROPIC_API_KEY?.trim());
}

export class AiNotConfiguredError extends Error {
  constructor() {
    super("ANTHROPIC_API_KEY is not set");
    this.name = "AiNotConfiguredError";
  }
}
