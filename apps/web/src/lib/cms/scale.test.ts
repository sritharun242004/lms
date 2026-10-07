import { describe, expect, it } from "vitest";
import {
  computeScaleStats,
  normalizeScaleStatements,
  normalizeScaleTemplateDraft,
  validateScaleResponses,
} from "./scale";

describe("Scale template normalization", () => {
  it("creates a Scale template with a default maximum of 5", () => {
    const draft = normalizeScaleTemplateDraft({ name: " Lecture check ", statements: [{ text: " I understand. " }] });
    expect(draft).toEqual({ name: "Lecture check", type: "SCALE", question: "I understand.", statements: [{ text: "I understand.", max: 5 }] });
  });

  it("accepts maxima of 7 and 10 and multiple ordered statements", () => {
    const statements = normalizeScaleStatements([{ text: "A", max: 7 }, { text: "B", max: 10 }, { text: "C" }]);
    expect(statements).toEqual([{ text: "A", max: 7 }, { text: "B", max: 10 }, { text: "C", max: 5 }]);
  });

  it.each([0, -3, 11, 2.5])("rejects invalid maximum %s", (max) => {
    expect(() => normalizeScaleStatements([{ text: "A", max }])).toThrow(/Maximum/);
  });

  it("rejects empty statements, empty lists, empty names and oversize lists", () => {
    expect(() => normalizeScaleStatements([{ text: "  " }])).toThrow(/required/);
    expect(() => normalizeScaleStatements([])).toThrow(/at least one/);
    expect(() => normalizeScaleStatements(Array.from({ length: 11 }, () => ({ text: "x" })))).toThrow(/at most/);
    expect(() => normalizeScaleTemplateDraft({ name: " ", statements: [{ text: "A" }] })).toThrow(/name/);
  });
});

describe("validateScaleResponses", () => {
  const statements = [{ id: "s1", min: 0, max: 5 }, { id: "s2", min: 0, max: 10 }];

  it("accepts 0, the maximum, and every integer between", () => {
    for (let value = 0; value <= 5; value += 1) {
      expect(validateScaleResponses(statements, [{ statementId: "s1", value }]).ok).toBe(true);
    }
    expect(validateScaleResponses(statements, [{ statementId: "s2", value: 10 }]).ok).toBe(true);
  });

  it("rejects out-of-range values against each statement's own maximum", () => {
    expect(validateScaleResponses(statements, [{ statementId: "s1", value: 6 }]).ok).toBe(false);
    expect(validateScaleResponses(statements, [{ statementId: "s1", value: -1 }]).ok).toBe(false);
    expect(validateScaleResponses(statements, [{ statementId: "s2", value: 11 }]).ok).toBe(false);
  });

  it("rejects non-integers, unknown statement ids and duplicates", () => {
    expect(validateScaleResponses(statements, [{ statementId: "s1", value: 2.5 }]).ok).toBe(false);
    expect(validateScaleResponses(statements, [{ statementId: "other", value: 1 }]).ok).toBe(false);
    expect(validateScaleResponses(statements, [{ statementId: "s1", value: 1 }, { statementId: "s1", value: 2 }]).ok).toBe(false);
  });
});

describe("computeScaleStats", () => {
  it("summarises count, average, min, max and distribution (0 counts as an answer)", () => {
    const stats = computeScaleStats({ min: 0, max: 5 }, [0, 3, 3, 5]);
    expect(stats).toEqual({ count: 4, average: 2.75, min: 0, max: 5, distribution: [1, 0, 0, 2, 0, 1] });
  });

  it("returns an empty summary when there are no responses", () => {
    expect(computeScaleStats({ min: 0, max: 3 }, [])).toEqual({ count: 0, average: null, min: null, max: null, distribution: [0, 0, 0, 0] });
  });
});
