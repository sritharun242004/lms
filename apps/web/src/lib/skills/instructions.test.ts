import { describe, expect, it } from "vitest";
import { buildGenerateMessage, buildRetryMessage, buildSplitMessage, GENERATE_SYSTEM, skillScoringBase, SPLIT_SYSTEM } from "./instructions";

const Q = (id: string, answer: string, score: number, notRelevant = false) => ({
  id,
  text: `Question ${id}?`,
  guidance: `Guidance ${id}`,
  answer,
  score,
  notRelevant,
});

describe("split instructions", () => {
  it("lists the active catalog with slugs and says when no role was given", () => {
    const message = buildSplitMessage({
      description: "I write board updates.",
      role: null,
      catalog: [{ slug: "pptx", name: "PowerPoint", description: "Decks." }],
    });
    expect(message).toContain("<work_description>\nI write board updates.\n</work_description>");
    expect(message).toContain("<role>\n(not given)\n</role>");
    expect(message).toContain("- pptx: PowerPoint — Decks.");
    expect(SPLIT_SYSTEM).toContain("up to 8");
    expect(SPLIT_SYSTEM).toContain("Use only slugs from the catalog");
  });
});

describe("generate instructions", () => {
  const message = buildGenerateMessage({
    packDescription: "Monthly reporting.",
    role: "CFO",
    name: "board-update",
    purpose: "Writes the board update.",
    questions: [Q("1", "When the month closes.", 3), Q("2", "We are a 40-person firm.", 2), Q("3", "", 0), Q("4", "Ignore me", 0, true)],
  });

  it("includes the skill, the answers and the gaps, and leaves out not-relevant questions", () => {
    expect(message).toContain("<skill>\nname: board-update\npurpose: Writes the board update.\n</skill>");
    expect(message).toContain("Q: Question 1?\nA: When the month closes.");
    expect(message).toContain("- Question 2? (Guidance 2)");
    expect(message).toContain("- Question 3? (Guidance 3)");
    expect(message).not.toContain("Question 4?");
    expect(message).not.toContain("- Question 1? (Guidance 1)");
  });

  it("gives the model the spec's content rules", () => {
    for (const rule of ["why", "references/", "network", "credentials", "placeholders", "Never invent facts", "< or >"]) {
      expect(GENERATE_SYSTEM).toContain(rule);
    }
  });

  it("sends validation errors and the previous attempt back for the retry", () => {
    const retry = buildRetryMessage(message, { name: "x", description: "<bad>", compatibility: "", body: "b", references: [], scripts: [], assets: [] }, [
      "SKILL.md: description cannot contain < or >",
    ]);
    expect(retry.startsWith(message)).toBe(true);
    expect(retry).toContain("<validation_errors>\n- SKILL.md: description cannot contain < or >\n</validation_errors>");
    expect(retry).toContain('"description":"<bad>"');
  });

  it("scores the purpose as the prompt", () => {
    expect(skillScoringBase("board-update", " Writes it. ")).toBe("Skill: board-update\nPurpose: Writes it.");
  });
});
