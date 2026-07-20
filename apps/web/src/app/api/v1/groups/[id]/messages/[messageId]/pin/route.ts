import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getGroupAccess } from "@/lib/groups/access";
import { broadcastToGroup } from "@/lib/realtime/broadcast";
import { successResponse, errorResponse } from "@/lib/api/response";
import { AuditAction } from "@cms/shared";

/** Toggle a message's pinned state. Any manager (mentor/admin) may pin any message in their group. */
export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ id: string; messageId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  }

  const { id: groupId, messageId } = await params;
  const access = await getGroupAccess(groupId, user);
  if (!access.canManage) {
    return errorResponse("Only coaches can pin messages", "FORBIDDEN", 403);
  }

  const message = await prisma.message.findFirst({
    where: { id: messageId, groupId, isDeleted: false },
  });
  if (!message) {
    return errorResponse("Message not found", "MESSAGE_NOT_FOUND", 404);
  }

  try {
    const updated = await prisma.message.update({
      where: { id: messageId },
      data: { isPinned: !message.isPinned },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: updated.isPinned ? AuditAction.MESSAGE_PINNED : AuditAction.MESSAGE_UNPINNED,
        entityType: "Message",
        entityId: messageId,
        metadata: { groupId },
      },
    });

    broadcastToGroup(groupId, "message:pin", {
      messageId,
      groupId,
      isPinned: updated.isPinned,
    });

    return successResponse({ id: updated.id, isPinned: updated.isPinned });
  } catch (error) {
    console.error("Pin message error:", error);
    return errorResponse("Failed to update pin state", "MESSAGE_PIN_ERROR", 500);
  }
}
