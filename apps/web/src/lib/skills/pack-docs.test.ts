import { describe, expect, it } from "vitest";
import { renderReadme, renderRecommended } from "./pack-docs";

const REC = {
  name: "Impeccable",
  why: "Polishes the dashboards you review.",
  sourceUrl: "https://github.com/pbakaus/impeccable",
  license: "Apache-2.0",
  installNotes: "Follow the README.",
};

describe("renderReadme", () => {
  const readme = renderReadme({
    title: "My week",
    description: "I plan the week and write board updates.",
    role: "CTO",
    skills: [{ name: "board-update", purpose: "Writes the board update." }],
    recommendations: [REC],
  });

  it("says what is inside", () => {
    expect(readme.startsWith("# My week\n")).toBe(true);
    expect(readme).toContain("I plan the week and write board updates.");
    expect(readme).toContain("- `board-update`: Writes the board update.");
  });

  it("gives the install steps for each tool", () => {
    expect(readme).toContain("### Claude.ai / Claude Desktop");
    expect(readme).toContain("Settings → Capabilities → Skills");
    expect(readme).toContain("`upload-to-claude/`");
    expect(readme).toContain("### Claude Code");
    expect(readme).toContain("`~/.claude/skills/`");
    expect(readme).toContain("`.claude/skills/`");
    expect(readme).toContain("### Other tools that support Agent Skills");
    expect(readme).toContain("`recommended-skills.md`");
    expect(readme).toContain("Review any files in `scripts/` before running them.");
  });
});

describe("renderRecommended", () => {
  it("lists each match with why, source, license and install notes", () => {
    const md = renderRecommended([REC]);
    expect(md).toContain("## Impeccable");
    expect(md).toContain("Polishes the dashboards you review.");
    expect(md).toContain("- Source: https://github.com/pbakaus/impeccable");
    expect(md).toContain("- License: Apache-2.0");
    expect(md).toContain("- Install: Follow the README.");
  });

  it("says so when nothing was recommended", () => {
    expect(renderRecommended([])).toContain("No existing skills were recommended for this pack.");
  });
});
