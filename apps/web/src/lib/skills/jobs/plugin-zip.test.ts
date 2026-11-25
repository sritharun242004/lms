import { createHash, randomBytes } from "node:crypto";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { splitFrontmatter } from "../frontmatter";
import { validateJobSkill } from "./assemble";
import { pluginVersionRecord } from "./plugin";
import { buildPluginShareZip, buildPluginZip, pluginZipSize, toPluginVersionDetail } from "./plugin-download";
import { buildFixturePlugin, FIXTURE_PLUGIN, FIXTURE_SKILLS, fixtureFiles } from "./plugin-fixture.test-helper";

const DECK = new Uint8Array(randomBytes(1.5 * 1024 * 1024));
const LOGO = new Uint8Array(randomBytes(512));
const BYTES = new Map([
  ["deck", DECK],
  ["logo", LOGO],
]);
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** v1 of the fixture plugin, stored and read back exactly as generation and download do. */
function storedV1() {
  const built = buildFixturePlugin(fixtureFiles(DECK, LOGO));
  const record = pluginVersionRecord(built.skills, built.files);
  const detail = toPluginVersionDetail({ version: 1, name: FIXTURE_PLUGIN.name, displayName: FIXTURE_PLUGIN.displayName, createdAt: new Date("2026-11-25T12:00:00Z"), ...record });
  if (!detail) throw new Error("fixture did not round-trip");
  return detail;
}
const frontmatter = (content: string) => parse(splitFrontmatter(content)!.frontmatter) as Record<string, unknown>;

describe("plugin zip", () => {
  const detail = storedV1();
  const zip = buildPluginZip(detail, BYTES);
  const entries = unzipSync(zip);
  const root = `${FIXTURE_PLUGIN.name}/`;
  const paths = Object.keys(entries);
  const text = (path: string) => strFromU8(entries[`${root}${path}`]);

  it("has exactly one top-level folder and nothing Claude would refuse", () => {
    expect(new Set(paths.map((p) => p.split("/")[0]))).toEqual(new Set([FIXTURE_PLUGIN.name]));
    const top = new Set(paths.map((p) => p.split("/")[1]));
    expect(top).toEqual(new Set([".claude-plugin", "commands", "skills"]));
    for (const forbidden of ["bin", "agents", "hooks", ".mcp.json"]) expect(top.has(forbidden)).toBe(false);
  });

  it("writes .claude-plugin/plugin.json with the exact keys and values", () => {
    const manifest = JSON.parse(text(".claude-plugin/plugin.json"));
    expect(Object.keys(manifest)).toEqual(["name", "displayName", "version", "description", "author"]);
    expect(manifest).toEqual({
      name: "acme-quarterly-deck",
      displayName: "Acme · Quarterly deck",
      version: "1.0.0",
      description: "Builds the quarterly board deck from the numbers. Includes: deck-designer, deck-grammar-check.",
      author: { name: "Acme" },
    });
  });

  it("puts every skill in skills/<name>/ with a SKILL.md that names its folder and validates alone", () => {
    const folders = new Set(paths.filter((p) => p.startsWith(`${root}skills/`)).map((p) => p.split("/")[2]));
    expect(folders).toEqual(new Set(FIXTURE_SKILLS.map((s) => s.name)));
    for (const name of folders) {
      const prefix = `${root}skills/${name}/`;
      const own = paths.filter((p) => p.startsWith(prefix)).map((p) => p.slice(prefix.length));
      const files = own.filter((p) => !p.startsWith("assets/")).map((p) => ({ path: p, content: strFromU8(entries[prefix + p]) }));
      const assets = own.filter((p) => p.startsWith("assets/")).map((p) => ({ fileId: p, path: p, fileName: p, bytes: entries[prefix + p].length }));
      const skillMd = files.find((f) => f.path === "SKILL.md")!.content;
      expect(frontmatter(skillMd).name).toBe(name);
      expect(validateJobSkill(name, files, assets)).toEqual([]);
    }
  });

  it("has one command per skill with a description", () => {
    for (const skill of FIXTURE_SKILLS) {
      const command = text(`commands/${skill.name}.md`);
      expect(String(frontmatter(command).description).trim()).not.toBe("");
      expect(command).toContain(`\`${skill.name}\` skill from this plugin`);
    }
    expect(paths.filter((p) => p.startsWith(`${root}commands/`))).toHaveLength(FIXTURE_SKILLS.length);
  });

  it("runs every sub-skill from the main skill's workflow, and marks each sub-skill as stand-alone", () => {
    const main = text("skills/quarterly-deck/SKILL.md");
    const workflow = main.slice(main.indexOf("## How this skill works"));
    expect(main.split("## How this skill works")).toHaveLength(2);
    for (const sub of FIXTURE_SKILLS.filter((s) => s.role === "SUB")) {
      expect(workflow).toContain(`\`${sub.name}\``);
      expect(workflow).toContain(`/${FIXTURE_PLUGIN.name}:${sub.name}`);
      expect(text(`skills/${sub.name}/SKILL.md`)).toContain("> Part of the **Acme · Quarterly deck** plugin.");
    }
  });

  it("bundles originals byte for byte: once in the main skill, and a small copy where a sub-skill selected it", () => {
    expect(sha(entries[`${root}skills/quarterly-deck/assets/board-deck.pptx`])).toBe(sha(DECK));
    expect(sha(entries[`${root}skills/quarterly-deck/assets/logo.png`])).toBe(sha(LOGO));
    expect(sha(entries[`${root}skills/deck-designer/assets/logo.png`])).toBe(sha(LOGO));
    expect(entries[`${root}skills/deck-designer/assets/board-deck.pptx`]).toBeUndefined();
    expect(text("skills/deck-designer/SKILL.md")).toContain("Kept in the `quarterly-deck` skill of this plugin (`assets/board-deck.pptx`)");
  });

  it("is byte-identical each time it is built, and sized before any bytes load", () => {
    expect(sha(buildPluginZip(detail, BYTES))).toBe(sha(zip));
    expect(pluginZipSize(detail, "plugin")).toBeGreaterThan(DECK.length + 2 * LOGO.length);
    expect(pluginZipSize(detail, "share")).toBeGreaterThan(2 * pluginZipSize(detail, "plugin"));
  });

  it("refuses an asset whose bytes are missing", () => {
    expect(() => buildPluginZip(detail, new Map([["deck", DECK]]))).toThrow();
  });
});

describe("plugin share zip", () => {
  const detail = storedV1();
  const share = unzipSync(buildPluginShareZip(detail, BYTES));
  const root = `${FIXTURE_PLUGIN.name}-share/`;

  it("has a README with every skill and how to call it, the readable plugin, and the upload zip byte for byte", () => {
    const readme = strFromU8(share[`${root}README.md`]);
    for (const skill of FIXTURE_SKILLS) {
      expect(readme).toContain(`\`/${FIXTURE_PLUGIN.name}:${skill.name}\``);
      expect(readme).toContain(`"use ${skill.name} on this…"`);
    }
    expect(readme).toContain("Plugins → Add → Upload plugin");
    expect(share[`${root}plugin/${FIXTURE_PLUGIN.name}/.claude-plugin/plugin.json`]).toBeDefined();
    expect(share[`${root}plugin/${FIXTURE_PLUGIN.name}/skills/deck-designer/SKILL.md`]).toBeDefined();
    expect(sha(share[`${root}upload-to-claude/${FIXTURE_PLUGIN.name}.zip`])).toBe(sha(buildPluginZip(detail, BYTES)));
  });
});
