import { describe, expect, it } from "vitest";
import type { PromptQuestionContext } from "@/lib/prompt-bot/instructions";
import {
  ANALYSE_SYSTEM,
  buildAnalysisText,
  buildJobGenerateMessage,
  buildJobRetryMessage,
  buildSuggestMessage,
  GENERATE_JOB_SYSTEM,
  SUGGEST_SYSTEM,
  type PromptFile,
  type ShippedFile,
} from "./instructions";

const questions: PromptQuestionContext[] = [
  { id: "q1", text: "When should this skill be used?", guidance: "Triggers", answer: "Every month before the board meeting.", score: 3, notRelevant: false },
  { id: "q2", text: "What inputs will it receive?", guidance: "Files and notes", answer: "", score: 1, notRelevant: false },
  { id: "q3", text: "What should it avoid?", guidance: "Mistakes", answer: "Ignored", score: 0, notRelevant: true },
];
const deck: PromptFile = { id: "f1", fileName: "Q3 board deck.pptx", kind: "PPTX", size: 2 * 1024 * 1024, analysis: "## Colours\n- #1F4E79 headings" };
const brand: PromptFile = { id: "f2", fileName: "Brand book.pdf", kind: "PDF", size: 14.2 * 1024 * 1024, analysis: null };

describe("system prompts", () => {
  it("name the job each call does", () => {
    expect(ANALYSE_SYSTEM).toContain("style guide");
    for (const heading of ["## Colours", "## Fonts", "## Layout", "## Structure", "## Tone and content", "## Reusing this file"]) {
      expect(ANALYSE_SYSTEM).toContain(heading);
    }
    expect(ANALYSE_SYSTEM).toContain("(approximate)");
    expect(SUGGEST_SYSTEM).toMatch(/usually exactly one/i);
    expect(SUGGEST_SYSTEM).toMatch(/already built/i);
    expect(GENERATE_JOB_SYSTEM).toContain("references/style-guide.md");
    expect(GENERATE_JOB_SYSTEM).toMatch(/never write references\/style-guide\.md/i);
    expect(GENERATE_JOB_SYSTEM).toMatch(/network/i);
  });
});

describe("buildAnalysisText", () => {
  it("wraps the facts in a file tag and never lets the name break the tag", () => {
    const text = buildAnalysisText({ fileName: 'Deck "final" <v2>.pptx', kind: "PPTX", facts: { kind: "PDF", version: "1.7", pages: 3, title: null } });
    expect(text).toContain('<file name="Deck final v2.pptx" kind="PPTX">');
    expect(text).toContain('"pages": 3');
    expect(text).toContain("</facts>");
  });

  it("says when no facts were extracted", () => {
    expect(buildAnalysisText({ fileName: "a.png", kind: "PNG", facts: null })).toContain("(none");
  });
});

describe("buildSuggestMessage", () => {
  const message = buildSuggestMessage({
    title: "Monthly board update",
    description: "I turn the numbers into a board deck.",
    questions,
    files: [deck, brand],
    built: [{ name: "board-deck", purpose: "Builds the deck." }],
  });

  it("lists answers, relevant gaps, files with ids and the skills already built", () => {
    expect(message).toContain("Monthly board update");
    expect(message).toContain("Q: When should this skill be used?\nA: Every month before the board meeting.");
    expect(message).toContain("- What inputs will it receive? (Files and notes)");
    expect(message).not.toContain("What should it avoid?");
    expect(message).toContain("id: f1");
    expect(message).toContain("name: Q3 board deck.pptx");
    expect(message).toContain("size: 2.0 MB");
    expect(message).toContain("#1F4E79 headings");
    expect(message).toContain("(no analysis yet)");
    expect(message).toContain("- board-deck: Builds the deck.");
  });

  it("cuts long analyses to the excerpt length", () => {
    const long = buildSuggestMessage({ title: "t", description: "d", questions: [], files: [{ ...deck, analysis: "x".repeat(5000) }], built: [] });
    expect(long).toContain("x".repeat(1500));
    expect(long).not.toContain("x".repeat(1501));
    expect(long).toContain("<already_built>\n(none)\n</already_built>");
  });
});

describe("buildJobGenerateMessage", () => {
  const files: ShippedFile[] = [
    { ...deck, shipping: "bundled", path: "assets/q3-board-deck.pptx" },
    { ...brand, shipping: "analysis-only", reason: "too-large" },
    { ...deck, id: "f3", fileName: "Old deck.pptx", shipping: "analysis-only", reason: "over-budget" },
  ];
  const message = buildJobGenerateMessage({ title: "Board update", description: "I write it.", questions, skill: { name: "board-deck", purpose: "Builds the deck." }, files });

  it("says how each file ships and includes its whole analysis", () => {
    expect(message).toContain("<skill>\nname: board-deck\npurpose: Builds the deck.\n</skill>");
    expect(message).toContain('shipping="bundled at assets/q3-board-deck.pptx"');
    expect(message).toContain('shipping="analysis only (too large to bundle)"');
    expect(message).toContain('shipping="analysis only (over the 25 MB bundle budget)"');
    expect(message).toContain("## Colours\n- #1F4E79 headings");
    expect(message).toContain("No analysis available.");
    expect(message).toContain("<gaps>\n- What inputs will it receive? (Files and notes)\n</gaps>");
  });

  it("says when the skill uses no files", () => {
    expect(buildJobGenerateMessage({ title: "t", description: "d", questions: [], skill: { name: "a", purpose: "b" }, files: [] })).toContain("<files>\n(none)\n</files>");
  });
});

describe("buildJobRetryMessage", () => {
  it("appends the previous attempt and every error", () => {
    const draft = { description: "d", compatibility: "", body: "b", references: [], scripts: [] };
    const retry = buildJobRetryMessage("ORIGINAL", draft, ["SKILL.md: description cannot contain < or >", "\"x\": duplicate path"]);
    expect(retry.startsWith("ORIGINAL")).toBe(true);
    expect(retry).toContain(`<previous_attempt>\n${JSON.stringify(draft)}\n</previous_attempt>`);
    expect(retry).toContain("- SKILL.md: description cannot contain < or >\n- \"x\": duplicate path");
    expect(retry).toMatch(/fixed/);
  });
});
