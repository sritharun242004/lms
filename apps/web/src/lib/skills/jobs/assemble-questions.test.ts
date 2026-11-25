import { describe, expect, it } from "vitest";
import {
  assembleJobSkill,
  BEFORE_YOU_START_HEADING,
  beforeYouStartSection,
  buildStyleGuide,
  filesSection,
  planAssets,
  validateJobSkill,
  withBeforeYouStart,
  type PlanInputFile,
} from "./assemble";
import type { JobSkillDraft, PerUseInput } from "./types";

const MB = 1024 * 1024;
const file = (over: Partial<PlanInputFile> = {}): PlanInputFile => ({
  id: "f1", fileName: "SLA template.docx", assetName: "sla-template.docx", kind: "DOCX", size: MB,
  analysis: "## Structure\n\n- 9 sections\n\n### Clauses", questionId: "q1", ...over,
});
const QUESTIONS = [{ id: "q1", text: "Which SLA template do you start from?" }, { id: "q2", text: 'Which "clauses" always apply?' }];
const PER_USE: PerUseInput[] = [
  { label: "Client name", hint: "e.g. Acme Ltd", required: true },
  { label: "Agreement date", hint: "", required: true },
  { label: "Deal value", hint: "in GBP", required: false },
];
const SECTION = [
  "## Before you start — ask the user for",
  "",
  "These change every time this skill is used. Check the request first, then ask for anything missing in one message before doing any work. Never guess or invent them.",
  "",
  "- **Client name** (required): e.g. Acme Ltd",
  "- **Agreement date** (required)",
  "- **Deal value** (if available): in GBP",
].join("\n");
const DRAFT: JobSkillDraft = { description: "Writes the client SLA. Use for a new client.", compatibility: "", body: "# Client SLA\n\nStart from the template.", references: [], scripts: [] };

describe("Before you start", () => {
  it("writes the exact section and nothing without per-use inputs", () => {
    expect(BEFORE_YOU_START_HEADING).toBe("## Before you start — ask the user for");
    expect(beforeYouStartSection(PER_USE)).toBe(SECTION);
    expect(beforeYouStartSection([])).toBe("");
  });

  it("goes after the title, or at the top without one", () => {
    expect(withBeforeYouStart("# Client SLA\n\nStart from the template.", PER_USE)).toBe(`# Client SLA\n\n${SECTION}\n\nStart from the template.`);
    expect(withBeforeYouStart("Start from the template.", PER_USE)).toBe(`${SECTION}\n\nStart from the template.`);
    expect(withBeforeYouStart("# Client SLA\n\nStart.", [])).toBe("# Client SLA\n\nStart.");
  });

  it("replaces a section the model wrote with exactly one server section", () => {
    const body = "# Client SLA\n\n## Before you start — ask the user for\n\n- The model's own list\n\n### Detail\n\nmore\n\n## Steps\n\n1. Start.";
    const out = withBeforeYouStart(body, PER_USE);
    expect(out).toBe(`# Client SLA\n\n${SECTION}\n\n## Steps\n\n1. Start.`);
    expect(out).not.toContain("The model's own list");
    expect(withBeforeYouStart("# T\n\n## Before you start\n\nx\n\n## Steps\n\ny", [])).toBe("# T\n\n## Steps\n\ny");
  });
});

describe("style guide by question", () => {
  it("groups files by question, demotes analysis headings to ####, then lists the general files", () => {
    const plan = planAssets([file(), file({ id: "f2", fileName: "Old SLA.pdf", assetName: "old-sla.pdf", kind: "PDF", size: 12 * MB, analysis: null, questionId: null })]);
    expect(buildStyleGuide(plan, QUESTIONS)).toBe(
      [
        "# Style guide",
        "",
        "Taken from the files uploaded for this task, grouped by the question each file answers. Analyses edited by hand are used exactly as written.",
        "",
        '## For "Which SLA template do you start from?"',
        "",
        "### SLA template.docx",
        "",
        "Bundled as assets/sla-template.docx.",
        "",
        "#### Structure\n\n- 9 sections\n\n##### Clauses",
        "",
        "## General files",
        "",
        "### Old SLA.pdf",
        "",
        "Not bundled (too large).",
        "",
        "No analysis is available for this file.",
        "",
      ].join("\n"),
    );
  });

  it("treats a file of an unknown question as general", () => {
    const guide = buildStyleGuide(planAssets([file({ questionId: "gone" })]), QUESTIONS)!;
    expect(guide).toContain("## General files\n\n### SLA template.docx");
    expect(guide).not.toContain("## For");
  });
});

describe("assembleJobSkill with questions", () => {
  it("says which question each file was added for, and inserts Before you start", () => {
    const plan = planAssets([file(), file({ id: "f2", fileName: "logo.png", assetName: "logo.png", kind: "PNG", size: 1000, questionId: null })]);
    const section = filesSection(plan, QUESTIONS);
    expect(section).toContain('- `assets/sla-template.docx`: the original "SLA template.docx". Start from this file and reuse its styles and page setup instead of recreating them. Added for the question "Which SLA template do you start from?".');
    expect(section.split("\n").at(-1)).toBe('- `assets/logo.png`: the original "logo.png". Use it as the reference for how the result should look.');
    const built = assembleJobSkill("client-sla", DRAFT, plan, { questions: QUESTIONS, perUse: PER_USE });
    const skillMd = built.files[0].content;
    expect(skillMd.match(/^## Before you start — ask the user for$/gm)).toHaveLength(1);
    expect(skillMd).toContain(`# Client SLA\n\n${SECTION}\n\nStart from the template.`);
    expect(validateJobSkill("client-sla", built.files, built.assets)).toEqual([]);
  });

  it("works without questions or per-use inputs", () => {
    const built = assembleJobSkill("client-sla", DRAFT, planAssets([file({ questionId: null })]));
    expect(built.files[0].content).not.toContain("Before you start");
    expect(built.files[1].content).toContain("## General files");
  });
});
