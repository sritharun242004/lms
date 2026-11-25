import { ANALYSIS_STALE_MS, GENERATION_STALE_MS } from "../limits";

export const GENERATION_INTERRUPTED_MESSAGE = "Writing this skill was interrupted. Generate it again.";
export const PLUGIN_GENERATION_INTERRUPTED_MESSAGE = "Writing this plugin was interrupted. Generate it again.";
export const ANALYSIS_INTERRUPTED_MESSAGE = "Analysing this file was interrupted. Analyse it again.";

export const generationCutoff = (now = new Date()) => new Date(now.getTime() - GENERATION_STALE_MS);
export const analysisCutoff = (now = new Date()) => new Date(now.getTime() - ANALYSIS_STALE_MS);

/** A fresh claim. An older GENERATING row was interrupted (a deploy, a crash) and may be claimed again. */
export function isGenerating(status: string, startedAt: Date | null, now = new Date()): boolean {
  return status === "GENERATING" && startedAt !== null && startedAt > generationCutoff(now);
}

/** A fresh analysis. An older PENDING row was interrupted and may be analysed again. */
export function isAnalysing(status: string, startedAt: Date | null, now = new Date()): boolean {
  return status === "PENDING" && startedAt !== null && startedAt > analysisCutoff(now);
}
