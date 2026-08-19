import type { AuthUser } from "@cms/shared";
import { AuditAction } from "@cms/shared";
import { NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { errorResponse, successResponse } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { canMutateOwnProfilePhoto } from "@/lib/photos/access";
import { buildUserPhotoUrl } from "@/lib/photos/contracts";
import { normalizePhotoUpload, PhotoUploadError } from "@/lib/photos/image";

type FileLike = Pick<File, "size" | "type" | "arrayBuffer">;

function isFileLike(value: FormDataEntryValue | null): value is File {
  return value !== null
    && typeof value !== "string"
    && typeof value.arrayBuffer === "function"
    && typeof value.type === "string"
    && typeof value.size === "number";
}

function uploadErrorResponse(error: unknown) {
  if (error instanceof PhotoUploadError) {
    return errorResponse(error.message, error.code, error.status);
  }
  return errorResponse("The selected file is not a valid photo.", "INVALID_PHOTO", 400);
}

async function parsePhoto(request: NextRequest): Promise<FileLike | Response> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse("A multipart photo upload is required.", "PHOTO_REQUIRED", 400);
  }

  const entries = formData.getAll("photo");
  if (entries.length !== 1 || !isFileLike(entries[0]) || entries[0].size === 0) {
    return errorResponse("Exactly one non-empty photo is required.", "PHOTO_REQUIRED", 400);
  }
  return entries[0];
}

function userWithAvatar(user: AuthUser, avatarUrl: string | null): AuthUser {
  return { ...user, avatarUrl };
}

export async function PUT(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  if (!canMutateOwnProfilePhoto(user)) {
    return errorResponse("You cannot manage a profile photo", "FORBIDDEN", 403);
  }

  const parsed = await parsePhoto(request);
  if (parsed instanceof Response) return parsed;

  let normalized;
  try {
    normalized = await normalizePhotoUpload(parsed as File);
  } catch (error) {
    return uploadErrorResponse(error);
  }

  const version = Date.now();
  const avatarUrl = buildUserPhotoUrl(user.id, version);

  try {
    const operation = await prisma.$transaction(async (tx) => {
      const existing = await tx.userProfilePhoto.findUnique({
        where: { userId: user.id },
        select: { id: true },
      });

      await tx.userProfilePhoto.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          mimeType: normalized.mimeType,
          size: normalized.size,
          width: normalized.width,
          height: normalized.height,
          data: normalized.data as unknown as Uint8Array<ArrayBuffer>,
        },
        update: {
          mimeType: normalized.mimeType,
          size: normalized.size,
          width: normalized.width,
          height: normalized.height,
          data: normalized.data as unknown as Uint8Array<ArrayBuffer>,
        },
      });

      await tx.user.update({
        where: { id: user.id },
        data: { avatarUrl },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: AuditAction.AVATAR_UPDATED,
          entityType: "User",
          entityId: user.id,
          metadata: {
            operation: existing ? "replace" : "add",
            mimeType: normalized.mimeType,
            size: normalized.size,
            width: normalized.width,
            height: normalized.height,
          },
        },
      });

      return { avatarUrl };
    });

    return successResponse({ user: userWithAvatar(user, operation.avatarUrl) });
  } catch (error) {
    console.error("Update profile photo error:", error);
    return errorResponse("Failed to update profile photo", "PHOTO_UPDATE_ERROR", 500);
  }
}

export async function DELETE(_request?: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  if (!canMutateOwnProfilePhoto(user)) {
    return errorResponse("You cannot manage a profile photo", "FORBIDDEN", 403);
  }

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.userProfilePhoto.findUnique({
        where: { userId: user.id },
        select: { id: true },
      });

      if (existing) {
        await tx.userProfilePhoto.delete({ where: { userId: user.id } });
        await tx.auditLog.create({
          data: {
            userId: user.id,
            action: AuditAction.AVATAR_REMOVED,
            entityType: "User",
            entityId: user.id,
            metadata: { operation: "remove" },
          },
        });
      }

      await tx.user.update({
        where: { id: user.id },
        data: { avatarUrl: null },
      });
    });

    return successResponse({ user: userWithAvatar(user, null) });
  } catch (error) {
    console.error("Remove profile photo error:", error);
    return errorResponse("Failed to remove profile photo", "PHOTO_REMOVE_ERROR", 500);
  }
}
