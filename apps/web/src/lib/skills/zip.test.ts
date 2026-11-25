import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { sha256Hex, tinyPng } from "./files/fixtures";
import { JOB_LIMITS } from "./limits";
import { buildPackZip, buildSkillZip, DuplicateSkillNameError, PackTooLargeError, packZipSize, zipResponse, type ZipSkill } from "./zip";

const SKILL: ZipSkill = {
  name: "board-update",
  purpose: "Writes the board update.",
  files: [
    { path: "SKILL.md", content: '---\nname: board-update\ndescription: "x"\n---\n\nBody\n' },
    { path: "references/context.md", content: "Context" },
  ],
};
/** Compression method per entry: 0 = stored, 8 = deflate. */
function methods(zip: Uint8Array): Record<string, number> {
  const out: Record<string, number> = {};
  unzipSync(zip, {
    filter: (file) => {
      out[file.name] = file.compression;
      return false;
    },
  });
  return out;
}
const packOf = (skills: ZipSkill[]) => buildPackZip({ slug: "my-week", title: "My week", description: "d", role: null, skills });

describe("buildSkillZip", () => {
  it("puts the skill folder at the zip root", () => {
    const entries = unzipSync(buildSkillZip(SKILL));
    expect(Object.keys(entries).sort()).toEqual(["board-update/SKILL.md", "board-update/references/context.md"]);
    expect(strFromU8(entries["board-update/references/context.md"])).toBe("Context");
  });

  it("stores bundled originals byte for byte and uncompressed, text deflated", async () => {
    const png = await tinyPng(16, 16);
    const zip = buildSkillZip({ ...SKILL, assets: [{ path: "assets/logo.png", bytes: png }] });
    expect(sha256Hex(unzipSync(zip)["board-update/assets/logo.png"])).toBe(sha256Hex(png));
    expect(methods(zip)).toEqual({ "board-update/SKILL.md": 8, "board-update/references/context.md": 8, "board-update/assets/logo.png": 0 });
  });

  it("refuses an unsafe path, name or asset location instead of zipping it", () => {
    expect(() => buildSkillZip({ ...SKILL, files: [{ path: "../evil", content: "x" }] })).toThrow(/unsafe/);
    expect(() => buildSkillZip({ ...SKILL, name: "../x" })).toThrow(/unsafe/);
    expect(() => buildSkillZip({ ...SKILL, assets: [{ path: "references/deck.pptx", bytes: new Uint8Array([1]) }] })).toThrow(/unsafe/);
    expect(() => buildSkillZip({ ...SKILL, assets: [{ path: "assets/../x", bytes: new Uint8Array([1]) }] })).toThrow(/unsafe/);
  });

  it("refuses two entries at the same path", () => {
    expect(() => buildSkillZip({ ...SKILL, files: [...SKILL.files, { path: "references/context.md", content: "again" }] })).toThrow(/duplicate/);
  });
});

describe("buildPackZip", () => {
  it("uses the spec's pack layout, with no recommended-skills.md", () => {
    const entries = unzipSync(packOf([SKILL]));
    expect(Object.keys(entries).sort()).toEqual([
      "my-week/README.md",
      "my-week/skills/board-update/SKILL.md",
      "my-week/skills/board-update/references/context.md",
      "my-week/upload-to-claude/board-update.zip",
    ]);
    expect(strFromU8(entries["my-week/README.md"])).not.toContain("## About the files in assets/");
  });

  it("carries the same original bytes in the unpacked copy and in the upload zip, whose root is the skill folder", async () => {
    const png = await tinyPng(16, 16);
    const zip = packOf([{ ...SKILL, version: 2, assets: [{ path: "assets/logo.png", bytes: png }] }]);
    const entries = unzipSync(zip);
    expect(sha256Hex(entries["my-week/skills/board-update/assets/logo.png"])).toBe(sha256Hex(png));
    const inner = unzipSync(entries["my-week/upload-to-claude/board-update.zip"]);
    expect([...new Set(Object.keys(inner).map((k) => k.split("/")[0]))]).toEqual(["board-update"]);
    expect(sha256Hex(inner["board-update/assets/logo.png"])).toBe(sha256Hex(png));
    expect(methods(zip)["my-week/upload-to-claude/board-update.zip"]).toBe(0);
    expect(methods(zip)["my-week/skills/board-update/assets/logo.png"]).toBe(0);
    const readme = strFromU8(entries["my-week/README.md"]);
    expect(readme).toContain("- `board-update` (v2): Writes the board update.");
    expect(readme).toContain("## About the files in assets/");
  });

  it("refuses two skills with the same folder name instead of merging them", () => {
    const build = () => packOf([SKILL, { ...SKILL, purpose: "Other" }]);
    expect(build).toThrow(DuplicateSkillNameError);
    expect(build).toThrow(/board-update/);
  });

  it("refuses a pack over 100 MB before building it", () => {
    const big = new Uint8Array(26 * 1024 * 1024);
    const skills = ["one", "two"].map((name) => ({ ...SKILL, name, assets: [{ path: "assets/big.pptx", bytes: big }] }));
    expect(packZipSize(skills)).toBeGreaterThan(JOB_LIMITS.packZipBytes);
    expect(() => packOf(skills)).toThrow(PackTooLargeError);
  });
});

describe("packZipSize", () => {
  it("counts every text and asset byte twice (unpacked copy and upload zip) plus the README", () => {
    const text = SKILL.files.reduce((n, f) => n + new TextEncoder().encode(f.content).length, 0);
    expect(packZipSize([{ ...SKILL, assets: [{ path: "assets/a.png", bytes: new Uint8Array(100) }] }])).toBe(16 * 1024 + 2 * (text + 100));
    expect(packZipSize([{ files: SKILL.files, assets: [{ bytes: 100 }] }])).toBe(16 * 1024 + 2 * (text + 100));
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
