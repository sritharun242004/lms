import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getGroupAccess } from "@/lib/groups/access";
import { broadcastToGroup } from "@/lib/realtime/broadcast";
import { messageSelect, serializeMessage } from "@/lib/messages/serialize";
import { successResponse, errorResponse, parseBody } from "@/lib/api/response";
import { createPollSchema, MessageType, AuditAction } from "@cms/shared";

/**
 * Create a live poll — a message of type POLL with a question and 2-8
 * options, ready for group members to vote on. Only managers may post,
 * same restriction as a regular text message.
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
    return errorResponse("Only coaches can create polls in this group", "FORBIDDEN", 403);
  }

  const parsed = await parseBody(req, createPollSchema);
  if (parsed.error) return parsed.error;

  const { question, options, chartType } = parsed.data;

  try {
    const messageId = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const message = await tx.message.create({
        data: {
          content: question,
          type: MessageType.POLL,
          groupId,
          senderId: user.id,
        },
      });

      await tx.poll.create({
        data: {
          messageId: message.id,
          question,
          chartType,
          options: {
            create: options.map((text: string, index: number) => ({ text, order: index })),
          },
        },
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
        action: AuditAction.POLL_CREATED,
        entityType: "Message",
        entityId: message.id,
        metadata: { groupId, question },
      },
    });

    broadcastToGroup(groupId, "message:new", message);

    return successResponse(message, undefined, 201);
  } catch (error) {
    console.error("Create poll error:", error);
    return errorResponse("Failed to create poll", "POLL_CREATE_ERROR", 500);
  }
}
