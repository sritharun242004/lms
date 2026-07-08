import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getGroupAccess } from "@/lib/groups/access";
import { broadcastToGroup } from "@/lib/realtime/broadcast";
import { messageSelect, serializeMessage } from "@/lib/messages/serialize";
import { successResponse, errorResponse, parseBody } from "@/lib/api/response";
import { createOpenQuestionSchema, MessageType, AuditAction } from "@lms/shared";

/**
 * Post an open-ended question — a message of type OPEN_QUESTION.
 * Unlike a poll, there are no predefined options: every group member
 * (mentees included) can submit a free-text answer that stacks onto a
 * shared, anonymous wall. Only managers may post the question itself.
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
    return errorResponse("Only mentors can ask questions in this group", "FORBIDDEN", 403);
  }

  const parsed = await parseBody(req, createOpenQuestionSchema);
  if (parsed.error) return parsed.error;
  const { question } = parsed.data;

  try {
    const messageId = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const message = await tx.message.create({
        data: {
          content: question,
          type: MessageType.OPEN_QUESTION,
          groupId,
          senderId: user.id,
        },
      });

      await tx.openQuestion.create({
        data: { messageId: message.id, question },
      });

      return message.id;
    });

    const created = await prisma.message.findUniqueOrThrow({
      where: { id: messageId },
      select: messageSelect(user.id),
    });
    const message = serializeMessage(created, user.id);

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: AuditAction.OPEN_QUESTION_CREATED,
        entityType: "Message",
        entityId: message.id,
        metadata: { groupId, question },
      },
    });

    broadcastToGroup(groupId, "message:new", message);

    return successResponse(message, undefined, 201);
  } catch (error) {
    console.error("Create open question error:", error);
    return errorResponse("Failed to create question", "OPEN_QUESTION_CREATE_ERROR", 500);
  }
}
