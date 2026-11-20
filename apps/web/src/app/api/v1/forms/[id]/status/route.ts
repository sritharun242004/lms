import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { setFormStatus, FormError } from "@/lib/forms/form-service";
import { errorResponse, successResponse } from "@/lib/api/response";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);

  const { id } = await params;
  try {
    const body = await req.json();
    const status = String(body.status ?? "");
    if (status !== "DRAFT" && status !== "PUBLISHED" && status !== "ARCHIVED") {
      return errorResponse("Unknown status", "INVALID_STATUS", 400);
    }
    const form = await setFormStatus(user, id, status);
    return successResponse({ form });
  } catch (error) {
    if (error instanceof FormError) return errorResponse(error.message, error.code, error.status);
    throw error;
  }
}
