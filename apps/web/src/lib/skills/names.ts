export const SKILL_NAME_MAX = 64;

/** Agent Skills name rule: kebab-case, no leading, trailing or double hyphen, at most 64 characters. */
export function isValidSkillName(name: string): boolean {
  return name.length <= SKILL_NAME_MAX && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(name);
}

export function oneLine(value: string, max = Number.POSITIVE_INFINITY): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

/** Lower-case ASCII kebab-case that always satisfies isValidSkillName. */
export function normalizeSkillName(raw: string, fallback = "skill"): string {
  const kebab = raw
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return kebab.slice(0, SKILL_NAME_MAX).replace(/-+$/g, "") || fallback;
}

/** The normalised name, or the first free `<name>-N` (N >= 2) that fits in 64 characters. */
export function uniqueSkillName(raw: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = normalizeSkillName(raw);
  if (!used.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const suffix = `-${n}`;
    const candidate = `${base.slice(0, SKILL_NAME_MAX - suffix.length).replace(/-+$/g, "")}${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
}
