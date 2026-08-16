import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse, successResponse } from "@/lib/api/response";
import { normalizeQuizDraft } from "@/lib/cms/task-requirements";

const allowed = (role?: string) => role === "ADMIN" || role === "MENTOR";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !allowed(user.role)) return errorResponse("Staff access required", "FORBIDDEN", 403);
  const { id } = await params;
  try {
    const body = await req.json();
    const quiz = normalizeQuizDraft({
      name: String(body.name ?? ""),
      question: String(body.question ?? ""),
      options: Array.isArray(body.options) ? body.options.map(String) : [],
      chartType: body.chartType,
    });
    const item = await prisma.$transaction(async (tx) => {
      await tx.questionLibraryOption.deleteMany({ where: { questionId: id } });
      return tx.questionLibraryItem.update({
        where: { id },
        data: {
          name: quiz.name,
          question: quiz.question,
          chartType: quiz.chartType,
          options: { create: quiz.options.map((text, order) => ({ text, order })) },
        },
        include: { options: { orderBy: { order: "asc" } }, createdBy: { select: { name: true } } },
      });
    });
    return successResponse({ item });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unable to update quiz", "QUIZ_UPDATE_ERROR", 400);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !allowed(user.role)) return errorResponse("Staff access required", "FORBIDDEN", 403);
  const { id } = await params;
  try {
    await prisma.questionLibraryItem.delete({ where: { id } });
    return successResponse({ id });
  } catch {
    return errorResponse("Quiz not found", "QUIZ_NOT_FOUND", 404);
  }
}
