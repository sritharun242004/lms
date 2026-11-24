import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listFeedbackSubmissions } from "@/lib/forms/feedback";
import { FormError } from "@/lib/forms/form-service";
import { errorResponse, successResponse } from "@/lib/api/response";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);

  const url = new URL(req.url);
  const formId = url.searchParams.get("formId") || undefined;
  const q = url.searchParams.get("q") || undefined;

  try {
    const submissions = await listFeedbackSubmissions(user, { formId, q });
    return successResponse({ submissions });
  } catch (error) {
    if (error instanceof FormError) return errorResponse(error.message, error.code, error.status);
    throw error;
  }
}
