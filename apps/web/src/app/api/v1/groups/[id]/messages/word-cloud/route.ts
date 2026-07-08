import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getGroupAccess } from "@/lib/groups/access";
import { broadcastToGroup } from "@/lib/realtime/broadcast";
import { messageSelect, serializeMessage } from "@/lib/messages/serialize";
import { successResponse, errorResponse, parseBody } from "@/lib/api/response";
import { createWordCloudSchema, MessageType, AuditAction } from "@lms/shared";

/**
 * Create a word cloud — a message of type WORD_CLOUD. Every group
 * member (mentees included) can submit a word once it's posted; only
 * managers may post the question itself.
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
    return errorResponse("Only mentors can create a word cloud in this group", "FORBIDDEN", 403);
  }

  const parsed = await parseBody(req, createWordCloudSchema);
  if (parsed.error) return parsed.error;
  const {
    question,
    maxWordsPerParticipant,
    maxWordLength,
    allowMultipleSubmissions,
    profanityFilter,
  } = parsed.data;

  try {
    const messageId = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const message = await tx.message.create({
        data: {
          content: question,
          type: MessageType.WORD_CLOUD,
          groupId,
          senderId: user.id,
        },
      });

      await tx.wordCloud.create({
        data: {
          messageId: message.id,
          question,
          // A single-submission cloud has nothing to "allow multiple" —
          // keep the effective cap at 1 regardless of the number field.
          maxWordsPerParticipant: allowMultipleSubmissions ? maxWordsPerParticipant : 1,
          maxWordLength,
          allowMultipleSubmissions,
          profanityFilter,
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
        action: AuditAction.WORD_CLOUD_CREATED,
        entityType: "Message",
        entityId: message.id,
        metadata: { groupId, question },
      },
    });

    broadcastToGroup(groupId, "message:new", message);

    return successResponse(message, undefined, 201);
  } catch (error) {
    console.error("Create word cloud error:", error);
    return errorResponse("Failed to create word cloud", "WORD_CLOUD_CREATE_ERROR", 500);
  }
}
