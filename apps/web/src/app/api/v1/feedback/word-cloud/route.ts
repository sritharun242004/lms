import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getFeedbackWordCloud } from "@/lib/forms/feedback-word-cloud";
import { FormError } from "@/lib/forms/form-service";
import { errorResponse, successResponse } from "@/lib/api/response";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);

  const url = new URL(req.url);
  const since = url.searchParams.get("since");

  try {
    const entries = await getFeedbackWordCloud(user, {
      formId: url.searchParams.get("formId") ?? undefined,
      targetLabel: url.searchParams.get("targetLabel") ?? undefined,
      since: since ? new Date(since) : undefined,
    });
    return successResponse({ entries });
  } catch (error) {
    if (error instanceof FormError) return errorResponse(error.message, error.code, error.status);
    throw error;
  }
}
