import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getGroupAccess } from "@/lib/groups/access";
import { broadcastToGroup } from "@/lib/realtime/broadcast";
import { successResponse, errorResponse, parseBody } from "@/lib/api/response";
import { wordCloudControlSchema, AuditAction } from "@cms/shared";
import type { NextRequest } from "next/server";

/** Presenter controls: reset the cloud, or lock/unlock further submissions. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  }

  const { id: groupId, messageId } = await params;
  const access = await getGroupAccess(groupId, user);
  if (!access.canManage) {
    return errorResponse("Only mentors can manage this word cloud", "FORBIDDEN", 403);
  }

  const parsed = await parseBody(req, wordCloudControlSchema);
  if (parsed.error) return parsed.error;

  try {
    const message = await prisma.message.findFirst({
      where: { id: messageId, groupId, isDeleted: false },
      select: {
        wordCloud: {
          select: {
            id: true,
            question: true,
            maxWordsPerParticipant: true,
            maxWordLength: true,
            allowMultipleSubmissions: true,
          },
        },
      },
    });
    if (!message?.wordCloud) {
      return errorResponse("Word cloud not found", "WORD_CLOUD_NOT_FOUND", 404);
    }
    const wordCloudId = message.wordCloud.id;

    if (parsed.data.action === "reset") {
      // Cascades to word_cloud_submissions.
      await prisma.wordCloudEntry.deleteMany({ where: { wordCloudId } });

      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: AuditAction.WORD_CLOUD_RESET,
          entityType: "Message",
          entityId: messageId,
          metadata: { groupId },
        },
      });

      broadcastToGroup(groupId, "word-cloud:reset", { messageId, wordCloudId });

      return successResponse({
        wordCloud: {
          id: wordCloudId,
          question: message.wordCloud.question,
          maxWordsPerParticipant: message.wordCloud.maxWordsPerParticipant,
          maxWordLength: message.wordCloud.maxWordLength,
          allowMultipleSubmissions: message.wordCloud.allowMultipleSubmissions,
          isLocked: false,
          entries: [],
          totalSubmissions: 0,
          totalParticipants: 0,
          mySubmissionCount: 0,
        },
      });
    }

    const isLocked = parsed.data.action === "lock";
    const updated = await prisma.wordCloud.update({
      where: { id: wordCloudId },
      data: { isLocked },
      select: {
        id: true,
        question: true,
        maxWordsPerParticipant: true,
        maxWordLength: true,
        allowMultipleSubmissions: true,
        isLocked: true,
        entries: {
          select: { id: true, text: true, count: true, color: true },
          orderBy: { firstSeenAt: "asc" },
        },
        submissions: { select: { userId: true } },
      },
    });

    broadcastToGroup(groupId, "word-cloud:lock", { messageId, wordCloudId, isLocked });

    return successResponse({
      wordCloud: {
        id: updated.id,
        question: updated.question,
        maxWordsPerParticipant: updated.maxWordsPerParticipant,
        maxWordLength: updated.maxWordLength,
        allowMultipleSubmissions: updated.allowMultipleSubmissions,
        isLocked: updated.isLocked,
        entries: updated.entries,
        totalSubmissions: updated.submissions.length,
        totalParticipants: new Set(updated.submissions.map((s: { userId: string }) => s.userId))
          .size,
        mySubmissionCount: updated.submissions.filter(
          (s: { userId: string }) => s.userId === user.id
        ).length,
      },
    });
  } catch (error) {
    console.error("Word cloud control error:", error);
    return errorResponse("Failed to update word cloud", "WORD_CLOUD_CONTROL_ERROR", 500);
  }
}
