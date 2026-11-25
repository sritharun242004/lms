import { after, NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse, successResponse } from "@/lib/api/response";
import { AiNotConfiguredError, isAiConfigured } from "@/lib/ai/config";
import { aiErrorResponse } from "@/lib/prompt-bot/http";
import { EmptyDescriptionError } from "@/lib/skills/jobs/errors";
import { jobErrorResponse, unauthorized } from "@/lib/skills/jobs/http";
import { runPluginGeneration, startPluginGeneration } from "@/lib/skills/jobs/plugin-generate";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Claims the plugin and answers 202 at once; every skill is written in after() because a plugin takes several
 * Opus calls, longer than App Runner's 120-second request limit. The workspace polls the task.
 */
export async function POST(_req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  if (!isAiConfigured()) return aiErrorResponse(new AiNotConfiguredError());
  const { id } = await params;
  try {
    const plugin = await startPluginGeneration(id, user.id);
    after(() => runPluginGeneration(id, user.id));
    return successResponse(plugin, undefined, 202);
  } catch (error) {
    if (error instanceof EmptyDescriptionError) return errorResponse("Describe the task first.", "EMPTY_DESCRIPTION", 400);
    const mapped = jobErrorResponse(error);
    if (mapped) return mapped;
    throw error;
  }
}
