import { describe, expect, it } from "vitest";
import { assembleJobSkill, filesSection, type PlanInputFile } from "./assemble";
import { planPluginAssets } from "./plugin-assets";

const MB = 1024 * 1024;
const file = (id: string, size: number, over: Partial<PlanInputFile> = {}): PlanInputFile => ({
  id,
  fileName: `${id}.png`,
  assetName: `${id}.png`,
  kind: "PNG",
  size,
  analysis: `analysis of ${id}`,
  questionId: null,
  ...over,
});
const shipping = (plan: ReturnType<typeof planPluginAssets>, skill: string) =>
  plan.get(skill)!.map((f) => `${f.id}:${f.shipping === "analysis-only" ? f.reason : f.shipping}`);

describe("planPluginAssets", () => {
  it("bundles the main skill's files once and copies small ones into a sub-skill that selected them", () => {
    const files = [file("logo", MB), file("deck", 2 * MB, { kind: "PPTX", assetName: "deck.pptx" })];
    const plan = planPluginAssets(
      [
        { name: "main", role: "MAIN", fileIds: ["logo", "deck"] },
        { name: "designer", role: "SUB", fileIds: ["logo", "deck"] },
        { name: "checker", role: "SUB", fileIds: [] },
      ],
      files,
    );
    expect(shipping(plan, "main")).toEqual(["logo:bundled", "deck:bundled"]);
    expect(shipping(plan, "designer")).toEqual(["logo:bundled", "deck:in-main"]);
    expect(plan.get("checker")).toEqual([]);
    const inMain = plan.get("designer")![1];
    expect(inMain).toMatchObject({ shipping: "in-main", mainSkill: "main", path: "assets/deck.pptx" });
  });

  it("bundles a file only a sub-skill selected in the main skill too", () => {
    const plan = planPluginAssets(
      [
        { name: "main", role: "MAIN", fileIds: [] },
        { name: "designer", role: "SUB", fileIds: ["big"] },
      ],
      [file("big", 3 * MB)],
    );
    expect(shipping(plan, "main")).toEqual(["big:bundled"]);
    expect(shipping(plan, "designer")).toEqual(["big:in-main"]);
  });

  it("stops copying once every copy would pass 25 MB in total, and notes the file in the main skill instead", () => {
    const files = [file("a", 9 * MB), file("b", 9 * MB), file("c", 6.5 * MB), file("small", 1 * MB)];
    const plan = planPluginAssets(
      [
        { name: "main", role: "MAIN", fileIds: ["a", "b", "c"] },
        { name: "s1", role: "SUB", fileIds: ["small"] },
      ],
      files,
    );
    // 24.5 MB in the main skill: the 1 MB file still fits there once, but not as a second copy.
    expect(shipping(plan, "main")).toEqual(["a:bundled", "b:bundled", "c:bundled", "small:over-budget"]);
    expect(shipping(plan, "s1")).toEqual(["small:over-budget"]);
  });

  it("copies at exactly 1 MB and the budget's last byte, never above", () => {
    const plan = planPluginAssets(
      [
        { name: "main", role: "MAIN", fileIds: ["a", "a2", "a3", "b"] },
        { name: "s1", role: "SUB", fileIds: ["b"] },
        { name: "s2", role: "SUB", fileIds: ["b"] },
      ],
      [file("a", 9 * MB), file("a2", 9 * MB), file("a3", 5 * MB), file("b", 1 * MB)],
    );
    expect(shipping(plan, "s1")).toEqual(["b:bundled"]);
    expect(shipping(plan, "s2")).toEqual(["b:in-main"]);
    const over = planPluginAssets(
      [
        { name: "main", role: "MAIN", fileIds: ["c"] },
        { name: "s1", role: "SUB", fileIds: ["c"] },
      ],
      [file("c", MB + 1)],
    );
    expect(shipping(over, "s1")).toEqual(["c:in-main"]);
  });

  it("keeps a file over 10 MB as analysis only everywhere", () => {
    const plan = planPluginAssets(
      [
        { name: "main", role: "MAIN", fileIds: ["huge"] },
        { name: "s1", role: "SUB", fileIds: ["huge"] },
      ],
      [file("huge", 15 * MB)],
    );
    expect(shipping(plan, "main")).toEqual(["huge:too-large"]);
    expect(shipping(plan, "s1")).toEqual(["huge:too-large"]);
  });

  it("ignores ids of removed files", () => {
    const plan = planPluginAssets([{ name: "main", role: "MAIN", fileIds: ["gone"] }], []);
    expect(plan.get("main")).toEqual([]);
  });
});

describe("a sub-skill's files", () => {
  it("names the main skill for a file it doesn't carry, and its style guide covers only its own files", () => {
    const plan = planPluginAssets(
      [
        { name: "quarterly-deck", role: "MAIN", fileIds: ["deck", "logo"] },
        { name: "designer", role: "SUB", fileIds: ["deck"] },
      ],
      [file("deck", 2 * MB, { fileName: "Deck.pptx", assetName: "deck.pptx", kind: "PPTX" }), file("logo", MB)],
    );
    const sub = plan.get("designer")!;
    expect(filesSection(sub)).toContain(
      '- "Deck.pptx": Kept in the `quarterly-deck` skill of this plugin (`assets/deck.pptx`). If you can\'t open it, ask the user to attach it.',
    );
    const draft = { description: "d", compatibility: "", body: "# D", references: [], scripts: [] };
    const built = assembleJobSkill("designer", draft, sub);
    expect(built.assets).toEqual([]);
    const guide = built.files.find((f) => f.path === "references/style-guide.md")!.content;
    expect(guide).toContain("analysis of deck");
    expect(guide).not.toContain("analysis of logo");
  });
});
