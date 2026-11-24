import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse, successResponse, validationErrorResponse } from "@/lib/api/response";
import { oneLine, uniqueSkillName } from "@/lib/skills/names";
import { loadItemView } from "@/lib/skills/packs";
import { PURPOSE_MAX } from "@/lib/skills/split";

const Body = z.object({ name: z.string().trim().min(1).max(120), purpose: z.string().trim().min(1).max(PURPOSE_MAX) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return validationErrorResponse(parsed.error);
  const pack = await prisma.skillPack.findFirst({
    where: { id, userId: user.id },
    select: { id: true, items: { select: { name: true, kind: true, order: true } } },
  });
  if (!pack) return errorResponse("Skill pack not found", "NOT_FOUND", 404);
  const taken = pack.items.filter((i) => i.kind === "CUSTOM").map((i) => i.name);
  const order = Math.max(-1, ...pack.items.map((i) => i.order)) + 1;
  const created = await prisma.skillPackItem.create({
    data: { packId: id, kind: "CUSTOM", order, name: uniqueSkillName(parsed.data.name, taken), purpose: oneLine(parsed.data.purpose, PURPOSE_MAX) },
    select: { id: true },
  });
  return successResponse(await loadItemView(id, created.id, user.id), undefined, 201);
}
