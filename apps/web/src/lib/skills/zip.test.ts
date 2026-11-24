import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { buildPackZip, buildSkillZip, zipResponse } from "./zip";

const SKILL = {
  name: "board-update",
  purpose: "Writes the board update.",
  files: [
    { path: "SKILL.md", content: "---\nname: board-update\ndescription: \"x\"\n---\n\nBody\n" },
    { path: "references/context.md", content: "Context" },
  ],
};

describe("buildSkillZip", () => {
  it("puts the skill folder at the zip root", () => {
    const entries = unzipSync(buildSkillZip(SKILL));
    expect(Object.keys(entries).sort()).toEqual(["board-update/SKILL.md", "board-update/references/context.md"]);
    expect(strFromU8(entries["board-update/references/context.md"])).toBe("Context");
  });

  it("refuses an unsafe path or name instead of zipping it", () => {
    expect(() => buildSkillZip({ ...SKILL, files: [{ path: "../evil", content: "x" }] })).toThrow(/unsafe/);
    expect(() => buildSkillZip({ ...SKILL, name: "../x" })).toThrow(/unsafe/);
  });
});

describe("buildPackZip", () => {
  const entries = unzipSync(
    buildPackZip({ slug: "my-week", title: "My week", description: "d", role: null, skills: [SKILL], recommendations: [] }),
  );

  it("uses the spec's pack layout", () => {
    expect(Object.keys(entries).sort()).toEqual([
      "my-week/README.md",
      "my-week/recommended-skills.md",
      "my-week/skills/board-update/SKILL.md",
      "my-week/skills/board-update/references/context.md",
      "my-week/upload-to-claude/board-update.zip",
    ]);
  });

  it("includes one upload-ready zip per skill with the folder at its root", () => {
    const inner = unzipSync(entries["my-week/upload-to-claude/board-update.zip"]);
    expect(Object.keys(inner).sort()).toEqual(["board-update/SKILL.md", "board-update/references/context.md"]);
  });
});

describe("zipResponse", () => {
  it("returns a downloadable zip", async () => {
    const res = zipResponse(buildSkillZip(SKILL), "board-update.zip");
    expect(res.headers.get("content-type")).toBe("application/zip");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="board-update.zip"');
    expect(Object.keys(unzipSync(new Uint8Array(await res.arrayBuffer())))).toHaveLength(2);
  });
});
