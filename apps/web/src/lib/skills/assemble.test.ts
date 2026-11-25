import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { assembleSkillFiles, buildSkillMd, inFolder, type SkillDraft } from "./assemble";
import { splitFrontmatter } from "./frontmatter";
import { validateSkillFiles } from "./format";

const DRAFT: SkillDraft = {
  name: "Something Else Entirely",
  description: 'Writes the "board" update: numbers first.\n# Use when asked for the monthly update',
  compatibility: "",
  body: "# Board update\n\nRead `references/context.md` first.",
  references: [{ path: "context.md", content: "[Add your company context here]" }],
  scripts: [{ path: "./scripts/count_words.py", content: "print(1)", purpose: "Counts words in the draft." }],
  assets: [{ path: "assets/template.md", content: "## Template" }],
};

describe("assembleSkillFiles", () => {
  it("writes SKILL.md first with the item's name, and places files in their folders", () => {
    const files = assembleSkillFiles("board-update", DRAFT);
    expect(files.map((f) => f.path)).toEqual(["SKILL.md", "references/context.md", "scripts/count_words.py", "assets/template.md"]);
    expect(files[0].content.startsWith('---\nname: "board-update"\n')).toBe(true);
    expect(validateSkillFiles(files, "board-update")).toEqual([]);
  });

  it("keeps quotes, colons and # in the description as valid YAML 1.1", () => {
    const front = splitFrontmatter(assembleSkillFiles("board-update", DRAFT)[0].content)!.frontmatter;
    expect(parse(front, { version: "1.1" })).toEqual({
      name: "board-update",
      description: 'Writes the "board" update: numbers first. # Use when asked for the monthly update',
    });
  });

  it("lists scripts the body does not mention, with their purpose and a review reminder", () => {
    const skillMd = assembleSkillFiles("board-update", DRAFT)[0].content;
    expect(skillMd).toContain("## Scripts");
    expect(skillMd).toContain("- `scripts/count_words.py`: Counts words in the draft.");
    const mentioned = assembleSkillFiles("board-update", { ...DRAFT, body: "Run `scripts/count_words.py` on the draft." })[0].content;
    expect(mentioned).not.toContain("## Scripts");
  });

  // YAML 1.1 (PyYAML) reads these unquoted as a bool, int, null or date; each is a valid skill name.
  it.each(["yes", "no", "on", "off", "true", "null", "123", "2024", "2024-01-01", "0x1f", "1e3"])(
    "quotes the name %s so it round-trips through the validator as text",
    (name) => {
      const files = assembleSkillFiles(name, DRAFT);
      expect(parse(splitFrontmatter(files[0].content)!.frontmatter, { version: "1.1" }).name).toBe(name);
      expect(validateSkillFiles(files, name)).toEqual([]);
    },
  );

  it("writes compatibility only when there is one", () => {
    expect(buildSkillMd("x", "d", "", "b")).not.toContain("compatibility");
    expect(buildSkillMd("x", "d", "Needs Python 3", "b")).toContain('compatibility: "Needs Python 3"');
  });

  it("assembles a hostile model path so the validator reports it", () => {
    const files = assembleSkillFiles("board-update", { ...DRAFT, scripts: [{ path: "../../evil.sh", content: "x", purpose: "x" }] });
    expect(files.map((f) => f.path)).toContain("scripts/../../evil.sh");
    expect(validateSkillFiles(files, "board-update")).toEqual([expect.stringMatching(/'\.\.'/)]);
  });
});

describe("inFolder", () => {
  it.each([
    ["context.md", "references/context.md"],
    ["references/context.md", "references/context.md"],
    ["./references/a.md", "references/a.md"],
    [" ./x.md ", "references/x.md"],
  ])("places %j under references/ once", (input, expected) => {
    expect(inFolder("references", input)).toBe(expected);
  });
});
