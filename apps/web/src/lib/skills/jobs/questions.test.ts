import { describe, expect, it } from "vitest";
import { cleanOutputType, cleanQuestionSet, ESSENTIALS, FALLBACK_QUESTIONS, normalizeQuestionText } from "./questions";
import type { RawTaskQuestions } from "./types";

type RawQ = RawTaskQuestions["questions"][number];
const fq = (text: string, covers: string[], over: Partial<RawQ> = {}): RawQ => ({
  text, guidance: "A strong answer names it.", kind: "fixed", wantsFiles: false, fileHint: "NONE", fileNote: "", covers, ...over,
});
const raw = (questions: RawQ[], over: Partial<RawTaskQuestions> = {}): RawTaskQuestions => ({ outputType: "client SLA document", perUseInputs: [], questions, ...over });
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
    expect(fixed.map((q) => q.text).slice(0, 5)).toEqual(ALL.map((q) => q.text));
    expect(fixed).toHaveLength(6);
    expect(fixed[5].text).toHaveLength(300);
  });

  it("clears the hint and note without files, and defaults a file question to REFERENCE", () => {
    const { fixed } = cleanQuestionSet(raw([
      fq("When is it used?", ["triggers"], { wantsFiles: false, fileHint: "BRAND", fileNote: "Upload logo" }),
      fq("Which past SLAs?", ["inputs"], { wantsFiles: true, fileHint: "NONE", fileNote: " Upload two\nsigned SLAs. " }),
      fq("Which template?", ["steps", "output", "quality", "avoid", "bogus"], { wantsFiles: true, fileHint: "TEMPLATE", fileNote: "n".repeat(200) }),
    ]));
    expect(fixed[0]).toMatchObject({ wantsFiles: false, fileHint: null, fileNote: "" });
    expect(fixed[1]).toMatchObject({ wantsFiles: true, fileHint: "REFERENCE", fileNote: "Upload two signed SLAs." });
    expect(fixed[2].fileHint).toBe("TEMPLATE");
    expect(fixed[2].fileNote).toHaveLength(120);
    expect(fixed[2].covers).toEqual(["steps", "output", "quality", "avoid"]);
  });

  it("appends a fallback for each uncovered essential", () => {
    const { fixed } = cleanQuestionSet(raw(ALL.slice(0, 4)));
    expect(fixed).toHaveLength(5);
    expect(fixed[4]).toEqual({ ...FALLBACK_QUESTIONS.avoid, wantsFiles: false, fileHint: null, fileNote: "", covers: ["avoid"] });
    expect(fixed[4].text).toBe("What should it never do?");
  });

  it("keeps at most 8 and still covers every essential, dropping redundant questions from the end", () => {
    const crowded = Array.from({ length: 12 }, (_, i) => fq(`Output question ${i + 1}?`, ["output"]));
    const { fixed } = cleanQuestionSet(raw(crowded));
    expect(fixed).toHaveLength(8);
    expect(fixed.slice(0, 3).map((q) => q.text)).toEqual(["Output question 1?", "Output question 2?", "Output question 3?"]);
    for (const e of ESSENTIALS) expect(fixed.some((q) => q.covers.includes(e))).toBe(true);
  });

  it("does not add a fallback when nothing is missing", () => {
    expect(cleanQuestionSet(raw(ALL)).fixed).toHaveLength(5);
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
