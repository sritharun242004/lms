import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse, successResponse, validationErrorResponse } from "@/lib/api/response";
import { AnswerBody, answerFields } from "@/lib/prompt-bot/answer-input";
import { findOwnedCustomItem, loadSkillMatrix } from "@/lib/skills/packs";

type Ctx = { params: Promise<{ id: string; itemId: string; questionId: string }> };
export async function PUT(req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  const { id, itemId, questionId } = await params;
  const parsed = AnswerBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return validationErrorResponse(parsed.error);
  if (!(await findOwnedCustomItem(id, itemId, user.id))) return errorResponse("Skill not found", "NOT_FOUND", 404);
  const matrix = await loadSkillMatrix();
  if (!matrix.questions.some((q) => q.id === questionId)) return errorResponse("Question not found", "NOT_FOUND", 404);

  const fields = answerFields(parsed.data);
  await prisma.skillItemAnswer.upsert({
    where: { itemId_questionId: { itemId, questionId } },
    create: { itemId, questionId, ...fields },
    update: fields,
  });
  return successResponse({ saved: true });
}
