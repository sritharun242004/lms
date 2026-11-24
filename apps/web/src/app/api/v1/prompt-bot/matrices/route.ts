// apps/web/src/app/api/v1/prompt-bot/matrices/route.ts
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse, successResponse, validationErrorResponse } from "@/lib/api/response";

import { canEditMatrices, QuestionInput } from "@/lib/prompt-bot/matrix-input";

const CreateBody = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).optional(),
  questions: z.array(QuestionInput).max(20),
});

const slugify = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "matrix";

const include = { questions: { orderBy: { order: "asc" as const } } };

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  const editor = canEditMatrices(user.role);
  const rows = await prisma.promptMatrix.findMany({
    where: editor ? { kind: { not: "SKILL" } } : { isActive: true, kind: { not: "SKILL" } },
    include,
    orderBy: [{ kind: "asc" }, { name: "asc" }],
  });
  return successResponse(
    rows.map((m) => ({ ...m, questions: editor ? m.questions : m.questions.filter((q) => q.isActive) })),
  );
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  if (!canEditMatrices(user.role)) return errorResponse("Only coaches and admins can edit matrices", "FORBIDDEN", 403);
  const parsed = CreateBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return validationErrorResponse(parsed.error);
  const data = (slug: string) => ({
    name: parsed.data.name,
    slug,
    description: parsed.data.description ?? null,
    kind: "TASK" as const,
    isBuiltIn: false,
    createdById: user.id,
    questions: { create: parsed.data.questions.map((q, order) => ({ order, text: q.text, guidance: q.guidance, element: q.element ?? null })) },
  });
  let matrix;
  try {
    matrix = await prisma.promptMatrix.create({ data: data(slugify(parsed.data.name)), include });
  } catch (error) {
    if ((error as { code?: string }).code !== "P2002") throw error;
    matrix = await prisma.promptMatrix.create({ data: data(`${slugify(parsed.data.name)}-${Date.now().toString(36)}`), include });
  }
  return successResponse(matrix, undefined, 201);
}
