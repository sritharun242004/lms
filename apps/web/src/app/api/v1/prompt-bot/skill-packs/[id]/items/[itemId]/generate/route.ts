import { after, NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse, successResponse } from "@/lib/api/response";
import { AiNotConfiguredError, isAiConfigured } from "@/lib/ai/config";
import { LimitReachedError } from "@/lib/ai/usage";
import { aiErrorResponse } from "@/lib/prompt-bot/http";
import { AlreadyGeneratingError, runGeneration, SkillNotFoundError, startGeneration } from "@/lib/skills/generate";

/**
 * Claims the skill and answers 202 at once; the writing runs in after() because an Opus
 * skill can take longer than App Runner's 120-second request limit. The page polls the item.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  if (!isAiConfigured()) return aiErrorResponse(new AiNotConfiguredError());
  const { id, itemId } = await params;
  try {
    const view = await startGeneration(id, itemId, user.id);
    after(() => runGeneration(id, itemId, user.id));
    return successResponse(view, undefined, 202);
  } catch (error) {
    if (error instanceof SkillNotFoundError) return errorResponse("Skill not found", "NOT_FOUND", 404);
    if (error instanceof AlreadyGeneratingError) {
      return errorResponse("This skill is already being written. Wait for it to finish.", "ALREADY_GENERATING", 409);
    }
    // Only the expected AI-layer failures are mapped; anything else is a real error.
    if (error instanceof LimitReachedError || error instanceof AiNotConfiguredError) return aiErrorResponse(error);
    throw error;
  }
}
