import { after, NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readBytesWithin } from "@/lib/api/body";
import { errorResponse, successResponse } from "@/lib/api/response";
import { AiNotConfiguredError, isAiConfigured } from "@/lib/ai/config";
import { aiErrorResponse } from "@/lib/prompt-bot/http";
import { JobNotFoundError, TooManyFilesError } from "@/lib/skills/jobs/errors";
import { countActiveFiles, runFileAnalysis, storeJobFile } from "@/lib/skills/jobs/files";
import { jobErrorResponse, unauthorized } from "@/lib/skills/jobs/http";
import { findOwnedJob } from "@/lib/skills/jobs/jobs";
import { JOB_LIMITS } from "@/lib/skills/limits";

const NAME_MAX = 255;

/** The display name: URLSearchParams has already decoded it; keep the base name, drop control characters. */
function uploadName(raw: string | null): string | null {
  if (raw === null) return null;
  const base = raw.split(/[\\/]/).pop() ?? "";
  const name = base.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return name && name.length <= NAME_MAX ? name : null;
}

/**
 * Uploads one resource file as the raw request body (`?name=` carries the file name). Every cheap check runs
 * before the body is read and before a unit is spent; the row is inserted only after the whole body arrived.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  if (!isAiConfigured()) return aiErrorResponse(new AiNotConfiguredError());
  const fileName = uploadName(req.nextUrl.searchParams.get("name"));
  if (!fileName) {
    return errorResponse("Add the file's name to the upload (up to 255 characters).", "VALIDATION_ERROR", 400, { name: ["Required"] });
  }
  const { id } = await params;
  try {
    if (!(await findOwnedJob(id, user.id))) throw new JobNotFoundError();
    if ((await countActiveFiles(id)) >= JOB_LIMITS.filesPerJob) throw new TooManyFilesError();
    const body = await readBytesWithin(req, JOB_LIMITS.fileBytes);
    if (!body.ok) {
      return body.reason === "too_large"
        ? errorResponse(`Files can be up to ${JOB_LIMITS.fileBytes / (1024 * 1024)} MB.`, "FILE_TOO_LARGE", 413)
        : errorResponse("The upload didn't finish. Try again.", "UPLOAD_INCOMPLETE", 400);
    }
    if (body.bytes.byteLength === 0) return errorResponse("This file is empty.", "VALIDATION_ERROR", 400);
    const view = await storeJobFile({ jobId: id, userId: user.id, fileName, bytes: body.bytes });
    after(() => runFileAnalysis(id, view.id, user.id));
    return successResponse(view, undefined, 201);
  } catch (error) {
    const res = jobErrorResponse(error);
    if (res) return res;
    throw error;
  }
}
