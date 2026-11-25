import { describe, expect, it } from "vitest";
import { buildCommands, buildPluginManifest, MANIFEST_PATH, pluginSemver, validatePlugin } from "./plugin";
import { buildFixturePlugin, fixtureFiles } from "./plugin-fixture.test-helper";

const manifestInput = { name: "acme-deck", displayName: "Acme · Deck", version: 1, mainPurpose: "Builds the deck.", subNames: ["deck-designer", "deck-grammar-check"], company: "Acme", userName: "Dana" };
const valid = () => buildFixturePlugin(fixtureFiles(new Uint8Array(2048), new Uint8Array(512)));

describe("buildPluginManifest", () => {
  it("writes the spec's keys and values", () => {
    const manifest = buildPluginManifest(manifestInput);
    expect(manifest).toEqual({
      name: "acme-deck",
      displayName: "Acme · Deck",
      version: "1.0.0",
      description: "Builds the deck. Includes: deck-designer, deck-grammar-check.",
      author: { name: "Acme" },
    });
    expect(Object.keys(manifest)).toEqual(["name", "displayName", "version", "description", "author"]);
  });

  it("numbers versions 1.<n-1>.0", () => {
    expect(pluginSemver(1)).toBe("1.0.0");
    expect(pluginSemver(2)).toBe("1.1.0");
    expect(buildPluginManifest({ ...manifestInput, version: 12 }).version).toBe("1.11.0");
  });

  it("falls back from the company to the user's name to Skills Builder", () => {
    expect(buildPluginManifest({ ...manifestInput, company: " " }).author.name).toBe("Dana");
    expect(buildPluginManifest({ ...manifestInput, company: "", userName: null }).author.name).toBe("Skills Builder");
  });

  it("keeps the description within 1024 characters and the list of sub-skills whole", () => {
    const description = buildPluginManifest({ ...manifestInput, mainPurpose: "x".repeat(2000) }).description;
    expect(description.length).toBeLessThanOrEqual(1024);
    expect(description.endsWith("Includes: deck-designer, deck-grammar-check.")).toBe(true);
  });
});

describe("buildCommands", () => {
  it("points each command at its skill; the main one runs the whole flow", () => {
    const [main, sub] = buildCommands([
      { name: "quarterly-deck", role: "MAIN", purpose: "Builds: the deck." },
      { name: "deck-grammar-check", role: "SUB", purpose: "Checks\nwording." },
    ]);
    expect(main).toEqual({
      path: "commands/quarterly-deck.md",
      content: '---\ndescription: "Builds: the deck."\n---\nRun the `quarterly-deck` skill from this plugin — the whole job, using each sub-skill in turn — on: $ARGUMENTS\n',
    });
    expect(sub.content).toBe('---\ndescription: "Checks wording."\n---\nUse the `deck-grammar-check` skill from this plugin on: $ARGUMENTS\n');
  });
});

describe("validatePlugin", () => {
  it("passes a complete fixture plugin, keeping the main skill's own steps", () => {
    const plugin = valid();
    expect(validatePlugin(plugin)).toEqual([]);
    const main = plugin.skills[0].files[0].content;
    expect(main).toContain("## Steps");
    expect(main).toContain("scripts/word_count.py");
    expect(main).not.toContain("A model-written workflow");
  });

  it("checks the manifest", () => {
    const plugin = valid();
    plugin.manifest = { ...plugin.manifest, name: "Bad Name", displayName: "", version: "1.0", description: "", author: { name: " " } };
    const errors = validatePlugin(plugin);
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("not a valid plugin id"),
        expect.stringContaining("display name"),
        expect.stringContaining("not semver"),
        expect.stringContaining("description must be"),
        "plugin.json: author.name is empty",
      ]),
    );
  });

  it("needs one main and 2 to 6 sub-skills", () => {
    const plugin = valid();
    plugin.skills = plugin.skills.slice(0, 2);
    expect(validatePlugin(plugin)).toContain("Add at least 2 sub-skills.");
  });

  it("prefixes a skill's own errors with its name", () => {
    const plugin = valid();
    const md = plugin.skills[1].files[0];
    plugin.skills[1].files[0] = { ...md, content: md.content.replace(/^description: .*$/m, `description: "${"x".repeat(1100)}"`) };
    expect(validatePlugin(plugin).some((e) => e.startsWith("deck-designer: "))).toBe(true);
  });

  it("needs exactly one workflow section naming every sub-skill, and each sub-skill's stand-alone note", () => {
    const plugin = valid();
    const main = plugin.skills[0].files[0];
    plugin.skills[0].files[0] = { ...main, content: main.content.replace("`deck-grammar-check`", "`other`") };
    const sub = plugin.skills[2].files[0];
    plugin.skills[2].files[0] = { ...sub, content: sub.content.replace("> Part of the **", "Part of the ") };
    const errors = validatePlugin(plugin);
    expect(errors).toContain('quarterly-deck: "How this skill works" doesn\'t name deck-grammar-check');
    expect(errors).toContain("deck-grammar-check: the stand-alone note is missing");
    const twice = valid();
    const md = twice.skills[0].files[0];
    twice.skills[0].files[0] = { ...md, content: `${md.content}\n## How this skill works\n` };
    expect(validatePlugin(twice)).toContain('quarterly-deck: needs exactly one "How this skill works" section');
  });

  it("needs one command with a description per skill and allows nothing else at the top", () => {
    const plugin = valid();
    plugin.files = plugin.files.filter((f) => f.path !== "commands/deck-designer.md");
    plugin.files.push({ path: "bin/run.sh", content: "" }, { path: "agents/x.md", content: "" }, { path: "commands/ghost.md", content: "---\ndescription: x\n---\n" });
    plugin.files = plugin.files.map((f) => (f.path === "commands/quarterly-deck.md" ? { ...f, content: "---\ndescription: \"\"\n---\nx\n" } : f));
    const errors = validatePlugin(plugin);
    expect(errors).toEqual(
      expect.arrayContaining([
        "deck-designer: its command is missing",
        "quarterly-deck: its command has no description",
        "bin/run.sh: not allowed at the top of a plugin",
        "agents/x.md: not allowed at the top of a plugin",
        "commands/ghost.md: no skill has this name",
      ]),
    );
    plugin.files = plugin.files.filter((f) => f.path !== MANIFEST_PATH);
    expect(validatePlugin(plugin)).toContain(".claude-plugin/plugin.json is missing");
  });

  it("caps the plugin's bundled files at 25 MB in total, and duplicate names", () => {
    const plugin = valid();
    plugin.skills[1].assets = Array.from({ length: 3 }, (_, i) => ({ fileId: `x${i}`, path: `assets/x${i}.png`, fileName: "x", bytes: 9 * 1024 * 1024 }));
    plugin.skills.push({ ...plugin.skills[2] });
    const errors = validatePlugin(plugin);
    expect(errors).toContain("The plugin's bundled files total over 25 MB");
    expect(errors).toContain("deck-grammar-check: two skills have this name");
  });
});
