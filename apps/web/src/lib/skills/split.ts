import { MAX_CATALOG_MATCHES, MAX_CUSTOM_SKILLS } from "./limits";
import { oneLine, uniqueSkillName } from "./names";

export const PURPOSE_MAX = 300;

export type RawSplit = { customSkills: { name: string; purpose: string }[]; catalogMatches: { slug: string; why: string }[] };
export type SplitResult = RawSplit;

/** Applies the spec's split rules to the model's reply: valid unique names, caps, and active catalog slugs only. */
export function cleanSplit(raw: RawSplit, activeSlugs: ReadonlySet<string>): SplitResult {
  const taken = new Set<string>();
  const customSkills: SplitResult["customSkills"] = [];
  for (const skill of raw.customSkills) {
    if (customSkills.length >= MAX_CUSTOM_SKILLS) break;
    const label = oneLine(skill.name);
    const purpose = oneLine(skill.purpose, PURPOSE_MAX);
    if (!label && !purpose) continue;
    const name = uniqueSkillName(label || purpose, taken);
    taken.add(name);
    customSkills.push({ name, purpose: purpose || label });
  }
  const seen = new Set<string>();
  const catalogMatches: SplitResult["catalogMatches"] = [];
  for (const match of raw.catalogMatches) {
    if (catalogMatches.length >= MAX_CATALOG_MATCHES) break;
    if (!activeSlugs.has(match.slug) || seen.has(match.slug)) continue;
    seen.add(match.slug);
    catalogMatches.push({ slug: match.slug, why: oneLine(match.why, PURPOSE_MAX) });
  }
  return { customSkills, catalogMatches };
}
