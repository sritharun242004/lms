import { describe, expect, it } from "vitest";
import { checkSkillPath, validateSkillFiles, validateSkillMd, withSkillName } from "./format";

const NAME = "board-update";
const VALID = `name: ${NAME}\ndescription: "Writes the monthly board update. Use when asked for a board update."`;
const md = (front: string, body = "Write the update from the notes.") => `---\n${front}\n---\n\n${body}\n`;
const errorsFor = (content: string, expected = NAME) => validateSkillMd(content, expected);

describe("validateSkillMd", () => {
  it("accepts a valid SKILL.md, including every allowed optional key", () => {
    expect(errorsFor(md(VALID))).toEqual([]);
    expect(errorsFor(md(`${VALID}\nlicense: MIT\nallowed-tools: Read\ncompatibility: "Python 3"\nmetadata:\n  owner: me`))).toEqual([]);
  });

  it("counts description length in characters, as the validator does", () => {
    expect(errorsFor(md(`name: ${NAME}\ndescription: "${"😀".repeat(1024)}"`))).toEqual([]);
    expect(errorsFor(md(`name: ${NAME}\ndescription: "${"😀".repeat(1025)}"`))).toEqual([expect.stringMatching(/1024/)]);
  });

  it.each([
    ["no frontmatter", "Just instructions", /no YAML frontmatter/],
    ["unclosed frontmatter", "---\nname: board-update\n", /closed with a --- line/],
    ["invalid YAML", md("name: [unclosed"), /invalid YAML/],
    ["frontmatter that is not a mapping", md("- a\n- b"), /mapping/],
    ["an unexpected key", md(`${VALID}\nversion: 1`), /unexpected frontmatter key\(s\): version/],
    ["a missing name", md('description: "Writes things."'), /missing name/],
    ["a name that is not text", md('name: 123\ndescription: "Writes things."'), /name must be text/],
    ["a name that is not kebab-case", md('name: Board_Update\ndescription: "Writes things."'), /kebab-case/],
    ["a double hyphen", md('name: board--update\ndescription: "Writes things."'), /hyphen/],
    ["a name over 64 characters", md(`name: ${"a".repeat(65)}\ndescription: "Writes things."`), /64 characters/],
    ["a name that differs from the folder", md('name: other-skill\ndescription: "Writes things."'), /match the skill folder/],
    ["a missing description", md(`name: ${NAME}`), /missing description/],
    ["a YAML 1.1 boolean description", md(`name: ${NAME}\ndescription: yes`), /description must be text/],
    ["an empty description", md(`name: ${NAME}\ndescription: ""`), /description is empty/],
    ["angle brackets in the description", md(`name: ${NAME}\ndescription: "Use <this>"`), /< or >/],
    ["a description over 1024 characters", md(`name: ${NAME}\ndescription: "${"x".repeat(1025)}"`), /1024/],
    ["a compatibility that is not text", md(`${VALID}\ncompatibility: 5`), /compatibility must be text/],
    ["a compatibility over 500 characters", md(`${VALID}\ncompatibility: "${"x".repeat(501)}"`), /500/],
    ["no instructions after the frontmatter", md(VALID, ""), /instructions below the frontmatter/],
  ])("rejects %s", (_label, content, pattern) => {
    expect(errorsFor(content)).toEqual(expect.arrayContaining([expect.stringMatching(pattern)]));
  });
});

describe("checkSkillPath", () => {
  it.each(["SKILL.md", "references/company/context.md", "scripts/count_words.py", "assets/slide-template.md"])("accepts %s", (path) => {
    expect(checkSkillPath(path)).toEqual({ ok: true, path });
  });

  it.each([
    ["", /empty/],
    [`references/${"a".repeat(200)}.md`, /longer than 200/],
    ["references\\x.md", /forward slashes/],
    ["/etc/passwd", /absolute/],
    ["C:/x.md", /absolute/],
    ["../x.md", /'\.\.'/],
    ["references/../../etc/passwd", /'\.\.'/],
    ["references/", /empty or '\.' segment/],
    ["references/./a.md", /empty or '\.' segment/],
    ["notes.md", /inside references\/, scripts\/ or assets\//],
    ["evals/evals.json", /inside references\/, scripts\/ or assets\//],
    ["scripts/__pycache__/a.pyc", /not packaged/],
    ["scripts/a.pyc", /not packaged/],
    ["references/.DS_Store", /not packaged/],
    ["references/SKILL.md", /only one SKILL\.md/],
    ["references/.env", /letters, digits/],
    ["references/a b.md", /letters, digits/],
  ])("rejects %j", (path, pattern) => {
    const result = checkSkillPath(path);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(pattern);
  });
});

describe("validateSkillFiles", () => {
  const skillMd = { path: "SKILL.md", content: md(VALID) };

  it("accepts a complete skill", () => {
    expect(
      validateSkillFiles(
        [skillMd, { path: "references/context.md", content: "x" }, { path: "scripts/count.py", content: "print(1)" }, { path: "assets/t.md", content: "t" }],
        NAME,
      ),
    ).toEqual([]);
  });

  it("requires SKILL.md", () => {
    expect(validateSkillFiles([{ path: "references/a.md", content: "x" }], NAME)).toEqual(["SKILL.md is missing"]);
  });

  it("reports hostile paths and duplicate paths", () => {
    const errors = validateSkillFiles(
      [skillMd, { path: "../../evil.sh", content: "x" }, { path: "references/A.md", content: "x" }, { path: "references/a.md", content: "y" }],
      NAME,
    );
    expect(errors).toEqual([expect.stringMatching(/'\.\.'/), expect.stringMatching(/duplicate path/)]);
  });

  it("enforces 200 KB per file, counted in UTF-8 bytes", () => {
    expect(validateSkillFiles([skillMd, { path: "references/a.md", content: "x".repeat(200 * 1024) }], NAME)).toEqual([]);
    expect(validateSkillFiles([skillMd, { path: "references/a.md", content: "x".repeat(200 * 1024 + 1) }], NAME)).toEqual([
      expect.stringMatching(/200 KB/),
    ]);
    expect(validateSkillFiles([skillMd, { path: "references/a.md", content: "é".repeat(102401) }], NAME)).toEqual([expect.stringMatching(/200 KB/)]);
  });

  it("enforces 1 MB per skill", () => {
    const big = Array.from({ length: 6 }, (_, i) => ({ path: `references/part-${i}.md`, content: "x".repeat(180 * 1024) }));
    expect(validateSkillFiles([skillMd, ...big], NAME)).toEqual([expect.stringMatching(/1 MB/)]);
  });

  it("allows at most 100 files", () => {
    const many = Array.from({ length: 100 }, (_, i) => ({ path: `references/n-${i}.md`, content: "" }));
    expect(validateSkillFiles([skillMd, ...many], NAME)).toEqual([expect.stringMatching(/at most 100 files/)]);
  });
});

describe("withSkillName", () => {
  it("renames the skill and keeps every other key and the body", () => {
    const original = md(`${VALID}\nmetadata:\n  owner: me`, "Body stays.");
    const renamed = withSkillName(original, "weekly-report");
    expect(renamed).toContain("\nname: weekly-report\n");
    expect(renamed).toContain('description: "Writes the monthly board update. Use when asked for a board update."');
    expect(renamed).toContain("owner: me");
    expect(renamed.endsWith("\n\nBody stays.\n")).toBe(true);
    expect(validateSkillMd(renamed, "weekly-report")).toEqual([]);
  });

  it("leaves content without valid frontmatter untouched", () => {
    expect(withSkillName("no frontmatter", "x")).toBe("no frontmatter");
    expect(withSkillName(md("name: [unclosed"), "x")).toBe(md("name: [unclosed"));
  });
});
