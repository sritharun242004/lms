import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse, successResponse } from "@/lib/api/response";
import {
  approveRegistration,
  rejectRegistration,
  requestResubmission,
  VerificationError,
} from "@/lib/workshop/verification";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    return errorResponse("Admin access required", "FORBIDDEN", 403);
  }

  const { id } = await params;
  const body = await req.json();
  const note = typeof body.note === "string" ? body.note : undefined;

  try {
    if (body.action === "APPROVE") {
      const registration = await approveRegistration(user.id, id, {
        note,
        whatsappGroupInviteUrl: typeof body.whatsappGroupInviteUrl === "string" ? body.whatsappGroupInviteUrl : undefined,
        allowMissingWhatsappLink: body.allowMissingWhatsappLink === true,
      });
      return successResponse({ registration });
    }
    if (body.action === "REJECT") {
      const registration = await rejectRegistration(user.id, id, note ?? "Rejected");
      return successResponse({ registration });
    }
    if (body.action === "REQUEST_RESUBMISSION") {
      const registration = await requestResubmission(user.id, id, note ?? "Resubmission requested");
      return successResponse({ registration });
    }
    return errorResponse("Unknown action", "INVALID_ACTION", 400);
  } catch (error) {
    if (error instanceof VerificationError) {
      return errorResponse(error.message, error.code, error.status);
    }
    throw error;
  }
}
