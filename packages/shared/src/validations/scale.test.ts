import { describe, expect, it } from "vitest";
import { MessageType, SCALE_DEFAULT_MAX, SCALE_MIN } from "../constants";
import { createScaleSchema, submitScaleSchema } from "./index";

describe("createScaleSchema", () => {
  it("defaults the maximum to 5 and the minimum constant to 0", () => {
    const parsed = createScaleSchema.parse({ statements: [{ text: "I understand today's lecture." }] });
    expect(SCALE_MIN).toBe(0);
    expect(SCALE_DEFAULT_MAX).toBe(5);
    expect(parsed.statements[0]).toEqual({ text: "I understand today's lecture.", max: 5 });
  });

  it.each([1, 5, 7, 10])("accepts a maximum of %i", (max) => {
    expect(createScaleSchema.safeParse({ statements: [{ text: "Statement", max }] }).success).toBe(true);
  });

  it.each([0, -1, 11, 100, 2.5, Number.NaN])("rejects an invalid maximum of %s", (max) => {
    expect(createScaleSchema.safeParse({ statements: [{ text: "Statement", max }] }).success).toBe(false);
  });

  it("rejects empty and whitespace-only statements", () => {
    expect(createScaleSchema.safeParse({ statements: [{ text: "" }] }).success).toBe(false);
    expect(createScaleSchema.safeParse({ statements: [{ text: "   " }] }).success).toBe(false);
  });

  it("requires at least one statement and caps the count", () => {
    expect(createScaleSchema.safeParse({ statements: [] }).success).toBe(false);
    const many = Array.from({ length: 11 }, (_, i) => ({ text: `Statement ${i}` }));
    expect(createScaleSchema.safeParse({ statements: many }).success).toBe(false);
  });

  it("keeps multiple statements in order with independent maxima", () => {
    const parsed = createScaleSchema.parse({
      statements: [{ text: "One", max: 5 }, { text: "Two", max: 10 }, { text: "Three" }],
    });
    expect(parsed.statements.map((s) => [s.text, s.max])).toEqual([["One", 5], ["Two", 10], ["Three", 5]]);
  });
});

describe("submitScaleSchema", () => {
  it("treats 0 as a real answer", () => {
    expect(submitScaleSchema.safeParse({ responses: [{ statementId: "s1", value: 0 }] }).success).toBe(true);
  });

  it("rejects non-integer, negative, and missing values", () => {
    expect(submitScaleSchema.safeParse({ responses: [{ statementId: "s1", value: 2.5 }] }).success).toBe(false);
    expect(submitScaleSchema.safeParse({ responses: [{ statementId: "s1", value: -1 }] }).success).toBe(false);
    expect(submitScaleSchema.safeParse({ responses: [{ statementId: "s1" }] }).success).toBe(false);
    expect(submitScaleSchema.safeParse({ responses: [] }).success).toBe(false);
  });
});

describe("MessageType", () => {
  it("adds SCALE without changing the existing values", () => {
    expect(MessageType.SCALE).toBe("SCALE");
    expect(MessageType.POLL).toBe("POLL");
    expect(MessageType.WORD_CLOUD).toBe("WORD_CLOUD");
    expect(MessageType.OPEN_QUESTION).toBe("OPEN_QUESTION");
  });
});
