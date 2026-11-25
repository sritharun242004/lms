import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { PromptQuestionContext } from "@/lib/prompt-bot/instructions";
import { scoreAndApply, toAnswerView, type AnswerView } from "@/lib/prompt-bot/score-run";
import { titleFrom } from "@/lib/prompt-bot/sessions";
import { JOB_LIMITS } from "../limits";
import { loadSkillMatrix } from "../matrix";
import type { SkillItemStatus } from "../types";
import { JobNotFoundError } from "./errors";
import { ANALYSIS_INTERRUPTED_MESSAGE, GENERATION_INTERRUPTED_MESSAGE, isAnalysing, isGenerating } from "./staleness";
import type { AnalysisStatus, FileHint, JobFileView, JobSkillView, JobView, PerUseInput, TaskQuestionView } from "./types";

/** Lists and views never read a file's bytes or its facts. */
export const fileViewOmit = { data: true, facts: true } as const satisfies Prisma.SkillJobFileOmit;
export const skillInclude = {
  versions: { select: { version: true, name: true, createdAt: true, assetFileIds: true }, orderBy: { version: "desc" } },
} as const satisfies Prisma.SkillJobSkillInclude;

/** Questions in the order the person sees them; ties (same order) by creation. */
export const questionOrder = [{ order: "asc" }, { createdAt: "asc" }] as const satisfies Prisma.SkillJobQuestionOrderByWithRelationInput[];

type QuestionRow = Prisma.SkillJobQuestionGetPayload<object>;

export function toQuestionView(row: QuestionRow): TaskQuestionView {
  return {
    id: row.id,
    order: row.order,
    kind: row.kind,
    text: row.text,
    guidance: row.guidance,
    required: row.required,
    wantsFiles: row.wantsFiles,
    fileHint: (row.fileHint as FileHint | null) ?? null,
    fileNote: row.fileNote,
    source: row.source,
  };
}

/** The answer columns of a FIXED question row. notRelevant is always false for tasks. */
export function toQuestionAnswer(row: QuestionRow): AnswerView {
  return { questionId: row.id, answer: row.answer, score: row.score, reason: row.reason, notRelevant: false };
}

export type FileViewRow = Prisma.SkillJobFileGetPayload<{ omit: typeof fileViewOmit }>;
export type SkillViewRow = Prisma.SkillJobSkillGetPayload<{ include: typeof skillInclude }>;

export function toFileView(row: FileViewRow, now = new Date()): JobFileView {
  let analysisStatus = row.analysisStatus as AnalysisStatus;
  let analysisError = row.analysisError;
  if (analysisStatus === "PENDING" && !isAnalysing(analysisStatus, row.analysisStartedAt, now)) {
    analysisStatus = "FAILED";
    analysisError = ANALYSIS_INTERRUPTED_MESSAGE;
  }
  return {
    id: row.id,
    fileName: row.fileName,
    assetName: row.assetName,
    kind: row.kind,
    size: row.size,
    createdAt: row.createdAt.toISOString(),
    analysisStatus,
    analysis: row.analysis,
    analysisEdited: row.analysisEdited,
    analysisError,
    bundlable: row.size <= JOB_LIMITS.assetBytes,
    questionId: row.questionId,
  };
}

export function toSkillView(row: SkillViewRow, now = new Date()): JobSkillView {
  let status = row.status as SkillItemStatus;
  let validationErrors = row.validationErrors;
  if (status === "GENERATING" && !isGenerating(status, row.generationStartedAt, now)) {
    status = "FAILED";
    validationErrors = [GENERATION_INTERRUPTED_MESSAGE];
  }
  return {
    id: row.id,
    order: row.order,
    name: row.name,
    purpose: row.purpose,
    fileIds: row.fileIds,
    status,
    validationErrors,
    latestVersion: row.latestVersion,
    versions: row.versions.map((v) => ({ version: v.version, name: v.name, createdAt: v.createdAt.toISOString(), assets: v.assetFileIds.length })),
  };
}

export async function loadJobView(jobId: string, userId: string, now = new Date()): Promise<JobView | null> {
  const job = await prisma.skillJob.findFirst({
    where: { id: jobId, userId },
    include: {
      questions: { orderBy: questionOrder },
      files: { where: { deletedAt: null }, omit: fileViewOmit, orderBy: { createdAt: "asc" } },
      skills: { include: skillInclude, orderBy: { order: "asc" } },
    },
  });
  if (!job) return null;
  const fixed = job.questions.filter((q) => q.kind === "FIXED");
  return {
    id: job.id,
    title: job.title,
    description: job.description,
    scoreRevision: job.scoreRevision,
    updatedAt: job.updatedAt.toISOString(),
    suggestedAt: job.suggestedAt?.toISOString() ?? null,
    questionsGeneratedAt: job.questionsGeneratedAt?.toISOString() ?? null,
    outputType: job.outputType,
    questions: job.questions.map(toQuestionView),
    matrix: {
      id: `task:${job.id}`,
      name: "Task questions",
      questions: fixed.map((q) => ({ id: q.id, text: q.text, guidance: q.guidance, order: q.order })),
    },
    answers: fixed.map(toQuestionAnswer),
    files: job.files.map((f) => toFileView(f, now)),
    skills: job.skills.map((s) => toSkillView(s, now)),
  };
}

export function findOwnedJob(jobId: string, userId: string) {
  return prisma.skillJob.findFirst({ where: { id: jobId, userId }, select: { id: true, title: true, description: true } });
}

export async function createJob(userId: string, input: { title?: string; description?: string }): Promise<string> {
  const description = (input.description ?? "").trim();
  const title = input.title?.trim() || titleFrom(description, "Untitled job");
  const job = await prisma.skillJob.create({ data: { userId, title, description }, select: { id: true } });
  return job.id;
}

export async function updateJob(jobId: string, userId: string, patch: { title?: string; description?: string }): Promise<JobView> {
  if (!(await findOwnedJob(jobId, userId))) throw new JobNotFoundError();
  const data: Prisma.SkillJobUpdateInput = {};
  if (patch.title !== undefined) data.title = patch.title.trim();
  if (patch.description !== undefined) data.description = patch.description;
  await prisma.skillJob.update({ where: { id: jobId }, data });
  const view = await loadJobView(jobId, userId);
  if (!view) throw new JobNotFoundError();
  return view;
}

/** Answers, files (with bytes), skills and versions go with it (onDelete: Cascade). */
export async function deleteJob(jobId: string, userId: string): Promise<void> {
  if (!(await findOwnedJob(jobId, userId))) throw new JobNotFoundError();
  await prisma.skillJob.delete({ where: { id: jobId } });
}

/** What the scorer reads as the "prompt": the job plus the start of each ready analysis (spec, Questions and Scoring). */
export function jobScoringBase(
  job: { title: string; description: string },
  files: { fileName: string; analysis: string | null; analysisStatus: string }[],
): string {
  const parts = [`Job: ${job.title.trim()}\n${job.description.trim()}`];
  for (const file of files) {
    const analysis = file.analysis?.trim();
    if (file.analysisStatus === "READY" && analysis) parts.push(`File: ${file.fileName}\n${analysis.slice(0, JOB_LIMITS.analysisExcerptChars)}`);
  }
  return parts.join("\n\n").slice(0, JOB_LIMITS.scoringBaseChars);
}

export async function ensureJobAnswerRows(jobId: string, questionIds: string[]): Promise<void> {
  if (questionIds.length === 0) return;
  await prisma.skillJobAnswer.createMany({ data: questionIds.map((questionId) => ({ jobId, questionId })), skipDuplicates: true });
}

/** The enhancer's scoring flow for one job, applied only if `revision` is not stale. */
export async function runJobScoring(jobId: string, userId: string, revision: number): Promise<{ applied: boolean; revision: number; answers: AnswerView[] }> {
  const job = await prisma.skillJob.findFirst({
    where: { id: jobId, userId },
    include: {
      answers: true,
      files: { where: { deletedAt: null }, select: { fileName: true, analysis: true, analysisStatus: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!job) throw new JobNotFoundError();
  const matrix = await loadSkillMatrix();
  const active = new Set(matrix.questions.map((q) => q.id));
  return scoreAndApply({
    userId,
    revision,
    scoringBase: jobScoringBase(job, job.files),
    questions: matrix.questions,
    answers: job.answers.filter((a) => active.has(a.questionId)).map(toAnswerView),
    ensureRows: () => ensureJobAnswerRows(jobId, matrix.questions.map((q) => q.id)),
    readRevision: async () => (await prisma.skillJob.findFirst({ where: { id: jobId, userId }, select: { scoreRevision: true } }))?.scoreRevision ?? null,
    applyOps: (results, scoredAt, next) => [
      ...results.map((r) =>
        prisma.skillJobAnswer.update({
          where: { jobId_questionId: { jobId, questionId: r.questionId } },
          data: { score: r.score, reason: r.reason, scoredAt },
        }),
      ),
      prisma.skillJob.update({ where: { id: jobId }, data: { scoreRevision: next } }),
    ],
    transaction: (ops) => prisma.$transaction(ops),
    reload: async () => (await loadJobView(jobId, userId))?.answers ?? [],
  });
}

/** Writes the answer onto a FIXED question row of this task. notRelevant is accepted and ignored (spec: every question counts). */
export async function saveJobAnswer(
  jobId: string,
  userId: string,
  questionId: string,
  fields: { answer?: string; notRelevant?: boolean },
): Promise<"saved" | "no-question"> {
  if (!(await findOwnedJob(jobId, userId))) throw new JobNotFoundError();
  const where = { id: questionId, jobId, kind: "FIXED" as const };
  if (fields.answer === undefined) {
    return (await prisma.skillJobQuestion.findFirst({ where, select: { id: true } })) ? "saved" : "no-question";
  }
  const { count } = await prisma.skillJobQuestion.updateMany({ where, data: { answer: fields.answer } });
  return count > 0 ? "saved" : "no-question";
}

/** The job's files that are not removed, oldest first, without bytes or facts. */
export function activeFiles(jobId: string): Promise<FileViewRow[]> {
  return prisma.skillJobFile.findMany({ where: { jobId, deletedAt: null }, omit: fileViewOmit, orderBy: { createdAt: "asc" } });
}

/** Every FIXED question with its answer, for the suggest and generate messages. */
export async function jobQuestionContext(jobId: string): Promise<PromptQuestionContext[]> {
  const rows = await prisma.skillJobQuestion.findMany({ where: { jobId, kind: "FIXED" }, orderBy: questionOrder });
  return rows.map((q) => ({ id: q.id, text: q.text, guidance: q.guidance, answer: q.answer, score: q.score, notRelevant: false }));
}

/** The per-use inputs the generated skill asks for at the start of every run, in order. */
export async function jobPerUseInputs(jobId: string): Promise<PerUseInput[]> {
  const rows = await prisma.skillJobQuestion.findMany({ where: { jobId, kind: "PER_USE" }, orderBy: questionOrder });
  return rows.map((q) => ({ label: q.text, hint: q.guidance, required: q.required }));
}
