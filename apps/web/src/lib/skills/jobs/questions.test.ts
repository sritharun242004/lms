import { describe, expect, it } from "vitest";
import { cleanOutputType, cleanQuestionSet, CONTEXT_QUESTION, ESSENTIALS, FALLBACK_QUESTIONS, normalizeQuestionText } from "./questions";
import type { RawTaskQuestions } from "./types";

type RawQ = RawTaskQuestions["questions"][number];
const fq = (text: string, covers: string[], over: Partial<RawQ> = {}): RawQ => ({
  text, guidance: "A strong answer names it.", kind: "fixed", wantsFiles: false, fileHint: "NONE", fileNote: "", covers, ...over,
});
const raw = (questions: RawQ[], over: Partial<RawTaskQuestions> = {}): RawTaskQuestions => ({
  outputType: "client SLA document", coveredByDescription: [], perUseInputs: [], questions, ...over,
});
const ALL = [fq("When is it used?", ["triggers"]), fq("What do you start from?", ["inputs"]), fq("What are the steps?", ["steps"]),
  fq("What does great look like?", ["output", "quality"]), fq("What must it never do?", ["avoid"])];

describe("normalizeQuestionText", () => {
  it("ignores case, spacing and trailing punctuation", () => {
    expect(normalizeQuestionText("  Which   Template do you use?! ")).toBe("which template do you use");
    expect(normalizeQuestionText("Client name:")).toBe("client name");
  });
});

describe("cleanOutputType", () => {
  it("keeps one line of at most 60 characters, blank as null", () => {
    expect(cleanOutputType(" Instagram\ncarousel ")).toBe("Instagram carousel");
    expect(cleanOutputType("x".repeat(80))).toHaveLength(60);
    expect(cleanOutputType("  ")).toBeNull();
  });
});

describe("cleanQuestionSet: fixed questions", () => {
  it("one-lines, caps, drops empty and duplicate questions", () => {
    const { fixed } = cleanQuestionSet(raw([...ALL, fq("  when IS it used ", ["triggers"]), fq("   ", ["steps"]), fq(`Long ${"a".repeat(400)}?`, [])]));
    expect(fixed[0].text).toBe(CONTEXT_QUESTION.text);
    expect(fixed.map((q) => q.text).slice(1, 6)).toEqual(ALL.map((q) => q.text));
    expect(fixed).toHaveLength(7);
    expect(fixed[6].text).toHaveLength(300);
  });

  it("clears the hint and note without files, and defaults a file question to REFERENCE", () => {
    const { fixed } = cleanQuestionSet(raw([
      fq("When is it used?", ["triggers"], { wantsFiles: false, fileHint: "BRAND", fileNote: "Upload logo" }),
      fq("Which past SLAs?", ["inputs"], { wantsFiles: true, fileHint: "NONE", fileNote: " Upload two\nsigned SLAs. " }),
      fq("Which template?", ["steps", "output", "quality", "avoid", "bogus"], { wantsFiles: true, fileHint: "TEMPLATE", fileNote: "n".repeat(200) }),
    ]));
    expect(fixed[0].text).toBe(CONTEXT_QUESTION.text);
    expect(fixed[1]).toMatchObject({ wantsFiles: false, fileHint: null, fileNote: "" });
    expect(fixed[2]).toMatchObject({ wantsFiles: true, fileHint: "REFERENCE", fileNote: "Upload two signed SLAs." });
    expect(fixed[3].fileHint).toBe("TEMPLATE");
    expect(fixed[3].fileNote).toHaveLength(120);
    expect(fixed[3].covers).toEqual(["steps", "output", "quality", "avoid"]);
  });

  it("appends a fallback for each uncovered essential, but never one for avoid (the context question covers it)", () => {
    const { fixed } = cleanQuestionSet(raw(ALL.slice(0, 3)));
    expect(fixed).toHaveLength(6);
    expect(fixed[0].covers).toEqual(["avoid"]);
    expect(fixed[4]).toEqual({ ...FALLBACK_QUESTIONS.output, wantsFiles: false, fileHint: null, fileNote: "", covers: ["output"] });
    expect(fixed[5]).toEqual({ ...FALLBACK_QUESTIONS.quality, wantsFiles: false, fileHint: null, fileNote: "", covers: ["quality"] });
    expect(fixed.map((q) => q.text)).not.toContain(FALLBACK_QUESTIONS.avoid.text);
    for (const e of ESSENTIALS) expect(fixed.some((q) => q.covers.includes(e))).toBe(true);
  });

  it("keeps at most 8 and still covers every essential, dropping redundant questions from the end", () => {
    const crowded = Array.from({ length: 12 }, (_, i) => fq(`Output question ${i + 1}?`, ["output"]));
    const { fixed } = cleanQuestionSet(raw(crowded));
    expect(fixed).toHaveLength(8);
    expect(fixed[0].text).toBe(CONTEXT_QUESTION.text);
    expect(fixed.slice(1, 4).map((q) => q.text)).toEqual(["Output question 1?", "Output question 2?", "Output question 3?"]);
    for (const e of ESSENTIALS) expect(fixed.some((q) => q.covers.includes(e))).toBe(true);
  });

  it("adds no fallback for essentials the description already answers fully", () => {
    const steps = [fq("What do you start from?", ["inputs"]), fq("What are the steps?", ["steps"]), fq("How is it checked?", ["quality"])];
    const { fixed } = cleanQuestionSet(raw(steps, { coveredByDescription: ["triggers", "output", "avoid", "bogus"] }));
    expect(fixed.map((q) => q.text)).toEqual([CONTEXT_QUESTION.text, ...steps.map((q) => q.text)]);
  });

  it("still adds fallbacks for a lazy description", () => {
    const { fixed } = cleanQuestionSet(raw([fq("What do you start from?", ["inputs"])], { coveredByDescription: [] }));
    expect(fixed.map((q) => q.text)).toEqual([
      CONTEXT_QUESTION.text,
      "What do you start from?",
      FALLBACK_QUESTIONS.triggers.text, FALLBACK_QUESTIONS.steps.text, FALLBACK_QUESTIONS.output.text, FALLBACK_QUESTIONS.quality.text,
    ]);
  });

  it("does not add a fallback when nothing is missing", () => {
    expect(cleanQuestionSet(raw(ALL)).fixed).toHaveLength(6);
  });
});

describe("cleanQuestionSet: per-use inputs", () => {
  it("takes per-use questions and proposed inputs, deduplicated across both kinds, cap 10, label 120", () => {
    const { fixed, perUse, outputType } = cleanQuestionSet(raw(
      [...ALL, fq("What is the client's name?", ["inputs"], { kind: "per_use", guidance: "e.g. Acme Ltd" }), fq("What are the steps", [], { kind: "per_use" })],
      { perUseInputs: [
        { label: "what is the client's NAME", hint: "", required: true },
        { label: "Agreement date", hint: "", required: true },
        { label: "Deal value", hint: " in\nGBP ", required: false },
        { label: "  ", hint: "", required: true },
        { label: "L".repeat(200), hint: "h".repeat(400), required: true },
        ...Array.from({ length: 12 }, (_, i) => ({ label: `Input ${i}`, hint: "", required: true })),
      ] },
    ));
    expect(outputType).toBe("client SLA document");
    expect(fixed.map((q) => q.text)).not.toContain("What is the client's name?");
    expect(perUse[0]).toEqual({ label: "What is the client's name?", hint: "e.g. Acme Ltd", required: true });
    expect(perUse.slice(1, 3)).toEqual([{ label: "Agreement date", hint: "", required: true }, { label: "Deal value", hint: "in GBP", required: false }]);
    expect(perUse[3].label).toHaveLength(120);
    expect(perUse[3].hint).toHaveLength(300);
    expect(perUse).toHaveLength(10);
  });
});

describe("the combined context question", () => {
  const raw = (questions: Array<{ text: string; covers?: string[] }>) => ({
    outputType: "Instagram carousel",
    coveredByDescription: ["triggers", "inputs", "steps", "output", "quality"],
    perUseInputs: [],
    questions: questions.map((q) => ({ text: q.text, guidance: "g", kind: "fixed" as const, covers: (q.covers ?? []) as never, wantsFiles: false, fileHint: "NONE" as const, fileNote: "" })),
  });

  it("is always asked first and covers avoid, so no separate avoid fallback is added", () => {
    const { fixed } = cleanQuestionSet(raw([{ text: "Which images should it use?", covers: ["inputs"] }]) as never);
    expect(fixed[0].text).toBe("What's the context, who is it for (target audience), and what are the do's and don'ts?");
    expect(fixed.filter((q) => q.covers.includes("avoid"))).toHaveLength(1);
    expect(fixed.map((q) => q.text)).not.toContain("What should it never do?");
  });

  it("is never dropped to make room and never duplicated", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ text: `Question ${i}?`, covers: ["inputs"] }));
    const { fixed } = cleanQuestionSet(raw([{ text: "What's the context, who is it for (target audience), and what are the do's and don'ts?" }, ...many]) as never);
    expect(fixed[0].text).toMatch(/^What's the context/);
    expect(fixed.filter((q) => /^What's the context/.test(q.text))).toHaveLength(1);
  });
});
