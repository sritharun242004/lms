import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse, successResponse, validationErrorResponse } from "@/lib/api/response";
import { AiNotConfiguredError } from "@/lib/ai/config";
import { isAiCallError } from "@/lib/ai/errors";
import { LimitReachedError } from "@/lib/ai/usage";
import { ScoreBody } from "@/lib/prompt-bot/answer-input";
import { aiErrorResponse } from "@/lib/prompt-bot/http";
import { findOwnedCustomItem, runItemScoring } from "@/lib/skills/packs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  const { id, itemId } = await params;
  const parsed = ScoreBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return validationErrorResponse(parsed.error);
  if (!(await findOwnedCustomItem(id, itemId, user.id))) return errorResponse("Skill not found", "NOT_FOUND", 404);
  try {
    return successResponse(await runItemScoring(id, itemId, user.id, parsed.data.revision));
  } catch (error) {
    // Only AI-layer failures are mapped (C5); a database error or a skill deleted mid-score is a real error.
    if (error instanceof LimitReachedError || error instanceof AiNotConfiguredError || isAiCallError(error)) return aiErrorResponse(error);
    throw error;
  }
}
