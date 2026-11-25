/** Plugins spec, AI Prompt Changes (Suggest): the clean-up of the model's plugin structure. Pure. */
import { JOB_LIMITS } from "../limits";
import { normalizeSkillName, oneLine, SKILL_NAME_MAX, uniqueSkillName } from "../names";
import type { RawPluginSuggestion } from "./types";

/** The job's active files only, in the caller's order, each once, at most JOB_LIMITS.fileIdsPerSkill. */
export function cleanFileIds(ids: readonly string[], activeFileIds: readonly string[]): string[] {
  const allowed = new Set(activeFileIds);
  const out: string[] = [];
  for (const id of ids) {
    if (out.length >= JOB_LIMITS.fileIdsPerSkill) break;
    if (allowed.has(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

/** One skill named after the job, used as the main skill when the model gave no usable one. */
export function fallbackSuggestion(job: { title: string; description: string }, activeFileIds: string[], taken: string[]): { name: string; purpose: string; fileIds: string[] } {
  const firstSentence = oneLine(job.description).split(/(?<=[.!?])\s/)[0] ?? "";
  const purpose = oneLine(firstSentence, JOB_LIMITS.skillPurposeChars) || oneLine(job.title, JOB_LIMITS.skillPurposeChars) || "Does this task the way I do it.";
  return { name: uniqueSkillName(normalizeSkillName(job.title, "my-skill"), taken), purpose, fileIds: cleanFileIds(activeFileIds, activeFileIds) };
}

export type CleanMain = { name: string; label: string; purpose: string; fileIds: string[] };
export type CleanSub = { name: string; label: string; purpose: string; focus: string; step: string; fileIds: string[] };

type FallbackSub = { suffix: string; label: string; purpose: string; focus: string; step: string; allFiles: boolean };
/** Added when the model proposed fewer than JOB_LIMITS.subSkillsMin usable sub-skills. */
export const FALLBACK_SUBS: readonly FallbackSub[] = [
  {
    suffix: "planner",
    label: "Planner",
    purpose: "Plans the work and gathers the inputs before starting",
    focus: "Only the planning: it lists the inputs and the plan, and leaves doing the work to the main skill.",
    step: "Plan the work and gather the inputs",
    allFiles: false,
  },
  {
    suffix: "checker",
    label: "Checker",
    purpose: "Checks finished work against this task's standards and lists fixes",
    focus: "Only the checking: it reviews finished work and lists fixes, and leaves making the work to the main skill.",
    step: "Check the finished work and list fixes",
    allFiles: true,
  },
];

export type PluginCleanContext = {
  job: { title: string; description: string };
  activeFileIds: string[];
  /** Names of the rows that stay (they have legacy versions). */
  keptNames: string[];
  /** A kept MAIN row stays MAIN: the model's main is then dropped. */
  keptMainName: string | null;
  /** Kept SUB rows, counted toward the sub-skill room and the minimum. */
  keptSubs: number;
};

const SUB_PURPOSE_MAX = JOB_LIMITS.skillPurposeChars;

function cleanMain(raw: RawPluginSuggestion["main"], ctx: PluginCleanContext, taken: Set<string>): CleanMain {
  const label = oneLine(raw.label, JOB_LIMITS.skillLabelChars);
  const purpose = oneLine(raw.purpose, SUB_PURPOSE_MAX);
  const seed = oneLine(raw.name) || label;
  if (!seed && !purpose) {
    const fallback = fallbackSuggestion(ctx.job, ctx.activeFileIds, [...taken]);
    return { ...fallback, label: oneLine(ctx.job.title, JOB_LIMITS.skillLabelChars) };
  }
  return { name: uniqueSkillName(seed || purpose, taken), label, purpose: purpose || seed, fileIds: cleanFileIds(raw.fileIds, ctx.activeFileIds) };
}

/** Unique names, one-line fields, known files, at most aiSubSkillsMax subs; planner/checker fallbacks below the minimum. */
export function cleanPluginSuggestion(raw: RawPluginSuggestion, ctx: PluginCleanContext): { main: CleanMain | null; subs: CleanSub[] } {
  const taken = new Set(ctx.keptNames);
  const main = ctx.keptMainName === null ? cleanMain(raw.main, ctx, taken) : null;
  if (main) taken.add(main.name);
  const room = Math.max(0, Math.min(JOB_LIMITS.aiSubSkillsMax, JOB_LIMITS.subSkillsMax - ctx.keptSubs));
  const subs: CleanSub[] = [];
  for (const suggestion of raw.subSkills) {
    if (subs.length >= room) break;
    const label = oneLine(suggestion.label, JOB_LIMITS.skillLabelChars);
    const purpose = oneLine(suggestion.purpose, SUB_PURPOSE_MAX);
    const seed = oneLine(suggestion.name) || label;
    if (!seed && !purpose) continue;
    const name = uniqueSkillName(seed || purpose, taken);
    taken.add(name);
    subs.push({
      name,
      label,
      purpose: purpose || seed,
      focus: oneLine(suggestion.focus, JOB_LIMITS.skillFocusChars),
      step: oneLine(suggestion.step, JOB_LIMITS.skillStepChars),
      fileIds: cleanFileIds(suggestion.fileIds, ctx.activeFileIds),
    });
  }
  const base = main?.name ?? ctx.keptMainName ?? "skill";
  for (const fallback of FALLBACK_SUBS) {
    if (ctx.keptSubs + subs.length >= JOB_LIMITS.subSkillsMin || subs.length >= JOB_LIMITS.subSkillsMax - ctx.keptSubs) break;
    const stem = base.slice(0, SKILL_NAME_MAX - fallback.suffix.length - 1).replace(/-+$/g, "");
    const name = uniqueSkillName(`${stem}-${fallback.suffix}`, taken);
    taken.add(name);
    const { label, purpose, focus, step } = fallback;
    subs.push({ name, label, purpose, focus, step, fileIds: fallback.allFiles ? cleanFileIds(ctx.activeFileIds, ctx.activeFileIds) : [] });
  }
  return { main, subs };
}
