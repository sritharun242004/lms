import { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { successResponse, validationErrorResponse } from "@/lib/api/response";
import { AiNotConfiguredError, isAiConfigured } from "@/lib/ai/config";
import { aiErrorResponse } from "@/lib/prompt-bot/http";
import { enhanceTask } from "@/lib/skills/jobs/enhance";
import { jobErrorResponse, readJobJson, unauthorized } from "@/lib/skills/jobs/http";
import { JOB_LIMITS } from "@/lib/skills/limits";

const Body = z.object({ description: z.string().max(JOB_LIMITS.descriptionChars) });

/** Enhance runs inside the request (Haiku, 45 s with one retry). The text in the box is sent, saved or not; nothing is stored. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  if (!isAiConfigured()) return aiErrorResponse(new AiNotConfiguredError());
  const { id } = await params;
  const body = await readJobJson(req);
  if (!body.ok) return body.response;
  const parsed = Body.safeParse(body.value);
  if (!parsed.success) return validationErrorResponse(parsed.error);
  try {
    return successResponse(await enhanceTask(id, user.id, parsed.data.description));
  } catch (error) {
    const res = jobErrorResponse(error);
    if (res) return res;
    throw error;
  }
}
