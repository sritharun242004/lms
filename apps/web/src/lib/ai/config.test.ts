import { describe, expect, it } from "vitest";
import { AiNotConfiguredError, BEST_MODEL, FAST_MODEL, isAiConfigured } from "./config";

describe("AI configuration", () => {
  it("uses Haiku 4.5 for fast work and Opus 5.5 for output", () => {
    expect(FAST_MODEL).toBe("claude-haiku-4-5");
    expect(BEST_MODEL).toBe("claude-opus-5-5");
  });

  it("is configured only when ANTHROPIC_API_KEY has a non-blank value", () => {
    expect(isAiConfigured({ ANTHROPIC_API_KEY: "sk-ant-test" })).toBe(true);
    expect(isAiConfigured({ ANTHROPIC_API_KEY: "   " })).toBe(false);
    expect(isAiConfigured({})).toBe(false);
  });

  it("has a dedicated error type for the missing key", () => {
    const error = new AiNotConfiguredError();
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("AiNotConfiguredError");
  });
});
