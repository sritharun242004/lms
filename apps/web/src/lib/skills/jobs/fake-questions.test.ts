import { describe, expect, it } from "vitest";
import { enhanceReply, JOB_DRAFT, KINDS, questionsReply, TASK_DESCRIPTIONS, taskKind } from "../../../../scripts/fake-anthropic-shapes.mjs";
import { TaskQuestionsReply } from "@/lib/ai/claude";
import { assembleJobSkill, planAssets, validateJobSkill } from "./assemble";
import { buildEnhanceTaskMessage, buildQuestionsMessage } from "./instructions";
import { CONTEXT_QUESTION, cleanQuestionSet, ESSENTIALS } from "./questions";

const message = (kind: keyof typeof TASK_DESCRIPTIONS, existing = false) =>
  buildQuestionsMessage({
    title: "My task",
    description: TASK_DESCRIPTIONS[kind],
    existing: existing ? [{ kind: "FIXED", text: "Anything?", answered: true }] : [],
  });

describe("fake Anthropic task shapes", () => {
  it("has a description of at least 500 characters for each kind, and picks the kind from the task block", () => {
    for (const kind of KINDS) {
      expect(TASK_DESCRIPTIONS[kind].trim().length).toBeGreaterThanOrEqual(500);
      expect(taskKind(message(kind))).toBe(kind);
    }
  });

  it.each(KINDS)("answers %s with a reply that parses as the real schema", (kind) => {
    const { reply, regenerate } = questionsReply(message(kind));
    expect(regenerate).toBe(false);
    expect(TaskQuestionsReply.safeParse(reply).success).toBe(true);
    expect(reply.questions.some((q) => q.kind === "fixed" && q.wantsFiles && q.fileHint !== "NONE" && q.fileNote)).toBe(true);
    expect(reply.questions.filter((q) => q.kind === "per_use")).toHaveLength(1);
    expect(reply.perUseInputs.length).toBeGreaterThan(0);
    expect(reply.questions.some((q) => q.covers.includes("avoid"))).toBe(false);
    expect(reply.coveredByDescription).not.toContain("avoid");
    const clean = cleanQuestionSet(reply);
    expect(clean.fixed[0].text).toBe(CONTEXT_QUESTION.text);
    expect(clean.fixed.filter((q) => q.covers.includes("avoid"))).toHaveLength(1);
    expect(clean.fixed.map((q) => q.text)).not.toContain("What should it never do?");
    for (const e of ESSENTIALS) expect(clean.fixed.some((q) => q.covers.includes(e)) || reply.coveredByDescription.includes(e)).toBe(true);
  });

  it("asks a carousel for brand assets, images, past posts and the 1080×1350 format", () => {
    const clean = cleanQuestionSet(questionsReply(message("carousel")).reply);
    expect(clean.outputType).toBe("Instagram carousel");
    const hints = clean.fixed.filter((q) => q.wantsFiles).map((q) => q.fileHint);
    expect(hints).toEqual(expect.arrayContaining(["BRAND", "INPUT", "REFERENCE"]));
    expect(clean.fixed.some((q) => q.guidance.includes("1080×1350"))).toBe(true);
    expect(clean.perUse.map((p) => p.label)).toEqual(expect.arrayContaining(["Topic of this post", "Slide copy"]));
  });

  it("repeats the first three fixed questions verbatim on regenerate and changes the rest", () => {
    for (const kind of KINDS) {
      const first = questionsReply(message(kind)).reply.questions.filter((q) => q.kind === "fixed").map((q) => q.text);
      const again = questionsReply(message(kind, true));
      expect(again.regenerate).toBe(true);
      const second = again.reply.questions.filter((q) => q.kind === "fixed").map((q) => q.text);
      expect(second.slice(0, 3)).toEqual(first.slice(0, 3));
      expect(second.slice(3).some((t, i) => t !== first[3 + i])).toBe(true);
    }
  });

  it("writes an Enhance brief with the fixed and varying sections", () => {
    const { brief } = enhanceReply(buildEnhanceTaskMessage({ title: "t", description: TASK_DESCRIPTIONS.finance }));
    expect(brief.length).toBeGreaterThanOrEqual(500);
    expect(brief).toContain("## Same every time");
    expect(brief).toContain("## Varies each time");
  });

  it("drafts a skill with its own Before you start section, which assembly replaces with exactly one", () => {
    expect(JOB_DRAFT.body).toContain("## Before you start — ask the user for");
    const built = assembleJobSkill("board-update", JOB_DRAFT, planAssets([]), { perUse: [{ label: "Month", hint: "", required: true }] });
    const skillMd = built.files[0].content;
    expect(skillMd.match(/^## Before you start — ask the user for$/gm)).toHaveLength(1);
    expect(skillMd).not.toContain("The model's own list");
    expect(validateJobSkill("board-update", built.files, built.assets)).toEqual([]);
  });
});
