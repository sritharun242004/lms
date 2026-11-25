import { randomUUID } from "node:crypto";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { prisma } from "@/lib/db/prisma";
import { isInlineSafeType, uploadedFileHeaders } from "@/lib/api/file-response";
import { FormError } from "./form-service";

const MB = 1024 * 1024;

// Bytes kept in Postgres go through the server's memory several times over,
// so they stay small. Files bound for S3 never touch the server at all — the
// browser sends them straight to the bucket — which is what makes 100 MB safe.
export const MAX_DATABASE_ANSWER_FILE_BYTES = 20 * MB;
export const MAX_S3_ANSWER_FILE_BYTES = 100 * MB;

const UPLOAD_URL_TTL_SECONDS = 15 * 60;
const DOWNLOAD_URL_TTL_SECONDS = 5 * 60;

type S3Settings = { bucket: string; region: string };

/** S3 is used when a bucket is configured; credentials come from the runtime's AWS role. */
export function formUploadsS3(): S3Settings | null {
  const bucket = process.env.FORM_UPLOADS_BUCKET?.trim();
  if (!bucket) return null;
  return { bucket, region: process.env.FORM_UPLOADS_REGION?.trim() || process.env.AWS_REGION?.trim() || "us-east-1" };
}

let cachedClient: { region: string; client: S3Client } | null = null;
function s3Client(region: string): S3Client {
  if (!cachedClient || cachedClient.region !== region) cachedClient = { region, client: new S3Client({ region }) };
  return cachedClient.client;
}

export function maxAnswerFileBytes(): number {
  return formUploadsS3() ? MAX_S3_ANSWER_FILE_BYTES : MAX_DATABASE_ANSWER_FILE_BYTES;
}

function tooLarge(maxBytes: number): FormError {
  return new FormError(`File is too large. Maximum size is ${maxBytes / MB} MB.`, "FILE_TOO_LARGE", 400);
}

function cleanFileName(name: string): string {
  const trimmed = name.replace(/[\\/\u0000-\u001f]/g, "_").trim();
  return (trimmed || "file").slice(0, 200);
}

export type AnswerFileUpload =
  | { mode: "s3"; fileId: string; uploadUrl: string; headers: Record<string, string>; maxBytes: number }
  | { mode: "direct"; maxBytes: number };

/**
 * Step one of an upload. With S3 configured this records the file and returns
 * a short-lived link the browser PUTs the bytes to; the signed size and type
 * mean S3 itself rejects anything other than the file that was declared.
 * Without S3 the caller falls back to posting the bytes to this server.
 */
export async function createAnswerFileUpload(input: { fileName: string; mimeType: string; size: number }): Promise<AnswerFileUpload> {
  const s3 = formUploadsS3();
  const maxBytes = maxAnswerFileBytes();
  if (!Number.isInteger(input.size) || input.size <= 0) {
    throw new FormError("Choose a file to upload", "FILE_REQUIRED", 400);
  }
  if (input.size > maxBytes) throw tooLarge(maxBytes);
  if (!s3) return { mode: "direct", maxBytes };

  const mimeType = input.mimeType.trim() || "application/octet-stream";
  const storageKey = `form-answers/${randomUUID()}`;
  const record = await prisma.formAnswerFile.create({
    data: { mimeType, fileName: cleanFileName(input.fileName), size: input.size, storageKey },
  });
  const uploadUrl = await getSignedUrl(
    s3Client(s3.region),
    new PutObjectCommand({ Bucket: s3.bucket, Key: storageKey, ContentType: mimeType, ContentLength: input.size }),
    { expiresIn: UPLOAD_URL_TTL_SECONDS, signableHeaders: new Set(["content-type", "content-length"]) }
  );
  return { mode: "s3", fileId: record.id, uploadUrl, headers: { "Content-Type": mimeType }, maxBytes };
}

/** The no-S3 path: bytes posted to this server and kept in the database. */
export async function storeAnswerFile(file: { mimeType: string; fileName: string; size: number; data: Buffer }) {
  if (file.size > MAX_DATABASE_ANSWER_FILE_BYTES) throw tooLarge(MAX_DATABASE_ANSWER_FILE_BYTES);
  const stored = await prisma.formAnswerFile.create({
    data: {
      mimeType: file.mimeType,
      fileName: cleanFileName(file.fileName),
      size: file.size,
      data: new Uint8Array(file.data),
    },
  });
  return { fileId: stored.id, fileName: stored.fileName };
}

export type AnswerFileDownload =
  | { kind: "redirect"; url: string }
  | { kind: "bytes"; data: Uint8Array<ArrayBuffer>; headers: Record<string, string> };

/**
 * S3 files are handed out as a short-lived signed link carrying the same
 * safety headers the app applies to its own downloads (only script-free types
 * open inline; everything else downloads under a neutral type).
 */
export async function getAnswerFileDownload(fileId: string): Promise<AnswerFileDownload | null> {
  const file = await prisma.formAnswerFile.findUnique({ where: { id: fileId } });
  if (!file) return null;
  const headers = uploadedFileHeaders({ fileName: file.fileName, mimeType: file.mimeType, size: file.size, inline: true });

  if (file.storageKey) {
    const s3 = formUploadsS3();
    if (!s3) throw new FormError("File storage isn't configured on this server", "STORAGE_UNAVAILABLE", 503);
    const url = await getSignedUrl(
      s3Client(s3.region),
      new GetObjectCommand({
        Bucket: s3.bucket,
        Key: file.storageKey,
        ResponseContentType: isInlineSafeType(file.mimeType) ? file.mimeType : "application/octet-stream",
        ResponseContentDisposition: headers["Content-Disposition"],
      }),
      { expiresIn: DOWNLOAD_URL_TTL_SECONDS }
    );
    return { kind: "redirect", url };
  }
  if (!file.data) return null;
  return { kind: "bytes", data: Uint8Array.from(file.data), headers };
}
