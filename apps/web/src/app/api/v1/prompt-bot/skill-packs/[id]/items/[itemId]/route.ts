import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse, successResponse, validationErrorResponse } from "@/lib/api/response";
import { withSkillName } from "@/lib/skills/format";
import { oneLine, uniqueSkillName } from "@/lib/skills/names";
import { isGenerating, loadItemView, parseStoredFiles, toStoredFiles } from "@/lib/skills/packs";
import { PURPOSE_MAX } from "@/lib/skills/split";

type Ctx = { params: Promise<{ id: string; itemId: string }> };
const PatchBody = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    purpose: z.string().trim().min(1).max(PURPOSE_MAX).optional(),
    order: z.number().int().min(0).max(1000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

const notFound = () => errorResponse("Skill not found", "NOT_FOUND", 404);

export async function GET(_req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  const { id, itemId } = await params;
  const view = await loadItemView(id, itemId, user.id);
  return view ? successResponse(view) : notFound();
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  const { id, itemId } = await params;
  const parsed = PatchBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return validationErrorResponse(parsed.error);
  const item = await prisma.skillPackItem.findFirst({
    where: { id: itemId, packId: id, pack: { userId: user.id } },
    select: { id: true, kind: true, name: true, status: true, generationStartedAt: true, files: true, pack: { select: { items: { select: { id: true, name: true, kind: true } } } } },
  });
  if (!item) return notFound();

  const data: Prisma.SkillPackItemUpdateInput = {};
  if (parsed.data.purpose !== undefined) data.purpose = oneLine(parsed.data.purpose, PURPOSE_MAX);
  if (parsed.data.order !== undefined) data.order = parsed.data.order;
  if (parsed.data.name !== undefined) {
    if (item.kind !== "CUSTOM") return errorResponse("Only custom skills can be renamed", "VALIDATION_ERROR", 400);
    if (isGenerating(item.status, item.generationStartedAt)) {
      return errorResponse("Wait until the skill has been written before renaming it.", "ALREADY_GENERATING", 409);
    }
    const taken = item.pack.items.filter((i) => i.kind === "CUSTOM" && i.id !== item.id).map((i) => i.name);
    const name = uniqueSkillName(parsed.data.name, taken);
    if (name !== item.name) {
      data.name = name;
      // The item name owns the folder and the SKILL.md name; keep them identical.
      const files = parseStoredFiles(item.files);
      if (files) data.files = toStoredFiles(files.map((f) => (f.path === "SKILL.md" ? { ...f, content: withSkillName(f.content, name) } : f)));
    }
  }
  if (Object.keys(data).length > 0) await prisma.skillPackItem.update({ where: { id: itemId }, data });
  return successResponse(await loadItemView(id, itemId, user.id));
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  const { id, itemId } = await params;
  const item = await prisma.skillPackItem.findFirst({ where: { id: itemId, packId: id, pack: { userId: user.id } }, select: { id: true } });
  if (!item) return notFound();
  await prisma.skillPackItem.delete({ where: { id: itemId } });
  return successResponse({ deleted: true });
}
