import { describe, expect, it } from "vitest";
import { containsProfanity, defaultProfanityFilter } from "./profanity-filter";
import { normalizeWord } from "./normalize";

describe("containsProfanity", () => {
  it("flags a blocked word", () => {
    expect(containsProfanity(normalizeWord("Shit"))).toBe(true);
  });

  it("flags a blocked word within a multi-word phrase", () => {
    expect(containsProfanity(normalizeWord("oh dick move"))).toBe(true);
  });

  it("does not flag clean words", () => {
    expect(containsProfanity(normalizeWord("creative"))).toBe(false);
    expect(containsProfanity(normalizeWord("teamwork"))).toBe(false);
  });

  it("supports swapping in a custom filter", () => {
    const alwaysClean = { check: () => false };
    expect(containsProfanity(normalizeWord("shit"), alwaysClean)).toBe(false);
  });

  it("defaultProfanityFilter.check matches containsProfanity with no override", () => {
    const word = normalizeWord("bastard");
    expect(defaultProfanityFilter.check(word)).toBe(containsProfanity(word));
  });
});
