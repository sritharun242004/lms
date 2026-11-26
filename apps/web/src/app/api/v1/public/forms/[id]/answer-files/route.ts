import { NextRequest } from "next/server";
import { storeAnswerFile } from "@/lib/forms/answer-files";
import { getPublicForm, isPublicFileUploadQuestion } from "@/lib/forms/responses";
import { FormError } from "@/lib/forms/form-service";
import { errorResponse, successResponse } from "@/lib/api/response";
import { RATE_LIMITS, clientIp, hitRateLimit, tooManyAttempts } from "@/lib/api/rate-limit";

// The no-S3 path for a public-link upload: bytes posted here and kept in the
// database, same as the staff/participant route, just without a signed-in
// user — so the form and question are re-checked instead.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const retryAfter = hitRateLimit(`public-form-upload:${clientIp(req)}`, RATE_LIMITS.publicFileUploadPerIp);
  if (retryAfter !== null) return tooManyAttempts(retryAfter);

  const form = await req.formData();
  const file = form.get("file");
  const questionId = form.get("questionId");
  if (!(file instanceof File) || typeof questionId !== "string") {
    return errorResponse("Choose a file to upload", "FILE_REQUIRED", 400);
  }

  try {
    const publicForm = await getPublicForm(id);
    if (!isPublicFileUploadQuestion(publicForm, questionId)) {
      return errorResponse("This question does not accept a file", "UNKNOWN_QUESTION", 400);
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const stored = await storeAnswerFile({ mimeType: file.type, fileName: file.name, size: file.size, data: buffer });
    return successResponse(stored, undefined, 201);
  } catch (error) {
    if (error instanceof FormError) return errorResponse(error.message, error.code, error.status);
    throw error;
  }
}
