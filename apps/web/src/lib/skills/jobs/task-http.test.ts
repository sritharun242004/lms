import { describe, expect, it } from "vitest";
import * as E from "./errors";
import { jobErrorResponse } from "./http";

async function body(res: Response | null) {
  expect(res).not.toBeNull();
  return { status: res!.status, ...(await res!.json()).error };
}

describe("task errors", () => {
  it.each([
    [new E.QuestionNotFoundError(), 404, "NOT_FOUND", "Question not found"],
    [new E.TooManyQuestionsError("FIXED"), 409, "TOO_MANY_QUESTIONS", "A task can have at most 12 questions to answer now. Remove one to add another."],
    [new E.TooManyQuestionsError("PER_USE"), 409, "TOO_MANY_QUESTIONS", "A task can have at most 15 inputs asked each time. Remove one to add another."],
    [new E.DescriptionTooShortError(312), 400, "DESCRIPTION_TOO_SHORT", "Add a bit more detail — at least 500 characters (312/500)."],
    [new E.EnhanceInputTooShortError(), 400, "VALIDATION_ERROR", "Write at least 5 words about the task first."],
    [new E.PerUseLabelTooLongError(), 400, "VALIDATION_ERROR", "An input's name can be up to 120 characters."],
  ])("maps %o", async (error, status, code, message) => {
    expect(await body(jobErrorResponse(error))).toEqual({ status, code, message });
  });

  it("keeps the names that logs carry", () => {
    expect(new E.DescriptionTooShortError(3).name).toBe("DescriptionTooShortError");
    expect(new E.TooManyQuestionsError("FIXED").kind).toBe("FIXED");
  });
});
