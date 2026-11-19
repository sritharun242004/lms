import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getInvitationForFilling } from "@/lib/forms/invitations";
import { FormError } from "@/lib/forms/form-service";
import { errorResponse, successResponse } from "@/lib/api/response";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);

  const { id } = await params;
  try {
    const invitation = await getInvitationForFilling(user, id);
    return successResponse({ invitation });
  } catch (error) {
    if (error instanceof FormError) return errorResponse(error.message, error.code, error.status);
    throw error;
  }
}
