import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { successResponse } from "@/lib/api/response";
import { AiNotConfiguredError, isAiConfigured } from "@/lib/ai/config";
import { aiErrorResponse } from "@/lib/prompt-bot/http";
import { jobErrorResponse, unauthorized } from "@/lib/skills/jobs/http";
import { suggestForJob } from "@/lib/skills/jobs/skills";

/** Suggest runs inside the request (one 100 s Opus attempt, under App Runner's 120 s cap). */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  if (!isAiConfigured()) return aiErrorResponse(new AiNotConfiguredError());
  const { id } = await params;
  try {
    return successResponse(await suggestForJob(id, user.id));
  } catch (error) {
    const res = jobErrorResponse(error);
    if (res) return res;
    throw error;
  }
}
