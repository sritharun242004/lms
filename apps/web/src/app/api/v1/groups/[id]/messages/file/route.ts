import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getGroupAccess } from "@/lib/groups/access";
import { broadcastToGroup } from "@/lib/realtime/broadcast";
import { messageSelect, serializeMessage } from "@/lib/messages/serialize";
import { successResponse, errorResponse } from "@/lib/api/response";
import {
  MessageType,
  AuditAction,
  MAX_ATTACHMENT_SIZE_BYTES,
  MAX_ATTACHMENT_SIZE_MB,
  MAX_MESSAGE_LENGTH,
} from "@cms/shared";

/**
 * Upload a file attachment as a message — any file type is accepted (the
 * mentee-facing message bubble decides how to render it from `mimeType`),
 * capped at MAX_ATTACHMENT_SIZE_BYTES. Bytes are stored in Postgres via
 * MessageAttachment rather than an external object store.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  }

  const { id: groupId } = await params;
  const access = await getGroupAccess(groupId, user);
  if (!access.canView) {
    return errorResponse("You don't have access to this group", "FORBIDDEN", 403);
  }
  if (!access.canManage) {
    return errorResponse("Only mentors can send messages in this group", "FORBIDDEN", 403);
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return errorResponse("Invalid upload", "PARSE_ERROR", 400);
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return errorResponse("A file is required", "VALIDATION_ERROR", 400);
  }
  if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    return errorResponse(
      `File is too large. Max size is ${MAX_ATTACHMENT_SIZE_MB}MB.`,
      "FILE_TOO_LARGE",
      413
    );
  }

  const rawContent = formData.get("content");
  const content = (typeof rawContent === "string" ? rawContent : "")
    .trim()
    .slice(0, MAX_MESSAGE_LENGTH);

  try {
    const buffer = Buffer.from(await file.arrayBuffer());

    const messageId = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const message = await tx.message.create({
        data: {
          content,
          type: MessageType.FILE,
          groupId,
          senderId: user.id,
        },
      });

      await tx.messageAttachment.create({
        data: {
          messageId: message.id,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
          data: buffer,
        },
      });

      await tx.message.update({
        where: { id: message.id },
        data: {
          attachmentUrl: `/api/v1/groups/${groupId}/messages/${message.id}/attachment`,
          attachmentName: file.name,
        },
      });

      return message.id;
    }, { timeout: 30_000 });

    const created = await prisma.message.findUniqueOrThrow({
      where: { id: messageId },
      select: messageSelect(user.id),
    });
    const message = serializeMessage(created, user.id);

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: AuditAction.MESSAGE_SENT,
        entityType: "Message",
        entityId: message.id,
        metadata: { groupId, fileName: file.name },
      },
    });

    broadcastToGroup(groupId, "message:new", message);

    return successResponse(message, undefined, 201);
  } catch (error) {
    console.error("Upload file error:", error);
    return errorResponse("Failed to upload file", "FILE_UPLOAD_ERROR", 500);
  }
}
