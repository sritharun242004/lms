import { oneLine } from "./names";
import type { SkillFile } from "./types";

/** The generation model's structured reply (spec, Generate). The server, not the model, writes the files. */
export type SkillDraft = {
  name: string;
  description: string;
  compatibility: string;
  body: string;
  references: { path: string; content: string }[];
  scripts: { path: string; content: string; purpose: string }[];
  assets: { path: string; content: string }[];
};

/**
 * A JSON string literal is a valid YAML double-quoted scalar, so any text is safe here. Every frontmatter
 * value goes through it: unquoted, YAML 1.1 reads names such as `yes`, `null` or `2024` as non-text.
 */
const yamlString = (value: string) => JSON.stringify(value);

function inFolder(folder: string, path: string): string {
  const clean = path.trim().replace(/^(\.\/)+/, "");
  return clean.startsWith(`${folder}/`) ? clean : `${folder}/${clean}`;
}

export function buildSkillMd(name: string, description: string, compatibility: string, body: string): string {
  const lines = ["---", `name: ${yamlString(name)}`, `description: ${yamlString(oneLine(description))}`];
  const compat = oneLine(compatibility);
  if (compat) lines.push(`compatibility: ${yamlString(compat)}`);
  lines.push("---", "", body.trim(), "");
  return lines.join("\n");
}

/** Turns a draft into files. `name` is the item's name, which owns the folder and the frontmatter name. */
export function assembleSkillFiles(name: string, draft: SkillDraft): SkillFile[] {
  const scripts = draft.scripts.map((s) => ({ path: inFolder("scripts", s.path), content: s.content, purpose: oneLine(s.purpose) }));
  const unlisted = scripts.filter((s) => !draft.body.includes(s.path));
  const body = unlisted.length
    ? `${draft.body.trim()}\n\n## Scripts\n\nReview each script before running it.\n\n${unlisted.map((s) => `- \`${s.path}\`: ${s.purpose}`).join("\n")}`
    : draft.body;
  return [
    { path: "SKILL.md", content: buildSkillMd(name, draft.description, draft.compatibility, body) },
    ...draft.references.map((r) => ({ path: inFolder("references", r.path), content: r.content })),
    ...scripts.map((s) => ({ path: s.path, content: s.content })),
    ...draft.assets.map((a) => ({ path: inFolder("assets", a.path), content: a.content })),
  ];
}
