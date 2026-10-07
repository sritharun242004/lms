import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse, successResponse } from "@/lib/api/response";
import { normalizeScaleTemplateDraft } from "@/lib/cms/scale";
import {
  normalizeQuizDraft,
  normalizeStandaloneQuestionDraft,
  type StandaloneQuestionType,
} from "@/lib/cms/task-requirements";

const itemInclude = {
  options: { orderBy: { order: "asc" } },
  scaleStatements: { orderBy: { order: "asc" } },
  createdBy: { select: { name: true } },
} as const;

type LibraryType = "MULTIPLE_CHOICE" | "WORD_CLOUD" | "OPEN_ENDED" | "SCALE";

// Conversion is only allowed inside a family, so a PATCH can never delete one
// family's child rows (choices / statements) to rewrite it as another.
const family = (type: LibraryType) =>
  type === "MULTIPLE_CHOICE" ? "quiz" : type === "SCALE" ? "scale" : "standalone";

const allowed = (role?: string) => role === "ADMIN" || role === "MENTOR";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !allowed(user.role)) return errorResponse("Staff access required", "FORBIDDEN", 403);
  const { id } = await params;
  const item = await prisma.questionLibraryItem.findUnique({
    where: { id },
    include: itemInclude,
  });
  if (!item) return errorResponse("Question not found", "QUESTION_NOT_FOUND", 404);
  return successResponse({ item });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !allowed(user.role)) return errorResponse("Staff access required", "FORBIDDEN", 403);
  const { id } = await params;
  let existingType: LibraryType | undefined;
  try {
    const body = await req.json();
    const existing = await prisma.questionLibraryItem.findUnique({ where: { id }, select: { type: true } });
    if (!existing) return errorResponse("Question not found", "QUESTION_NOT_FOUND", 404);
    existingType = existing.type;
    const type = String(body.type ?? existing.type);
    if (type !== "MULTIPLE_CHOICE" && type !== "WORD_CLOUD" && type !== "OPEN_ENDED" && type !== "SCALE") {
      throw new Error("Unsupported question type");
    }
    if (family(existing.type) !== family(type)) {
      throw new Error("Question family cannot be changed");
    }
    if (type === "SCALE") {
      const scale = normalizeScaleTemplateDraft({
        name: String(body.name ?? ""),
        statements: Array.isArray(body.statements)
          ? body.statements.map((statement: { text?: unknown; max?: unknown }) => ({
              text: String(statement?.text ?? ""),
              max: statement?.max == null ? undefined : Number(statement.max),
            }))
          : [],
      });
      const item = await prisma.$transaction(async (tx) => {
        await tx.questionLibraryScaleStatement.deleteMany({ where: { questionId: id } });
        return tx.questionLibraryItem.update({
          where: { id },
          data: {
            name: scale.name,
            question: scale.question,
            scaleStatements: {
              create: scale.statements.map((statement, order) => ({ text: statement.text, max: statement.max, order })),
            },
          },
          include: itemInclude,
        });
      });
      return successResponse({ item });
    }
    if (type !== "MULTIPLE_CHOICE") {
      const question = normalizeStandaloneQuestionDraft({
        name: String(body.name ?? ""),
        question: String(body.question ?? ""),
        type: type as StandaloneQuestionType,
        options: body.options == null
          ? []
          : Array.isArray(body.options)
            ? body.options.map(String)
            : [String(body.options)],
      });
      const item = await prisma.$transaction(async (tx) => {
        await tx.questionLibraryOption.deleteMany({ where: { questionId: id } });
        return tx.questionLibraryItem.update({
          where: { id },
          data: {
            name: question.name,
            question: question.question,
            type: question.type,
          },
          include: itemInclude,
        });
      });
      return successResponse({ item });
    }
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
          type: "MULTIPLE_CHOICE",
          chartType: quiz.chartType,
          options: { create: quiz.options.map((text, order) => ({ text, order })) },
        },
        include: itemInclude,
      });
    });
    return successResponse({ item });
  } catch (error) {
    const legacyQuiz = existingType === "MULTIPLE_CHOICE";
    return errorResponse(
      error instanceof Error ? error.message : legacyQuiz ? "Unable to update quiz" : "Unable to update question",
      legacyQuiz ? "QUIZ_UPDATE_ERROR" : "QUESTION_UPDATE_ERROR",
      400
    );
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
