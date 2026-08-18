import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse, successResponse, validationErrorResponse } from "@/lib/api/response";
import {
  CoachManagementError,
  coachPasswordSchema,
  setCoachPassword,
} from "@/lib/admin/coach-management";

type CoachPasswordRouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, context: CoachPasswordRouteContext) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  if (user.role !== "ADMIN") {
    return errorResponse("Super Admin access required", "FORBIDDEN", 403);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid request body", "PARSE_ERROR", 400);
  }
  const parsed = coachPasswordSchema.safeParse(body);
  if (!parsed.success) return validationErrorResponse(parsed.error);

  try {
    const { id } = await context.params;
    await setCoachPassword(user, id, parsed.data.password);
    return successResponse({
      message: "Password updated. Existing coach sessions have been signed out.",
    });
  } catch (error) {
    if (error instanceof CoachManagementError) {
      return errorResponse(error.message, error.code, error.status);
    }
    return errorResponse("Unable to update coach password", "COACH_PASSWORD_ERROR", 500);
  }
}
