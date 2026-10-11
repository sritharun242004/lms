import { describe, expect, it } from "vitest";
import { wrapLabel, wrapLabelBy } from "./poll-bar-label";

describe("wrapLabel", () => {
  it("keeps a short label on one line", () => {
    expect(wrapLabel("Yes", 10)).toEqual(["Yes"]);
  });

  it("wraps at word boundaries without exceeding the limit", () => {
    const lines = wrapLabel("Data readiness and architecture", 12);
    expect(lines).toEqual(["Data", "readiness", "and", "architecture"]);
    expect(wrapLabel("Process clarity and reimagination", 16)).toEqual(["Process clarity", "and", "reimagination"]);
    expect(lines.every((line) => line.length <= 12)).toBe(true);
  });

  it("hard-splits an unbroken string instead of overflowing", () => {
    const lines = wrapLabel("Supercalifragilisticexpialidocious", 10);
    expect(lines.every((line) => line.length <= 10)).toBe(true);
    expect(lines.join("")).toBe("Supercalifragilisticexpialidocious");
  });

  it("never drops or reorders characters, for any text and width", () => {
    const samples = [
      "A very long sentence with many short words and a-few-hyphenated-compounds",
      "12345678901234567890 mixed123abc !!! ??? #hash",
      "https://example.com/" + "a".repeat(50),
      "日本語のとても長い回答テキスト ✓ 100%",
      "🚀🚀🚀🚀🚀 emoji rocket test",
    ];
    for (const text of samples) {
      for (const width of [1, 3, 7, 12, 40]) {
        const lines = wrapLabel(text, width);
        expect(lines.join("").replace(/\s+/g, "")).toBe(text.replace(/\s+/g, ""));
        for (const line of lines) expect(Array.from(line).length).toBeLessThanOrEqual(width);
      }
    }
  });

  it("is safe for empty and whitespace-only labels", () => {
    expect(wrapLabel("", 8)).toEqual([""]);
    expect(wrapLabel("   ", 8)).toEqual([""]);
  });
});

describe("wrapLabelBy (measured width)", () => {
  // 7px per character; a "line" may be at most 70px wide
  const fits = (s: string) => Array.from(s).length * 7 <= 70;

  it("keeps a 12-character word whole when it fits the measured width", () => {
    const wide = (s: string) => Array.from(s).length * 5 <= 70; // 14 chars fit
    expect(wrapLabelBy("Data readiness and architecture", wide)).toEqual(["Data readiness", "and", "architecture"]);
  });

  it("splits only words that genuinely cannot fit, and never loses characters", () => {
    const lines = wrapLabelBy("short " + "x".repeat(25) + " end", fits);
    expect(lines.join("").replace(/\s/g, "")).toBe("short" + "x".repeat(25) + "end");
    expect(lines.every((line) => fits(line))).toBe(true);
  });

  it("always terminates, even when nothing fits", () => {
    expect(wrapLabelBy("abc def", () => false).join("")).toBe("abcdef");
  });
});

describe("forced splits are balanced", () => {
  const fits = (s: string) => Array.from(s).length <= 12;

  it("does not strand a single character on the last line", () => {
    const lines = wrapLabelBy("reimagination", (s) => Array.from(s).length <= 12);
    expect(lines.join("")).toBe("reimagination");
    expect(lines).toHaveLength(2);
    expect(Math.min(...lines.map((l) => l.length))).toBeGreaterThanOrEqual(3);
  });

  it("still fills lines greedily when the tail is reasonable", () => {
    expect(wrapLabelBy("a".repeat(30), fits)).toEqual(["a".repeat(12), "a".repeat(12), "a".repeat(6)]);
  });
});
