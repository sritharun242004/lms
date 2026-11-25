import { describe, expect, it } from "vitest";
import { cleanFileIds, cleanPluginSuggestion, fallbackSuggestion, FALLBACK_SUBS } from "./plugin-suggest";
import type { RawPluginSuggestion } from "./types";

const JOB = { title: "Quarterly deck", description: "Every quarter I build the board deck. Then I send it." };
const sub = (name: string, over: Partial<RawPluginSuggestion["subSkills"][number]> = {}) => ({
  name,
  label: `${name} label`,
  purpose: `Use for ${name}.`,
  focus: `Only ${name}.`,
  step: `Do ${name}`,
  fileIds: [],
  ...over,
});
const ctx = (over: Partial<Parameters<typeof cleanPluginSuggestion>[1]> = {}) => ({
  job: JOB,
  activeFileIds: ["f1", "f2"],
  keptNames: [],
  keptMainName: null,
  keptSubs: 0,
  ...over,
});

describe("cleanPluginSuggestion", () => {
  it("cleans the main skill and the sub-skills in workflow order, with unique names and known files", () => {
    const raw: RawPluginSuggestion = {
      main: { name: "Quarterly Deck", label: "Quarterly\ndeck", purpose: "Builds the\ndeck.", fileIds: ["f1", "nope"] },
      subSkills: [sub("Deck Designer", { fileIds: ["f2", "f2"] }), sub("deck designer"), sub("quarterly-deck", { step: "Check\nwording" })],
    };
    const out = cleanPluginSuggestion(raw, ctx());
    expect(out.main).toEqual({ name: "quarterly-deck", label: "Quarterly deck", purpose: "Builds the deck.", fileIds: ["f1"] });
    expect(out.subs.map((s) => s.name)).toEqual(["deck-designer", "deck-designer-2", "quarterly-deck-2"]);
    expect(out.subs[0]).toEqual({ name: "deck-designer", label: "Deck Designer label", purpose: "Use for Deck Designer.", focus: "Only Deck Designer.", step: "Do Deck Designer", fileIds: ["f2"] });
    expect(out.subs[2].step).toBe("Check wording");
  });

  it("keeps at most 4 sub-skills and cuts fields to their caps", () => {
    const raw = { main: { name: "m", label: "x".repeat(80), purpose: "p", fileIds: [] }, subSkills: Array.from({ length: 6 }, (_, i) => sub(`s${i}`, { focus: "f".repeat(700), step: "s".repeat(200), purpose: "p".repeat(400) })) };
    const out = cleanPluginSuggestion(raw, ctx());
    expect(out.subs).toHaveLength(4);
    expect(out.main?.label).toHaveLength(60);
    expect(out.subs[0].focus).toHaveLength(600);
    expect(out.subs[0].step).toHaveLength(160);
    expect(out.subs[0].purpose).toHaveLength(300);
  });

  it("fills up to two sub-skills with the planner and checker fallbacks", () => {
    const one = cleanPluginSuggestion({ main: { name: "deck", label: "", purpose: "p", fileIds: [] }, subSkills: [sub("designer")] }, ctx());
    expect(one.subs.map((s) => s.name)).toEqual(["designer", "deck-planner"]);
    const none = cleanPluginSuggestion({ main: { name: "deck", label: "", purpose: "p", fileIds: [] }, subSkills: [sub("", { purpose: "", label: "" })] }, ctx());
    expect(none.subs.map((s) => s.name)).toEqual(["deck-planner", "deck-checker"]);
    expect(none.subs[0]).toMatchObject({ purpose: FALLBACK_SUBS[0].purpose, label: "Planner" });
    expect(none.subs[1]).toMatchObject({ purpose: "Checks finished work against this task's standards and lists fixes", fileIds: ["f1", "f2"] });
    expect(FALLBACK_SUBS[0].purpose).toBe("Plans the work and gathers the inputs before starting");
  });

  it("falls back to today's main skill from the title when the model gave no usable main", () => {
    const out = cleanPluginSuggestion({ main: { name: "", label: "", purpose: "", fileIds: [] }, subSkills: [sub("a"), sub("b")] }, ctx());
    expect(out.main).toEqual({ name: "quarterly-deck", label: "Quarterly deck", purpose: "Every quarter I build the board deck.", fileIds: ["f1", "f2"] });
  });

  it("keeps a main skill that has versions, counting kept sub-skills toward the room", () => {
    const raw = { main: { name: "new-main", label: "", purpose: "p", fileIds: [] }, subSkills: [sub("a"), sub("b"), sub("c")] };
    const out = cleanPluginSuggestion(raw, ctx({ keptNames: ["board-deck", "k1", "k2", "k3", "k4"], keptMainName: "board-deck", keptSubs: 4 }));
    expect(out.main).toBeNull();
    expect(out.subs.map((s) => s.name)).toEqual(["a", "b"]);
    const full = cleanPluginSuggestion(raw, ctx({ keptNames: ["board-deck"], keptMainName: "board-deck", keptSubs: 1 }));
    expect(full.subs.map((s) => s.name)).toEqual(["a", "b", "c"]);
    const fallback = cleanPluginSuggestion({ ...raw, subSkills: [] }, ctx({ keptNames: ["board-deck", "k1"], keptMainName: "board-deck", keptSubs: 1 }));
    expect(fallback.subs.map((s) => s.name)).toEqual(["board-deck-planner"]);
  });

  it("keeps fallback names within 64 characters", () => {
    const long = "a".repeat(64);
    const out = cleanPluginSuggestion({ main: { name: long, label: "", purpose: "p", fileIds: [] }, subSkills: [] }, ctx());
    for (const s of out.subs) expect(s.name.length).toBeLessThanOrEqual(64);
    expect(out.subs[0].name.endsWith("-planner")).toBe(true);
  });
});

const BOARD = { title: "Board update", description: "Every month I turn the numbers into a deck. Then I email it." };

describe("cleanFileIds", () => {
  it("keeps the order, drops unknown and repeated ids, and caps at 10", () => {
    expect(cleanFileIds(["f2", "zz", "f1", "f2"], ["f1", "f2"])).toEqual(["f2", "f1"]);
    const many = Array.from({ length: 12 }, (_, i) => `f${i}`);
    expect(cleanFileIds(many, many)).toHaveLength(10);
  });
});

describe("fallbackSuggestion", () => {
  it("names the skill from the title, takes the first sentence as purpose and uses every file", () => {
    expect(fallbackSuggestion(BOARD, ["f1", "f2"], [])).toEqual({ name: "board-update", purpose: "Every month I turn the numbers into a deck.", fileIds: ["f1", "f2"] });
    expect(fallbackSuggestion({ title: "!!!", description: "" }, [], ["my-skill"]).name).toBe("my-skill-2");
  });
});

