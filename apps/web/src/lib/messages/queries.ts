import { prisma } from "@/lib/db/prisma";
import type { MessageType, UserRole, UserStatus } from "@lms/shared";
import type { ChatMessage } from "@/lib/api/services/message-service";

const PAGE_SIZE = 50;

const MESSAGE_SELECT = {
  id: true,
  content: true,
  type: true,
  groupId: true,
  senderId: true,
  sender: { select: { id: true, name: true, email: true, role: true, avatarUrl: true, status: true } },
  attachmentUrl: true,
  attachmentName: true,
  isPinned: true,
  isEdited: true,
  isDeleted: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function getInitialMessages(
  groupId: string
): Promise<{ messages: ChatMessage[]; hasMore: boolean }> {
  const messages = await prisma.message.findMany({
    where: { groupId, isDeleted: false },
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE,
    select: MESSAGE_SELECT,
  });

  return {
    messages: messages.reverse().map((m: (typeof messages)[number]) => ({
      ...m,
      type: m.type as MessageType,
      sender: { ...m.sender, role: m.sender.role as UserRole, status: m.sender.status as UserStatus },
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
    })),
    hasMore: messages.length === PAGE_SIZE,
  };
}

export async function getGroupHeader(groupId: string) {
  return prisma.group.findUnique({
    where: { id: groupId },
    select: {
      id: true,
      name: true,
      description: true,
      _count: { select: { members: true } },
    },
  });
}
