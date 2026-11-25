import { describe, expect, it } from "vitest";
import { descriptionLength, outputTypeHeading, tooShortMessage, wordCount } from "./task-text";

describe("task text helpers", () => {
  it("counts words over mixed whitespace", () => {
    expect(wordCount("")).toBe(0);
    expect(wordCount("   \n\t ")).toBe(0);
    expect(wordCount("one")).toBe(1);
    expect(wordCount("  one\ttwo\n\nthree   four\r\nfive ")).toBe(5);
  });

  it("measures the trimmed description", () => {
    expect(descriptionLength("  abc \n")).toBe(3);
    expect(descriptionLength("")).toBe(0);
  });

  it("writes the 500-character message", () => {
    expect(tooShortMessage(312)).toBe("Add a bit more detail — at least 500 characters (312/500)");
  });

  it("titles the questions by output type with a or an", () => {
    expect(outputTypeHeading("Instagram carousel")).toBe("Questions for an Instagram carousel");
    expect(outputTypeHeading("client SLA document")).toBe("Questions for a client SLA document");
    expect(outputTypeHeading("explainer video")).toBe("Questions for an explainer video");
    expect(outputTypeHeading("  monthly financial report ")).toBe("Questions for a monthly financial report");
    expect(outputTypeHeading(null)).toBeNull();
    expect(outputTypeHeading("   ")).toBeNull();
  });
});
