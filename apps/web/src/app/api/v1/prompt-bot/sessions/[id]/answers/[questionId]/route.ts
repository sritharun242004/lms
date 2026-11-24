// apps/web/src/app/api/v1/prompt-bot/sessions/[id]/answers/[questionId]/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { AnswerBody, answerFields } from "@/lib/prompt-bot/answer-input";
import { matricesForSession } from "@/lib/prompt-bot/sessions";
import { errorResponse, successResponse, validationErrorResponse } from "@/lib/api/response";

type Ctx = { params: Promise<{ id: string; questionId: string }> };
export async function PUT(req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  const { id, questionId } = await params;
  const parsed = AnswerBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return validationErrorResponse(parsed.error);
  const owned = await prisma.promptBotSession.findFirst({ where: { id, userId: user.id } });
  if (!owned) return errorResponse("Session not found", "NOT_FOUND", 404);
  const matrices = await matricesForSession(owned.taskMatrixId);
  if (!matrices.some((m) => m.questions.some((q) => q.id === questionId))) {
    return errorResponse("Question not found", "NOT_FOUND", 404);
  }

  const fields = answerFields(parsed.data);
  await prisma.promptBotAnswer.upsert({
    where: { sessionId_questionId: { sessionId: id, questionId } },
    create: { sessionId: id, questionId, ...fields },
    update: fields,
  });
  return successResponse({ saved: true });
}
