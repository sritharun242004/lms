import type { MessageType, UserRole, UserStatus, PollChartType } from "@cms/shared";
import type { ChatMessage } from "@/lib/api/services/message-service";

/**
 * Prisma `select` for a message, including its poll (if any) scoped to
 * `viewerId` — `votes` only pulls the viewer's own row, so `myVote` in
 * `serializeMessage` reflects what *this* caller picked, never anyone
 * else's. Never broadcast the result of this select directly; the
 * `poll:vote` socket event carries counts only for exactly this reason.
 */
export function messageSelect(viewerId: string) {
  return {
    id: true,
    content: true,
    type: true,
    groupId: true,
    senderId: true,
    sender: {
      select: { id: true, name: true, email: true, role: true, avatarUrl: true, status: true },
    },
    attachmentUrl: true,
    attachmentName: true,
    attachment: {
      select: { mimeType: true, size: true },
    },
    isPinned: true,
    isEdited: true,
    isDeleted: true,
    createdAt: true,
    updatedAt: true,
    poll: {
      select: {
        id: true,
        question: true,
        chartType: true,
        allowMultiple: true,
        options: {
          select: { id: true, text: true, order: true, _count: { select: { votes: true } } },
          orderBy: { order: "asc" },
        },
        votes: { where: { userId: viewerId }, select: { optionId: true } },
      },
    },
    openQuestion: {
      select: {
        id: true,
        question: true,
        // `userId` stays server-side only — serializeMessage strips it
        // before this ever reaches a client, keeping the wall anonymous.
        answers: {
          select: { id: true, text: true, userId: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        },
      },
    },
    wordCloud: {
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
        // Unfiltered — total submissions/participants and "my" count are
        // all derived from this one array in serializeMessage.
        submissions: { select: { userId: true } },
      },
    },
  } as const;
}

interface RawMessage {
  id: string;
  content: string;
  type: string;
  groupId: string;
  senderId: string;
  sender: {
    id: string;
    name: string;
    email: string | null;
    role: string;
    avatarUrl: string | null;
    status: string;
  };
  attachmentUrl: string | null;
  attachmentName: string | null;
  attachment: { mimeType: string; size: number } | null;
  isPinned: boolean;
  isEdited: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
  poll: {
    id: string;
    question: string;
    chartType: string;
    allowMultiple: boolean;
    options: { id: string; text: string; order: number; _count: { votes: number } }[];
    votes: { optionId: string }[];
  } | null;
  openQuestion: {
    id: string;
    question: string;
    answers: { id: string; text: string; userId: string; createdAt: Date }[];
  } | null;
  wordCloud: {
    id: string;
    question: string;
    maxWordsPerParticipant: number;
    maxWordLength: number;
    allowMultipleSubmissions: boolean;
    isLocked: boolean;
    entries: { id: string; text: string; count: number; color: string }[];
    submissions: { userId: string }[];
  } | null;
}

export function serializeMessage<T extends RawMessage>(m: T, viewerId: string): ChatMessage {
  const poll = m.poll
    ? {
        id: m.poll.id,
        question: m.poll.question,
        chartType: m.poll.chartType as PollChartType,
        allowMultiple: m.poll.allowMultiple,
        options: m.poll.options.map((o) => ({
          id: o.id,
          text: o.text,
          voteCount: o._count.votes,
        })),
        totalVotes: m.poll.options.reduce((sum, o) => sum + o._count.votes, 0),
        myVote: m.poll.votes[0]?.optionId ?? null,
      }
    : null;

  const openQuestion = m.openQuestion
    ? {
        id: m.openQuestion.id,
        question: m.openQuestion.question,
        answers: m.openQuestion.answers.map((a) => ({
          id: a.id,
          text: a.text,
          createdAt: a.createdAt.toISOString(),
        })),
        myAnswerId: m.openQuestion.answers.find((a) => a.userId === viewerId)?.id ?? null,
      }
    : null;

  const wordCloud = m.wordCloud
    ? {
        id: m.wordCloud.id,
        question: m.wordCloud.question,
        maxWordsPerParticipant: m.wordCloud.maxWordsPerParticipant,
        maxWordLength: m.wordCloud.maxWordLength,
        allowMultipleSubmissions: m.wordCloud.allowMultipleSubmissions,
        isLocked: m.wordCloud.isLocked,
        entries: m.wordCloud.entries.map((e) => ({
          id: e.id,
          text: e.text,
          count: e.count,
          color: e.color,
        })),
        totalSubmissions: m.wordCloud.submissions.length,
        totalParticipants: new Set(m.wordCloud.submissions.map((s) => s.userId)).size,
        mySubmissionCount: m.wordCloud.submissions.filter((s) => s.userId === viewerId).length,
      }
    : null;

  return {
    id: m.id,
    content: m.content,
    type: m.type as MessageType,
    groupId: m.groupId,
    senderId: m.senderId,
    sender: {
      id: m.sender.id,
      name: m.sender.name,
      email: m.sender.email,
      role: m.sender.role as UserRole,
      avatarUrl: m.sender.avatarUrl,
      status: m.sender.status as UserStatus,
    },
    attachmentUrl: m.attachmentUrl,
    attachmentName: m.attachmentName,
    attachment: m.attachment,
    isPinned: m.isPinned,
    isEdited: m.isEdited,
    isDeleted: m.isDeleted,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
    poll,
    openQuestion,
    wordCloud,
  };
}
