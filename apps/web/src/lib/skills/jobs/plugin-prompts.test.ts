import { describe, expect, it } from "vitest";
import type { PromptQuestionContext } from "@/lib/prompt-bot/instructions";
import {
  buildJobGenerateMessage,
  buildSubSkillGenerateMessage,
  GENERATE_JOB_SYSTEM,
  GENERATE_SUB_SKILL_RULES,
  GENERATE_SUB_SKILL_SYSTEM,
  type ShippedFile,
} from "./instructions";

const questions: PromptQuestionContext[] = [
  { id: "q1", text: "Which template do you start from?", guidance: "Name it.", answer: "The 2026 deck.", score: 3, notRelevant: false },
  { id: "q2", text: "What's the tone?", guidance: "Describe it.", answer: "Numbers first.", score: 3, notRelevant: false },
];
const deck: ShippedFile = { id: "f1", fileName: "Deck.pptx", kind: "PPTX", size: 1024, analysis: "## Colours\n- #1F4E79", questionId: "q1", shipping: "bundled", path: "assets/deck.pptx" };
const logo: ShippedFile = { id: "f2", fileName: "Logo.png", kind: "PNG", size: 2048, analysis: "A logo", questionId: null, shipping: "in-main", mainSkill: "quarterly-deck", path: "assets/logo.png" };
const base = {
  title: "Quarterly deck",
  company: "Acme",
  description: "I build the deck.",
  outputType: "slide deck",
  questions,
  perUse: [{ label: "Quarter", hint: "e.g. Q3", required: true }],
  plugin: { name: "acme-quarterly-deck", displayName: "Acme · Quarterly deck" },
};
const subs = [
  { name: "deck-designer", purpose: "Lays out slides." },
  { name: "deck-grammar-check", purpose: "Checks wording." },
];

describe("main skill message", () => {
  const message = buildJobGenerateMessage({ ...base, skill: { name: "quarterly-deck", purpose: "Builds the deck." }, files: [deck], subSkills: subs });

  it("names the plugin and lists the sub-skills in workflow order", () => {
    expect(message).toContain('<plugin name="acme-quarterly-deck" displayName="Acme · Quarterly deck">');
    expect(message).toContain("<sub_skills>\n1. deck-designer: Lays out slides.\n2. deck-grammar-check: Checks wording.\n</sub_skills>");
    expect(message).toContain("company: Acme");
  });

  it("says the server adds the workflow section and never to copy a sub-skill in full", () => {
    expect(message).toMatch(/server adds the "## How this skill works" section/);
    expect(message).toMatch(/refer to each sub-skill by name/);
    expect(message).toMatch(/never copy a sub-skill's instructions in full/i);
  });
});

describe("sub-skill message", () => {
  const message = buildSubSkillGenerateMessage({
    ...base,
    main: { name: "quarterly-deck", purpose: "Builds the deck." },
    subSkill: { name: "deck-designer", purpose: "Lays out slides.", focus: "Layout only; leaves wording to the main skill." },
    siblings: [{ name: "deck-grammar-check", purpose: "Checks wording." }],
    files: [logo],
  });

  it("carries the task, its own files only, the main skill, its focus and its siblings", () => {
    expect(message.startsWith("<task>\ntitle: Quarterly deck\ncompany: Acme")).toBe(true);
    expect(message).toContain("<main_skill>\nname: quarterly-deck\npurpose: Builds the deck.\n</main_skill>");
    expect(message).toContain("<sub_skill>\nname: deck-designer\npurpose: Lays out slides.\nfocus: Layout only; leaves wording to the main skill.\n</sub_skill>");
    expect(message).toContain("<siblings>\n- deck-grammar-check: Checks wording.\n</siblings>");
    expect(message).toContain('shipping="kept in the quarterly-deck skill of this plugin (assets/logo.png)"');
    expect(message).not.toContain("Deck.pptx");
    expect(message).toContain("<answer>\nThe 2026 deck.\n</answer>");
    expect(message).toContain("- Quarter (required): e.g. Q3");
  });

  it("uses the job system plus the stand-alone sub-skill rules", () => {
    expect(GENERATE_SUB_SKILL_SYSTEM).toBe(`${GENERATE_JOB_SYSTEM}\n\n${GENERATE_SUB_SKILL_RULES}`);
    expect(GENERATE_SUB_SKILL_RULES).toMatch(/only the focus/i);
    expect(GENERATE_SUB_SKILL_RULES).toMatch(/completely on its own/i);
    expect(GENERATE_SUB_SKILL_RULES).toMatch(/server adds the stand-alone note/i);
  });
});
