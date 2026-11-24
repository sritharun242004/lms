import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse, successResponse, validationErrorResponse } from "@/lib/api/response";
import { PACK_LIMITS } from "@/lib/skills/limits";
import { duplicateNameResponse } from "@/lib/skills/http";
import { normalizeSkillName, oneLine } from "@/lib/skills/names";
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
  if (pack.items.length >= PACK_LIMITS.items) {
    return errorResponse(`A pack can hold at most ${PACK_LIMITS.items} skills. Remove one to add another.`, "PACK_FULL", 409, {
      items: [String(PACK_LIMITS.items)],
    });
  }
  const name = normalizeSkillName(parsed.data.name);
  if (pack.items.some((i) => i.kind === "CUSTOM" && i.name === name)) return duplicateNameResponse(name);
  const order = Math.max(-1, ...pack.items.map((i) => i.order)) + 1;
  const created = await prisma.skillPackItem.create({
    data: { packId: id, kind: "CUSTOM", order, name, purpose: oneLine(parsed.data.purpose, PURPOSE_MAX) },
    select: { id: true },
  });
  return successResponse(await loadItemView(id, created.id, user.id), undefined, 201);
}
