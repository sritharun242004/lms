import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { deleteForm, getFormWithStructure, updateFormMeta, FormError } from "@/lib/forms/form-service";
import { errorResponse, successResponse } from "@/lib/api/response";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);

  const { id } = await params;
  try {
    const form = await getFormWithStructure(id);
    return successResponse({ form });
  } catch (error) {
    if (error instanceof FormError) return errorResponse(error.message, error.code, error.status);
    throw error;
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);

  const { id } = await params;
  // Same loose typing as req.json() gave this route before; each field is
  // passed through to updateFormMeta, which Prisma type-checks on write.
  let body: Awaited<ReturnType<NextRequest["json"]>>;
  try {
    body = await req.json();
  } catch {
    // e.g. the page was left mid-request and the body arrived cut off.
    return errorResponse("Invalid request body", "PARSE_ERROR", 400);
  }
  try {
    const form = await updateFormMeta(user, id, {
      title: body.title,
      description: body.description,
      headerImageUrl: body.headerImageUrl,
      themeColor: body.themeColor,
      opensAt: body.opensAt ? new Date(body.opensAt) : body.opensAt,
      closesAt: body.closesAt ? new Date(body.closesAt) : body.closesAt,
      allowMultipleSubmissions: body.allowMultipleSubmissions,
      feedbackTargetType: body.feedbackTargetType,
      feedbackTargetLabel: body.feedbackTargetLabel,
      isTemplate: typeof body.isTemplate === "boolean" ? body.isTemplate : undefined,
      publicLinkEnabled: typeof body.publicLinkEnabled === "boolean" ? body.publicLinkEnabled : undefined,
    });
    return successResponse({ form });
  } catch (error) {
    if (error instanceof FormError) return errorResponse(error.message, error.code, error.status);
    throw error;
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);

  const { id } = await params;
  try {
    const result = await deleteForm(user, id);
    return successResponse(result);
  } catch (error) {
    if (error instanceof FormError) return errorResponse(error.message, error.code, error.status);
    throw error;
  }
}
