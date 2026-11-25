import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { successResponse, validationErrorResponse } from "@/lib/api/response";
import { AiNotConfiguredError, isAiConfigured } from "@/lib/ai/config";
import { ScoreBody } from "@/lib/prompt-bot/answer-input";
import { aiErrorResponse } from "@/lib/prompt-bot/http";
import { jobErrorResponse, readJobJson, unauthorized } from "@/lib/skills/jobs/http";
import { runJobScoring } from "@/lib/skills/jobs/jobs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  // Refuse before anything is counted: scoreAndApply spends the unit before the AI call.
  if (!isAiConfigured()) return aiErrorResponse(new AiNotConfiguredError());
  const { id } = await params;
  const body = await readJobJson(req);
  if (!body.ok) return body.response;
  const parsed = ScoreBody.safeParse(body.value);
  if (!parsed.success) return validationErrorResponse(parsed.error);
  try {
    return successResponse(await runJobScoring(id, user.id, parsed.data.revision));
  } catch (error) {
    const res = jobErrorResponse(error);
    if (res) return res;
    throw error;
  }
}
