import { describe, expect, it } from "vitest";
import type { PromptQuestionContext } from "@/lib/prompt-bot/instructions";
import { buildJobGenerateMessage, buildSuggestMessage, GENERATE_JOB_SYSTEM, SUGGEST_SYSTEM, type PromptFile, type ShippedFile } from "./instructions";
import type { PerUseInput } from "./types";

const questions: PromptQuestionContext[] = [
  { id: "q1", text: "Which SLA template do you start from?", guidance: "Name the file.", answer: "The 2026 template.", score: 3, notRelevant: false },
  { id: "q2", text: "Which clauses always apply?", guidance: "List them.", answer: "", score: 0, notRelevant: false },
];
const perUse: PerUseInput[] = [
  { label: "Client name", hint: "e.g. Acme Ltd", required: true },
  { label: "Deal value", hint: "", required: false },
];
const sla: PromptFile = { id: "f1", fileName: "SLA template.docx", kind: "DOCX", size: 1024 * 1024, analysis: "## Structure\n- 9 sections", questionId: "q1" };
const old: PromptFile = { id: "f2", fileName: "Old SLA.pdf", kind: "PDF", size: 2 * 1024 * 1024, analysis: null, questionId: null };
const base = { title: "Client SLA", description: "I write an SLA for each client.", outputType: "client SLA document", questions, perUse };

describe("buildSuggestMessage", () => {
  const message = buildSuggestMessage({ ...base, files: [sla, old], built: [] });

  it("names the output type in the task block", () => {
    expect(message.startsWith("<task>\ntitle: Client SLA\noutput_type: client SLA document\n\nI write an SLA for each client.\n</task>")).toBe(true);
    expect(buildSuggestMessage({ ...base, outputType: null, files: [], built: [] })).not.toContain("output_type");
  });

  it("groups each answer with the files attached to its question, then the general files", () => {
    expect(message).toContain(
      '<question n="1" text="Which SLA template do you start from?">\n<answer>\nThe 2026 template.\n</answer>\n<files>\n- id: f1\n  name: SLA template.docx\n  kind: DOCX\n  size: 1.0 MB\n  <analysis>\n## Structure\n- 9 sections\n  </analysis>\n</files>\n</question>',
    );
    expect(message).toContain('<question n="2" text="Which clauses always apply?">\n<answer>\n(not answered yet)\n</answer>\n</question>');
    expect(message).toContain("<general_files>\n- id: f2\n  name: Old SLA.pdf");
    expect(message).toContain("<gaps>\n- Which clauses always apply? (List them.)\n</gaps>");
    expect(message).toContain("<already_built>\n(none)\n</already_built>");
  });

  it("lists every per-use input as asked at every run", () => {
    expect(message).toContain("<ask_each_time>");
    expect(message).toContain("- Client name (required): e.g. Acme Ltd\n- Deal value (if available)\n</ask_each_time>");
    expect(message).toMatch(/<ask_each_time>\n[^\n]*every run[^\n]*never answered now/);
  });
});

describe("buildJobGenerateMessage", () => {
  const files: ShippedFile[] = [
    { ...sla, shipping: "bundled", path: "assets/sla-template.docx" },
    { ...old, shipping: "analysis-only", reason: "too-large" },
  ];
  const message = buildJobGenerateMessage({ ...base, skill: { name: "client-sla", purpose: "Writes the SLA." }, files });

  it("puts the skill's files under the question they answer, with their whole analysis", () => {
    expect(message).toContain(
      '<question n="1" text="Which SLA template do you start from?">\n<answer>\nThe 2026 template.\n</answer>\n<file name="SLA template.docx" kind="DOCX" shipping="bundled at assets/sla-template.docx">\n## Structure\n- 9 sections\n</file>\n</question>',
    );
    expect(message).toContain('<general_files>\n<file name="Old SLA.pdf" kind="PDF" shipping="analysis only (too large to bundle)">\nNo analysis available.\n</file>\n</general_files>');
    expect(message).toContain("- Client name (required): e.g. Acme Ltd\n- Deal value (if available)");
    expect(message).toContain("<skill>\nname: client-sla\npurpose: Writes the SLA.\n</skill>");
    expect(message).toContain("<gaps>\n- Which clauses always apply? (List them.)\n</gaps>");
  });

  it("says when there are no general files or per-use inputs", () => {
    const bare = buildJobGenerateMessage({ ...base, perUse: [], skill: { name: "a", purpose: "b" }, files: [] });
    expect(bare).toContain("<general_files>\n(none)\n</general_files>");
    expect(bare).toContain("<ask_each_time>\n(none)\n</ask_each_time>");
  });
});

describe("system prompts for tasks", () => {
  it("never fill in per-use inputs, and leave the Before you start section to the server", () => {
    expect(GENERATE_JOB_SYSTEM).toContain("<ask_each_time>");
    expect(GENERATE_JOB_SYSTEM).toContain("Never fill them in, guess them or invent values");
    expect(GENERATE_JOB_SYSTEM).toContain('Do not write a "Before you start" section');
    expect(GENERATE_JOB_SYSTEM).toContain("a file attached to a question shows what that answer looks like in practice");
    expect(SUGGEST_SYSTEM).toContain("<ask_each_time>");
    expect(SUGGEST_SYSTEM).toContain("recurring task");
  });
});
