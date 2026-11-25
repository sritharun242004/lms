import { describe, expect, it } from "vitest";
import { buildEnhanceTaskMessage, buildQuestionsMessage, ENHANCE_TASK_SYSTEM, QUESTIONS_SYSTEM } from "./instructions";

const order = (text: string, parts: string[]) => parts.map((p) => text.indexOf(p));

describe("ENHANCE_TASK_SYSTEM", () => {
  it("asks for the brief's sections in order", () => {
    const positions = order(ENHANCE_TASK_SYSTEM, [
      "## Purpose", "## When it's used", "## Same every time", "## Varies each time", "## Steps", "## Output", "## Audience", "## Quality bar", "## Constraints",
    ]);
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("separates what is fixed from what varies, and never invents", () => {
    expect(ENHANCE_TASK_SYSTEM).toMatch(/Same every time.*document structure and sections, company standards, the template, clauses that always apply, brand assets, tone/);
    expect(ENHANCE_TASK_SYSTEM).toMatch(/Varies each time.*client name, date, project scope, deal value, contacts, deadlines, specific figures/);
    expect(ENHANCE_TASK_SYSTEM).toContain("first person");
    expect(ENHANCE_TASK_SYSTEM).toContain("150 to 450 words");
    expect(ENHANCE_TASK_SYSTEM).toContain("Never invent facts");
    expect(ENHANCE_TASK_SYSTEM).toContain("_Which file do you start from?_");
  });
});

describe("QUESTIONS_SYSTEM", () => {
  it("always does all four things, for every task", () => {
    expect(QUESTIONS_SYSTEM).toContain("Whatever the task is, always do all four");
    for (const step of ["(a)", "(b)", "(c)", "(d)"]) expect(QUESTIONS_SYSTEM).toContain(step);
  });

  it("names the whole output taxonomy, including other", () => {
    for (const kind of [
      "image or visual design", "social post or carousel", "video", "audio or podcast", "slide deck",
      "contract or policy", "spreadsheet, financial model or data analysis", "email or written copy", "research or summary",
      "code or automation", "plan, process or checklist", "other",
    ]) {
      expect(QUESTIONS_SYSTEM).toContain(kind);
    }
  });

  it("asks for inputs and assets first, with files where a file helps", () => {
    expect(QUESTIONS_SYSTEM).toMatch(/inputs and assets/i);
    for (const word of ["wantsFiles", "fileHint", "fileNote", "TEMPLATE", "REFERENCE", "INPUT", "BRAND", "NONE"]) expect(QUESTIONS_SYSTEM).toContain(word);
  });

  it("splits fixed from per-use inputs", () => {
    expect(QUESTIONS_SYSTEM).toContain('kind "fixed"');
    expect(QUESTIONS_SYSTEM).toContain('kind "per_use"');
    expect(QUESTIONS_SYSTEM).toContain("perUseInputs");
    expect(QUESTIONS_SYSTEM).toContain("Never ask the person to answer these now");
  });

  it("covers the six essentials with 5 to 8 fixed questions", () => {
    for (const e of ["- triggers:", "- inputs:", "- steps:", "- output:", "- quality:", "- avoid:"]) expect(QUESTIONS_SYSTEM).toContain(e);
    expect(QUESTIONS_SYSTEM).toContain("Ask 5 to 8 fixed questions");
  });

  it("gives illustrations, not a menu", () => {
    for (const ex of ["Instagram carousel", "1080×1350", "explainer video", "storyboard", "client SLA document", "monthly financial report"]) {
      expect(QUESTIONS_SYSTEM).toContain(ex);
    }
    expect(QUESTIONS_SYSTEM).toContain("illustrations");
    expect(QUESTIONS_SYSTEM).toContain("They are not a menu");
  });

  it("keeps fitting wording on regenerate and never invents", () => {
    expect(QUESTIONS_SYSTEM).toContain("<existing_questions>");
    expect(QUESTIONS_SYSTEM).toContain("keep its exact wording");
    expect(QUESTIONS_SYSTEM).toContain("Never invent facts");
  });
});

describe("task messages", () => {
  it("sends the box text to Enhance inside a task block", () => {
    expect(buildEnhanceTaskMessage({ title: " Client SLA ", description: " I write SLAs. " })).toBe(
      "<task>\ntitle: Client SLA\n\nI write SLAs.\n</task>\n\nRewrite this description as the task brief.",
    );
    expect(buildEnhanceTaskMessage({ title: "", description: "x" })).toContain("title: (untitled)");
  });

  it("lists existing questions only when there are some", () => {
    const first = buildQuestionsMessage({ title: "SLA", description: "I write SLAs.", existing: [] });
    expect(first).toContain("<task>\ntitle: SLA\n\nI write SLAs.\n</task>");
    expect(first).not.toContain("<existing_questions>");
    const again = buildQuestionsMessage({
      title: "SLA",
      description: "I write SLAs.",
      existing: [
        { kind: "FIXED", text: "Which template?", answered: true },
        { kind: "FIXED", text: "Who reads it?", answered: false },
        { kind: "PER_USE", text: "Client name", answered: false },
      ],
    });
    expect(again).toContain("<existing_questions>\n- [fixed] Which template? (answered)\n- [fixed] Who reads it?\n- [per_use] Client name\n</existing_questions>");
  });
});
