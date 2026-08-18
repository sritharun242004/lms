import { describe, expect, it } from "vitest";
import { normalizeWord } from "./normalize";
import { isStopWord } from "./stop-words";

describe("normalizeWord", () => {
  it("preserves submitted letter casing while trimming", () => {
    expect(normalizeWord("  Creative  ")).toBe("Creative");
  });

  it("keeps case variants as distinct stored and displayed values", () => {
    const variants = ["Creative", "creative", "CREATIVE"];
    const normalized = new Set(variants.map(normalizeWord));
    expect(normalized).toEqual(new Set(["Creative", "creative", "CREATIVE"]));
  });

  it("strips punctuation without changing letter casing", () => {
    expect(normalizeWord("Creative,")).toBe("Creative");
  });

  it("keeps stop-word checks case-insensitive after normalization", () => {
    expect(isStopWord(normalizeWord("THE"))).toBe(true);
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
