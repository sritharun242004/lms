import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { splitFrontmatter } from "../frontmatter";
import { SKILL_LIMITS } from "../limits";
import {
  assembleJobSkill,
  buildStyleGuide,
  filesSection,
  planAssets,
  SHORTENED_MARKER,
  STYLE_GUIDE_PATH,
  validateJobSkill,
  type PlanInputFile,
} from "./assemble";
import type { JobSkillDraft, VersionAsset } from "./types";

const MB = 1024 * 1024;
const file = (over: Partial<PlanInputFile> = {}): PlanInputFile => ({
  id: "f1",
  fileName: "Q3 board deck.pptx",
  assetName: "q3-board-deck.pptx",
  kind: "PPTX",
  size: 2 * MB,
  analysis: "## Colours\n\n- Navy #1F4E79 for titles",
  questionId: null,
  ...over,
});
const DRAFT: JobSkillDraft = {
  description: 'Writes the monthly board update: "numbers first".\nUse when asked for a board update.',
  compatibility: "",
  body: "# Board update\n\nRead `references/style-guide.md` before writing.",
  references: [{ path: "board-context.md", content: "[Add the board's priorities here]" }],
  scripts: [{ path: "count_words.py", content: "import sys\nprint(len(sys.stdin.read().split()))\n", purpose: "Counts the words in a draft." }],
};

describe("planAssets", () => {
  it("bundles files up to 10 MB at assets/<assetName> and marks larger ones analysis only", () => {
    const plan = planAssets([file(), file({ id: "f2", fileName: "Brand book.pdf", assetName: "brand-book.pdf", kind: "PDF", size: 12 * MB })]);
    expect(plan[0]).toMatchObject({ id: "f1", shipping: "bundled", path: "assets/q3-board-deck.pptx", analysis: file().analysis });
    expect(plan[1]).toMatchObject({ id: "f2", shipping: "analysis-only", reason: "too-large" });
  });

  it("bundles a file of exactly 10 MB", () => {
    expect(planAssets([file({ size: 10 * MB })])[0].shipping).toBe("bundled");
  });

  it("keeps the skill's file order and stops bundling past 25 MB in total, still fitting later small files", () => {
    const plan = planAssets([
      file({ id: "a", assetName: "a.pptx", size: 9 * MB }),
      file({ id: "b", assetName: "b.pptx", size: 9 * MB }),
      file({ id: "c", assetName: "c.pptx", size: 9 * MB }),
      file({ id: "d", assetName: "d.png", kind: "PNG", size: 1 * MB }),
    ]);
    expect(plan.map((p) => p.id)).toEqual(["a", "b", "c", "d"]);
    expect(plan.map((p) => (p.shipping === "bundled" ? "bundled" : p.reason))).toEqual(["bundled", "bundled", "over-budget", "bundled"]);
  });
});

describe("filesSection", () => {
  it("writes the server's section: style guide, bundled originals and analysis-only files", () => {
    const plan = planAssets([
      file(),
      file({ id: "f2", fileName: 'The "Brand" <book>.pdf', assetName: "brand-book.pdf", kind: "PDF", size: Math.round(14.2 * MB) }),
    ]);
    expect(filesSection(plan)).toBe(
      [
        "## Files in this skill",
        "",
        "- `references/style-guide.md`: colours, fonts, layouts and structure taken from the files below. Follow it for anything you produce.",
        '- `assets/q3-board-deck.pptx`: the original "Q3 board deck.pptx". Start from this file and reuse its masters, layouts and theme instead of recreating the design.',
        '- "The Brand book.pdf" (14.2 MB) was too large to include. Its style is described in `references/style-guide.md`.',
      ].join("\n"),
    );
  });

  it("explains a file left out by the 25 MB budget", () => {
    const plan = planAssets([file({ size: 9 * MB }), file({ id: "b", assetName: "b.pptx", size: 9 * MB }), file({ id: "c", fileName: "Old deck.pptx", assetName: "c.pptx", size: 9 * MB })]);
    expect(filesSection(plan)).toContain(
      "- \"Old deck.pptx\" (9.0 MB) didn't fit in this skill's 25 MB of bundled files. Its style is described in `references/style-guide.md`.",
    );
  });

  it("uses wording that fits Word, Excel and image originals", () => {
    const section = filesSection(
      planAssets([
        file({ id: "w", fileName: "Memo.docx", assetName: "memo.docx", kind: "DOCX" }),
        file({ id: "x", fileName: "Model.xlsx", assetName: "model.xlsx", kind: "XLSX" }),
        file({ id: "p", fileName: "Logo.png", assetName: "logo.png", kind: "PNG" }),
      ]),
    );
    expect(section).toContain("reuse its styles and page setup instead of recreating them.");
    expect(section).toContain("reuse its sheets, formulas and number formats instead of rebuilding them.");
    expect(section).toContain('- `assets/logo.png`: the original "Logo.png". Use it as the reference for how the result should look.');
  });

  it("is empty when the skill uses no files", () => {
    expect(filesSection([])).toBe("");
  });
});

describe("buildStyleGuide", () => {
  it("is null when the skill uses no files", () => {
    expect(buildStyleGuide([])).toBeNull();
  });

  it("uses each analysis as stored (headings demoted under its file), with how the file ships, and says when none exists", () => {
    const edited = "## Colours\n\n- Brand red #C00000 (edited by hand)\n";
    const guide = buildStyleGuide(
      planAssets([file({ analysis: edited }), file({ id: "f2", fileName: "Brand book.pdf", assetName: "brand-book.pdf", kind: "PDF", size: 12 * MB, analysis: null })]),
    )!;
    expect(guide).toBe(
      [
        "# Style guide",
        "",
        "Taken from the files uploaded for this task, grouped by the question each file answers. Analyses edited by hand are used exactly as written.",
        "",
        "## General files",
        "",
        "### Q3 board deck.pptx",
        "",
        "Bundled as assets/q3-board-deck.pptx.",
        "",
        "#### Colours\n\n- Brand red #C00000 (edited by hand)",
        "",
        "### Brand book.pdf",
        "",
        "Not bundled (too large).",
        "",
        "No analysis is available for this file.",
        "",
      ].join("\n"),
    );
  });

  it("shortens every analysis proportionally so the file stays within 200 KB", () => {
    const files = Array.from({ length: 10 }, (_, i) =>
      file({ id: `f${i}`, fileName: `Deck ${i}.pptx`, assetName: `deck-${i}.pptx`, size: 1024, analysis: "é".repeat(12_000) }),
    );
    const guide = buildStyleGuide(planAssets(files))!;
    expect(new TextEncoder().encode(guide).length).toBeLessThanOrEqual(SKILL_LIMITS.fileBytes);
    expect(guide.split(SHORTENED_MARKER)).toHaveLength(11);
    expect(guide).not.toContain("�");
    expect(guide.startsWith("# Style guide\n")).toBe(true);
  });

  it("demotes the analysis's own headings so the file's ### heading stays above them", () => {
    const usual = buildStyleGuide(planAssets([file({ analysis: "## Colours\n\n### Accents\n\n```md\n## not a heading\n```\n#hashtag" })]))!;
    expect(usual).toContain("#### Colours\n\n##### Accents\n\n```md\n## not a heading\n```\n#hashtag");
    const titled = buildStyleGuide(planAssets([file({ analysis: "# Overview\n\n## Colours\n\n###### Deep" })]))!;
    expect(titled).toContain("#### Overview\n\n##### Colours\n\n###### Deep");
    expect(usual.match(/^### .*/gm)).toEqual(["### Q3 board deck.pptx"]);
    expect(titled.match(/^##? .*/gm)).toEqual(["# Style guide", "## General files"]);
  });
});

describe("assembleJobSkill", () => {
  const plan = planAssets([file()]);

  it("writes SKILL.md, the server's style guide, model references and scripts, plus the bundled originals", () => {
    const { files, assets } = assembleJobSkill("board-update", DRAFT, plan);
    expect(files.map((f) => f.path)).toEqual(["SKILL.md", STYLE_GUIDE_PATH, "references/board-context.md", "scripts/count_words.py"]);
    expect(assets).toEqual([{ fileId: "f1", path: "assets/q3-board-deck.pptx", fileName: "Q3 board deck.pptx", bytes: 2 * MB }]);
    const parts = splitFrontmatter(files[0].content)!;
    expect(parse(parts.frontmatter, { version: "1.1" })).toEqual({
      name: "board-update",
      description: 'Writes the monthly board update: "numbers first". Use when asked for a board update.',
    });
    expect(parts.body).toContain("## Files in this skill");
    expect(parts.body).toContain("- `assets/q3-board-deck.pptx`:");
    expect(parts.body).toContain("## Scripts\n\nReview each script before running it.\n\n- `scripts/count_words.py`: Counts the words in a draft.");
  });

  it("does not list a script the body already mentions", () => {
    const { files } = assembleJobSkill("board-update", { ...DRAFT, body: "Run `scripts/count_words.py` on the draft." }, plan);
    expect(files[0].content).not.toContain("## Scripts");
  });

  it("drops any style guide the model wrote: the server's, built from the analyses, wins", () => {
    const { files } = assembleJobSkill(
      "board-update",
      {
        ...DRAFT,
        references: [
          { path: "style-guide.md", content: "MODEL VERSION" },
          { path: "./references/Style-Guide.md", content: "MODEL VERSION" },
          { path: "board-context.md", content: "ok" },
        ],
      },
      plan,
    );
    expect(files.filter((f) => f.path.toLowerCase() === STYLE_GUIDE_PATH)).toHaveLength(1);
    expect(files.map((f) => f.content).join("\n")).not.toContain("MODEL VERSION");
  });

  it("writes neither a style guide nor a files section for a skill without files", () => {
    const { files, assets } = assembleJobSkill("board-update", DRAFT, []);
    expect(files.map((f) => f.path)).toEqual(["SKILL.md", "references/board-context.md", "scripts/count_words.py"]);
    expect(files[0].content).not.toContain("## Files in this skill");
    expect(assets).toEqual([]);
  });

  it("produces a skill that passes every check", () => {
    const { files, assets } = assembleJobSkill("board-update", DRAFT, planAssets([file(), file({ id: "f2", fileName: "Big.pdf", assetName: "big.pdf", kind: "PDF", size: 12 * MB })]));
    expect(validateJobSkill("board-update", files, assets)).toEqual([]);
  });
});

describe("validateJobSkill", () => {
  const skill = assembleJobSkill("board-update", DRAFT, []).files;
  const asset = (over: Partial<VersionAsset> = {}): VersionAsset => ({ fileId: "f1", path: "assets/deck.pptx", fileName: "Deck.pptx", bytes: MB, ...over });

  it("keeps every text-file rule of the Agent Skills validator", () => {
    expect(validateJobSkill("other-name", skill, [])).toEqual([expect.stringMatching(/name must be "other-name"/)]);
  });

  it("rejects an unsafe asset path or one outside assets/", () => {
    expect(validateJobSkill("board-update", skill, [asset({ path: "assets/../x.pptx" })])).toEqual([expect.stringMatching(/'\.\.'/)]);
    expect(validateJobSkill("board-update", skill, [asset({ path: "references/deck.pptx" })])).toEqual([expect.stringMatching(/inside assets\//)]);
  });

  it("rejects an asset whose path collides with another file, ignoring case", () => {
    const withText = [...skill, { path: "assets/notes.md", content: "x" }];
    expect(validateJobSkill("board-update", withText, [asset({ path: "assets/Notes.md" })])).toEqual([expect.stringMatching(/duplicate path/)]);
    expect(validateJobSkill("board-update", skill, [asset(), asset({ fileId: "f2" })])).toEqual([expect.stringMatching(/duplicate path/)]);
  });

  it("enforces 10 MB per bundled file and 25 MB in total", () => {
    expect(validateJobSkill("board-update", skill, [asset({ bytes: 10 * MB + 1 })])).toEqual([expect.stringMatching(/10 MB limit for a bundled file/)]);
    const three = [1, 2, 3].map((n) => asset({ fileId: `f${n}`, path: `assets/d${n}.pptx`, bytes: 9 * MB }));
    expect(validateJobSkill("board-update", skill, three)).toEqual([expect.stringMatching(/over the 25 MB limit/)]);
  });

  it("counts assets towards the 100-file limit", () => {
    const many = [...skill, ...Array.from({ length: 97 }, (_, i) => ({ path: `references/n-${i}.md`, content: "x" }))];
    expect(many).toHaveLength(100);
    expect(validateJobSkill("board-update", many, [])).toEqual([]);
    expect(validateJobSkill("board-update", many, [asset()])).toEqual([expect.stringMatching(/at most 100 files \(this one has 101\)/)]);
  });
});
