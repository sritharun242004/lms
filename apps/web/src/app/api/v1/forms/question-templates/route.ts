import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createQuestionTemplate, listQuestionTemplates } from "@/lib/forms/question-templates";
import { FormError } from "@/lib/forms/form-service";
import { errorResponse, successResponse } from "@/lib/api/response";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);

  const url = new URL(req.url);
  try {
    const templates = await listQuestionTemplates(user, {
      type: (url.searchParams.get("type") as never) ?? undefined,
      category: url.searchParams.get("category") ?? undefined,
      search: url.searchParams.get("q") ?? undefined,
    });
    return successResponse({ templates });
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
    const template = await createQuestionTemplate(user, {
      title: String(body.title ?? ""),
      type: body.type,
      description: body.description,
      config: body.config,
      category: body.category,
      tags: body.tags,
    });
    return successResponse({ template }, undefined, 201);
  } catch (error) {
    if (error instanceof FormError) return errorResponse(error.message, error.code, error.status);
    throw error;
  }
}
