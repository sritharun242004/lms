// apps/web/src/app/api/v1/prompt-bot/matrices/[id]/route.ts
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse, successResponse, validationErrorResponse } from "@/lib/api/response";
import { CORE_MATRIX_ID } from "@/lib/prompt-bot/builtin-matrices";
import { canEditMatrices, QuestionInput } from "@/lib/prompt-bot/matrix-input";

type Ctx = { params: Promise<{ id: string }> };
const PatchBody = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(300).nullable().optional(),
  isActive: z.boolean().optional(),
  questions: z.array(QuestionInput).max(20).optional(),
});

async function guard(id: string) {
  const user = await getCurrentUser();
  if (!user) return { error: errorResponse("Authentication required", "UNAUTHORIZED", 401) };
  if (!canEditMatrices(user.role)) return { error: errorResponse("Only coaches and admins can edit matrices", "FORBIDDEN", 403) };
  const matrix = await prisma.promptMatrix.findUnique({ where: { id }, include: { questions: { select: { id: true } } } });
  if (!matrix || matrix.kind === "SKILL") return { error: errorResponse("Matrix not found", "NOT_FOUND", 404) };
  return { matrix };
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const { matrix, error } = await guard(id);
  if (error) return error;
  const parsed = PatchBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return validationErrorResponse(parsed.error);
  if (matrix!.id === CORE_MATRIX_ID && parsed.data.isActive === false) {
    return errorResponse("The Design Think core matrix must stay active", "VALIDATION_ERROR", 400);
  }
  if (matrix!.id === CORE_MATRIX_ID && parsed.data.questions?.length === 0) {
    return errorResponse("The Design Think core matrix needs at least one question", "VALIDATION_ERROR", 400);
  }

  const ops = [];
  ops.push(
    prisma.promptMatrix.update({
      where: { id },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
        ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
      },
    }),
  );
  if (parsed.data.questions) {
    const keep = new Set<string>();
    parsed.data.questions.forEach((q, order) => {
      const fields = { order, text: q.text, guidance: q.guidance, element: q.element ?? null, isActive: true };
      if (q.id && matrix!.questions.some((existing) => existing.id === q.id)) {
        keep.add(q.id);
        ops.push(prisma.promptMatrixQuestion.update({ where: { id: q.id }, data: fields }));
      } else {
        ops.push(prisma.promptMatrixQuestion.create({ data: { matrixId: id, ...fields } }));
      }
    });
    const removed = matrix!.questions.map((q) => q.id).filter((qid) => !keep.has(qid));
    if (removed.length) {
      ops.push(prisma.promptMatrixQuestion.updateMany({ where: { matrixId: id, id: { in: removed } }, data: { isActive: false } }));
    }
  }
  await prisma.$transaction(ops);
  return successResponse(await prisma.promptMatrix.findUnique({ where: { id }, include: { questions: { orderBy: { order: "asc" } } } }));
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const { matrix, error } = await guard(id);
  if (error) return error;
  if (matrix!.isBuiltIn) return errorResponse("Built-in matrices can be deactivated but not deleted", "VALIDATION_ERROR", 400);
  await prisma.promptMatrix.delete({ where: { id } });
  return successResponse({ deleted: true });
}
