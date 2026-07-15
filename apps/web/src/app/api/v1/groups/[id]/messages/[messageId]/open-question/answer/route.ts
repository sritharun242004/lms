import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getGroupAccess } from "@/lib/groups/access";
import { broadcastToGroup } from "@/lib/realtime/broadcast";
import { successResponse, errorResponse, parseBody } from "@/lib/api/response";
import { submitAnswerSchema } from "@cms/shared";
import type { NextRequest } from "next/server";

/**
 * Submit (or update) a free-text answer. Any group member may answer —
 * including mentees, who otherwise can't post — since the whole point
 * is collecting everyone's response, not just managers'.
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

  const parsed = await parseBody(req, submitAnswerSchema);
  if (parsed.error) return parsed.error;
  const { text } = parsed.data;

  try {
    const message = await prisma.message.findFirst({
      where: { id: messageId, groupId, isDeleted: false },
      select: { openQuestion: { select: { id: true, question: true, isClosed: true } } },
    });

    if (!message?.openQuestion) {
      return errorResponse("Question not found", "OPEN_QUESTION_NOT_FOUND", 404);
    }
    const openQuestion = message.openQuestion;
    if (openQuestion.isClosed) {
      return errorResponse("This question is closed", "OPEN_QUESTION_CLOSED", 400);
    }

    const answer = await prisma.openAnswer.upsert({
      where: { openQuestionId_userId: { openQuestionId: openQuestion.id, userId: user.id } },
      update: { text },
      create: { openQuestionId: openQuestion.id, userId: user.id, text },
    });

    const allAnswers = await prisma.openAnswer.findMany({
      where: { openQuestionId: openQuestion.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, text: true, createdAt: true },
    });

    // Anonymous — the broadcast carries the answer text but never who
    // submitted it, so every viewer's wall gets the identical update.
    broadcastToGroup(groupId, "open-question:answer", {
      messageId,
      openQuestionId: openQuestion.id,
      answer: { id: answer.id, text: answer.text, createdAt: answer.createdAt.toISOString() },
    });

    return successResponse({
      openQuestion: {
        id: openQuestion.id,
        question: openQuestion.question,
        answers: allAnswers.map((a: (typeof allAnswers)[number]) => ({
          id: a.id,
          text: a.text,
          createdAt: a.createdAt.toISOString(),
        })),
        myAnswerId: answer.id,
      },
    });
  } catch (error) {
    console.error("Submit answer error:", error);
    return errorResponse("Failed to submit answer", "ANSWER_SUBMIT_ERROR", 500);
  }
}
