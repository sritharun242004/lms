/** A task's questions: writing them with Claude, regenerating, and the person's own edits (spec 2026-11-25 tasks, Step 2). */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { writeTaskQuestions } from "@/lib/ai/claude";
import { consumeAiUsage } from "@/lib/ai/usage";
import { JOB_LIMITS } from "../limits";
import { DescriptionTooShortError, JobNotFoundError } from "./errors";
import { buildQuestionsMessage } from "./instructions";
import { loadJobView, questionOrder } from "./jobs";
import { cleanQuestionSet, normalizeQuestionText } from "./questions";
import { descriptionLength } from "./task-text";
import type { FileHint, JobView, QuestionKind, QuestionSource } from "./types";

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
