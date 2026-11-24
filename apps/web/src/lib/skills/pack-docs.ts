export type Recommendation = { name: string; why: string; sourceUrl: string; license: string; installNotes: string };
export type PackDocInput = {
  title: string;
  description: string;
  role: string | null;
  skills: { name: string; purpose: string }[];
  recommendations: Recommendation[];
};

export function renderReadme(input: PackDocInput): string {
  return [
    `# ${input.title}`,
    "",
    "Reusable AI skills built with Prompt Bot's Skills Builder.",
    "",
    "## What this pack is for",
    "",
    input.description.trim(),
    ...(input.role ? ["", `Role: ${input.role}`] : []),
    "",
    "## Skills in this pack",
    "",
    ...input.skills.map((s) => `- \`${s.name}\`: ${s.purpose}`),
    "",
    "## Install",
    "",
    "### Claude.ai / Claude Desktop",
    "",
    "Open Settings → Capabilities → Skills and upload each zip from `upload-to-claude/`. Claude.ai accepts one skill per upload.",
    "",
    "### Claude Code",
    "",
    "Copy `skills/<skill>` into `~/.claude/skills/` (personal) or `.claude/skills/` (one project).",
    "",
    "### Other tools that support Agent Skills",
    "",
    "Copy each `skills/<skill>` folder into that tool's skills folder, as its documentation describes.",
    "",
    "## Recommended existing skills",
    "",
    input.recommendations.length
      ? "Existing public skills that fit this work are listed in `recommended-skills.md`. Install them from their own sources."
      : "No existing skills were recommended for this pack (see `recommended-skills.md`).",
    "",
    "## Before you run anything",
    "",
    "Review any files in `scripts/` before running them.",
    "",
  ].join("\n");
}

export function renderRecommended(recommendations: Recommendation[]): string {
  const header = [
    "# Recommended existing skills",
    "",
    "These public skills were matched to your work. They are not included in this pack: install each one from its source.",
    "",
  ];
  if (recommendations.length === 0) return [...header, "No existing skills were recommended for this pack.", ""].join("\n");
  return [
    ...header,
    ...recommendations.flatMap((r) => [
      `## ${r.name}`,
      "",
      r.why,
      "",
      `- Source: ${r.sourceUrl}`,
      `- License: ${r.license}`,
      `- Install: ${r.installNotes || "See the source repository."}`,
      "",
    ]),
  ].join("\n");
}
