import { NextRequest } from "next/server";
import { createAnswerFileUpload, maxAnswerFileBytes } from "@/lib/forms/answer-files";
import { getPublicForm, isPublicFileUploadQuestion } from "@/lib/forms/responses";
import { FormError } from "@/lib/forms/form-service";
import { errorResponse, successResponse } from "@/lib/api/response";
import { RATE_LIMITS, clientIp, hitRateLimit, tooManyAttempts } from "@/lib/api/rate-limit";

type RouteContext = { params: Promise<{ id: string }> };

// The size limit the public link's upload box shows before anyone picks a file.
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  try {
    await getPublicForm(id);
  } catch (error) {
    if (error instanceof FormError) return errorResponse(error.message, error.code, error.status);
    throw error;
  }
  return successResponse({ maxBytes: maxAnswerFileBytes() });
}

// Step one of a public-link upload: unlike the staff/participant route, there
// is no signed-in user to trust, so the form must be genuinely public and
// questionId must name one of its own FILE_UPLOAD questions.
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const retryAfter = hitRateLimit(`public-form-upload:${clientIp(req)}`, RATE_LIMITS.publicFileUploadPerIp);
  if (retryAfter !== null) return tooManyAttempts(retryAfter);

  let body: { fileName?: unknown; mimeType?: unknown; size?: unknown; questionId?: unknown };
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid request body", "PARSE_ERROR", 400);
  }
  if (typeof body.fileName !== "string" || typeof body.size !== "number" || typeof body.questionId !== "string") {
    return errorResponse("Choose a file to upload", "FILE_REQUIRED", 400);
  }

  try {
    const form = await getPublicForm(id);
    if (!isPublicFileUploadQuestion(form, body.questionId)) {
      return errorResponse("This question does not accept a file", "UNKNOWN_QUESTION", 400);
    }
    const upload = await createAnswerFileUpload({
      fileName: body.fileName,
      mimeType: typeof body.mimeType === "string" ? body.mimeType : "",
      size: body.size,
    });
    return successResponse(upload, undefined, upload.mode === "s3" ? 201 : 200);
  } catch (error) {
    if (error instanceof FormError) return errorResponse(error.message, error.code, error.status);
    throw error;
  }
}
