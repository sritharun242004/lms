export type ReadmeInput = {
  title: string;
  description: string;
  role: string | null;
  skills: { name: string; purpose: string; version?: number }[];
  /** True when any skill bundles original files under assets/. */
  hasAssets: boolean;
};

/** README.md at the pack root (spec: Versions and Downloads). Used for job packs and legacy packs. */
export function renderReadme(input: ReadmeInput): string {
  return [
    `# ${input.title}`,
    "",
    "Agent Skills built with Prompt Bot's Skills Builder.",
    "",
    "## What this job is",
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
    "Just ask Claude for the job in your own words and attach your latest files — Claude picks the skill up automatically from its description. To be sure, name it: \"Use my <skill> skill\". In Claude Code you can also type `/<skill>`.",
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
