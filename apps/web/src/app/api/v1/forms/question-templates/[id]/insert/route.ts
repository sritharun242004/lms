import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { insertTemplateIntoSection } from "@/lib/forms/question-templates";
import { FormError } from "@/lib/forms/form-service";
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
    const sectionId = String(body.sectionId ?? "");
    const question = await insertTemplateIntoSection(user, id, sectionId);
    return successResponse({ question }, undefined, 201);
  } catch (error) {
    if (error instanceof FormError) return errorResponse(error.message, error.code, error.status);
    throw error;
  }
}
