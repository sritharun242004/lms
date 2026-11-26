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

  it("asks for the six Elements of LLM Prompts in order, Persona, Context, Output Expectations and Iteration Request always", () => {
    const order = ["Persona", "Context", "Data", "Output Expectations", "Iteration Request", "Examples"];
    const positions = order.map((h) => ENHANCE_SYSTEM.indexOf(`## ${h}\n`));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(ENHANCE_SYSTEM).toMatch(/Always include ## Persona, ## Context, ## Output Expectations and ## Iteration Request/);
    expect(ENHANCE_SYSTEM).toMatch(/## Examples only when the person gave a template, sample or style/);
    expect(ENHANCE_SYSTEM).toMatch(/Use no other headings/);
    for (const legacy of ["## Data/Details", "## Plan", "## Instructions", "## Output expectations", "## Iteration request"]) {
      expect(ENHANCE_SYSTEM).not.toContain(legacy);
    }
  });

  it("writes elaborate prose: a specific expert persona, rich first-person context with bold key facts, inline-numbered details", () => {
    expect(ENHANCE_SYSTEM).toMatch(/flowing, natural prose paragraphs/);
    expect(rule("Persona")).toMatch(/seniority and years of experience/);
    expect(rule("Persona")).toMatch(/in the person's own words/);
    expect(rule("Persona")).toMatch(/Never narrow or shift it to a specialism they did not mention/);
    expect(rule("Context")).toMatch(/first person plural/);
    expect(rule("Context")).toMatch(/all the facts/);
    expect(rule("Context")).toMatch(/key facts in \*\*bold\*\*/);
    expect(rule("Data")).toMatch(/inline numbering/);
    expect(rule("Data")).toMatch(/1\) … 2\) …/);
    expect(ENHANCE_SYSTEM).toMatch(/150-600 words/);
  });

  it("never invents facts about the person, and never leaves placeholders or a missing-details list", () => {
    expect(ENHANCE_SYSTEM).toMatch(/Never invent facts, numbers, names[^\n]*about the person, their organisation/);
    expect(ENHANCE_SYSTEM).toMatch(/Persona's expertise is the only invented detail allowed/);
    expect(rule("Persona")).toMatch(/must not state anything about the person or their organisation that the input does not give/);
    expect(ENHANCE_SYSTEM).toMatch(/Never write placeholders, blanks or brackets/);
    expect(ENHANCE_SYSTEM).toMatch(/never add a "Missing details" list/);
    expect(ENHANCE_SYSTEM).toMatch(/no preamble/i);
  });

  it("states the deliverable, format, tone and audience in a warm, direct ask", () => {
    const out = rule("Output Expectations");
    expect(out).toMatch(/format/);
    expect(out).toMatch(/tone and style/);
    expect(out).toMatch(/"Please help us …"/);
  });

  it("asks clarifying questions about gaps first, then mentors the person through the work", () => {
    const it2 = rule("Iteration Request");
    expect(it2).toMatch(/<gaps>/);
    expect(it2).toMatch(/first ask the user specific clarifying questions/);
    expect(it2).toMatch(/wait for the answers/);
    expect(it2).toMatch(/mentoring them/);
  });

  it("puts examples in only when a template, sample or style was given", () => {
    expect(rule("Examples")).toMatch(/only when a template, sample or style was given/);
  });

  it("writes the plan as numbered steps from the plan answer, or proposes one for the user to confirm first", () => {
    const plan = rule("Iteration Request");
    expect(plan).toMatch(/numbered list/);
    expect(plan).toMatch(/What is the systematic plan to work on this\?/);
    expect(plan).toMatch(/<gaps>/);
    expect(plan).toMatch(/propose a sensible plan/);
    expect(plan).toMatch(/confirm it with the user before executing/);
  });

  it("keeps a thin input short and on scope instead of padding it", () => {
    expect(ENHANCE_SYSTEM).toMatch(/Stay on the person's scope\. Never add topics, tools, channels, sub-specialties or goals/);
    expect(ENHANCE_SYSTEM).toMatch(/When it is "thin"[^\n]*60-150 words/);
    expect(ENHANCE_SYSTEM).toMatch(/ask the user the key questions first/);
    expect(ENHANCE_SYSTEM).toMatch(/Never pad\./);
  });

  it("tells the model how much the person gave", () => {
    const q = (id: string, answer: string) => ({ id, text: `Q${id}?`, guidance: "", answer, score: answer ? 2 : 0, notRelevant: false });
    expect(buildEnhanceMessage("email expert", [q("1", ""), q("2", "")])).toContain("<input_size>thin (basic prompt: 2 words; answered questions: 0)</input_size>");
    expect(buildEnhanceMessage("email expert", [q("1", "Sales team"), q("2", "Win back lapsed clients")])).toContain("<input_size>enough");
  });

  it("versions the instructions", () => {
    expect(INSTRUCTIONS_VERSION).toBe("prompt-bot-v6");
  });
});
