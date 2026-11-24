import Anthropic from "@anthropic-ai/sdk";

/** The API answered, but the reply can't be used: it stopped early, had no text, or wasn't the requested JSON. */
export class AiResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiResponseError";
  }
}

/** A failure of the AI call itself (SDK transport/status errors or an unusable reply), as opposed to our own code or data. */
export function isAiCallError(error: unknown): boolean {
  return error instanceof AiResponseError || error instanceof Anthropic.AnthropicError;
}
