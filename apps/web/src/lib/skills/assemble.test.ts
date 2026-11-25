import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import * as assemble from "./assemble";
import { buildSkillMd, inFolder } from "./assemble";
import { splitFrontmatter } from "./frontmatter";
import { validateSkillMd } from "./format";

const frontmatter = (content: string) => parse(splitFrontmatter(content)!.frontmatter, { version: "1.1" });

describe("buildSkillMd", () => {
  it("keeps quotes, colons, # and newlines in the description as valid YAML 1.1", () => {
    const md = buildSkillMd("board-update", 'Writes the "board" update: numbers first.\n# Use when asked for the monthly update', "", "# Board update");
    expect(frontmatter(md)).toEqual({ name: "board-update", description: 'Writes the "board" update: numbers first. # Use when asked for the monthly update' });
    expect(validateSkillMd(md, "board-update")).toEqual([]);
  });

  // YAML 1.1 (PyYAML) reads these unquoted as a bool, int, null or date; each is a valid skill name.
  it.each(["yes", "no", "on", "off", "true", "null", "123", "2024", "2024-01-01", "0x1f", "1e3"])(
    "quotes the name %s so it round-trips through the validator as text",
    (name) => {
      const md = buildSkillMd(name, "Writes it. Use for updates.", "", "Body");
      expect(frontmatter(md).name).toBe(name);
      expect(validateSkillMd(md, name)).toEqual([]);
    },
  );

  it("writes compatibility only when there is one", () => {
    expect(buildSkillMd("x", "d", "", "b")).not.toContain("compatibility");
    expect(buildSkillMd("x", "d", "Needs Python 3", "b")).toContain('compatibility: "Needs Python 3"');
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

describe("module", () => {
  it("no longer carries the old draft assembler", () => {
    expect(Object.keys(assemble).sort()).toEqual(["buildSkillMd", "inFolder"]);
  });
});
