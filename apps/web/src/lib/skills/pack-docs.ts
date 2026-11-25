export type ReadmeInput = {
  title: string;
  description: string;
  role: string | null;
  skills: { name: string; purpose: string; version?: number }[];
  /** True when any skill bundles original files under assets/. */
  hasAssets: boolean;
};

/** README.md at the pack root (spec: Versions and Downloads). Used for task packs and legacy packs. */
export function renderReadme(input: ReadmeInput): string {
  return [
    `# ${input.title}`,
    "",
    "Agent Skills built with Prompt Bot's Skills Builder.",
    "",
    "## What this task is",
    "",
    input.description.trim(),
    ...(input.role ? ["", `Role: ${input.role}`] : []),
    "",
    "## Skills in this pack",
    "",
    ...input.skills.map((s) => `- \`${s.name}\`${s.version ? ` (v${s.version})` : ""}: ${s.purpose}`),
    "",
    "## Install",
    "",
    "### Claude.ai / Claude Desktop",
    "",
    "First turn on Settings → Capabilities → Create and edit files (skills need it). Then open Plugins → Add → Upload plugin and upload each zip from `upload-to-claude/` (one skill per upload). It appears in your plugins as a Skill · By you.",
    "",
    "## Use it",
    "",
    "Just ask Claude for the task in your own words and attach your latest files — Claude picks the skill up automatically from its description. To be sure, name it: \"Use my <skill> skill\". In Claude Code you can also type `/<skill>`.",
    "",
    "### Claude Code",
    "",
    "Copy `skills/<skill>` into `~/.claude/skills/` (personal) or `.claude/skills/` (one project).",
    "",
    "### Other tools that support Agent Skills",
    "",
    "Copy each `skills/<skill>` folder into that tool's skills folder, as its documentation describes.",
    "",
    "## Before you run anything",
    "",
    "Review any files in `scripts/` before running them.",
    "",
    ...(input.hasAssets
      ? ["## About the files in assets/", "", "These are your original files, included so the skill can reuse your templates.", ""]
      : []),
  ].join("\n");
}

export type PluginReadmeInput = {
  name: string;
  displayName: string;
  description: string;
  version: string;
  skills: { name: string; role: "MAIN" | "SUB"; purpose: string }[];
  hasAssets: boolean;
};

/** Table cells: one line, no pipes. */
const cell = (value: string) => value.replace(/\s+/g, " ").replace(/\|/g, "/").trim();

/** README.md of the share zip (plugins spec, Plugin Zip Layout): what the plugin is, each skill and how to call it, install. */
export function renderPluginReadme(input: PluginReadmeInput): string {
  const rows = input.skills.map((s) => {
    const role = s.role === "MAIN" ? "Main: runs the whole job, using every sub-skill" : "Sub-skill: use alone for just this part";
    return `| \`${s.name}\` | ${role} | ${cell(s.purpose)} | "use ${s.name} on this…" | \`/${input.name}:${s.name}\` |`;
  });
  const example = input.skills.find((s) => s.role === "SUB")?.name ?? input.skills[0]?.name ?? "skill";
  return [
    `# ${input.displayName}`,
    "",
    `A Claude plugin built with Prompt Bot's Skills Builder (plugin id \`${input.name}\`, version ${input.version}).`,
    "",
    input.description.trim(),
    "",
    "## Skills in this plugin",
    "",
    "| Skill | Role | When to use it | In Claude chat, say | In Claude Code or Cowork, type |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
    "",
    "## Install",
    "",
    "### Claude.ai / Claude Desktop",
    "",
    `First turn on Settings → Capabilities → Create and edit files. Then open Plugins → Add → Upload plugin and choose \`upload-to-claude/${input.name}.zip\`. It shows as **${cell(input.displayName)}**.`,
    "",
    `In chat, ask for a skill by name, for example "use ${example} on this". In Claude Code or Cowork, type \`/${input.name}:${example}\`.`,
    "",
    "### Claude Code",
    "",
    `Copy the \`plugin/${input.name}\` folder somewhere stable and add it as a local plugin, or copy each \`skills/<skill>\` folder into \`~/.claude/skills/\`.`,
    "",
    "## Before you run anything",
    "",
    "Review any files in `scripts/` before running them.",
    "",
    ...(input.hasAssets
      ? ["## About the files in assets/", "", "These are your original files, included so the skills can reuse your templates.", ""]
      : []),
  ].join("\n");
}
