import { describe, expect, it } from "vitest";
import { normalizeWord } from "./normalize";

describe("normalizeWord", () => {
  it("lowercases and trims", () => {
    expect(normalizeWord("  Creative  ")).toBe("creative");
  });

  it("collapses case/punctuation variants to the same value", () => {
    const variants = ["Creative", "creative", "CREATIVE", "creative.", "creative,"];
    const normalized = new Set(variants.map(normalizeWord));
    expect(normalized.size).toBe(1);
    expect([...normalized][0]).toBe("creative");
  });

  it("keeps internal hyphens for short phrases", () => {
    expect(normalizeWord("well-being")).toBe("well-being");
  });

  it("collapses repeated internal whitespace to a single space", () => {
    expect(normalizeWord("team   work")).toBe("team work");
  });

  it("strips punctuation that isn't a letter, number, space, or hyphen", () => {
    expect(normalizeWord("wow!!! #amazing")).toBe("wow amazing");
  });
});
