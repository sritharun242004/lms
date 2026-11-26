import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse, successResponse } from "@/lib/api/response";
import { AiNotConfiguredError, isAiConfigured } from "@/lib/ai/config";
import { aiErrorResponse } from "@/lib/prompt-bot/http";
import {
  jobErrorResponse,
  readJobJson,
  unauthorized,
  uploadName,
} from "@/lib/skills/jobs/http";
import { createJobFileUpload } from "@/lib/skills/jobs/uploads";

/**
 * Step one of a file upload: the browser declares the file (name, size, optional questionId) and gets back a
 * link to PUT it straight to S3 (201), or "post it to /files" when this server has no bucket (200).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  if (!isAiConfigured()) return aiErrorResponse(new AiNotConfiguredError());
  const body = await readJobJson(req);
  if (!body.ok) return body.response;
  const input = (body.value ?? {}) as {
    name?: unknown;
    size?: unknown;
    questionId?: unknown;
  };
  const fileName = uploadName(
    typeof input.name === "string" ? input.name : null,
  );
  if (!fileName) {
    return errorResponse(
      "Add the file's name to the upload (up to 255 characters).",
      "VALIDATION_ERROR",
      400,
      { name: ["Required"] },
    );
  }
  if (
    typeof input.size !== "number" ||
    !Number.isSafeInteger(input.size) ||
    input.size < 0
  ) {
    return errorResponse(
      "Add the file's size to the upload.",
      "VALIDATION_ERROR",
      400,
      { size: ["Required"] },
    );
  }
  if (input.size === 0)
    return errorResponse("This file is empty.", "VALIDATION_ERROR", 400);
  const questionId =
    typeof input.questionId === "string" && input.questionId
      ? input.questionId
      : null;
  const { id } = await params;
  try {
    const upload = await createJobFileUpload({
      jobId: id,
      userId: user.id,
      fileName,
      size: input.size,
      questionId,
    });
    return successResponse(upload, undefined, upload.mode === "s3" ? 201 : 200);
  } catch (error) {
    const res = jobErrorResponse(error);
    if (res) return res;
    throw error;
  }
}
