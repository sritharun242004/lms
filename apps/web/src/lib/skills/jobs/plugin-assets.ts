/** Plugins spec, decision 2: which originals each skill of a plugin ships. Pure. */
import { JOB_LIMITS } from "../limits";
import { planAssets, type PlanInputFile } from "./assemble";
import type { ShippedFile } from "./instructions";
import type { SkillRole } from "./types";

export type PluginPlanSkill = { name: string; role: SkillRole; fileIds: string[] };

/**
 * The main skill bundles every bundlable file of the plugin once (its own files first, then the files only sub-skills
 * selected). A sub-skill gets its own copy of a selected file only when it is <= 1 MB and every copy in the plugin stays
 * within 25 MB; otherwise it points at the main skill's copy, or keeps the analysis when the main skill could not bundle it.
 * Each skill's plan lists only the files it selected (the main skill: plus the ones it carries for sub-skills).
 */
export function planPluginAssets(skills: PluginPlanSkill[], files: PlanInputFile[]): Map<string, ShippedFile[]> {
  const byId = new Map(files.map((f) => [f.id, f]));
  const pick = (ids: string[]) => ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  const main = skills.find((s) => s.role === "MAIN");
  const subs = skills.filter((s) => s !== main);
  const out = new Map<string, ShippedFile[]>();

  const mainIds = [...new Set([...(main?.fileIds ?? []), ...subs.flatMap((s) => s.fileIds)])];
  const mainPlan = planAssets(pick(mainIds));
  if (main) out.set(main.name, mainPlan);
  const inMain = new Map(mainPlan.map((f) => [f.id, f]));
  let total = mainPlan.reduce((sum, f) => sum + (f.shipping === "bundled" ? f.size : 0), 0);

  for (const sub of subs) {
    const plan = pick([...new Set(sub.fileIds)]).map((f): ShippedFile => {
      const base = { id: f.id, fileName: f.fileName, kind: f.kind, size: f.size, analysis: f.analysis, questionId: f.questionId };
      if (f.size > JOB_LIMITS.assetBytes) return { ...base, shipping: "analysis-only", reason: "too-large" };
      if (f.size <= JOB_LIMITS.subSkillAssetCopyBytes && total + f.size <= JOB_LIMITS.pluginAssetBytes) {
        total += f.size;
        return { ...base, shipping: "bundled", path: `assets/${f.assetName}` };
      }
      const carried = inMain.get(f.id);
      if (main && carried?.shipping === "bundled") return { ...base, shipping: "in-main", mainSkill: main.name, path: carried.path };
      return { ...base, shipping: "analysis-only", reason: "over-budget" };
    });
    out.set(sub.name, plan);
  }
  return out;
}
