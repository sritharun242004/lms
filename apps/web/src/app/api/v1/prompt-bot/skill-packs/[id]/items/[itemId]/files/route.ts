import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { readJsonWithin } from "@/lib/api/body";
import { errorResponse, successResponse } from "@/lib/api/response";
import { validateSkillFiles } from "@/lib/skills/format";
import { FILES_REQUEST_BYTES } from "@/lib/skills/limits";
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
  const body = await readJsonWithin(req, FILES_REQUEST_BYTES);
  if (!body.ok) {
    const message = `The files are over the ${FILES_REQUEST_BYTES / (1024 * 1024)} MB save limit. Make them smaller.`;
    return errorResponse(message, "PAYLOAD_TOO_LARGE", 413, { files: [message], limit: [String(FILES_REQUEST_BYTES)] });
  }
  const raw = body.value;
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return errorResponse("Fix these problems before saving the skill.", "VALIDATION_ERROR", 400, { files: structuralMessages(parsed.error, raw) });
  const item = await findOwnedCustomItem(id, itemId, user.id);
  if (!item) return errorResponse("Skill not found", "NOT_FOUND", 404);
  if (isGenerating(item.status, item.generationStartedAt)) {
    return errorResponse("This skill is being written. Wait for it to finish before editing.", "ALREADY_GENERATING", 409);
  }
  // Files exist only once a generation wrote them, so an edit can never mint a READY skill from nothing.
  if (item.files === null) return errorResponse("Generate this skill before editing its files.", "NOT_GENERATED", 409);
  const errors = validateSkillFiles(parsed.data.files, item.name);
  if (errors.length > 0) return errorResponse("Fix these problems before saving the skill.", "VALIDATION_ERROR", 400, { files: errors });
  await prisma.skillPackItem.update({
    where: { id: itemId },
    data: { files: toStoredFiles(parsed.data.files), status: "READY", validationErrors: [] },
  });
  return successResponse(await loadItemView(id, itemId, user.id));
}
