import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse, successResponse } from "@/lib/api/response";
import { validateSkillFiles } from "@/lib/skills/format";
import { findOwnedCustomItem, isGenerating, loadItemView, toStoredFiles } from "@/lib/skills/packs";

// Structure only: every size, count and path rule is the validator's, so its per-file messages reach the preview.
const Body = z.object({ files: z.array(z.object({ path: z.string(), content: z.string() })) });

/** Names the file for each zod issue ("files.0.content") so the preview can show it on that file. */
function structuralMessages(error: z.ZodError, raw: unknown): string[] {
  const list = (raw as { files?: unknown })?.files;
  return error.issues.map((issue) => {
    const index = issue.path[0] === "files" && typeof issue.path[1] === "number" ? issue.path[1] : null;
    const entry = index !== null && Array.isArray(list) ? (list[index] as { path?: unknown } | undefined) : undefined;
    const label = typeof entry?.path === "string" && entry.path ? entry.path : index !== null ? `File ${index + 1}` : "files";
    return `${label}: ${issue.message}`;
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  const { id, itemId } = await params;
  const raw: unknown = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return errorResponse("Fix these problems before saving the skill.", "VALIDATION_ERROR", 400, { files: structuralMessages(parsed.error, raw) });
  const item = await findOwnedCustomItem(id, itemId, user.id);
  if (!item) return errorResponse("Skill not found", "NOT_FOUND", 404);
  if (isGenerating(item.status, item.generationStartedAt)) {
    return errorResponse("This skill is being written. Wait for it to finish before editing.", "ALREADY_GENERATING", 409);
  }
  const errors = validateSkillFiles(parsed.data.files, item.name);
  if (errors.length > 0) return errorResponse("Fix these problems before saving the skill.", "VALIDATION_ERROR", 400, { files: errors });
  await prisma.skillPackItem.update({
    where: { id: itemId },
    data: { files: toStoredFiles(parsed.data.files), status: "READY", validationErrors: [] },
  });
  return successResponse(await loadItemView(id, itemId, user.id));
}
