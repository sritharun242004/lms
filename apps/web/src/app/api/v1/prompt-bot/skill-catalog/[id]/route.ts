import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse, successResponse, validationErrorResponse } from "@/lib/api/response";
import { canEditMatrices } from "@/lib/prompt-bot/matrix-input";
import { BUNDLABLE_MESSAGE, bundlableAllowed, CatalogPatch, toCatalogEntryView } from "@/lib/skills/catalog-input";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  if (!canEditMatrices(user.role)) return errorResponse("Only coaches and admins can edit the skill catalog", "FORBIDDEN", 403);
  const { id } = await params;
  const parsed = CatalogPatch.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return validationErrorResponse(parsed.error);
  const existing = await prisma.skillCatalogEntry.findUnique({ where: { id } });
  if (!existing) return errorResponse("Catalog entry not found", "NOT_FOUND", 404);
  const license = parsed.data.license ?? existing.license;
  const bundlable = parsed.data.bundlable ?? existing.bundlable;
  if (!bundlableAllowed(license, bundlable)) return errorResponse(BUNDLABLE_MESSAGE, "VALIDATION_ERROR", 400);
  const row = await prisma.skillCatalogEntry.update({ where: { id }, data: parsed.data });
  return successResponse(toCatalogEntryView(row));
}
