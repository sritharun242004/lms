import { after, NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { successResponse } from "@/lib/api/response";
import { AiNotConfiguredError, isAiConfigured } from "@/lib/ai/config";
import { aiErrorResponse } from "@/lib/prompt-bot/http";
import { runJobSkillGeneration, startJobSkillGeneration } from "@/lib/skills/jobs/generate";
import { jobErrorResponse, unauthorized } from "@/lib/skills/jobs/http";

type Ctx = { params: Promise<{ id: string; skillId: string }> };

/**
 * Claims the skill and answers 202 at once; the writing runs in after() because an Opus skill can take
 * longer than App Runner's 120-second request limit. The workspace polls the job.
 */
export async function POST(_req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  if (!isAiConfigured()) return aiErrorResponse(new AiNotConfiguredError());
  const { id, skillId } = await params;
  try {
    const view = await startJobSkillGeneration(id, skillId, user.id);
    after(() => runJobSkillGeneration(id, skillId, user.id));
    return successResponse(view, undefined, 202);
  } catch (error) {
    const mapped = jobErrorResponse(error);
    if (mapped) return mapped;
    throw error;
  }
}
