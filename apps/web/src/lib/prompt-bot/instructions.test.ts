import { describe, expect, it } from "vitest";
import { buildEnhanceMessage, buildScoringText, ENHANCE_SYSTEM, INSTRUCTIONS_VERSION, type PromptQuestionContext } from "./instructions";

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

  const rule = (heading: string) => ENHANCE_SYSTEM.split("\n").find((line) => line.startsWith(`- ## ${heading}:`))!;

  it("asks for the detailed-prompt sections in order, Persona, Context and Instructions always", () => {
    const order = ["Persona", "Context", "Data/Details", "Plan", "Instructions"];
    const positions = order.map((h) => ENHANCE_SYSTEM.indexOf(`## ${h}\n`));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(ENHANCE_SYSTEM).toMatch(/Always include ## Persona, ## Context and ## Instructions/);
    expect(ENHANCE_SYSTEM).toMatch(/Omit ## Data\/Details or ## Plan only when there is truly nothing/);
    expect(ENHANCE_SYSTEM).toMatch(/Use no other headings/);
    for (const legacy of ["## Data\n", "## Output expectations", "## Iteration request", "## Examples"]) {
      expect(ENHANCE_SYSTEM).not.toContain(legacy);
    }
  });

  it("writes elaborate prose: a specific expert persona, rich first-person context with bold key facts, inline-numbered details", () => {
    expect(ENHANCE_SYSTEM).toMatch(/flowing, natural prose paragraphs/);
    expect(rule("Persona")).toMatch(/seniority, years of experience/);
    expect(rule("Persona")).toMatch(/role-play/);
    expect(rule("Context")).toMatch(/first person plural/);
    expect(rule("Context")).toMatch(/all the facts/);
    expect(rule("Context")).toMatch(/key facts in \*\*bold\*\*/);
    expect(rule("Data/Details")).toMatch(/inline numbering/);
    expect(rule("Data/Details")).toMatch(/1\) … 2\) …/);
    expect(ENHANCE_SYSTEM).toMatch(/250-600 words/);
  });

  it("never invents facts about the person, and never leaves placeholders or a missing-details list", () => {
    expect(ENHANCE_SYSTEM).toMatch(/Never invent facts, numbers, names[^\n]*about the person, their organisation/);
    expect(ENHANCE_SYSTEM).toMatch(/Persona's expertise is the only invented detail allowed/);
    expect(rule("Persona")).toMatch(/must not state anything about the person or their organisation that the input does not give/);
    expect(ENHANCE_SYSTEM).toMatch(/Never write placeholders, blanks or brackets/);
    expect(ENHANCE_SYSTEM).toMatch(/never add a "Missing details" list/);
    expect(ENHANCE_SYSTEM).toMatch(/no preamble/i);
  });

  it("ends with a warm, direct ask that turns gaps into clarifying questions first", () => {
    const ask = rule("Instructions");
    expect(ask).toMatch(/"Please help us …\. Let's start by …"/);
    expect(ask).toMatch(/<gaps>/);
    expect(ask).toMatch(/first ask the user specific clarifying questions/);
    expect(ask).toMatch(/wait for the answers/);
  });

  it("writes the plan as numbered steps from the plan answer, or proposes one for the user to confirm first", () => {
    const plan = rule("Plan");
    expect(plan).toMatch(/numbered list/);
    expect(plan).toMatch(/What is the systematic plan to work on this\?/);
    expect(plan).toMatch(/<gaps>/);
    expect(plan).toMatch(/propose a sensible plan/);
    expect(plan).toMatch(/wait for their confirmation before executing/);
  });

  it("versions the instructions", () => {
    expect(INSTRUCTIONS_VERSION).toBe("prompt-bot-v4");
  });
});
