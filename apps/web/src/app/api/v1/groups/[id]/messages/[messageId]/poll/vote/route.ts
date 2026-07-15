import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getGroupAccess } from "@/lib/groups/access";
import { broadcastToGroup } from "@/lib/realtime/broadcast";
import { successResponse, errorResponse, parseBody } from "@/lib/api/response";
import { castVoteSchema, PollChartType } from "@cms/shared";
import type { NextRequest } from "next/server";

/**
 * Cast (or change) a vote. Any group member may vote — including
 * mentees, who otherwise can't post — since a poll is meant to collect
 * everyone's response, not just managers'.
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

  const parsed = await parseBody(req, castVoteSchema);
  if (parsed.error) return parsed.error;
  const { optionId } = parsed.data;

  try {
    const message = await prisma.message.findFirst({
      where: { id: messageId, groupId, isDeleted: false },
      select: {
        poll: {
          select: {
            id: true,
            question: true,
            chartType: true,
            allowMultiple: true,
            isClosed: true,
            options: { select: { id: true } },
          },
        },
      },
    });

    if (!message?.poll) {
      return errorResponse("Poll not found", "POLL_NOT_FOUND", 404);
    }
    const poll = message.poll;
    if (poll.isClosed) {
      return errorResponse("This poll is closed", "POLL_CLOSED", 400);
    }
    if (!poll.options.some((o: { id: string }) => o.id === optionId)) {
      return errorResponse("That option doesn't belong to this poll", "INVALID_OPTION", 400);
    }

    if (poll.allowMultiple) {
      await prisma.pollVote.upsert({
        where: { optionId_userId: { optionId, userId: user.id } },
        update: {},
        create: { pollId: poll.id, optionId, userId: user.id },
      });
    } else {
      // Single-choice: replace whatever this user previously picked in
      // this poll with their new choice.
      await prisma.$transaction([
        prisma.pollVote.deleteMany({ where: { pollId: poll.id, userId: user.id } }),
        prisma.pollVote.create({ data: { pollId: poll.id, optionId, userId: user.id } }),
      ]);
    }

    const optionsWithCounts = await prisma.pollOption.findMany({
      where: { pollId: poll.id },
      orderBy: { order: "asc" },
      select: { id: true, text: true, _count: { select: { votes: true } } },
    });

    const results = optionsWithCounts.map((o: (typeof optionsWithCounts)[number]) => ({
      id: o.id,
      text: o.text,
      voteCount: o._count.votes,
    }));
    const totalVotes = results.reduce((sum: number, o: { voteCount: number }) => sum + o.voteCount, 0);

    // Counts-only broadcast — never includes "myVote", which is
    // viewer-specific and would be wrong for everyone else's client.
    broadcastToGroup(groupId, "poll:vote", {
      messageId,
      pollId: poll.id,
      options: results.map((o: { id: string; voteCount: number }) => ({
        id: o.id,
        voteCount: o.voteCount,
      })),
      totalVotes,
    });

    return successResponse({
      poll: {
        id: poll.id,
        question: poll.question,
        chartType: poll.chartType as PollChartType,
        allowMultiple: poll.allowMultiple,
        options: results,
        totalVotes,
        myVote: poll.allowMultiple ? null : optionId,
      },
    });
  } catch (error) {
    console.error("Cast vote error:", error);
    return errorResponse("Failed to cast vote", "VOTE_ERROR", 500);
  }
}
