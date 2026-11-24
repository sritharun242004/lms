// apps/web/src/app/api/v1/prompt-bot/sessions/route.ts
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse, successResponse, validationErrorResponse } from "@/lib/api/response";
import { isAiConfigured, AiNotConfiguredError } from "@/lib/ai/config";
import { LimitReachedError } from "@/lib/ai/usage";
import { aiErrorResponse } from "@/lib/prompt-bot/http";
import { loadSessionView, recentSessions, runScoring, titleFrom } from "@/lib/prompt-bot/sessions";

const CreateBody = z.object({ basePrompt: z.string().trim().min(1).max(20000) });

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  const sessions = await recentSessions(user.id, 50);
  return successResponse(sessions.map((s) => ({ id: s.id, title: s.title, updatedAt: s.updatedAt.toISOString(), readiness: s.ratio })));
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  if (!isAiConfigured()) return aiErrorResponse(new AiNotConfiguredError());
  const parsed = CreateBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return validationErrorResponse(parsed.error);

  const session = await prisma.promptBotSession.create({
    data: {
      userId: user.id,
      basePrompt: parsed.data.basePrompt,
      title: titleFrom(parsed.data.basePrompt),
    },
  });
  try {
    await runScoring(session.id, user.id, 0);
  } catch (error) {
    if (!(error instanceof LimitReachedError)) console.error("[prompt-bot] initial scoring failed");
  }
  return successResponse(await loadSessionView(session.id, user.id), undefined, 201);
}
