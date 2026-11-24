import { isMap, parse, parseDocument } from "yaml";
import { splitFrontmatter } from "./frontmatter";
import { SKILL_LIMITS } from "./limits";
import type { SkillFile } from "./types";

export const SKILL_FOLDERS = ["references", "scripts", "assets"] as const;

const ALLOWED_KEYS = ["allowed-tools", "compatibility", "description", "license", "metadata", "name"];
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const NOT_PACKAGED = new Set(["__pycache__", "node_modules", ".DS_Store"]);
/** The validator parses with PyYAML, which reads YAML 1.1 (`yes` is a boolean there). */
const YAML_OPTIONS = { version: "1.1" } as const;

const show = (path: string) => JSON.stringify(path.length > 80 ? `${path.slice(0, 77)}...` : path);
const chars = (value: string) => [...value].length;
const utf8Bytes = (value: string) => new TextEncoder().encode(value).length;
const kb = (bytes: number) => `${Math.ceil(bytes / 1024)} KB`;

export type PathCheck = { ok: true; path: string } | { ok: false; error: string };

export function checkSkillPath(path: string): PathCheck {
  const fail = (reason: string): PathCheck => ({ ok: false, error: `${show(path)}: ${reason}` });
  if (!path) return { ok: false, error: "A file path is empty" };
  if (path.length > SKILL_LIMITS.pathChars) return fail(`path is longer than ${SKILL_LIMITS.pathChars} characters`);
  if (path.includes("\\")) return fail("use forward slashes (/) in paths");
  if (path.startsWith("/") || /^[A-Za-z]:/.test(path)) return fail("absolute paths are not allowed");
  const segments = path.split("/");
  if (segments.includes("..")) return fail("'..' is not allowed in paths");
  if (segments.some((s) => s === "" || s === ".")) return fail("path has an empty or '.' segment");
  if (path === "SKILL.md") return { ok: true, path };
  if (segments.length < 2 || !(SKILL_FOLDERS as readonly string[]).includes(segments[0])) {
    return fail("files must be SKILL.md or inside references/, scripts/ or assets/");
  }
  if (segments.some((s) => NOT_PACKAGED.has(s)) || path.endsWith(".pyc")) {
    return fail("__pycache__, node_modules, .pyc and .DS_Store files are not packaged");
  }
  if (segments.includes("SKILL.md")) return fail("a skill has only one SKILL.md, at its root");
  if (!segments.every((s) => SEGMENT.test(s))) return fail("use letters, digits, dots, dashes and underscores, and don't start a name with a dot");
  return { ok: true, path };
}

export function validateSkillMd(content: string, expectedName: string): string[] {
  if (!content.startsWith("---")) return ["SKILL.md: no YAML frontmatter found (it must start with ---)"];
  const parts = splitFrontmatter(content);
  if (!parts) return ["SKILL.md: frontmatter must be closed with a --- line"];
  let data: unknown;
  try {
    data = parse(parts.frontmatter, YAML_OPTIONS);
  } catch (error) {
    return [`SKILL.md: invalid YAML in frontmatter (${(error as Error).message.split("\n")[0]})`];
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return ["SKILL.md: frontmatter must be a YAML mapping of keys to values"];
  const fm = data as Record<string, unknown>;
  const errors: string[] = [];

  const unexpected = Object.keys(fm).filter((key) => !ALLOWED_KEYS.includes(key)).sort();
  if (unexpected.length) errors.push(`SKILL.md: unexpected frontmatter key(s): ${unexpected.join(", ")}. Allowed: ${ALLOWED_KEYS.join(", ")}`);

  if (!("name" in fm)) errors.push("SKILL.md: missing name");
  else if (typeof fm.name !== "string") errors.push("SKILL.md: name must be text");
  else {
    const name = fm.name.trim();
    if (!/^[a-z0-9-]+$/.test(name)) errors.push(`SKILL.md: name ${show(name)} must be kebab-case (lowercase letters, digits and hyphens)`);
    else if (name.startsWith("-") || name.endsWith("-") || name.includes("--")) {
      errors.push(`SKILL.md: name ${show(name)} cannot start or end with a hyphen or contain "--"`);
    }
    if (chars(name) > SKILL_LIMITS.nameChars) errors.push(`SKILL.md: name is longer than ${SKILL_LIMITS.nameChars} characters`);
    if (name !== expectedName) errors.push(`SKILL.md: name must be "${expectedName}" to match the skill folder`);
  }

  if (!("description" in fm)) errors.push("SKILL.md: missing description");
  else if (typeof fm.description !== "string") errors.push("SKILL.md: description must be text");
  else {
    const description = fm.description.trim();
    if (!description) errors.push("SKILL.md: description is empty");
    if (/[<>]/.test(description)) errors.push("SKILL.md: description cannot contain < or >");
    if (chars(description) > SKILL_LIMITS.descriptionChars) {
      errors.push(`SKILL.md: description is ${chars(description)} characters; the limit is ${SKILL_LIMITS.descriptionChars}`);
    }
  }

  const compatibility = fm.compatibility;
  if (compatibility !== undefined && compatibility !== null && compatibility !== "") {
    if (typeof compatibility !== "string") errors.push("SKILL.md: compatibility must be text");
    else if (chars(compatibility) > SKILL_LIMITS.compatibilityChars) {
      errors.push(`SKILL.md: compatibility is longer than ${SKILL_LIMITS.compatibilityChars} characters`);
    }
  }

  if (!parts.body.trim()) errors.push("SKILL.md: add instructions below the frontmatter");
  return errors;
}

/** Every rule in the Target Format section. An empty result means the skill can be packaged. */
export function validateSkillFiles(files: SkillFile[], expectedName: string): string[] {
  const errors: string[] = [];
  if (files.length > SKILL_LIMITS.files) errors.push(`A skill can have at most ${SKILL_LIMITS.files} files (this one has ${files.length})`);
  const seen = new Set<string>();
  let total = 0;
  for (const file of files) {
    const check = checkSkillPath(file.path);
    if (!check.ok) errors.push(check.error);
    const key = file.path.toLowerCase();
    if (seen.has(key)) errors.push(`${show(file.path)}: duplicate path`);
    seen.add(key);
    const bytes = utf8Bytes(file.content);
    total += bytes;
    if (bytes > SKILL_LIMITS.fileBytes) errors.push(`${show(file.path)}: ${kb(bytes)} is over the ${kb(SKILL_LIMITS.fileBytes)} file limit`);
  }
  if (total > SKILL_LIMITS.skillBytes) errors.push(`The skill is ${kb(total)}, over the ${kb(SKILL_LIMITS.skillBytes)} limit`);
  const skillMd = files.find((f) => f.path === "SKILL.md");
  if (!skillMd) errors.push("SKILL.md is missing");
  else errors.push(...validateSkillMd(skillMd.content, expectedName));
  return errors;
}

/** The size and count limits alone: a draft outside them is never stored, not even as a FAILED draft to fix. */
export function withinStorageLimits(files: SkillFile[]): boolean {
  if (files.length > SKILL_LIMITS.files) return false;
  let total = 0;
  for (const file of files) {
    const bytes = utf8Bytes(file.content);
    if (bytes > SKILL_LIMITS.fileBytes) return false;
    total += bytes;
  }
  return total <= SKILL_LIMITS.skillBytes;
}

/** Sets the frontmatter `name` (the item name owns it); leaves unparseable content unchanged for the validator to report. */
export function withSkillName(content: string, name: string): string {
  const parts = splitFrontmatter(content);
  if (!parts) return content;
  const doc = parseDocument(parts.frontmatter, YAML_OPTIONS);
  if (doc.errors.length > 0 || !isMap(doc.contents)) return content;
  doc.set("name", name);
  return `---\n${doc.toString({ lineWidth: 0 }).replace(/\n+$/, "")}\n---${parts.rest}`;
}
