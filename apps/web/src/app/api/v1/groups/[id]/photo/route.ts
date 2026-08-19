import { AuditAction } from "@cms/shared";
import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse, successResponse } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { getGroupAccess } from "@/lib/groups/access";
import { buildGroupPhotoUrl } from "@/lib/photos/contracts";
import { normalizePhotoUpload, PhotoUploadError } from "@/lib/photos/image";
import { photoResponse } from "@/lib/photos/response";
import { broadcastToGroup } from "@/lib/realtime/broadcast";

type FileLike = Pick<File, "size" | "type" | "arrayBuffer">;
function isFileLike(value: FormDataEntryValue | null): value is File { return value !== null && typeof value !== "string" && typeof value.arrayBuffer === "function" && typeof value.type === "string" && typeof value.size === "number"; }
async function parsePhoto(request: NextRequest): Promise<FileLike | Response> { try { const form = await request.formData(); const entries = form.getAll("photo"); if (entries.length !== 1 || !isFileLike(entries[0]) || entries[0].size === 0) return errorResponse("Exactly one non-empty photo is required.", "PHOTO_REQUIRED", 400); return entries[0]; } catch { return errorResponse("A multipart photo upload is required.", "PHOTO_REQUIRED", 400); } }
function uploadError(error: unknown) { if (error instanceof PhotoUploadError) return errorResponse(error.message, error.code, error.status); return errorResponse("The selected file is not a valid photo.", "INVALID_PHOTO", 400); }
async function findGroup(id: string) { return prisma.group.findUnique({ where: { id }, select: { id: true, name: true, description: true, avatarUrl: true } }); }
async function canManage(id: string, user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>) { const access = await getGroupAccess(id, user); return access; }

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(); if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  const { id } = await params; const group = await findGroup(id); if (!group) return errorResponse("Group not found", "GROUP_NOT_FOUND", 404);
  if (!(await canManage(id, user)).canManage) return errorResponse("You don't have permission to manage this group photo", "FORBIDDEN", 403);
  const parsed = await parsePhoto(request); if (parsed instanceof Response) return parsed;
  let normalized; try { normalized = await normalizePhotoUpload(parsed as File); } catch (error) { return uploadError(error); }
  const avatarUrl = buildGroupPhotoUrl(id, Date.now());
  try {
    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.groupProfilePhoto.findUnique({ where: { groupId: id }, select: { id: true } });
      await tx.groupProfilePhoto.upsert({ where: { groupId: id }, create: { groupId: id, mimeType: normalized.mimeType, size: normalized.size, width: normalized.width, height: normalized.height, data: normalized.data as unknown as Uint8Array<ArrayBuffer> }, update: { mimeType: normalized.mimeType, size: normalized.size, width: normalized.width, height: normalized.height, data: normalized.data as unknown as Uint8Array<ArrayBuffer> } });
      const result = await tx.group.update({ where: { id }, data: { avatarUrl } });
      await tx.auditLog.create({ data: { userId: user.id, action: AuditAction.GROUP_AVATAR_UPDATED, entityType: "Group", entityId: id, metadata: { operation: existing ? "replace" : "add", mimeType: normalized.mimeType, size: normalized.size, width: normalized.width, height: normalized.height } } });
      return result;
    });
    broadcastToGroup(id, "group:update", { groupId: id, name: updated.name, description: updated.description, avatarUrl });
    return successResponse({ id: updated.id, avatarUrl });
  } catch (error) { console.error("Update group photo error:", error); return errorResponse("Failed to update group photo", "PHOTO_UPDATE_ERROR", 500); }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(); if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  const { id } = await params; const group = await findGroup(id); if (!group) return errorResponse("Group not found", "GROUP_NOT_FOUND", 404);
  if (!(await canManage(id, user)).canManage) return errorResponse("You don't have permission to manage this group photo", "FORBIDDEN", 403);
  try {
    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.groupProfilePhoto.findUnique({ where: { groupId: id }, select: { id: true } });
      if (existing) { await tx.groupProfilePhoto.delete({ where: { groupId: id } }); await tx.auditLog.create({ data: { userId: user.id, action: AuditAction.GROUP_AVATAR_REMOVED, entityType: "Group", entityId: id, metadata: { operation: "remove" } } }); }
      return tx.group.update({ where: { id }, data: { avatarUrl: null } });
    });
    broadcastToGroup(id, "group:update", { groupId: id, name: updated.name, description: updated.description, avatarUrl: null });
    return successResponse({ id: updated.id, avatarUrl: null });
  } catch (error) { console.error("Remove group photo error:", error); return errorResponse("Failed to remove group photo", "PHOTO_REMOVE_ERROR", 500); }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(); if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  const { id } = await params; const group = await findGroup(id); if (!group) return errorResponse("Group not found", "GROUP_NOT_FOUND", 404);
  if (!(await canManage(id, user)).canView) return errorResponse("You don't have permission to view this group photo", "FORBIDDEN", 403);
  const photo = await prisma.groupProfilePhoto.findUnique({ where: { groupId: id }, select: { data: true, mimeType: true, size: true, updatedAt: true } });
  if (!photo) return errorResponse("Group photo not found", "PHOTO_NOT_FOUND", 404);
  return photoResponse(photo, request);
}
