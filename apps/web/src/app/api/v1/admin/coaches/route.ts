import type { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse, successResponse, validationErrorResponse } from "@/lib/api/response";
import {
  CoachManagementError,
  coachAccountCreateSchema,
  createCoachAccount,
} from "@/lib/admin/coach-management";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  if (user.role !== "ADMIN") return errorResponse("Super Admin access required", "FORBIDDEN", 403);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid request body", "PARSE_ERROR", 400);
  }
  const parsed = coachAccountCreateSchema.safeParse(body);
  if (!parsed.success) return validationErrorResponse(parsed.error);

  try {
    const coach = await createCoachAccount(user, parsed.data);
    return successResponse({ coach }, undefined, 201);
  } catch (error) {
    if (error instanceof CoachManagementError) {
      return errorResponse(error.message, error.code, error.status);
    }
    return errorResponse("Unable to create coach account", "COACH_MANAGEMENT_ERROR", 500);
  }
}
