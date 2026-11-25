/** Plugins spec: the plugin-level files (plugin.json, commands) and the plugin validator. Pure. */
import { parse } from "yaml";
import { SKILL_LIMITS } from "../limits";
import { JOB_LIMITS } from "../limits";
import { isValidSkillName, oneLine } from "../names";
import { splitFrontmatter } from "../frontmatter";
import type { SkillFile } from "../types";
import { validateJobSkill } from "./assemble";
import { HOW_THIS_SKILL_WORKS_HEADING, pluginCommand } from "./plugin-assemble";
import type { PluginManifest, SkillRole, VersionAsset } from "./types";

export const MANIFEST_PATH = ".claude-plugin/plugin.json";
export const PLUGIN_AUTHOR_FALLBACK = "Skills Builder";
const STAND_ALONE_PREFIX = "> Part of the **";

/** Plugin version n is 1.<n-1>.0 (v1 = 1.0.0, v2 = 1.1.0). */
export const pluginSemver = (version: number) => `1.${version - 1}.0`;

export function buildPluginManifest(input: {
  name: string;
  displayName: string;
  version: number;
  mainPurpose: string;
  subNames: string[];
  company: string;
  userName: string | null;
}): PluginManifest {
  const includes = input.subNames.length > 0 ? ` Includes: ${input.subNames.join(", ")}.` : "";
  const purpose = oneLine(input.mainPurpose);
  const description = `${purpose.slice(0, SKILL_LIMITS.descriptionChars - includes.length)}${includes}`.trim().slice(0, SKILL_LIMITS.descriptionChars);
  return {
    name: input.name,
    displayName: oneLine(input.displayName, JOB_LIMITS.pluginDisplayNameChars),
    version: pluginSemver(input.version),
    description,
    author: { name: oneLine(input.company) || oneLine(input.userName ?? "") || PLUGIN_AUTHOR_FALLBACK },
  };
}

export const manifestFile = (manifest: PluginManifest): SkillFile => ({ path: MANIFEST_PATH, content: `${JSON.stringify(manifest, null, 2)}\n` });

/** commands/<skill>.md: a thin pointer to the skill (the main skill's runs the whole flow). */
export function buildCommands(skills: { name: string; role: SkillRole; purpose: string }[]): SkillFile[] {
  return skills.map((s) => {
    const line =
      s.role === "MAIN"
        ? `Run the \`${s.name}\` skill from this plugin — the whole job, using each sub-skill in turn — on: $ARGUMENTS`
        : `Use the \`${s.name}\` skill from this plugin on: $ARGUMENTS`;
    const description = oneLine(s.purpose, SKILL_LIMITS.descriptionChars) || `Runs the ${s.name} skill.`;
    return { path: `commands/${s.name}.md`, content: `---\ndescription: ${JSON.stringify(description)}\n---\n${line}\n` };
  });
}

export type PluginSkillFiles = { name: string; role: SkillRole; files: SkillFile[]; assets: VersionAsset[] };
export type PluginToValidate = { manifest: PluginManifest; files: SkillFile[]; skills: PluginSkillFiles[] };

const ALLOWED_PLUGIN_FILE = /^(\.claude-plugin\/plugin\.json|commands\/[a-z0-9]+(-[a-z0-9]+)*\.md)$/;

function frontmatterOf(content: string): Record<string, unknown> | null {
  const split = splitFrontmatter(content);
  if (!split) return null;
  try {
    const value: unknown = parse(split.frontmatter);
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The body of the "## How this skill works" section (to the next level-1 or level-2 heading), or null. */
function workflowSection(skillMd: string): { count: number; text: string } {
  const lines = skillMd.split("\n");
  const starts = lines.flatMap((line, i) => (line.trim() === HOW_THIS_SKILL_WORKS_HEADING ? [i] : []));
  if (starts.length === 0) return { count: 0, text: "" };
  const end = lines.findIndex((line, i) => i > starts[0] && /^ {0,3}#{1,2}[ \t]/.test(line));
  return { count: starts.length, text: lines.slice(starts[0], end === -1 ? undefined : end).join("\n") };
}

/** Every plugin rule (spec: Plugin Validation). Skill errors are prefixed with the skill's name. Empty = writable. */
export function validatePlugin(plugin: PluginToValidate): string[] {
  const { manifest } = plugin;
  const errors: string[] = [];
  if (!isValidSkillName(manifest.name)) errors.push(`plugin.json: "${manifest.name}" is not a valid plugin id (kebab-case, at most 64 characters)`);
  if (!manifest.displayName.trim() || manifest.displayName.length > JOB_LIMITS.pluginDisplayNameChars || /\n/.test(manifest.displayName)) {
    errors.push(`plugin.json: the display name must be one line of 1 to ${JOB_LIMITS.pluginDisplayNameChars} characters`);
  }
  if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) errors.push(`plugin.json: version "${manifest.version}" is not semver`);
  if (!manifest.description.trim() || manifest.description.length > SKILL_LIMITS.descriptionChars) {
    errors.push(`plugin.json: the description must be 1 to ${SKILL_LIMITS.descriptionChars} characters`);
  }
  if (!manifest.author.name.trim()) errors.push("plugin.json: author.name is empty");

  const mains = plugin.skills.filter((s) => s.role === "MAIN");
  const subs = plugin.skills.filter((s) => s.role === "SUB");
  if (mains.length !== 1) errors.push("A plugin needs exactly one main skill.");
  if (subs.length < JOB_LIMITS.subSkillsMin) errors.push(`Add at least ${JOB_LIMITS.subSkillsMin} sub-skills.`);
  if (subs.length > JOB_LIMITS.subSkillsMax) errors.push(`A plugin can have at most ${JOB_LIMITS.subSkillsMax} sub-skills.`);

  const names = new Set<string>();
  let assetBytes = 0;
  for (const skill of plugin.skills) {
    if (names.has(skill.name)) errors.push(`${skill.name}: two skills have this name`);
    names.add(skill.name);
    errors.push(...validateJobSkill(skill.name, skill.files, skill.assets).map((e) => `${skill.name}: ${e}`));
    for (const path of [...skill.files.map((f) => f.path), ...skill.assets.map((a) => a.path)]) {
      if (`skills/${skill.name}/${path}`.length > SKILL_LIMITS.pathChars) errors.push(`${skill.name}: the path of ${path} is too long`);
    }
    assetBytes += skill.assets.reduce((sum, a) => sum + a.bytes, 0);
    const skillMd = skill.files.find((f) => f.path === "SKILL.md")?.content ?? "";
    if (skill.role === "SUB" && !skillMd.includes(STAND_ALONE_PREFIX)) errors.push(`${skill.name}: the stand-alone note is missing`);
    if (skill.role === "MAIN") {
      const section = workflowSection(skillMd);
      if (section.count !== 1) errors.push(`${skill.name}: needs exactly one "How this skill works" section`);
      for (const sub of subs) {
        if (!section.text.includes(`\`${sub.name}\``) || !section.text.includes(pluginCommand(manifest.name, sub.name))) {
          errors.push(`${skill.name}: "How this skill works" doesn't name ${sub.name}`);
        }
      }
    }
  }
  if (assetBytes > JOB_LIMITS.pluginAssetBytes) errors.push(`The plugin's bundled files total over ${JOB_LIMITS.pluginAssetBytes / (1024 * 1024)} MB`);

  for (const file of plugin.files) {
    if (!ALLOWED_PLUGIN_FILE.test(file.path)) errors.push(`${file.path}: not allowed at the top of a plugin`);
  }
  for (const skill of plugin.skills) {
    const command = plugin.files.find((f) => f.path === `commands/${skill.name}.md`);
    const description = command ? frontmatterOf(command.content)?.description : undefined;
    if (!command) errors.push(`${skill.name}: its command is missing`);
    else if (typeof description !== "string" || !description.trim()) errors.push(`${skill.name}: its command has no description`);
  }
  const commands = plugin.files.filter((f) => f.path.startsWith("commands/"));
  for (const command of commands) {
    if (!names.has(command.path.slice("commands/".length, -".md".length))) errors.push(`${command.path}: no skill has this name`);
  }
  if (!plugin.files.some((f) => f.path === MANIFEST_PATH)) errors.push(`${MANIFEST_PATH} is missing`);
  return errors;
}

export type BuiltPluginSkill = { name: string; role: SkillRole; label: string; purpose: string; description: string; files: SkillFile[]; assets: VersionAsset[] };
export type StoredPluginAsset = VersionAsset & { skill: string };

/** The JSON columns of one SkillPluginVersion: every skill's text files (main first), the plugin files and the asset entries. */
export function pluginVersionRecord(skills: BuiltPluginSkill[], files: SkillFile[]) {
  const assets: StoredPluginAsset[] = skills.flatMap((s) =>
    s.assets.map((a) => ({ fileId: a.fileId, skill: s.name, path: a.path, fileName: a.fileName, bytes: a.bytes })),
  );
  return {
    skills: skills.map((s) => ({
      name: s.name,
      role: s.role,
      label: s.label,
      purpose: s.purpose,
      description: s.description,
      files: s.files.map((f) => ({ path: f.path, content: f.content })),
    })),
    files: files.map((f) => ({ path: f.path, content: f.content })),
    assets,
    assetFileIds: [...new Set(assets.map((a) => a.fileId))],
  };
}
