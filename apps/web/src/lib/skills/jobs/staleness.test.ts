import { describe, expect, it } from "vitest";
import { analysisCutoff, generationCutoff, isAnalysing, isGenerating } from "./staleness";

const NOW = new Date("2026-11-25T12:00:00Z");
const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60_000);

describe("staleness", () => {
  it("treats analysis older than 5 minutes as interrupted", () => {
    expect(analysisCutoff(NOW)).toEqual(minutesAgo(5));
    expect(isAnalysing("PENDING", minutesAgo(4), NOW)).toBe(true);
    expect(isAnalysing("PENDING", minutesAgo(6), NOW)).toBe(false);
    expect(isAnalysing("PENDING", null, NOW)).toBe(false);
    expect(isAnalysing("READY", minutesAgo(1), NOW)).toBe(false);
  });

  it("treats generation older than 10 minutes as interrupted", () => {
    expect(generationCutoff(NOW)).toEqual(minutesAgo(10));
    expect(isGenerating("GENERATING", minutesAgo(9), NOW)).toBe(true);
    expect(isGenerating("GENERATING", minutesAgo(11), NOW)).toBe(false);
    expect(isGenerating("READY", minutesAgo(1), NOW)).toBe(false);
  });
});
