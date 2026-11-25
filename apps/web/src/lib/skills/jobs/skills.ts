import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { suggestJobSkills } from "@/lib/ai/claude";
import { consumeAiUsage } from "@/lib/ai/usage";
import { JOB_LIMITS } from "../limits";
import { normalizeSkillName, oneLine } from "../names";
import {
  AlreadyGeneratingError,
  DuplicateNameError,
  EmptyDescriptionError,
  FilesAnalysingError,
  isUniqueViolation,
  JobNotFoundError,
  MainRequiredError,
  SkillNotFoundError,
  TooManySkillsError,
} from "./errors";
import { purgeUnreferencedFiles } from "./files";
import { cleanFileIds, cleanPluginSuggestion } from "./plugin-suggest";
import { buildSuggestMessage } from "./instructions";
import { activeFiles, jobPerUseInputs, jobQuestionContext, loadJobView, skillInclude, toFileView, toSkillView } from "./jobs";
import { isAnalysing, isGenerating } from "./staleness";
import type { JobSkillView, JobView } from "./types";

const SKILL_PURPOSE_MAX = JOB_LIMITS.skillPurposeChars;

/** A unique-index race (two saves of the same name) reads exactly like the pre-check's refusal. */
function rethrowDuplicate(error: unknown, name: string): never {
  if (isUniqueViolation(error)) throw new DuplicateNameError(name);
  throw error;
}

/**
 * Suggest (plugins spec): every precondition, then one skill_split unit and one Opus call, then one transaction
 * that replaces every skill without legacy versions with 1 MAIN + 2–4 SUB. Rows with versions stay; a kept MAIN stays MAIN.
 */
export async function suggestForJob(jobId: string, userId: string, now = new Date()): Promise<JobView> {
  const job = await prisma.skillJob.findFirst({
    where: { id: jobId, userId },
    select: {
      id: true,
      title: true,
      description: true,
      outputType: true,
      company: true,
      pluginStatus: true,
      pluginGenerationStartedAt: true,
      skills: {
        select: { id: true, name: true, purpose: true, role: true, status: true, generationStartedAt: true, latestVersion: true, order: true },
        orderBy: { order: "asc" },
      },
    },
  });
  if (!job) throw new JobNotFoundError();
  if (!job.description.trim()) throw new EmptyDescriptionError();
  if (isGenerating(job.pluginStatus, job.pluginGenerationStartedAt, now) || job.skills.some((s) => isGenerating(s.status, s.generationStartedAt, now))) {
    throw new AlreadyGeneratingError();
  }
  const files = await activeFiles(jobId);
  if (files.some((f) => isAnalysing(f.analysisStatus, f.analysisStartedAt, now))) throw new FilesAnalysingError();
  const kept = job.skills.filter((s) => s.latestVersion > 0);
  const keptMain = kept.find((s) => s.role === "MAIN") ?? null;
  const keptSubs = kept.filter((s) => s.role !== "MAIN").length;
  if (keptSubs >= JOB_LIMITS.subSkillsMax) throw new TooManySkillsError();

  const fileViews = files.map((f) => toFileView(f, now));
  const activeFileIds = fileViews.map((f) => f.id);
  const [questions, perUse] = await Promise.all([jobQuestionContext(jobId), jobPerUseInputs(jobId)]);
  const message = buildSuggestMessage({
    title: job.title,
    company: job.company,
    description: job.description,
    outputType: job.outputType,
    questions,
    perUse,
    files: fileViews.map((f) => ({
      id: f.id,
      fileName: f.fileName,
      kind: f.kind,
      size: f.size,
      analysis: f.analysisStatus === "READY" ? f.analysis : null,
      questionId: f.questionId,
    })),
    built: kept.map((s) => ({ name: s.name, purpose: s.purpose, role: s.role })),
  });
  await consumeAiUsage(userId, "skill_split", now);
  const raw = await suggestJobSkills(message);

  const { main, subs } = cleanPluginSuggestion(raw, {
    job,
    activeFileIds,
    keptNames: kept.map((s) => s.name),
    keptMainName: keptMain?.name ?? null,
    keptSubs,
  });
  const start = Math.max(-1, ...kept.map((s) => s.order)) + 1;
  const rows: Prisma.SkillJobSkillCreateManyInput[] = [
    ...(main ? [{ jobId, order: start, role: "MAIN" as const, name: main.name, label: main.label, purpose: main.purpose, fileIds: main.fileIds }] : []),
    ...subs.map((s, i) => ({ jobId, order: start + (main ? 1 : 0) + i, role: "SUB" as const, ...s })),
  ];
  try {
    await prisma.$transaction([
      prisma.skillJobSkill.deleteMany({ where: { jobId, latestVersion: 0 } }),
      ...(rows.length > 0 ? [prisma.skillJobSkill.createMany({ data: rows })] : []),
      prisma.skillJob.update({ where: { id: jobId }, data: { suggestedAt: now } }),
    ]);
  } catch (error) {
    // A second Suggest or an Add skill won the unique [jobId, name] index between our read and this write.
    rethrowDuplicate(error, rows[0]?.name ?? "this skill");
  }
  const view = await loadJobView(jobId, userId, now);
  if (!view) throw new JobNotFoundError();
  return view;
}

export async function loadSkillView(jobId: string, skillId: string, userId: string): Promise<JobSkillView | null> {
  const row = await prisma.skillJobSkill.findFirst({ where: { id: skillId, jobId, job: { userId } }, include: skillInclude });
  return row ? toSkillView(row) : null;
}

export type SkillInput = { name: string; label?: string; purpose: string; focus?: string; step?: string; fileIds?: string[] };

/** The display fields of a skill, each on one line within its cap. */
function skillTexts(input: { label?: string; focus?: string; step?: string }): { label?: string; focus?: string; step?: string } {
  const out: { label?: string; focus?: string; step?: string } = {};
  if (input.label !== undefined) out.label = oneLine(input.label, JOB_LIMITS.skillLabelChars);
  if (input.focus !== undefined) out.focus = oneLine(input.focus, JOB_LIMITS.skillFocusChars);
  if (input.step !== undefined) out.step = oneLine(input.step, JOB_LIMITS.skillStepChars);
  return out;
}

/** Plugins: always a sub-skill, appended last in the workflow; at most JOB_LIMITS.subSkillsMax. */
export async function addSkill(jobId: string, userId: string, input: SkillInput): Promise<JobSkillView> {
  const job = await prisma.skillJob.findFirst({ where: { id: jobId, userId }, select: { id: true, skills: { select: { name: true, order: true, role: true } } } });
  if (!job) throw new JobNotFoundError();
  if (job.skills.filter((s) => s.role === "SUB").length >= JOB_LIMITS.subSkillsMax || job.skills.length >= JOB_LIMITS.skillsPerJob) {
    throw new TooManySkillsError();
  }
  const name = normalizeSkillName(input.name);
  if (job.skills.some((s) => s.name === name)) throw new DuplicateNameError(name);
  const activeFileIds = (await activeFiles(jobId)).map((f) => f.id);
  try {
    const row = await prisma.skillJobSkill.create({
      data: {
        jobId,
        order: Math.max(-1, ...job.skills.map((s) => s.order)) + 1,
        role: "SUB",
        name,
        label: "",
        purpose: oneLine(input.purpose, SKILL_PURPOSE_MAX),
        focus: "",
        step: "",
        ...skillTexts(input),
        fileIds: cleanFileIds(input.fileIds ?? activeFileIds, activeFileIds),
      },
      include: skillInclude,
    });
    return toSkillView(row);
  } catch (error) {
    rethrowDuplicate(error, name);
  }
}

const pluginClaim = { select: { pluginStatus: true, pluginGenerationStartedAt: true } } as const;
/** A legacy per-skill generation or a fresh plugin generation fixes this skill's name and existence. */
const busy = (skill: { status: string; generationStartedAt: Date | null; job: { pluginStatus: string; pluginGenerationStartedAt: Date | null } }) =>
  isGenerating(skill.status, skill.generationStartedAt) || isGenerating(skill.job.pluginStatus, skill.job.pluginGenerationStartedAt);

/** Renaming changes the next version's name only; existing versions are immutable (spec, Data Model). */
export async function updateSkill(
  jobId: string,
  skillId: string,
  userId: string,
  patch: { name?: string; label?: string; purpose?: string; focus?: string; step?: string; fileIds?: string[]; order?: number },
): Promise<JobSkillView> {
  const skill = await prisma.skillJobSkill.findFirst({
    where: { id: skillId, jobId, job: { userId } },
    select: { id: true, name: true, status: true, generationStartedAt: true, job: pluginClaim },
  });
  if (!skill) throw new SkillNotFoundError();
  const data: Prisma.SkillJobSkillUpdateInput = { ...skillTexts(patch) };
  if (patch.purpose !== undefined) data.purpose = oneLine(patch.purpose, SKILL_PURPOSE_MAX);
  if (patch.order !== undefined) data.order = patch.order;
  if (patch.fileIds !== undefined) data.fileIds = cleanFileIds(patch.fileIds, (await activeFiles(jobId)).map((f) => f.id));
  const name = patch.name === undefined ? skill.name : normalizeSkillName(patch.name);
  if (name !== skill.name) {
    if (busy(skill)) throw new AlreadyGeneratingError();
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
  const skill = await prisma.skillJobSkill.findFirst({
    where: { id: skillId, jobId, job: { userId } },
    select: { id: true, role: true, status: true, generationStartedAt: true, job: pluginClaim },
  });
  if (!skill) throw new SkillNotFoundError();
  if (skill.role === "MAIN") throw new MainRequiredError();
  if (busy(skill)) throw new AlreadyGeneratingError();
  await prisma.skillJobSkill.delete({ where: { id: skillId } });
  // The skill is gone; a purge failure only leaves removed files' bytes for the next purge.
  try {
    await purgeUnreferencedFiles(jobId);
  } catch (error) {
    console.error("[skills-builder] could not purge unreferenced files:", error instanceof Error ? error.name : "unknown");
  }
}
