import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { analyseFile, type AnalysisContent } from "@/lib/ai/claude";
import { AiBadRequestError } from "@/lib/ai/errors";
import { consumeAiUsage } from "@/lib/ai/usage";
import { readUpload } from "../files/extract";
import { imageForClaude } from "../files/image";
import { assetFileName } from "../files/safe-name";
import type { FileFacts, SkillFileKind } from "../files/types";
import { JOB_LIMITS } from "../limits";
import { AlreadyAnalysingError, AlreadyGeneratingError, FileNameTakenError, FileNotFoundError, isUniqueViolation, JobNotFoundError, TooManyFilesError } from "./errors";
import { buildAnalysisText } from "./instructions";
import { fileViewOmit, findOwnedJob, toFileView } from "./jobs";
import { analysisCutoff, generationCutoff, isAnalysing } from "./staleness";
import type { JobFileDetail, JobFileView } from "./types";

export const ANALYSIS_FAILED_MESSAGE = "We couldn't analyse this file. Try again, or write the style guide yourself.";
export const PDF_TOO_LONG_MESSAGE =
  "This PDF has more than 100 pages, so it can't be analysed. Upload the pages that show the style, or write the style guide yourself.";

export const PDF_UNREADABLE_MESSAGE = "This PDF couldn't be read — add the analysis by hand.";

const ownedFile = (jobId: string, fileId: string, userId: string) => ({ id: fileId, jobId, deletedAt: null, job: { userId } });

export function countActiveFiles(jobId: string): Promise<number> {
  return prisma.skillJobFile.count({ where: { jobId, deletedAt: null } });
}

/** Removed-but-kept files keep their names, so a version's assets/<name> never changes meaning. */
async function takenAssetNames(jobId: string): Promise<string[]> {
  return (await prisma.skillJobFile.findMany({ where: { jobId }, select: { assetName: true } })).map((r) => r.assetName);
}

/**
 * Checks the bytes first (a refused file spends nothing), then the count, then one skill_analyze unit,
 * and stores the file as PENDING. The route runs runFileAnalysis in after().
 */
export async function storeJobFile(input: { jobId: string; userId: string; fileName: string; bytes: Uint8Array }, now = new Date()): Promise<JobFileView> {
  if (!(await findOwnedJob(input.jobId, input.userId))) throw new JobNotFoundError();
  const read = await readUpload(input.bytes);
  if ((await countActiveFiles(input.jobId)) >= JOB_LIMITS.filesPerJob) throw new TooManyFilesError();
  await consumeAiUsage(input.userId, "skill_analyze", now);
  const bytes = Buffer.from(input.bytes);
  const data = (assetName: string): Prisma.SkillJobFileUncheckedCreateInput => ({
    jobId: input.jobId,
    fileName: input.fileName,
    assetName,
    kind: read.kind,
    mimeType: read.mimeType,
    size: input.bytes.byteLength,
    sha256: read.sha256,
    data: bytes,
    facts: read.facts as unknown as Prisma.InputJsonValue,
    analysisStatus: "PENDING",
    analysisStartedAt: now,
  });
  const create = async () =>
    prisma.skillJobFile.create({ data: data(assetFileName(input.fileName, read.kind, await takenAssetNames(input.jobId))), omit: fileViewOmit });
  // The unique [jobId, assetName] index only catches two uploads picking the same name at once (two uploads can
  // still both pass the count check). The loser picks again from a fresh read of the names, once.
  const row = await create().catch((error: unknown) => {
    if (!isUniqueViolation(error)) throw error;
    return create().catch((retryError: unknown) => {
      throw isUniqueViolation(retryError) ? new FileNameTakenError(input.fileName) : retryError;
    });
  });
  return toFileView(row, now);
}

async function analysisContent(
  row: { kind: SkillFileKind; fileName: string; assetName: string; facts: FileFacts | null },
  data: Uint8Array,
): Promise<AnalysisContent> {
  const text = buildAnalysisText({ fileName: row.fileName, kind: row.kind, facts: row.facts });
  if (row.kind === "PDF") {
    // A view over the stored bytes, not a copy: the base64 string is already a second copy of the file.
    return { text, document: { base64: Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("base64"), title: row.assetName } };
  }
  if (row.kind === "PNG" || row.kind === "JPEG") {
    const image = await imageForClaude(data, row.kind);
    return { text, image: { base64: image.base64, mediaType: image.mediaType } };
  }
  return { text };
}

/**
 * An analysis holds a file's bytes (up to the upload limit) plus their base64 copy until Claude answers, so this
 * process runs at most this many at once; the rest wait in order. Process-wide, not per user.
 */
export const MAX_CONCURRENT_ANALYSES = 2;
let analysesRunning = 0;
const analysisQueue: (() => void)[] = [];

async function withAnalysisSlot<T>(work: () => Promise<T>): Promise<T> {
  if (analysesRunning < MAX_CONCURRENT_ANALYSES) analysesRunning++;
  else await new Promise<void>((resolve) => analysisQueue.push(resolve));
  try {
    return await work();
  } finally {
    // Hand the slot straight to the next waiter; only free it when nobody waits.
    const next = analysisQueue.shift();
    if (next) next();
    else analysesRunning--;
  }
}

/**
 * One analysis, run after the response. Writes READY or FAILED only while the claim (analysisStartedAt) is
 * still this run's, so a newer Analyse again is never overwritten. Never throws; logs the error class only.
 */
export async function runFileAnalysis(jobId: string, fileId: string, userId: string): Promise<void> {
  let claim: Date | null | undefined;
  let isPdf = false;
  const finish = (data: Prisma.SkillJobFileUpdateManyMutationInput) =>
    prisma.skillJobFile.updateMany({ where: { id: fileId, analysisStatus: "PENDING", analysisStartedAt: claim ?? null }, data });
  try {
    const row = await prisma.skillJobFile.findFirst({ where: ownedFile(jobId, fileId, userId), omit: { data: true } });
    if (!row || row.analysisStatus !== "PENDING") return;
    claim = row.analysisStartedAt;
    isPdf = row.kind === "PDF";
    const facts = row.facts as unknown as FileFacts | null;
    if (facts?.kind === "PDF" && facts.pages !== null && facts.pages > JOB_LIMITS.pdfPagesForAnalysis) {
      await finish({ analysisStatus: "FAILED", analysisError: PDF_TOO_LONG_MESSAGE });
      return;
    }
    await withAnalysisSlot(async () => {
      // Re-stamp the claim now that the run starts, so time spent queued does not read as interrupted.
      // A lost claim (a newer Analyse again took the file while this run waited) means skip: that run owns it.
      const startedAt = new Date();
      const refreshed = await prisma.skillJobFile.updateMany({
        where: { id: fileId, analysisStatus: "PENDING", analysisStartedAt: claim ?? null },
        data: { analysisStartedAt: startedAt },
      });
      if (refreshed.count === 0) return;
      claim = startedAt;
      // Only now are the bytes loaded, so queued runs hold no file in memory.
      const stored = await prisma.skillJobFile.findFirst({ where: { id: fileId }, select: { data: true } });
      if (!stored) return;
      const analysis = await analyseFile(await analysisContent({ ...row, facts }, stored.data));
      await finish({ analysisStatus: "READY", analysis, analysisEdited: false, analysisError: null });
    });
  } catch (error) {
    console.error("[skills-builder] file analysis failed:", error instanceof Error ? error.name : "unknown");
    // Without a known claim (the row never loaded) the file stays PENDING and reads as interrupted after 5 minutes.
    if (claim === undefined) return;
    // A PDF whose page count the parser could not read skips the page guard; Claude's own 400 is the guard then.
    const unreadablePdf = isPdf && error instanceof AiBadRequestError;
    await finish({ analysisStatus: "FAILED", analysisError: unreadablePdf ? PDF_UNREADABLE_MESSAGE : ANALYSIS_FAILED_MESSAGE }).catch((writeError: unknown) => {
      console.error("[skills-builder] could not record the analysis failure:", writeError instanceof Error ? writeError.name : "unknown");
    });
  }
}

/** Claims the file (a fresh analysis refuses; an interrupted one may be re-claimed), then spends one unit. */
export async function startReanalysis(jobId: string, fileId: string, userId: string, now = new Date()): Promise<JobFileView> {
  const row = await prisma.skillJobFile.findFirst({ where: ownedFile(jobId, fileId, userId), omit: fileViewOmit });
  if (!row) throw new FileNotFoundError();
  if (isAnalysing(row.analysisStatus, row.analysisStartedAt, now)) throw new AlreadyAnalysingError();
  const claimed = await prisma.skillJobFile.updateMany({
    where: {
      id: fileId,
      OR: [{ analysisStatus: { not: "PENDING" } }, { analysisStartedAt: null }, { analysisStartedAt: { lt: analysisCutoff(now) } }],
    },
    data: { analysisStatus: "PENDING", analysisStartedAt: now, analysisError: null },
  });
  if (claimed.count === 0) throw new AlreadyAnalysingError();
  try {
    await consumeAiUsage(userId, "skill_analyze", now);
  } catch (error) {
    // No unit was spent, so nothing will run: hand the file back as it was (only if the claim is still ours).
    await prisma.skillJobFile.updateMany({
      where: { id: fileId, analysisStatus: "PENDING", analysisStartedAt: now },
      data: { analysisStatus: row.analysisStatus, analysisStartedAt: row.analysisStartedAt, analysisError: row.analysisError },
    });
    throw error;
  }
  return toFileView({ ...row, analysisStatus: "PENDING" as const, analysisStartedAt: now, analysisError: null }, now);
}

/** The user's style guide wins: generation uses it exactly as written. */
export async function saveAnalysisEdit(jobId: string, fileId: string, userId: string, analysis: string, now = new Date()): Promise<JobFileView> {
  const row = await prisma.skillJobFile.findFirst({ where: ownedFile(jobId, fileId, userId), omit: fileViewOmit });
  if (!row) throw new FileNotFoundError();
  if (isAnalysing(row.analysisStatus, row.analysisStartedAt, now)) throw new AlreadyAnalysingError();
  const updated = await prisma.skillJobFile.update({
    where: { id: fileId },
    data: { analysis: analysis.trim().slice(0, JOB_LIMITS.analysisChars), analysisEdited: true, analysisStatus: "READY", analysisError: null },
    omit: fileViewOmit,
  });
  return toFileView(updated, now);
}

/**
 * Removes a file from the job. A version that bundled it keeps its bytes (soft delete); otherwise the row goes.
 * updateMany/deleteMany, not update/delete: those would read the bytes back.
 */
export async function deleteJobFile(jobId: string, fileId: string, userId: string, now = new Date()): Promise<"soft" | "hard"> {
  const row = await prisma.skillJobFile.findFirst({ where: ownedFile(jobId, fileId, userId), select: { id: true } });
  if (!row) throw new FileNotFoundError();
  const generating = await prisma.skillJobSkill.findFirst({
    where: { jobId, status: "GENERATING", generationStartedAt: { gt: generationCutoff(now) } },
    select: { id: true },
  });
  if (generating) throw new AlreadyGeneratingError();
  const referenced = await prisma.skillVersion.findFirst({ where: { skill: { jobId }, assetFileIds: { has: fileId } }, select: { id: true } });
  await prisma.$transaction([
    referenced
      ? prisma.skillJobFile.updateMany({ where: { id: fileId }, data: { deletedAt: now } })
      : prisma.skillJobFile.deleteMany({ where: { id: fileId } }),
    prisma.$executeRaw`UPDATE "skill_job_skills" SET "file_ids" = array_remove("file_ids", ${fileId}) WHERE "job_id" = ${jobId}`,
  ]);
  return referenced ? "soft" : "hard";
}

/** Hard-deletes the job's removed files that no remaining version bundles. Returns how many went. */
export function purgeUnreferencedFiles(jobId: string): Promise<number> {
  return prisma.$executeRaw`DELETE FROM "skill_job_files" f WHERE f."job_id" = ${jobId} AND f."deleted_at" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "skill_versions" v JOIN "skill_job_skills" s ON s."id" = v."skill_id" WHERE s."job_id" = ${jobId} AND f."id" = ANY(v."asset_file_ids"))`;
}

export async function loadFileDetail(jobId: string, fileId: string, userId: string): Promise<JobFileDetail | null> {
  const row = await prisma.skillJobFile.findFirst({ where: ownedFile(jobId, fileId, userId), omit: { data: true } });
  if (!row) return null;
  return { ...toFileView(row), facts: row.facts as unknown as FileFacts | null };
}
