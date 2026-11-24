export const SKILL_NAME_MAX = 64;

/** Agent Skills name rule: kebab-case, no leading, trailing or double hyphen, at most 64 characters. */
export function isValidSkillName(name: string): boolean {
  return name.length <= SKILL_NAME_MAX && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(name);
}
