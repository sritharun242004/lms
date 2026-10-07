import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getGroupAccess } from "@/lib/groups/access";
import { broadcastToGroup } from "@/lib/realtime/broadcast";
import { messageSelect, serializeMessage } from "@/lib/messages/serialize";
import { successResponse, errorResponse, parseBody } from "@/lib/api/response";
import {
  createScaleSchema,
  MessageType,
  AuditAction,
  SCALE_MIN,
  SCALE_LEFT_LABEL,
  SCALE_RIGHT_LABEL,
} from "@cms/shared";

/**
 * Publish a Scale — ONE message of type SCALE holding every statement.
 * Each statement's range and endpoint labels are written into
 * ScaleStatement rows here, so the live interaction is a snapshot that
 * later repository-template edits can never change.
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
    return errorResponse("Only authorized participants can post scales in this group", "FORBIDDEN", 403);
  }

  const parsed = await parseBody(req, createScaleSchema);
  if (parsed.error) return parsed.error;
  const { statements } = parsed.data;

  try {
    const messageId = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const message = await tx.message.create({
        data: {
          content: statements.map((s) => s.text).join(" / "),
          type: MessageType.SCALE,
          groupId,
          senderId: user.id,
        },
      });

      await tx.scale.create({
        data: {
          messageId: message.id,
          statements: {
            create: statements.map((statement, order) => ({
              text: statement.text,
              order,
              min: SCALE_MIN,
              max: statement.max,
              leftLabel: SCALE_LEFT_LABEL,
              rightLabel: SCALE_RIGHT_LABEL,
            })),
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
        action: AuditAction.SCALE_CREATED,
        entityType: "Message",
        entityId: message.id,
        metadata: { groupId, statementCount: statements.length },
      },
    });

    broadcastToGroup(groupId, "message:new", message);

    return successResponse(message, undefined, 201);
  } catch (error) {
    console.error("Create scale error:", error);
    return errorResponse("Failed to create scale", "SCALE_CREATE_ERROR", 500);
  }
}
