import { describe, expect, it } from "vitest";
import { KINDS, pluginSuggestionReply, TASK_DESCRIPTIONS } from "../../../../scripts/fake-anthropic-shapes.mjs";
import { PluginSuggestReply } from "@/lib/ai/claude";
import { buildSuggestMessage } from "./instructions";
import { cleanPluginSuggestion } from "./plugin-suggest";

const message = (kind: keyof typeof TASK_DESCRIPTIONS) =>
  buildSuggestMessage({
    title: "My task",
    description: TASK_DESCRIPTIONS[kind],
    outputType: null,
    questions: [],
    perUse: [],
    files: [{ id: "f1", fileName: "a.pptx", kind: "PPTX", size: 10, analysis: null, questionId: null }],
    built: [],
  });
const ctx = { job: { title: "My task", description: "d" }, activeFileIds: ["f1"], keptNames: [], keptMainName: null, keptSubs: 0 };

describe("fake Anthropic plugin suggestions", () => {
  it.each(KINDS)("answers %s with one main and three sub-skills that parse as the real schema", (kind) => {
    const { reply, kind: picked } = pluginSuggestionReply(message(kind));
    expect(picked).toBe(kind);
    expect(PluginSuggestReply.safeParse(reply).success).toBe(true);
    expect(reply.subSkills).toHaveLength(3);
    expect(reply.main.fileIds).toEqual(["f1", "file_that_does_not_exist"]);
    const clean = cleanPluginSuggestion(reply, ctx);
    expect(clean.main?.fileIds).toEqual(["f1"]);
    expect(new Set(clean.subs.map((s) => s.name)).size).toBe(3);
  });

  it("names the carousel's sub-skills as the spec does", () => {
    expect(pluginSuggestionReply(message("carousel")).reply.subSkills.map((s) => s.name)).toEqual(["carousel-designer", "caption-writer", "hashtag-check"]);
  });

  it("repeats one sub name for the other kind, which clean-up makes unique", () => {
    const { reply } = pluginSuggestionReply(message("other"));
    expect(reply.subSkills[1].name).toBe(reply.subSkills[2].name);
    expect(cleanPluginSuggestion(reply, ctx).subs.map((s) => s.name)).toEqual(["wine-picker", "tasting-notes", "tasting-notes-2"]);
  });
});

describe("fake Anthropic plugin drafts", () => {
  it("recognises a sub-skill message and writes a draft that parses and validates alone", async () => {
    const { subSkillDraft, subSkillName, JOB_DRAFT } = await import("../../../../scripts/fake-anthropic-shapes.mjs");
    const { buildSubSkillGenerateMessage, buildJobGenerateMessage } = await import("./instructions");
    const { assembleJobSkill, validateJobSkill } = await import("./assemble");
    const common = { title: "t", description: "d", outputType: null, questions: [], perUse: [], files: [] };
    const subMessage = buildSubSkillGenerateMessage({ ...common, main: { name: "m", purpose: "p" }, subSkill: { name: "deck-designer", purpose: "p", focus: "f" }, siblings: [] });
    expect(subSkillName(subMessage)).toBe("deck-designer");
    expect(subSkillName(buildJobGenerateMessage({ ...common, skill: { name: "m", purpose: "p" } }))).toBeNull();
    const built = assembleJobSkill("deck-designer", subSkillDraft("deck-designer"), []);
    expect(validateJobSkill("deck-designer", built.files, built.assets)).toEqual([]);
    expect(JOB_DRAFT.body).toContain("## How this skill works");
  });
});
