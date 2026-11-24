import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse, successResponse, validationErrorResponse } from "@/lib/api/response";
import { loadPackView } from "@/lib/skills/packs";

type Ctx = { params: Promise<{ id: string }> };
const PatchBody = z.object({ title: z.string().trim().min(1).max(120) });

export async function GET(_req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  const { id } = await params;
  const view = await loadPackView(id, user.id);
  return view ? successResponse(view) : errorResponse("Skill pack not found", "NOT_FOUND", 404);
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  const { id } = await params;
  const parsed = PatchBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return validationErrorResponse(parsed.error);
  const owned = await prisma.skillPack.findFirst({ where: { id, userId: user.id }, select: { id: true } });
  if (!owned) return errorResponse("Skill pack not found", "NOT_FOUND", 404);
  await prisma.skillPack.update({ where: { id }, data: { title: parsed.data.title } });
  return successResponse(await loadPackView(id, user.id));
}
