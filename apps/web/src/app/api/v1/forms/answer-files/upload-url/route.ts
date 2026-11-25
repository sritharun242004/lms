import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createAnswerFileUpload, maxAnswerFileBytes } from "@/lib/forms/answer-files";
import { FormError } from "@/lib/forms/form-service";
import { errorResponse, successResponse } from "@/lib/api/response";

// The size limit the upload box shows before anyone picks a file.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  return successResponse({ maxBytes: maxAnswerFileBytes() });
}

// Step one of a form-answer upload: the browser declares the file, and gets
// back either a link to send it straight to S3 or "post it here" (no S3).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);

  let body: { fileName?: unknown; mimeType?: unknown; size?: unknown };
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid request body", "PARSE_ERROR", 400);
  }
  if (typeof body.fileName !== "string" || typeof body.size !== "number") {
    return errorResponse("Choose a file to upload", "FILE_REQUIRED", 400);
  }

  try {
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
