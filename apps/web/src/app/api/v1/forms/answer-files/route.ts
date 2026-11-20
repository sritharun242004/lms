import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { storeAnswerFile } from "@/lib/forms/answer-files";
import { FormError } from "@/lib/forms/form-service";
import { errorResponse, successResponse } from "@/lib/api/response";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return errorResponse("Choose a file to upload", "FILE_REQUIRED", 400);

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const stored = await storeAnswerFile({ mimeType: file.type, fileName: file.name, size: file.size, data: buffer });
    return successResponse(stored, undefined, 201);
  } catch (error) {
    if (error instanceof FormError) return errorResponse(error.message, error.code, error.status);
    throw error;
  }
}
