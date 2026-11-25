import { describe, expect, it } from "vitest";
import { renderReadme } from "./pack-docs";

describe("renderReadme", () => {
  const readme = renderReadme({
    title: "Monthly board update",
    description: "Every month I turn my notes into the board update.",
    role: null,
    skills: [{ name: "board-update", purpose: "Writes the board update.", version: 3 }],
    hasAssets: true,
  });

  it("says what is inside, with each skill's version", () => {
    expect(readme.startsWith("# Monthly board update\n")).toBe(true);
    expect(readme).toContain("## What this job is");
    expect(readme).toContain("Every month I turn my notes into the board update.");
    expect(readme).toContain("- `board-update` (v3): Writes the board update.");
  });

  it("gives the install steps for each tool and never mentions recommendations", () => {
    expect(readme).toContain("### Claude.ai / Claude Desktop");
    expect(readme).toContain("Customize → Skills → + → Create skill → Upload a skill");
    expect(readme).toContain("## Use it");
    expect(readme).toContain("Create and edit files");
    expect(readme).toContain("`upload-to-claude/`");
    expect(readme).toContain("### Claude Code");
    expect(readme).toContain("`~/.claude/skills/`");
    expect(readme).toContain("`.claude/skills/`");
    expect(readme).toContain("### Other tools that support Agent Skills");
    expect(readme).toContain("Review any files in `scripts/` before running them.");
    expect(readme.toLowerCase()).not.toContain("recommend");
  });

  it("explains the original files only when there are some", () => {
    expect(readme).toContain("## About the files in assets/\n\nThese are your original files, included so the skill can reuse your templates.");
    const legacy = renderReadme({ title: "My week", description: "d", role: "CTO", skills: [{ name: "board-update", purpose: "Writes it." }], hasAssets: false });
    expect(legacy).not.toContain("assets/");
    expect(legacy).toContain("Role: CTO");
    expect(legacy).toContain("- `board-update`: Writes it.");
  });
});
