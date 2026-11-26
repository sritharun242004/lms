import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { formUploadsS3, s3Client } from "@/lib/forms/answer-files";
import { JOB_LIMITS, UPLOAD_URL_TTL_SECONDS } from "../limits";
import { StorageUnavailableError } from "./errors";

/**
 * Where a Skills Builder file's bytes live. Files share the form uploads bucket (under skills/); without a
 * bucket, uploads go to this server and the bytes stay in Postgres (`data`). Credentials come from the runtime role.
 */
export const skillUploadsS3 = formUploadsS3;

/** The one effective per-file cap: what the server enforces and what the upload box shows. */
export function maxJobFileBytes(): number {
  return skillUploadsS3() ? JOB_LIMITS.s3FileBytes : JOB_LIMITS.fileBytes;
}

function bucket() {
  const s3 = skillUploadsS3();
  if (!s3) throw new StorageUnavailableError();
  return { client: s3Client(s3.region), Bucket: s3.bucket };
}

/** A link the browser PUTs exactly this many bytes of exactly this type to; S3 refuses anything else. */
export async function signJobFileUpload(
  key: string,
  contentType: string,
  size: number,
): Promise<string> {
  const { client, Bucket } = bucket();
  return getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: size,
    }),
    {
      expiresIn: UPLOAD_URL_TTL_SECONDS,
      signableHeaders: new Set(["content-type", "content-length"]),
    },
  );
}

const statusOf = (error: unknown) =>
  (error as { $metadata?: { httpStatusCode?: number } } | null)?.$metadata
    ?.httpStatusCode;

/**
 * The stored object's size, or null when it is not there. The role has no s3:ListBucket, so S3 answers a
 * missing key with 403 rather than 404: both read as "not uploaded (yet)".
 */
export async function storedObjectSize(key: string): Promise<number | null> {
  const { client, Bucket } = bucket();
  try {
    const head = await client.send(new HeadObjectCommand({ Bucket, Key: key }));
    return typeof head.ContentLength === "number" ? head.ContentLength : null;
  } catch (error) {
    const status = statusOf(error);
    if (status === 403 || status === 404) return null;
    throw error;
  }
}

/** Reads the object (or its first range.bytes) into one buffer; a whole read must be exactly maxBytes, its known size. */
export async function readStoredObject(
  key: string,
  maxBytes: number,
  range?: { bytes: number },
): Promise<Buffer> {
  const { client, Bucket } = bucket();
  const res = await client.send(
    new GetObjectCommand({
      Bucket,
      Key: key,
      ...(range ? { Range: `bytes=0-${range.bytes - 1}` } : {}),
    }),
  );
  const limit = range ? Math.min(range.bytes, maxBytes) : maxBytes;
  if (!res.Body) throw new Error("Empty S3 response");
  // One allocation of the expected size, filled as chunks arrive, so a 100 MB file is held once, not twice.
  const out = Buffer.allocUnsafe(limit);
  let total = 0;
  for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
    if (total + chunk.byteLength > limit) {
      (res.Body as { destroy?: () => void }).destroy?.();
      throw new Error("Stored object is larger than expected");
    }
    out.set(chunk, total);
    total += chunk.byteLength;
  }
  // A whole-object read must be exactly the stored size; a short stream is a cut-off transfer, never a file.
  if (!range && total !== limit)
    throw new Error("Stored object is shorter than expected");
  return out.subarray(0, total);
}

/**
 * Best effort: the production role may lack s3:DeleteObject, so a failure is logged by class and the object
 * stays (it is never referenced again). Never throws.
 */
export async function deleteStoredObject(key: string): Promise<void> {
  try {
    const { client, Bucket } = bucket();
    await client.send(new DeleteObjectCommand({ Bucket, Key: key }));
  } catch (error) {
    console.error(
      "[skills-builder] could not delete a stored file:",
      error instanceof Error ? error.name : "unknown",
    );
  }
}

/** The owner of "where are this file's bytes": S3 for direct uploads, the row for files posted to this server. */
export async function loadJobFileBytes(row: {
  data: Uint8Array | null;
  storageKey: string | null;
  size: number;
}): Promise<Uint8Array> {
  if (row.storageKey) return readStoredObject(row.storageKey, row.size);
  if (row.data) return row.data;
  throw new Error("Stored file has no bytes");
}
