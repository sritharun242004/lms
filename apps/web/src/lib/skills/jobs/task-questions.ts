/** A task's questions: writing them with Claude, regenerating, and the person's own edits (spec 2026-11-25 tasks, Step 2). */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { writeTaskQuestions } from "@/lib/ai/claude";
import { consumeAiUsage } from "@/lib/ai/usage";
import { JOB_LIMITS } from "../limits";
import { DescriptionTooShortError, JobNotFoundError, QuestionNotFoundError, TooManyQuestionsError } from "./errors";
import { buildQuestionsMessage } from "./instructions";
import { findOwnedJob, loadJobView, questionOrder, toQuestionView } from "./jobs";
import { cleanQuestionSet, normalizeQuestionText } from "./questions";
import { descriptionLength } from "./task-text";
import type { FileHint, JobView, QuestionInput, QuestionKind, QuestionSource, TaskQuestionView } from "./types";

/** A stored row as the regeneration plan sees it. */
export type ExistingRow = { id: string; kind: QuestionKind; text: string; source: QuestionSource };
/** One question or per-use input of the new set, in order. */
export type NextRow = {
  kind: QuestionKind;
  text: string;
  guidance: string;
  required: boolean;
  wantsFiles: boolean;
  fileHint: FileHint | null;
  fileNote: string;
};
type KeepData = Partial<Pick<NextRow, "guidance" | "wantsFiles" | "fileHint" | "fileNote">> & { order: number };
export type QuestionPlan = {
  keep: { id: string; data: KeepData }[];
  create: (NextRow & { order: number })[];
  remove: string[];
};

/**
 * Regenerate rules (spec, Regenerate): a new row whose normalised text equals an existing row's keeps that row
 * (id, text, kind, required, answer, score, files) with the new order, and an AI row of the same kind takes the new
 * guidance and file fields (per-use: guidance only); other new rows are created; the person's own rows are always kept,
 * after the new set; other AI rows are removed (the foreign key makes their files general).
 */
export function planQuestionChanges(existing: ExistingRow[], next: NextRow[]): QuestionPlan {
  const unused = new Map(existing.map((row) => [row.id, row]));
  const plan: QuestionPlan = { keep: [], create: [], remove: [] };
  next.forEach((row, order) => {
    const key = normalizeQuestionText(row.text);
    const match = [...unused.values()].find((e) => normalizeQuestionText(e.text) === key);
    if (!match) {
      plan.create.push({ ...row, order });
      return;
    }
    unused.delete(match.id);
    const data: KeepData = { order };
    if (match.source === "AI" && match.kind === row.kind) {
      data.guidance = row.guidance;
      if (row.kind === "FIXED") Object.assign(data, { wantsFiles: row.wantsFiles, fileHint: row.fileHint, fileNote: row.fileNote });
    }
    plan.keep.push({ id: match.id, data });
  });
  let order = next.length;
  for (const row of unused.values()) {
    if (row.source === "USER") plan.keep.push({ id: row.id, data: { order: order++ } });
    else plan.remove.push(row.id);
  }
  return plan;
}

/** Write questions / Regenerate: ownership, the 500-character rule and one unit before the call; one transaction after. */
export async function generateQuestionsForTask(jobId: string, userId: string): Promise<JobView> {
  const job = await prisma.skillJob.findFirst({
    where: { id: jobId, userId },
    select: {
      id: true,
      title: true,
      description: true,
      questions: { orderBy: questionOrder, select: { id: true, kind: true, text: true, source: true, answer: true } },
    },
  });
  if (!job) throw new JobNotFoundError();
  const length = descriptionLength(job.description);
  if (length < JOB_LIMITS.descriptionMinChars) throw new DescriptionTooShortError(length);

  await consumeAiUsage(userId, "skill_questions");
  const raw = await writeTaskQuestions(
    buildQuestionsMessage({
      title: job.title,
      description: job.description,
      existing: job.questions.map((q) => ({ kind: q.kind, text: q.text, answered: q.answer.trim() !== "" })),
    }),
  );
  const clean = cleanQuestionSet(raw);
  const next: NextRow[] = [
    ...clean.fixed.map((q) => ({
      kind: "FIXED" as const,
      text: q.text,
      guidance: q.guidance,
      required: true,
      wantsFiles: q.wantsFiles,
      fileHint: q.fileHint,
      fileNote: q.fileNote,
    })),
    ...clean.perUse.map((p) => ({
      kind: "PER_USE" as const,
      text: p.label,
      guidance: p.hint,
      required: p.required,
      wantsFiles: false,
      fileHint: null,
      fileNote: "",
    })),
  ];
  const plan = planQuestionChanges(job.questions, next);
  const ops: Prisma.PrismaPromise<unknown>[] = [
    prisma.skillJobQuestion.deleteMany({ where: { jobId, id: { in: plan.remove } } }),
    ...plan.keep.map((k) => prisma.skillJobQuestion.updateMany({ where: { id: k.id, jobId }, data: k.data })),
    prisma.skillJobQuestion.createMany({ data: plan.create.map((c) => ({ jobId, source: "AI" as const, ...c })) }),
    prisma.skillJob.update({ where: { id: jobId }, data: { questionsGeneratedAt: new Date(), outputType: clean.outputType } }),
  ];
  await prisma.$transaction(ops);
  const view = await loadJobView(jobId, userId);
  if (!view) throw new JobNotFoundError();
  return view;
}

// ---------------------------------------------------------------------------
// The person's own edits (spec, Editing)
// ---------------------------------------------------------------------------

const capOf = (kind: QuestionKind) => (kind === "FIXED" ? JOB_LIMITS.questionsPerTask : JOB_LIMITS.perUseInputsPerTask);

async function assertRoom(jobId: string, kind: QuestionKind): Promise<void> {
  if ((await prisma.skillJobQuestion.count({ where: { jobId, kind } })) >= capOf(kind)) throw new TooManyQuestionsError(kind);
}

/** Per-use rows never take files; wantsFiles false clears the hint and the note. FIXED rows are always required. */
function fileFields(kind: QuestionKind, wantsFiles: boolean, fileHint: FileHint | null, fileNote: string) {
  const wants = kind === "FIXED" && wantsFiles;
  return { wantsFiles: wants, fileHint: wants ? fileHint : null, fileNote: wants ? fileNote.trim() : "" };
}

export async function addQuestion(jobId: string, userId: string, input: QuestionInput): Promise<TaskQuestionView> {
  if (!(await findOwnedJob(jobId, userId))) throw new JobNotFoundError();
  const kind = input.kind ?? "FIXED";
  await assertRoom(jobId, kind);
  const max = await prisma.skillJobQuestion.aggregate({ where: { jobId }, _max: { order: true } });
  const row = await prisma.skillJobQuestion.create({
    data: {
      jobId,
      order: (max._max.order ?? -1) + 1,
      kind,
      source: "USER",
      text: input.text.trim(),
      guidance: (input.guidance ?? "").trim(),
      required: kind === "PER_USE" ? (input.required ?? true) : true,
      ...fileFields(kind, input.wantsFiles ?? false, input.fileHint ?? null, input.fileNote ?? ""),
    },
  });
  return toQuestionView(row);
}

/** Edits a question; a kind change checks the target list's cap, and FIXED -> PER_USE makes its files general. The answer stays. */
export async function updateQuestion(jobId: string, userId: string, questionId: string, patch: Partial<QuestionInput>): Promise<TaskQuestionView> {
  if (!(await findOwnedJob(jobId, userId))) throw new JobNotFoundError();
  const row = await prisma.skillJobQuestion.findFirst({ where: { id: questionId, jobId } });
  if (!row) throw new QuestionNotFoundError();
  const kind = patch.kind ?? row.kind;
  if (kind !== row.kind) await assertRoom(jobId, kind);
  const data = {
    text: patch.text !== undefined ? patch.text.trim() : row.text,
    guidance: patch.guidance !== undefined ? patch.guidance.trim() : row.guidance,
    kind,
    required: kind === "PER_USE" ? (patch.required ?? (row.kind === "PER_USE" ? row.required : true)) : true,
    ...fileFields(
      kind,
      patch.wantsFiles ?? row.wantsFiles,
      patch.fileHint !== undefined ? patch.fileHint : ((row.fileHint as FileHint | null) ?? null),
      patch.fileNote ?? row.fileNote,
    ),
  };
  const update = prisma.skillJobQuestion.update({ where: { id: questionId }, data });
  if (row.kind === "FIXED" && kind === "PER_USE") {
    const [updated] = await prisma.$transaction([
      update,
      prisma.skillJobFile.updateMany({ where: { jobId, questionId }, data: { questionId: null } }),
    ]);
    return toQuestionView(updated);
  }
  return toQuestionView(await update);
}

/** Deletes a question and its answer; the foreign key (SET NULL) moves its files to General files. */
export async function deleteQuestion(jobId: string, userId: string, questionId: string): Promise<void> {
  if (!(await findOwnedJob(jobId, userId))) throw new JobNotFoundError();
  const { count } = await prisma.skillJobQuestion.deleteMany({ where: { id: questionId, jobId } });
  if (count === 0) throw new QuestionNotFoundError();
}
