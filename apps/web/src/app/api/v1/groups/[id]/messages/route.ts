import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getGroupAccess } from "@/lib/groups/access";
import { broadcastToGroup } from "@/lib/realtime/broadcast";
import { successResponse, errorResponse, parseBody } from "@/lib/api/response";
import { sendMessageSchema, AuditAction } from "@lms/shared";

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

const PAGE_SIZE = 50;

/**
 * List a group's messages, newest-first cursor pagination via
 * `?before=<ISO timestamp>`. Returned in chronological (oldest-first)
 * order, ready to render top-to-bottom.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  }

  const { id: groupId } = await params;
  const access = await getGroupAccess(groupId, user);
  if (!access.canView) {
    return errorResponse("You don't have access to this group", "FORBIDDEN", 403);
  }

  const before = req.nextUrl.searchParams.get("before");

  try {
    const messages = await prisma.message.findMany({
      where: {
        groupId,
        isDeleted: false,
        ...(before ? { createdAt: { lt: new Date(before) } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      select: MESSAGE_SELECT,
    });

    return successResponse({
      messages: messages.reverse(),
      hasMore: messages.length === PAGE_SIZE,
    });
  } catch (error) {
    console.error("List messages error:", error);
    return errorResponse("Failed to load messages", "MESSAGES_FETCH_ERROR", 500);
  }
}

/** Send a message. Mentees are read-only — only managers may post. */
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
    return errorResponse("Only mentors can send messages in this group", "FORBIDDEN", 403);
  }

  const parsed = await parseBody(req, sendMessageSchema);
  if (parsed.error) return parsed.error;

  try {
    const message = await prisma.message.create({
      data: {
        content: parsed.data.content,
        type: parsed.data.type,
        attachmentUrl: parsed.data.attachmentUrl,
        attachmentName: parsed.data.attachmentName,
        groupId,
        senderId: user.id,
      },
      select: MESSAGE_SELECT,
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: AuditAction.MESSAGE_SENT,
        entityType: "Message",
        entityId: message.id,
        metadata: { groupId },
      },
    });

    broadcastToGroup(groupId, "message:new", message);

    return successResponse(message, undefined, 201);
  } catch (error) {
    console.error("Send message error:", error);
    return errorResponse("Failed to send message", "MESSAGE_SEND_ERROR", 500);
  }
}
