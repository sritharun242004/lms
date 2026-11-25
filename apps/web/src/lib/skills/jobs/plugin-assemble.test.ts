import { describe, expect, it } from "vitest";
import { assembleJobSkill, validateJobSkill } from "./assemble";
import { howThisSkillWorksSection, pluginCommand, standAloneNote, SUB_BEFORE_YOU_START_NOTE, workflowSteps, HOW_THIS_SKILL_WORKS_HEADING } from "./plugin-assemble";
import type { JobSkillDraft } from "./types";

const PLUGIN = { name: "acme-quarterly-deck", displayName: "Acme · Quarterly deck" };
const SUBS = [
  { name: "deck-analyzer", step: "Analyse the source files", purpose: "p" },
  { name: "deck-designer", step: "Lay out the slides in the house style.", purpose: "p" },
  { name: "deck-formatter", step: "", purpose: "Applies the template's formatting" },
  { name: "deck-grammar-check", step: "Check the wording before handing over", purpose: "p" },
];
const PER_USE = [{ label: "Quarter", hint: "e.g. Q3", required: true }];
const draft = (body: string): JobSkillDraft => ({ description: "Builds the deck.", compatibility: "", body, references: [], scripts: [] });
const skillMd = (built: { files: { path: string; content: string }[] }) => built.files.find((f) => f.path === "SKILL.md")!.content;
const count = (text: string, needle: string) => text.split(needle).length - 1;

describe("How this skill works", () => {
  it("matches the spec's section, in workflow order with each command", () => {
    expect(howThisSkillWorksSection(PLUGIN, SUBS, true)).toBe(
      [
        "## How this skill works",
        "",
        "This skill runs the whole job and uses every sub-skill in this plugin. At each step, load and follow that sub-skill's SKILL.md (in Claude Code or Cowork you can also run its command), then carry on here.",
        "",
        '1. Gather the inputs listed in "Before you start".',
        "2. `deck-analyzer` — Analyse the source files. (`/acme-quarterly-deck:deck-analyzer`)",
        "3. `deck-designer` — Lay out the slides in the house style. (`/acme-quarterly-deck:deck-designer`)",
        "4. `deck-formatter` — Applies the template's formatting. (`/acme-quarterly-deck:deck-formatter`)",
        "5. `deck-grammar-check` — Check the wording before handing over. (`/acme-quarterly-deck:deck-grammar-check`)",
        "6. Finish with the steps below and hand the result over.",
      ].join("\n"),
    );
  });

  it("starts at the first sub-skill when there is nothing to ask for", () => {
    const section = howThisSkillWorksSection(PLUGIN, SUBS.slice(0, 2), false);
    expect(section).not.toContain("Before you start");
    expect(section).toContain("1. `deck-analyzer`");
    expect(section).toContain("3. Finish with the steps below");
    expect(workflowSteps(SUBS, false).get("deck-designer")).toBe(2);
    expect(workflowSteps(SUBS, true).get("deck-designer")).toBe(3);
  });

  it("is placed after Before you start in the main SKILL.md, exactly once, replacing a model-written copy", () => {
    const body = "# Quarterly deck\n\n## How this skill works\n\n1. Model steps\n\n### Detail\n\nmore\n\n## Steps\n\n1. Build it.";
    const section = howThisSkillWorksSection(PLUGIN, SUBS, true);
    const md = skillMd(assembleJobSkill("quarterly-deck", draft(body), [], { perUse: PER_USE, plugin: { role: "MAIN", section } }));
    expect(count(md, HOW_THIS_SKILL_WORKS_HEADING)).toBe(1);
    expect(md).not.toContain("Model steps");
    expect(md).not.toContain("### Detail");
    expect(md.indexOf("## Before you start")).toBeLessThan(md.indexOf(HOW_THIS_SKILL_WORKS_HEADING));
    expect(md.indexOf(HOW_THIS_SKILL_WORKS_HEADING)).toBeLessThan(md.indexOf("## Steps"));
    let last = -1;
    for (const sub of SUBS) {
      const at = md.indexOf(`\`/acme-quarterly-deck:${sub.name}\``);
      expect(at).toBeGreaterThan(last);
      last = at;
    }
  });
});

describe("sub-skill sections", () => {
  it("writes the stand-alone note with the plugin's display name and the step it is", () => {
    expect(standAloneNote(PLUGIN.displayName, "quarterly-deck", 3)).toBe(
      "> Part of the **Acme · Quarterly deck** plugin. Use this skill alone when you only need this part; the `quarterly-deck` skill also runs it as step 3 of the whole job.",
    );
    expect(standAloneNote("A **bold** name", "m", 2)).toContain("**A bold name**");
  });

  it("puts the note after the title, then its own Before you start with the sub-skill intro, and validates alone", () => {
    const note = standAloneNote(PLUGIN.displayName, "quarterly-deck", 3);
    const built = assembleJobSkill("deck-designer", draft("# Deck designer\n\n1. Lay it out."), [], { perUse: PER_USE, plugin: { role: "SUB", note } });
    const md = skillMd(built);
    expect(md.indexOf("# Deck designer")).toBeLessThan(md.indexOf(note));
    expect(md.indexOf(note)).toBeLessThan(md.indexOf("## Before you start"));
    expect(md).toContain(SUB_BEFORE_YOU_START_NOTE);
    expect(SUB_BEFORE_YOU_START_NOTE).toBe("Ask only for the ones this part needs, and only if the request doesn't already give them.");
    expect(md).toContain("- **Quarter** (required): e.g. Q3");
    expect(validateJobSkill("deck-designer", built.files, built.assets)).toEqual([]);
  });

  it("puts the note at the top when the body has no title", () => {
    const note = standAloneNote("P", "m", 2);
    const md = skillMd(assembleJobSkill("s", draft("1. Do it."), [], { plugin: { role: "SUB", note } }));
    expect(md.split("---\n\n")[1].startsWith(note)).toBe(true);
  });
});

describe("pluginCommand", () => {
  it("is /<plugin>:<skill>", () => {
    expect(pluginCommand("acme-quarterly-deck", "deck-designer")).toBe("/acme-quarterly-deck:deck-designer");
  });
});
