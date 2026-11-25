import { oneLine } from "./names";

/**
 * A JSON string literal is a valid YAML double-quoted scalar, so any text is safe here. Every frontmatter
 * value goes through it: unquoted, YAML 1.1 reads names such as `yes`, `null` or `2024` as non-text.
 */
const yamlString = (value: string) => JSON.stringify(value);

/** A model-supplied path placed under `folder` exactly once ("context.md" and "references/context.md" both become references/context.md). */
export function inFolder(folder: string, path: string): string {
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
