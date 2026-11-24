import { describe, expect, it } from "vitest";
import {
  clampScore,
  isTicked,
  readiness,
  sanitizeScores,
  shouldApplyRevision,
  unansweredQuestionIds,
} from "./scoring";

describe("clampScore", () => {
  it.each([
    [2, 2],
    [3.7, 3],
    [-1, 0],
    [9, 3],
    ["2", 2],
    [Number.NaN, 0],
    [null, 0],
  ])("clamps %s to %s", (input, expected) => {
    expect(clampScore(input)).toBe(expected);
  });
});

describe("isTicked", () => {
  it("ticks only fully answered relevant questions", () => {
    expect(isTicked({ score: 3, notRelevant: false })).toBe(true);
    expect(isTicked({ score: 2, notRelevant: false })).toBe(false);
    expect(isTicked({ score: 3, notRelevant: true })).toBe(false);
  });
});

describe("readiness", () => {
  it("ignores not-relevant questions and counts 3/3 answers", () => {
    const result = readiness([
      { score: 3, notRelevant: false },
      { score: 1, notRelevant: false },
      { score: 0, notRelevant: true },
      { score: 2, notRelevant: false },
    ]);
    expect(result).toEqual({ answered: 1, relevant: 3, ratio: 6 / 9 });
  });

  it("is zero, not NaN, when every question is not relevant", () => {
    expect(readiness([{ score: 0, notRelevant: true }])).toEqual({ answered: 0, relevant: 0, ratio: 0 });
  });
});

describe("sanitizeScores", () => {
  const valid = new Set(["q1", "q2"]);

  it("drops unknown ids and malformed rows, clamps scores and trims reasons", () => {
    const result = sanitizeScores(
      [
        { questionId: "q1", score: 5, reason: "  Fully covered.  " },
        { questionId: "nope", score: 2, reason: "x" },
        { questionId: "q2", score: 1, reason: "a".repeat(400) },
        { nonsense: true },
      ],
      valid,
    );
    expect(result).toEqual([
      { questionId: "q1", score: 3, reason: "Fully covered." },
      { questionId: "q2", score: 1, reason: "a".repeat(160) },
    ]);
  });

  it("keeps the first result when the model repeats an id", () => {
    const result = sanitizeScores(
      [
        { questionId: "q1", score: 1, reason: "first" },
        { questionId: "q1", score: 3, reason: "second" },
      ],
      valid,
    );
    expect(result).toEqual([{ questionId: "q1", score: 1, reason: "first" }]);
  });
});

describe("shouldApplyRevision", () => {
  it("applies equal or newer revisions only", () => {
    expect(shouldApplyRevision(5, 4)).toBe(true);
    expect(shouldApplyRevision(5, 5)).toBe(true);
    expect(shouldApplyRevision(4, 5)).toBe(false);
  });
});

describe("unansweredQuestionIds", () => {
  it("lists relevant questions below 3", () => {
    expect(
      unansweredQuestionIds([
        { questionId: "a", score: 3, notRelevant: false },
        { questionId: "b", score: 2, notRelevant: false },
        { questionId: "c", score: 0, notRelevant: true },
      ]),
    ).toEqual(["b"]);
  });
});
