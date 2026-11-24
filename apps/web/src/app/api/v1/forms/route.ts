import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createForm, listForms, FormError } from "@/lib/forms/form-service";
import { errorResponse, successResponse } from "@/lib/api/response";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const category = url.searchParams.get("category");
  const search = url.searchParams.get("q");

  try {
    const forms = await listForms(user, {
      status: status as never,
      category: category as never,
      search: search ?? undefined,
    });
    return successResponse({ forms });
  } catch (error) {
    if (error instanceof FormError) return errorResponse(error.message, error.code, error.status);
    throw error;
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);

  try {
    const body = await req.json();
    const form = await createForm(user, {
      title: String(body.title ?? ""),
      category: body.category,
      feedbackTargetType: body.feedbackTargetType,
      feedbackTargetLabel: body.feedbackTargetLabel,
    });
    return successResponse({ form }, undefined, 201);
  } catch (error) {
    if (error instanceof FormError) return errorResponse(error.message, error.code, error.status);
    throw error;
  }
}
