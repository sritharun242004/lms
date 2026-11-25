import { describe, expect, it } from "vitest";
import { initialAnswers } from "./prefill";

const instructor = { id: "q1", type: "SHORT_ANSWER", config: { defaultValue: "MN1494" } };
const location = { id: "q2", type: "SHORT_ANSWER", config: { urlParam: "location" } };

describe("initialAnswers", () => {
  it("uses a question's pre-filled answer", () => {
    expect(initialAnswers([instructor])).toEqual({ q1: "MN1494" });
  });

  it("fills a question from its link parameter", () => {
    expect(initialAnswers([location], { location: "Chennai" })).toEqual({ q2: "Chennai" });
  });

  it("prefers the link value over the pre-filled answer", () => {
    const both = { id: "q3", type: "SHORT_ANSWER", config: { defaultValue: "Chennai", urlParam: "location" } };
    expect(initialAnswers([both], { location: "Bengaluru" })).toEqual({ q3: "Bengaluru" });
    expect(initialAnswers([both], { location: "  " })).toEqual({ q3: "Chennai" });
  });

  it("leaves questions without a prefill, and non-text questions, empty", () => {
    expect(initialAnswers([{ id: "q4", type: "SHORT_ANSWER", config: {} }, { id: "q5", type: "DATE", config: { defaultValue: "x" } }], {})).toEqual({});
  });

  it("caps a link value to the question's character limit", () => {
    const short = { id: "q6", type: "SHORT_ANSWER", config: { urlParam: "c", maxLength: 3 } };
    expect(initialAnswers([short], { c: "Chennai" })).toEqual({ q6: "Che" });
  });

  it("takes the first value when a parameter repeats", () => {
    expect(initialAnswers([location], { location: ["Chennai", "Delhi"] })).toEqual({ q2: "Chennai" });
  });
});
