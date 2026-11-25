import { JOB_LIMITS } from "./limits";
import { normalizeSkillName, oneLine } from "./names";

/** Plugins spec, Naming Rules. Pure: safe for client components (the UI previews the default live). */
export const PLUGIN_NAME_FALLBACK = "my-plugin";

export function defaultPluginName(company: string, title: string): string {
  return normalizeSkillName(`${company} ${title}`, PLUGIN_NAME_FALLBACK);
}

/** "<Company> · <Task title>", or the title alone; one line, 1–120 characters. */
export function defaultPluginDisplayName(company: string, title: string): string {
  const parts = [oneLine(company), oneLine(title)].filter(Boolean);
  return parts.join(" · ").slice(0, JOB_LIMITS.pluginDisplayNameChars).trim() || "My plugin";
}

export type PluginNameFields = { company: string; title: string; pluginName: string | null; pluginDisplayName: string | null };
export type EffectivePlugin = { name: string; nameIsDefault: boolean; displayName: string; displayNameIsDefault: boolean };

export function effectivePlugin(job: PluginNameFields): EffectivePlugin {
  return {
    name: job.pluginName ?? defaultPluginName(job.company, job.title),
    nameIsDefault: job.pluginName === null,
    displayName: job.pluginDisplayName ?? defaultPluginDisplayName(job.company, job.title),
    displayNameIsDefault: job.pluginDisplayName === null,
  };
}
