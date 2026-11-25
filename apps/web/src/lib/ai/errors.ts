import Anthropic from "@anthropic-ai/sdk";

/** The API answered, but the reply can't be used: it stopped early, had no text, or wasn't the requested JSON. */
export class AiResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiResponseError";
  }
}

/**
 * Claude refused the request itself with a 400 (for a file analysis: usually a PDF it cannot read).
 * The SDK error is the cause; the message never echoes it, since it can quote the request.
 */
export class AiBadRequestError extends Error {
  constructor(options?: { cause?: unknown }) {
    super("Claude rejected the request", options);
    this.name = "AiBadRequestError";
  }
}

/** A failure of the AI call itself (SDK transport/status errors or an unusable reply), as opposed to our own code or data. */
export function isAiCallError(error: unknown): boolean {
  return error instanceof AiResponseError || error instanceof AiBadRequestError || error instanceof Anthropic.AnthropicError;
}
