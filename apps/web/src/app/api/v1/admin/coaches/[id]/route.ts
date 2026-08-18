import type { NextRequest, NextResponse } from "next/server";
import type { AuthUser } from "@cms/shared";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse, successResponse, validationErrorResponse } from "@/lib/api/response";
import {
  CoachManagementError,
  coachAccountUpdateSchema,
  deactivateCoachAccount,
  reactivateCoachAccount,
  updateCoachAccount,
} from "@/lib/admin/coach-management";

type CoachRouteContext = { params: Promise<{ id: string }> };

type AdminGate = { ok: true; user: AuthUser } | { ok: false; response: NextResponse };

async function requireAdmin(): Promise<AdminGate> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, response: errorResponse("Authentication required", "UNAUTHORIZED", 401) };
  }
  if (user.role !== "ADMIN") {
    return { ok: false, response: errorResponse("Super Admin access required", "FORBIDDEN", 403) };
  }
  return { ok: true, user };
}

function serviceError(error: unknown) {
  if (error instanceof CoachManagementError) {
    return errorResponse(error.message, error.code, error.status);
  }
  return errorResponse("Unable to manage coach account", "COACH_MANAGEMENT_ERROR", 500);
}

export async function PATCH(req: NextRequest, context: CoachRouteContext): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid request body", "PARSE_ERROR", 400);
  }
  const parsed = coachAccountUpdateSchema.safeParse(body);
  if (!parsed.success) return validationErrorResponse(parsed.error);

  try {
    const { id } = await context.params;
    const coach = await updateCoachAccount(auth.user, id, parsed.data);
    return successResponse({ coach });
  } catch (error) {
    return serviceError(error);
  }
}

export async function DELETE(_req: NextRequest, context: CoachRouteContext): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  try {
    const { id } = await context.params;
    const coach = await deactivateCoachAccount(auth.user, id);
    return successResponse({ coach });
  } catch (error) {
    return serviceError(error);
  }
}

export async function POST(_req: NextRequest, context: CoachRouteContext): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  try {
    const { id } = await context.params;
    const coach = await reactivateCoachAccount(auth.user, id);
    return successResponse({ coach });
  } catch (error) {
    return serviceError(error);
  }
}
