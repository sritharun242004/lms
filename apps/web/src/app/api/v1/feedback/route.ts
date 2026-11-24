import { getCurrentUser } from "@/lib/auth";
import { getFeedbackAggregates } from "@/lib/forms/feedback";
import { FormError } from "@/lib/forms/form-service";
import { errorResponse, successResponse } from "@/lib/api/response";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);

  try {
    const aggregates = await getFeedbackAggregates(user);
    return successResponse({ aggregates });
  } catch (error) {
    if (error instanceof FormError) return errorResponse(error.message, error.code, error.status);
    throw error;
  }
}
