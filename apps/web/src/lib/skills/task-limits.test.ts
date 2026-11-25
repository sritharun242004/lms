import { describe, expect, it } from "vitest";
import { ENHANCE_TIMEOUT_MS, JOB_LIMITS, QUESTIONS_TIMEOUT_MS } from "./limits";

describe("task limits", () => {
  it("carries the tasks spec's values", () => {
    expect(JOB_LIMITS.descriptionMinChars).toBe(500);
    expect(JOB_LIMITS.enhanceMinWords).toBe(5);
    expect(JOB_LIMITS.aiQuestionsMax).toBe(8);
    expect(JOB_LIMITS.questionsPerTask).toBe(12);
    expect(JOB_LIMITS.aiPerUseMax).toBe(10);
    expect(JOB_LIMITS.perUseInputsPerTask).toBe(15);
    expect(JOB_LIMITS.questionTextChars).toBe(300);
    expect(JOB_LIMITS.perUseLabelChars).toBe(120);
    expect(JOB_LIMITS.questionGuidanceChars).toBe(300);
    expect(JOB_LIMITS.fileNoteChars).toBe(120);
    expect(JOB_LIMITS.outputTypeChars).toBe(60);
  });

  it("keeps both in-request calls under App Runner's 120 s", () => {
    expect(ENHANCE_TIMEOUT_MS).toBe(45_000);
    expect(QUESTIONS_TIMEOUT_MS).toBe(90_000);
    expect(ENHANCE_TIMEOUT_MS * 2).toBeLessThan(120_000);
    expect(QUESTIONS_TIMEOUT_MS).toBeLessThan(120_000);
  });
});
