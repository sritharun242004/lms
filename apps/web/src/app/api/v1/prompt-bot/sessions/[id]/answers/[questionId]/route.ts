// apps/web/src/app/api/v1/prompt-bot/sessions/[id]/answers/[questionId]/route.ts
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { matricesForSession } from "@/lib/prompt-bot/sessions";
import { errorResponse, successResponse, validationErrorResponse } from "@/lib/api/response";

type Ctx = { params: Promise<{ id: string; questionId: string }> };
const Body = z
  .object({ answer: z.string().max(4000).optional(), notRelevant: z.boolean().optional() })
  .refine((v) => v.answer !== undefined || v.notRelevant !== undefined, "Nothing to update");

export async function PUT(req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  const { id, questionId } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return validationErrorResponse(parsed.error);
  const owned = await prisma.promptBotSession.findFirst({ where: { id, userId: user.id } });
  if (!owned) return errorResponse("Session not found", "NOT_FOUND", 404);
  const matrices = await matricesForSession(owned.taskMatrixId);
  if (!matrices.some((m) => m.questions.some((q) => q.id === questionId))) {
    return errorResponse("Question not found", "NOT_FOUND", 404);
  }

  const fields = {
    ...(parsed.data.answer !== undefined ? { answer: parsed.data.answer } : {}),
    ...(parsed.data.notRelevant !== undefined ? { notRelevant: parsed.data.notRelevant } : {}),
  };
  await prisma.promptBotAnswer.upsert({
    where: { sessionId_questionId: { sessionId: id, questionId } },
    create: { sessionId: id, questionId, ...fields },
    update: fields,
  });
  return successResponse({ saved: true });
}
