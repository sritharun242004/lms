import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { broadcastToGroup } from "@/lib/realtime/broadcast";
import { messageSelect, serializeMessage } from "@/lib/messages/serialize";
import { successResponse, errorResponse, parseBody } from "@/lib/api/response";
import { editMessageSchema, AuditAction } from "@cms/shared";

async function loadOwnMessage(groupId: string, messageId: string, userId: string) {
  const message = await prisma.message.findFirst({
    where: { id: messageId, groupId, isDeleted: false },
  });
  if (!message) return { message: null, isOwner: false };
  return { message, isOwner: message.senderId === userId };
}

/** Edit a message. Only the original sender may edit — even admins can't edit others' messages. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  }

  const { id: groupId, messageId } = await params;
  const { message, isOwner } = await loadOwnMessage(groupId, messageId, user.id);
  if (!message) {
    return errorResponse("Message not found", "MESSAGE_NOT_FOUND", 404);
  }
  if (!isOwner) {
    return errorResponse("You can only edit your own messages", "FORBIDDEN", 403);
  }

  const parsed = await parseBody(req, editMessageSchema);
  if (parsed.error) return parsed.error;

  try {
    const historyCount = await prisma.messageHistory.count({ where: { messageId } });

    const [, updatedRaw] = await prisma.$transaction([
      prisma.messageHistory.create({
        data: {
          messageId,
          previousContent: message.content,
          editedById: user.id,
          version: historyCount + 1,
        },
      }),
      prisma.message.update({
        where: { id: messageId },
        data: { content: parsed.data.content, isEdited: true },
        select: messageSelect(user.id),
      }),
    ]);
    const updated = serializeMessage(updatedRaw, user.id);

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: AuditAction.MESSAGE_EDITED,
        entityType: "Message",
        entityId: messageId,
        metadata: { groupId },
      },
    });

    broadcastToGroup(groupId, "message:edit", updated);

    return successResponse(updated);
  } catch (error) {
    console.error("Edit message error:", error);
    return errorResponse("Failed to edit message", "MESSAGE_EDIT_ERROR", 500);
  }
}

/** Soft-delete a message. Only the original sender may delete it. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  }

  const { id: groupId, messageId } = await params;
  const { message, isOwner } = await loadOwnMessage(groupId, messageId, user.id);
  if (!message) {
    return errorResponse("Message not found", "MESSAGE_NOT_FOUND", 404);
  }
  if (!isOwner) {
    return errorResponse("You can only delete your own messages", "FORBIDDEN", 403);
  }

  try {
    await prisma.message.update({
      where: { id: messageId },
      data: { isDeleted: true, deletedAt: new Date(), deletedById: user.id },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: AuditAction.MESSAGE_DELETED,
        entityType: "Message",
        entityId: messageId,
        metadata: { groupId },
      },
    });

    broadcastToGroup(groupId, "message:delete", { messageId, groupId });

    return successResponse({ message: "Message deleted" });
  } catch (error) {
    console.error("Delete message error:", error);
    return errorResponse("Failed to delete message", "MESSAGE_DELETE_ERROR", 500);
  }
}
