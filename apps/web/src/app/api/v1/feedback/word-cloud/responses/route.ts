import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getOpenTextAnswersForResponses } from "@/lib/forms/feedback-word-cloud";
import { FormError } from "@/lib/forms/form-service";
import { errorResponse, successResponse } from "@/lib/api/response";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);

  const ids = new URL(req.url).searchParams.get("ids")?.split(",").filter(Boolean) ?? [];
  try {
    const answers = await getOpenTextAnswersForResponses(user, ids);
    return successResponse({ answers });
  } catch (error) {
    if (error instanceof FormError) return errorResponse(error.message, error.code, error.status);
    throw error;
  }
}
