// apps/web/src/app/api/v1/prompt-bot/sessions/[id]/score/route.ts
import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse, successResponse, validationErrorResponse } from "@/lib/api/response";
import { ScoreBody } from "@/lib/prompt-bot/answer-input";
import { aiErrorResponse } from "@/lib/prompt-bot/http";
import { loadSessionView, runScoring } from "@/lib/prompt-bot/sessions";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  const { id } = await params;
  const parsed = ScoreBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return validationErrorResponse(parsed.error);
  if (!(await loadSessionView(id, user.id))) return errorResponse("Session not found", "NOT_FOUND", 404);
  try {
    return successResponse(await runScoring(id, user.id, parsed.data.revision));
  } catch (error) {
    return aiErrorResponse(error);
  }
}
