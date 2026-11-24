// apps/web/src/app/api/v1/prompt-bot/sessions/[id]/enhancements/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse, successResponse } from "@/lib/api/response";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  const { id } = await params;
  const rows = await prisma.promptBotEnhancement.findMany({
    where: { sessionId: id, session: { userId: user.id } },
    orderBy: { version: "desc" },
    select: { version: true, content: true, unansweredQuestionIds: true, createdAt: true },
  });
  return successResponse(rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })));
}
