import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getGroupAccess } from "@/lib/groups/access";
import { broadcastToGroup } from "@/lib/realtime/broadcast";
import { normalizeWord } from "@/lib/word-cloud/normalize";
import { isStopWord } from "@/lib/word-cloud/stop-words";
import { containsProfanity } from "@/lib/word-cloud/profanity-filter";
import { hueForWord } from "@/lib/word-cloud/color";
import { successResponse, errorResponse, parseBody } from "@/lib/api/response";
import { submitWordSchema } from "@lms/shared";
import type { NextRequest } from "next/server";

/**
 * Submit a word. Any group member may submit — including mentees, who
 * otherwise can't post. Every submission is normalized and merged into
 * a per-word frequency count: the cloud never shows duplicate words,
 * it just grows the matching entry.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  }

  const { id: groupId, messageId } = await params;
  const access = await getGroupAccess(groupId, user);
  if (!access.canView) {
    return errorResponse("You don't have access to this group", "FORBIDDEN", 403);
  }

  const parsed = await parseBody(req, submitWordSchema);
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
            profanityFilter: true,
            isLocked: true,
            submissions: { where: { userId: user.id }, select: { id: true } },
          },
        },
      },
    });

    if (!message?.wordCloud) {
      return errorResponse("Word cloud not found", "WORD_CLOUD_NOT_FOUND", 404);
    }
    const wordCloud = message.wordCloud;

    if (wordCloud.isLocked) {
      return errorResponse("Submissions are locked for this word cloud", "WORD_CLOUD_LOCKED", 400);
    }
    if (wordCloud.submissions.length >= wordCloud.maxWordsPerParticipant) {
      return errorResponse(
        `You've already submitted the maximum of ${wordCloud.maxWordsPerParticipant} word(s)`,
        "WORD_CLOUD_LIMIT_REACHED",
        400
      );
    }

    const normalized = normalizeWord(parsed.data.text);
    if (!normalized) {
      return errorResponse("Enter a word first", "EMPTY_WORD", 400);
    }
    if (normalized.length > wordCloud.maxWordLength) {
      return errorResponse(
        `Keep it under ${wordCloud.maxWordLength} characters`,
        "WORD_TOO_LONG",
        400
      );
    }
    if (isStopWord(normalized)) {
      return errorResponse("Try a more descriptive word", "STOP_WORD", 400);
    }
    if (wordCloud.profanityFilter && containsProfanity(normalized)) {
      return errorResponse("That word isn't allowed here", "PROFANITY_BLOCKED", 400);
    }

    const entry = await prisma.$transaction(async (tx) => {
      const upserted = await tx.wordCloudEntry.upsert({
        where: { wordCloudId_text: { wordCloudId: wordCloud.id, text: normalized } },
        create: {
          wordCloudId: wordCloud.id,
          text: normalized,
          count: 1,
          color: String(hueForWord(normalized)),
        },
        update: { count: { increment: 1 } },
      });

      await tx.wordCloudSubmission.create({
        data: { wordCloudId: wordCloud.id, entryId: upserted.id, userId: user.id },
      });

      return upserted;
    });

    broadcastToGroup(groupId, "word-cloud:update", {
      messageId,
      wordCloudId: wordCloud.id,
      entry: { id: entry.id, text: entry.text, count: entry.count, color: entry.color },
    });

    const [entries, submissions] = await Promise.all([
      prisma.wordCloudEntry.findMany({
        where: { wordCloudId: wordCloud.id },
        orderBy: { firstSeenAt: "asc" },
        select: { id: true, text: true, count: true, color: true },
      }),
      prisma.wordCloudSubmission.findMany({
        where: { wordCloudId: wordCloud.id },
        select: { userId: true },
      }),
    ]);

    return successResponse({
      wordCloud: {
        id: wordCloud.id,
        question: wordCloud.question,
        maxWordsPerParticipant: wordCloud.maxWordsPerParticipant,
        maxWordLength: wordCloud.maxWordLength,
        allowMultipleSubmissions: wordCloud.allowMultipleSubmissions,
        isLocked: wordCloud.isLocked,
        entries,
        totalSubmissions: submissions.length,
        totalParticipants: new Set(submissions.map((s: { userId: string }) => s.userId)).size,
        mySubmissionCount: submissions.filter((s: { userId: string }) => s.userId === user.id)
          .length,
      },
    });
  } catch (error) {
    console.error("Submit word error:", error);
    return errorResponse("Failed to submit word", "WORD_SUBMIT_ERROR", 500);
  }
}
