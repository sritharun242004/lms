import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { suggestJobSkills } from "@/lib/ai/claude";
import { consumeAiUsage } from "@/lib/ai/usage";
import { JOB_LIMITS } from "../limits";
import { normalizeSkillName, oneLine, uniqueSkillName } from "../names";
import {
  AlreadyGeneratingError,
  DuplicateNameError,
  EmptyDescriptionError,
  FilesAnalysingError,
  isUniqueViolation,
  JobNotFoundError,
  SkillNotFoundError,
  TooManySkillsError,
} from "./errors";
import { purgeUnreferencedFiles } from "./files";
import { buildSuggestMessage } from "./instructions";
import { activeFiles, jobQuestionContext, loadJobView, skillInclude, toFileView, toSkillView } from "./jobs";
import { isAnalysing, isGenerating } from "./staleness";
import type { JobSkillView, JobView, RawSuggestions } from "./types";

const SKILL_PURPOSE_MAX = JOB_LIMITS.skillPurposeChars;

export type CleanSuggestion = { name: string; purpose: string; fileIds: string[] };

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

/** The spec's clean-up of the model's suggestions: valid unique names, one-line purposes, known files, room left. */
export function cleanSuggestions(raw: RawSuggestions, ctx: { activeFileIds: string[]; keptNames: string[]; room: number }): CleanSuggestion[] {
  const taken = new Set(ctx.keptNames);
  const out: CleanSuggestion[] = [];
  for (const suggestion of raw.skills) {
    if (out.length >= ctx.room) break;
    const label = oneLine(suggestion.name);
    const purpose = oneLine(suggestion.purpose, SKILL_PURPOSE_MAX);
    if (!label && !purpose) continue;
    const name = uniqueSkillName(label || purpose, taken);
    taken.add(name);
    out.push({ name, purpose: purpose || label, fileIds: cleanFileIds(suggestion.fileIds, ctx.activeFileIds) });
  }
  return out;
}

/** One skill named after the job when the model gave nothing usable and the job has no skills. */
export function fallbackSuggestion(job: { title: string; description: string }, activeFileIds: string[], taken: string[]): CleanSuggestion {
  const firstSentence = oneLine(job.description).split(/(?<=[.!?])\s/)[0] ?? "";
  const purpose = oneLine(firstSentence, SKILL_PURPOSE_MAX) || oneLine(job.title, SKILL_PURPOSE_MAX) || "Does this job the way I do it.";
  return { name: uniqueSkillName(normalizeSkillName(job.title, "my-skill"), taken), purpose, fileIds: cleanFileIds(activeFileIds, activeFileIds) };
}

/** A unique-index race (two saves of the same name) reads exactly like the pre-check's refusal. */
function rethrowDuplicate(error: unknown, name: string): never {
  if (isUniqueViolation(error)) throw new DuplicateNameError(name);
  throw error;
}

/**
 * Suggest (spec, Suggest Skills): every precondition, then one skill_split unit and one Opus call, then one
 * transaction that replaces never-generated skills with the cleaned suggestions. Skills with versions stay.
 */
export async function suggestForJob(jobId: string, userId: string, now = new Date()): Promise<JobView> {
  const job = await prisma.skillJob.findFirst({
    where: { id: jobId, userId },
    select: {
      id: true,
      title: true,
      description: true,
      skills: { select: { id: true, name: true, purpose: true, status: true, generationStartedAt: true, latestVersion: true, order: true }, orderBy: { order: "asc" } },
    },
  });
  if (!job) throw new JobNotFoundError();
  if (!job.description.trim()) throw new EmptyDescriptionError();
  if (job.skills.some((s) => isGenerating(s.status, s.generationStartedAt, now))) throw new AlreadyGeneratingError();
  const files = await activeFiles(jobId);
  if (files.some((f) => isAnalysing(f.analysisStatus, f.analysisStartedAt, now))) throw new FilesAnalysingError();
  const kept = job.skills.filter((s) => s.latestVersion > 0);
  const room = JOB_LIMITS.skillsPerJob - kept.length;
  if (room <= 0) throw new TooManySkillsError();

  const fileViews = files.map((f) => toFileView(f, now));
  const activeFileIds = fileViews.map((f) => f.id);
  const message = buildSuggestMessage({
    title: job.title,
    description: job.description,
    questions: await jobQuestionContext(jobId),
    files: fileViews.map((f) => ({ id: f.id, fileName: f.fileName, kind: f.kind, size: f.size, analysis: f.analysisStatus === "READY" ? f.analysis : null })),
    built: kept.map((s) => ({ name: s.name, purpose: s.purpose })),
  });
  await consumeAiUsage(userId, "skill_split", now);
  const raw = await suggestJobSkills(message);

  let cleaned = cleanSuggestions(raw, { activeFileIds, keptNames: kept.map((s) => s.name), room });
  if (cleaned.length === 0 && kept.length === 0) cleaned = [fallbackSuggestion(job, activeFileIds, [])];
  const start = Math.max(-1, ...kept.map((s) => s.order)) + 1;
  try {
    await prisma.$transaction([
      prisma.skillJobSkill.deleteMany({ where: { jobId, latestVersion: 0 } }),
      ...(cleaned.length > 0
        ? [prisma.skillJobSkill.createMany({ data: cleaned.map((s, i) => ({ jobId, order: start + i, name: s.name, purpose: s.purpose, fileIds: s.fileIds })) })]
        : []),
      prisma.skillJob.update({ where: { id: jobId }, data: { suggestedAt: now } }),
    ]);
  } catch (error) {
    // A second Suggest or an Add skill won the unique [jobId, name] index between our read and this write.
    rethrowDuplicate(error, cleaned[0]?.name ?? "this skill");
  }
  const view = await loadJobView(jobId, userId, now);
  if (!view) throw new JobNotFoundError();
  return view;
}

export async function loadSkillView(jobId: string, skillId: string, userId: string): Promise<JobSkillView | null> {
  const row = await prisma.skillJobSkill.findFirst({ where: { id: skillId, jobId, job: { userId } }, include: skillInclude });
  return row ? toSkillView(row) : null;
}

export async function addSkill(jobId: string, userId: string, input: { name: string; purpose: string; fileIds?: string[] }): Promise<JobSkillView> {
  const job = await prisma.skillJob.findFirst({ where: { id: jobId, userId }, select: { id: true, skills: { select: { name: true, order: true } } } });
  if (!job) throw new JobNotFoundError();
  if (job.skills.length >= JOB_LIMITS.skillsPerJob) throw new TooManySkillsError();
  const name = normalizeSkillName(input.name);
  if (job.skills.some((s) => s.name === name)) throw new DuplicateNameError(name);
  const activeFileIds = (await activeFiles(jobId)).map((f) => f.id);
  try {
    const row = await prisma.skillJobSkill.create({
      data: {
        jobId,
        order: Math.max(-1, ...job.skills.map((s) => s.order)) + 1,
        name,
        purpose: oneLine(input.purpose, SKILL_PURPOSE_MAX),
        fileIds: cleanFileIds(input.fileIds ?? activeFileIds, activeFileIds),
      },
      include: skillInclude,
    });
    return toSkillView(row);
  } catch (error) {
    rethrowDuplicate(error, name);
  }
}

/** Renaming changes the next version's name only; existing versions are immutable (spec, Data Model). */
export async function updateSkill(
  jobId: string,
  skillId: string,
  userId: string,
  patch: { name?: string; purpose?: string; fileIds?: string[]; order?: number },
): Promise<JobSkillView> {
  const skill = await prisma.skillJobSkill.findFirst({
    where: { id: skillId, jobId, job: { userId } },
    select: { id: true, name: true, status: true, generationStartedAt: true },
  });
  if (!skill) throw new SkillNotFoundError();
  const data: Prisma.SkillJobSkillUpdateInput = {};
  if (patch.purpose !== undefined) data.purpose = oneLine(patch.purpose, SKILL_PURPOSE_MAX);
  if (patch.order !== undefined) data.order = patch.order;
  if (patch.fileIds !== undefined) data.fileIds = cleanFileIds(patch.fileIds, (await activeFiles(jobId)).map((f) => f.id));
  const name = patch.name === undefined ? skill.name : normalizeSkillName(patch.name);
  if (name !== skill.name) {
    if (isGenerating(skill.status, skill.generationStartedAt)) throw new AlreadyGeneratingError();
    const clash = await prisma.skillJobSkill.findFirst({ where: { jobId, name, id: { not: skillId } }, select: { id: true } });
    if (clash) throw new DuplicateNameError(name);
    data.name = name;
  }
  if (Object.keys(data).length > 0) {
    try {
      await prisma.skillJobSkill.update({ where: { id: skillId }, data });
    } catch (error) {
      rethrowDuplicate(error, name);
    }
  }
  const view = await loadSkillView(jobId, skillId, userId);
  if (!view) throw new SkillNotFoundError();
  return view;
}

/** Deletes the skill and its versions (cascade), then the removed files only those versions kept. */
export async function deleteSkill(jobId: string, skillId: string, userId: string): Promise<void> {
  const skill = await prisma.skillJobSkill.findFirst({ where: { id: skillId, jobId, job: { userId } }, select: { id: true, status: true, generationStartedAt: true } });
  if (!skill) throw new SkillNotFoundError();
  if (isGenerating(skill.status, skill.generationStartedAt)) throw new AlreadyGeneratingError();
  await prisma.skillJobSkill.delete({ where: { id: skillId } });
  await purgeUnreferencedFiles(jobId);
}
