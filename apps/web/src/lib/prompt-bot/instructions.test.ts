import { describe, expect, it } from "vitest";
import { buildEnhanceMessage, buildScoringText, ENHANCE_SYSTEM, type PromptQuestionContext } from "./instructions";

const questions: PromptQuestionContext[] = [
  { id: "q1", text: "Why are we doing this?", guidance: "Reason", answer: "To win a client", score: 3, notRelevant: false },
  { id: "q2", text: "Who is the target audience?", guidance: "Audience", answer: "", score: 1, notRelevant: false },
  { id: "q3", text: "Where will this image be published?", guidance: "Channel", answer: "", score: 0, notRelevant: true },
];

describe("prompt bot instructions", () => {
  it("scores the base prompt together with every relevant answer", () => {
    const text = buildScoringText("Write a cold email", questions);
    expect(text).toContain("Write a cold email");
    expect(text).toContain("Why are we doing this?\nTo win a client");
    expect(text).not.toContain("Where will this image be published?");
  });

  it("lists answered context and unanswered gaps, excluding not-relevant questions", () => {
    const message = buildEnhanceMessage("Write a cold email", questions);
    expect(message).toContain("<basic_prompt>\nWrite a cold email\n</basic_prompt>");
    expect(message).toContain("To win a client");
    expect(message).toMatch(/<gaps>[\s\S]*Who is the target audience\?[\s\S]*<\/gaps>/);
    expect(message).not.toContain("Where will this image be published?");
  });

  it("asks for the Elements of LLM Prompts sections in order with placeholders for gaps", () => {
    const order = ["Persona", "Context", "Data", "Output expectations", "Iteration request", "Examples"];
    const positions = order.map((h) => ENHANCE_SYSTEM.indexOf(`## ${h}`));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(ENHANCE_SYSTEM).toContain("[bracketed placeholders]");
  });
});
