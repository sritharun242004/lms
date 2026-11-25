import type { JobSkillDraft, RawPluginSuggestion, RawTaskQuestions } from "../src/lib/skills/jobs/types";

export type TaskKind = "carousel" | "video" | "sla" | "finance" | "other";
export const KINDS: TaskKind[];
export const TASK_DESCRIPTIONS: Record<TaskKind, string>;
export function taskKind(user: string): TaskKind;
export function questionsReply(user: string): { kind: TaskKind; regenerate: boolean; reply: RawTaskQuestions };
export function enhanceReply(user: string): { kind: TaskKind; brief: string };
export const JOB_DRAFT: JobSkillDraft;
export function pluginSuggestionReply(user: string): { kind: TaskKind; reply: RawPluginSuggestion };
