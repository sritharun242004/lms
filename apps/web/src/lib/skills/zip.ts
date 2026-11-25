import { strToU8, zipSync, type Zippable, type ZippableFile } from "fflate";
import { checkSkillPath } from "./format";
import { PackTooLargeError } from "./jobs/errors";
import { JOB_LIMITS } from "./limits";
import { isValidSkillName } from "./names";
import { renderReadme } from "./pack-docs";
import type { SkillFile } from "./types";

export { PackTooLargeError };

/** An original file bundled under assets/: raw bytes, never decoded to text. */
export type ZipAsset = { path: string; bytes: Uint8Array };
export type ZipSkill = { name: string; purpose: string; version?: number; files: SkillFile[]; assets?: ZipAsset[] };
/**
 * Anything with text files and asset sizes: a ZipSkill (bytes loaded) or a VersionDetail (sizes recorded).
 * `path` is optional so literal ZipAssets and VersionAssets type-check without excess-property errors.
 */
export type SizedSkill = { files: SkillFile[]; assets?: readonly { bytes: Uint8Array | number; path?: string }[] };

/** More than any README renderReadme writes for a pack within the limits. */
const README_ALLOWANCE = 16 * 1024;
const utf8Bytes = (value: string) => new TextEncoder().encode(value).length;

/** Two skills would share one folder (and one upload zip); merging them would silently lose one. */
export class DuplicateSkillNameError extends Error {
  constructor(public skillName: string) {
    super(`Two skills are named "${skillName}"`);
    this.name = "DuplicateSkillNameError";
  }
}

/** Every entry path is built here from a validated name and a re-checked path; nothing raw reaches the archive. */
function skillEntries(prefix: string, skill: ZipSkill): Zippable {
  if (!isValidSkillName(skill.name)) throw new Error("unsafe skill name");
  const entries: Zippable = {};
  const add = (path: string, value: ZippableFile) => {
    const check = checkSkillPath(path);
    if (!check.ok) throw new Error("unsafe skill file path");
    const key = `${prefix}${skill.name}/${check.path}`;
    if (key in entries) throw new Error("duplicate skill file path");
    entries[key] = value;
  };
  for (const file of skill.files) add(file.path, strToU8(file.content));
  for (const asset of skill.assets ?? []) {
    if (!asset.path.startsWith("assets/")) throw new Error("unsafe skill file path");
    // Office files and images are already compressed: store them as they are.
    add(asset.path, [asset.bytes, { level: 0 }]);
  }
  return entries;
}

export function buildSkillZip(skill: ZipSkill): Uint8Array {
  return zipSync(skillEntries("", skill));
}

/** The pack's size before it is built: each skill appears twice (unpacked and as its upload zip). */
export function packZipSize(skills: SizedSkill[]): number {
  let total = README_ALLOWANCE;
  for (const skill of skills) {
    const text = skill.files.reduce((sum, f) => sum + utf8Bytes(f.content), 0);
    const assets = (skill.assets ?? []).reduce((sum, a) => sum + (typeof a.bytes === "number" ? a.bytes : a.bytes.byteLength), 0);
    total += 2 * (text + assets);
  }
  return total;
}

export function buildPackZip(input: { slug: string; title: string; description: string; role: string | null; skills: ZipSkill[] }): Uint8Array {
  if (!isValidSkillName(input.slug)) throw new Error("unsafe pack slug");
  if (packZipSize(input.skills) > JOB_LIMITS.packZipBytes) throw new PackTooLargeError();
  const root = `${input.slug}/`;
  const entries: Zippable = {
    [`${root}README.md`]: strToU8(
      renderReadme({
        title: input.title,
        description: input.description,
        role: input.role,
        skills: input.skills.map((s) => ({ name: s.name, purpose: s.purpose, version: s.version })),
        hasAssets: input.skills.some((s) => (s.assets?.length ?? 0) > 0),
      }),
    ),
  };
  const names = new Set<string>();
  for (const skill of input.skills) {
    if (names.has(skill.name)) throw new DuplicateSkillNameError(skill.name);
    names.add(skill.name);
    entries[`${root}upload-to-claude/${skill.name}.zip`] = [buildSkillZip(skill), { level: 0 }];
    Object.assign(entries, skillEntries(`${root}skills/`, skill));
  }
  return zipSync(entries);
}

/** Sends the zip's own bytes: a pack can be near 100 MB, so the view is passed as-is, never copied. */
export function zipResponse(bytes: Uint8Array, filename: string): Response {
  // fflate allocates an ArrayBuffer (never a SharedArrayBuffer); the cast only narrows the generic for BodyInit.
  return new Response(bytes as Uint8Array<ArrayBuffer>, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
