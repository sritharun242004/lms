import { prisma } from "@/lib/db/prisma";
import { messageSelect, serializeMessage } from "@/lib/messages/serialize";
import type { ChatMessage } from "@/lib/api/services/message-service";

const PAGE_SIZE = 50;

export async function getInitialMessages(
  groupId: string,
  viewerId: string
): Promise<{ messages: ChatMessage[]; hasMore: boolean }> {
  const messages = await prisma.message.findMany({
    where: { groupId, isDeleted: false },
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE,
    select: messageSelect(viewerId),
  });

  return {
    messages: messages
      .reverse()
      .map((m: (typeof messages)[number]) => serializeMessage(m, viewerId)),
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
