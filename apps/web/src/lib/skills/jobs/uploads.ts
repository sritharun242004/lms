import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { consumeAiUsage, refundAiUsage } from "@/lib/ai/usage";
import { readUpload } from "../files/extract";
import { MAGIC_BYTES, sniffMagic, type Magic } from "../files/sniff";
import {
  FILE_READ_MESSAGES,
  FileReadError,
  KIND_MIME,
  kindFromFileName,
  type SkillFileKind,
} from "../files/types";
import { JOB_LIMITS, UPLOAD_ABANDONED_MS } from "../limits";
import {
  FileNotFoundError,
  FileTooLargeError,
  JobNotFoundError,
  TooManyFilesError,
  UploadExpiredError,
  UploadNotFinishedError,
  UploadSizeMismatchError,
} from "./errors";
import {
  assertTaskQuestion,
  countActiveFiles,
  createLimiter,
  insertJobFile,
} from "./files";
import { fileViewOmit, findOwnedJob, toFileView } from "./jobs";
import {
  deleteStoredObject,
  maxJobFileBytes,
  readStoredObject,
  signJobFileUpload,
  skillUploadsS3,
  storedObjectSize,
} from "./storage";
import type { JobFileView } from "./types";

export type JobFileUpload =
  | {
      mode: "s3";
      fileId: string;
      uploadUrl: string;
      headers: Record<string, string>;
      maxBytes: number;
    }
  | { mode: "direct"; maxBytes: number };

/** A completed upload's whole file is held while it is read; at most this many at once, the rest wait in order. */
export const MAX_CONCURRENT_UPLOAD_READS = 2;
const uploadReads = createLimiter(MAX_CONCURRENT_UPLOAD_READS);
const noQueueWork = () => () => {};

const logName = (error: unknown) =>
  error instanceof Error ? error.name : "unknown";
const mismatch = () =>
  new FileReadError("UNSUPPORTED_FILE", FILE_READ_MESSAGES.mismatch);
const MAGIC_OF: Record<SkillFileKind, Magic> = {
  PPTX: "ZIP",
  DOCX: "ZIP",
  XLSX: "ZIP",
  PDF: "PDF",
  PNG: "PNG",
  JPEG: "JPEG",
};

type PendingUpload = {
  id: string;
  jobId: string;
  fileName: string;
  kind: SkillFileKind;
  size: number;
  storageKey: string;
  questionId: string | null;
  createdAt: Date;
};

/** Removes the pending upload once (whoever deletes the row hands the unit back), then tries to delete its object. */
async function abandonUpload(
  upload: PendingUpload,
  userId: string,
): Promise<void> {
  const { count } = await prisma.skillJobFileUpload.deleteMany({
    where: { id: upload.id },
  });
  if (count === 0) return;
  await refundAiUsage(userId, "skill_analyze", upload.createdAt).catch(
    (error: unknown) => {
      console.error(
        "[skills-builder] could not refund an abandoned upload:",
        logName(error),
      );
    },
  );
  await deleteStoredObject(upload.storageKey);
}

/** The user's direct uploads not completed within UPLOAD_ABANDONED_MS: removed, their units handed back. */
export async function sweepAbandonedUploads(
  userId: string,
  now = new Date(),
): Promise<number> {
  const stale = await prisma.skillJobFileUpload.findMany({
    where: {
      createdAt: { lt: new Date(now.getTime() - UPLOAD_ABANDONED_MS) },
      job: { userId },
    },
    take: 50,
  });
  for (const upload of stale) await abandonUpload(upload, userId);
  return stale.length;
}

/**
 * Step one of an upload. Cheap checks first (size, a supported name, the task and question, the count), then one
 * skill_analyze unit, then a pending row and a link signed for exactly this size and type. Without a bucket the
 * caller posts the bytes to POST /files instead (mode "direct").
 */
export async function createJobFileUpload(
  input: {
    jobId: string;
    userId: string;
    fileName: string;
    size: number;
    questionId?: string | null;
  },
  now = new Date(),
): Promise<JobFileUpload> {
  const maxBytes = maxJobFileBytes();
  if (input.size > maxBytes) throw new FileTooLargeError(maxBytes);
  const kind = kindFromFileName(input.fileName);
  if (!kind)
    throw new FileReadError("UNSUPPORTED_FILE", FILE_READ_MESSAGES.unsupported);
  if (!(await findOwnedJob(input.jobId, input.userId)))
    throw new JobNotFoundError();
  const questionId = input.questionId ?? null;
  if (questionId) await assertTaskQuestion(input.jobId, questionId);
  if (!skillUploadsS3()) return { mode: "direct", maxBytes };
  await sweepAbandonedUploads(input.userId, now);
  if ((await countActiveFiles(input.jobId, now)) >= JOB_LIMITS.filesPerJob)
    throw new TooManyFilesError();

  await consumeAiUsage(input.userId, "skill_analyze", now);
  const id = randomUUID();
  const storageKey = `skills/${input.jobId}/${id}`;
  const contentType = KIND_MIME[kind];
  try {
    await prisma.skillJobFileUpload.create({
      data: {
        id,
        jobId: input.jobId,
        fileName: input.fileName,
        kind,
        size: input.size,
        storageKey,
        questionId,
        createdAt: now,
      },
    });
    const uploadUrl = await signJobFileUpload(
      storageKey,
      contentType,
      input.size,
    );
    return {
      mode: "s3",
      fileId: id,
      uploadUrl,
      headers: { "Content-Type": contentType },
      maxBytes,
    };
  } catch (error) {
    // Nothing can be uploaded, so nothing will run: hand the unit back. A failed cleanup never hides the first error.
    await prisma.skillJobFileUpload
      .deleteMany({ where: { id } })
      .catch((e: unknown) =>
        console.error(
          "[skills-builder] could not remove an upload:",
          logName(e),
        ),
      );
    await refundAiUsage(input.userId, "skill_analyze", now).catch(
      (e: unknown) =>
        console.error(
          "[skills-builder] could not refund the analysis unit:",
          logName(e),
        ),
    );
    throw error;
  }
}

/**
 * Step three, after the browser's PUT. Checks the object is there at the signed size, sniffs its first bytes
 * (a wrong or unsupported type is refused before the whole file is read), then reads and checks it exactly as
 * an upload to this server is, and turns the pending upload into a PENDING file (same id). A refused file is
 * abandoned (unit handed back). `created` is false when an earlier request already completed it.
 */
export async function completeJobFileUpload(
  jobId: string,
  uploadId: string,
  userId: string,
  now = new Date(),
): Promise<{ view: JobFileView; created: boolean }> {
  const upload = await prisma.skillJobFileUpload.findFirst({
    where: { id: uploadId, jobId, job: { userId } },
  });
  if (!upload) {
    const done = await prisma.skillJobFile.findFirst({
      where: { id: uploadId, jobId, deletedAt: null, job: { userId } },
      omit: fileViewOmit,
    });
    if (!done) throw new FileNotFoundError();
    return { view: toFileView(done, now), created: false };
  }
  if (upload.createdAt.getTime() < now.getTime() - UPLOAD_ABANDONED_MS) {
    await abandonUpload(upload, userId);
    throw new UploadExpiredError();
  }
  const size = await storedObjectSize(upload.storageKey);
  if (size === null) throw new UploadNotFinishedError();
  if (size !== upload.size) {
    await abandonUpload(upload, userId);
    throw new UploadSizeMismatchError();
  }
  let read: Awaited<ReturnType<typeof readUpload>>;
  try {
    if (
      sniffMagic(
        await readStoredObject(upload.storageKey, upload.size, {
          bytes: MAGIC_BYTES,
        }),
      ) !== MAGIC_OF[upload.kind]
    )
      throw mismatch();
    read = await uploadReads(
      async () =>
        readUpload(await readStoredObject(upload.storageKey, upload.size)),
      noQueueWork,
    );
    if (read.kind !== upload.kind) throw mismatch();
  } catch (error) {
    if (error instanceof FileReadError) await abandonUpload(upload, userId);
    throw error;
  }
  // A question removed while the file was uploading leaves it a general file, as removing a question does.
  const questionId =
    upload.questionId &&
    (await prisma.skillJobQuestion.findFirst({
      where: { id: upload.questionId, jobId, kind: "FIXED" },
      select: { id: true },
    }))
      ? upload.questionId
      : null;
  const row = await insertJobFile(
    {
      id: upload.id,
      jobId,
      fileName: upload.fileName,
      questionId,
      read,
      size: upload.size,
      data: null,
      storageKey: upload.storageKey,
    },
    now,
    () => prisma.skillJobFileUpload.delete({ where: { id: upload.id } }),
  );
  return { view: toFileView(row, now), created: true };
}
