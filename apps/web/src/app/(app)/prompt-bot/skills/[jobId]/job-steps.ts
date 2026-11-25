import { unansweredQuestionIds } from "@/lib/prompt-bot/scoring";
import type { AnswerView } from "@/lib/prompt-bot/sessions";
import { descriptionLength } from "@/lib/skills/jobs/task-text";
import type { JobView, TaskQuestionView } from "@/lib/skills/jobs/types";
import { JOB_LIMITS } from "@/lib/skills/limits";

export type JobStep = "task" | "questions" | "skills";
export const JOB_STEPS: { id: JobStep; label: string }[] = [
  { id: "task", label: "Task" },
  { id: "questions", label: "Questions" },
  { id: "skills", label: "Skills" },
];
/** Hashes from before tasks (Job · Files · Questions · Skills) keep opening the step that replaced them. */
const HASH_ALIASES: Record<string, JobStep> = { job: "task", files: "questions" };

export function stepFromHash(hash: string): JobStep {
  const id = hash.replace(/^#/, "");
  if (HASH_ALIASES[id]) return HASH_ALIASES[id];
  return JOB_STEPS.some((s) => s.id === id) ? (id as JobStep) : "task";
}

/**
 * Questions and Skills open once the description is long enough to write questions from, or as soon
 * as the task has questions (every migrated job does), so a short old description never locks it.
 */
export function canLeaveTask(description: string, questionCount: number): boolean {
  return questionCount > 0 || descriptionLength(description) >= JOB_LIMITS.descriptionMinChars;
}

const byOrder = (a: TaskQuestionView, b: TaskQuestionView) => a.order - b.order;
/** "Answer now (same every time)": the questions that are answered, scored and take files. */
export const fixedQuestions = (questions: TaskQuestionView[]) => questions.filter((q) => q.kind === "FIXED").sort(byOrder);
/** "Asked each time you use it": never answered here. */
export const perUseQuestions = (questions: TaskQuestionView[]) => questions.filter((q) => q.kind === "PER_USE").sort(byOrder);

export const POLL_FIRST_MS = 3000;
export const POLL_MAX_MS = 15_000;
/** A minute past the generation stale window: by then the server reports unfinished work as interrupted. */
export const POLL_CAP_MS = 11 * 60_000;

export function nextPollDelay(previous: number): number {
  return Math.min(Math.round(previous * 1.5), POLL_MAX_MS);
}

export function unansweredCount(questions: { id: string }[], answerFor: (id: string) => AnswerView): number {
  return unansweredQuestionIds(questions.map((q) => answerFor(q.id))).length;
}

/** What the page polls for: files being analysed and skills being written. Empty means nothing to wait for. */
export function pollKey(job: JobView): string {
  return [
    ...job.files.filter((f) => f.analysisStatus === "PENDING").map((f) => `f:${f.id}`),
    ...job.skills.filter((s) => s.status === "GENERATING").map((s) => `s:${s.id}`),
  ].join(",");
}

/**
 * Applies a poll: only rows that were waiting and have finished change, and only their status fields,
 * so text the user is typing (description, purposes, names) is never overwritten by the server copy.
 */
export function mergePolled(local: JobView, fresh: JobView): { job: JobView; analysed: boolean } {
  const freshFiles = new Map(fresh.files.map((f) => [f.id, f]));
  let analysed = false;
  const files = local.files.map((f) => {
    const next = freshFiles.get(f.id);
    if (f.analysisStatus !== "PENDING" || !next || next.analysisStatus === "PENDING") return f;
    if (next.analysisStatus === "READY") analysed = true;
    return { ...f, analysisStatus: next.analysisStatus, analysis: next.analysis, analysisEdited: next.analysisEdited, analysisError: next.analysisError };
  });
  const freshSkills = new Map(fresh.skills.map((s) => [s.id, s]));
  const skills = local.skills.map((s) => {
    const next = freshSkills.get(s.id);
    if (s.status !== "GENERATING" || !next || next.status === "GENERATING") return s;
    return { ...s, status: next.status, validationErrors: next.validationErrors, latestVersion: next.latestVersion, versions: next.versions };
  });
  return { job: { ...local, files, skills }, analysed };
}
