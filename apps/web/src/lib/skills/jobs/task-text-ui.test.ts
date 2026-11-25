import { describe, expect, it } from "vitest";
import { descriptionLength, outputTypeHeading, tooShortMessage, wordCount } from "./task-text";

// Track B's copy of the A1 contract helpers; Track A's task-text.test.ts is the owner's suite.
describe("task text helpers (UI contract)", () => {
  it("counts words over mixed whitespace and trims the description length", () => {
    expect(wordCount("  one\ttwo\n\nthree  four five ")).toBe(5);
    expect(wordCount("   ")).toBe(0);
    expect(descriptionLength("  abc \n")).toBe(3);
  });
  it("writes the 500-character message", () => {
    expect(tooShortMessage(312)).toBe("Add a bit more detail — at least 500 characters (312/500)");
  });
  it("heads the questions with a or an", () => {
    expect(outputTypeHeading("Instagram carousel")).toBe("Questions for an Instagram carousel");
    expect(outputTypeHeading("client SLA document")).toBe("Questions for a client SLA document");
    expect(outputTypeHeading(null)).toBeNull();
    expect(outputTypeHeading("  ")).toBeNull();
  });
});
