// apps/web/src/app/api/v1/prompt-bot/sessions/[id]/route.ts
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse, successResponse, validationErrorResponse } from "@/lib/api/response";
import { ensureAnswerRows, loadSessionView, matricesForSession } from "@/lib/prompt-bot/sessions";

type Ctx = { params: Promise<{ id: string }> };

const PatchBody = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    basePrompt: z.string().trim().min(1).max(20000).optional(),
    taskMatrixId: z.string().min(1).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

export async function GET(_req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  const { id } = await params;
  const view = await loadSessionView(id, user.id);
  return view ? successResponse(view) : errorResponse("Session not found", "NOT_FOUND", 404);
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  const { id } = await params;
  const parsed = PatchBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return validationErrorResponse(parsed.error);
  const owned = await prisma.promptBotSession.findFirst({ where: { id, userId: user.id } });
  if (!owned) return errorResponse("Session not found", "NOT_FOUND", 404);

  const data: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) data.title = parsed.data.title;
  if (parsed.data.basePrompt !== undefined) data.basePrompt = parsed.data.basePrompt;
  if (parsed.data.taskMatrixId !== undefined) {
    data.taskMatrixId = parsed.data.taskMatrixId;
    data.taskDetected = false;
  }
  await prisma.promptBotSession.update({ where: { id }, data });
  if (parsed.data.taskMatrixId !== undefined) {
    const matrices = await matricesForSession(parsed.data.taskMatrixId);
    await ensureAnswerRows(id, matrices.flatMap((m) => m.questions.map((q) => q.id)));
  }
  return successResponse(await loadSessionView(id, user.id));
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  const { id } = await params;
  const owned = await prisma.promptBotSession.findFirst({ where: { id, userId: user.id } });
  if (!owned) return errorResponse("Session not found", "NOT_FOUND", 404);
  await prisma.promptBotSession.delete({ where: { id } });
  return successResponse({ deleted: true });
}
