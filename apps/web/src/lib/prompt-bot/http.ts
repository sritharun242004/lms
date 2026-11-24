// apps/web/src/lib/prompt-bot/http.ts
import { errorResponse } from "@/lib/api/response";
import { AiNotConfiguredError } from "@/lib/ai/config";
import { LimitReachedError } from "@/lib/ai/usage";

/** Maps AI-layer failures to the spec's status codes. Never echoes prompt text. */
export function aiErrorResponse(error: unknown) {
  if (error instanceof AiNotConfiguredError) {
    return errorResponse("Prompt Bot isn't configured yet.", "AI_NOT_CONFIGURED", 503);
  }
  if (error instanceof LimitReachedError) {
    return errorResponse(
      `You've reached today's limit. It resets at ${error.resetAt.toISOString()}.`,
      "LIMIT_REACHED",
      429,
      { feature: [error.feature], resetAt: [error.resetAt.toISOString()] },
    );
  }
  console.error("[prompt-bot] AI call failed:", error instanceof Error ? error.name : "unknown");
  return errorResponse("The AI couldn't complete that request. Please try again.", "AI_FAILED", 502);
}
