// apps/web/src/app/api/v1/prompt-bot/sessions/route.ts
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse, successResponse, validationErrorResponse } from "@/lib/api/response";
import { isAiConfigured, AiNotConfiguredError } from "@/lib/ai/config";
import { detectTaskKind } from "@/lib/ai/claude";
import { consumeAiUsage, LimitReachedError } from "@/lib/ai/usage";
import { aiErrorResponse } from "@/lib/prompt-bot/http";
import { loadSessionView, runScoring, titleFrom } from "@/lib/prompt-bot/sessions";
import { readiness } from "@/lib/prompt-bot/scoring";

const CreateBody = z.object({ basePrompt: z.string().trim().min(1).max(20000) });

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  const sessions = await prisma.promptBotSession.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: { id: true, title: true, updatedAt: true, answers: { select: { score: true, notRelevant: true } } },
  });
  return successResponse(
    sessions.map((s) => ({ id: s.id, title: s.title, updatedAt: s.updatedAt.toISOString(), readiness: readiness(s.answers).ratio })),
  );
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  if (!isAiConfigured()) return aiErrorResponse(new AiNotConfiguredError());
  const parsed = CreateBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return validationErrorResponse(parsed.error);

  const taskMatrices = await prisma.promptMatrix.findMany({
    where: { kind: "TASK", isActive: true },
    select: { id: true, slug: true, name: true, description: true },
  });
  // Detection is an AI call: spend a score unit first, and refuse before creating a session that could never be scored.
  try {
    await consumeAiUsage(user.id, "score");
  } catch (error) {
    if (error instanceof LimitReachedError) return aiErrorResponse(error);
    throw error;
  }
  let taskMatrixId: string | null = null;
  try {
    const detection = await detectTaskKind(parsed.data.basePrompt, taskMatrices);
    taskMatrixId = taskMatrices.find((m) => m.slug === detection.slug)?.id ?? null;
  } catch (error) {
    if (error instanceof AiNotConfiguredError) return aiErrorResponse(error);
    // Detection is a convenience: fall back to core-only rather than failing creation.
  }

  const session = await prisma.promptBotSession.create({
    data: {
      userId: user.id,
      basePrompt: parsed.data.basePrompt,
      title: titleFrom(parsed.data.basePrompt),
      taskMatrixId,
      taskDetected: true,
    },
  });
  try {
    await runScoring(session.id, user.id, 0);
  } catch (error) {
    if (!(error instanceof LimitReachedError)) console.error("[prompt-bot] initial scoring failed");
  }
  return successResponse(await loadSessionView(session.id, user.id), undefined, 201);
}
