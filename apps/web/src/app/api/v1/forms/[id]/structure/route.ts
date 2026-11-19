import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { saveFormStructure, FormError } from "@/lib/forms/form-service";
import { errorResponse, successResponse } from "@/lib/api/response";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);

  const { id } = await params;
  try {
    const body = await req.json();
    const sections = Array.isArray(body.sections) ? body.sections : [];
    await saveFormStructure(user, id, sections);
    return successResponse({ saved: true });
  } catch (error) {
    if (error instanceof FormError) return errorResponse(error.message, error.code, error.status);
    throw error;
  }
}
