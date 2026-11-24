import { strToU8, zipSync, type Zippable } from "fflate";
import { checkSkillPath } from "./format";
import { isValidSkillName } from "./names";
import { renderReadme, renderRecommended, type Recommendation } from "./pack-docs";
import type { SkillFile } from "./types";

export type ZipSkill = { name: string; purpose: string; files: SkillFile[] };

/** Every entry path is built here from a validated name and a re-checked path; nothing raw reaches the archive. */
function skillEntries(prefix: string, skill: ZipSkill): Zippable {
  if (!isValidSkillName(skill.name)) throw new Error("unsafe skill name");
  const entries: Zippable = {};
  for (const file of skill.files) {
    const check = checkSkillPath(file.path);
    if (!check.ok) throw new Error("unsafe skill file path");
    entries[`${prefix}${skill.name}/${check.path}`] = strToU8(file.content);
  }
  return entries;
}

export function buildSkillZip(skill: ZipSkill): Uint8Array {
  return zipSync(skillEntries("", skill));
}

export function buildPackZip(input: {
  slug: string;
  title: string;
  description: string;
  role: string | null;
  skills: ZipSkill[];
  recommendations: Recommendation[];
}): Uint8Array {
  if (!isValidSkillName(input.slug)) throw new Error("unsafe pack slug");
  const root = `${input.slug}/`;
  const entries: Zippable = {
    [`${root}README.md`]: strToU8(renderReadme({ ...input, skills: input.skills.map((s) => ({ name: s.name, purpose: s.purpose })) })),
    [`${root}recommended-skills.md`]: strToU8(renderRecommended(input.recommendations)),
  };
  for (const skill of input.skills) {
    entries[`${root}upload-to-claude/${skill.name}.zip`] = [buildSkillZip(skill), { level: 0 }];
    Object.assign(entries, skillEntries(`${root}skills/`, skill));
  }
  return zipSync(entries);
}

export function zipResponse(bytes: Uint8Array, filename: string): Response {
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Response(body, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
