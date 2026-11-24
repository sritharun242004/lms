import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse, successResponse, validationErrorResponse } from "@/lib/api/response";
import { canEditMatrices } from "@/lib/prompt-bot/matrix-input";
import { BUNDLABLE_MESSAGE, bundlableAllowed, CatalogCreate, toCatalogEntryView } from "@/lib/skills/catalog-input";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  const rows = await prisma.skillCatalogEntry.findMany({ where: canEditMatrices(user.role) ? {} : { isActive: true }, orderBy: { name: "asc" } });
  return successResponse(rows.map(toCatalogEntryView));
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  if (!canEditMatrices(user.role)) return errorResponse("Only coaches and admins can edit the skill catalog", "FORBIDDEN", 403);
  const parsed = CatalogCreate.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return validationErrorResponse(parsed.error);
  if (!bundlableAllowed(parsed.data.license, parsed.data.bundlable)) return errorResponse(BUNDLABLE_MESSAGE, "VALIDATION_ERROR", 400);
  try {
    const row = await prisma.skillCatalogEntry.create({ data: { ...parsed.data, createdById: user.id } });
    return successResponse(toCatalogEntryView(row), undefined, 201);
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return errorResponse("That slug is already in the catalog.", "VALIDATION_ERROR", 400);
    throw error;
  }
}
