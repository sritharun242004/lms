import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getGroupAccess } from "@/lib/groups/access";
import { broadcastToGroup } from "@/lib/realtime/broadcast";
import { messageSelect, serializeMessage } from "@/lib/messages/serialize";
import { successResponse, errorResponse } from "@/lib/api/response";
import { sendFormToGroup } from "@/lib/forms/invitations";
import { FormError } from "@/lib/forms/form-service";

/**
 * Send a published form into a group chat — a FORM message plus one
 * FormInvitation per current participant member, mirrored off the
 * existing poll-creation route.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);

  const { id: groupId } = await params;
  const access = await getGroupAccess(groupId, user);
  if (!access.canView) return errorResponse("You don't have access to this group", "FORBIDDEN", 403);
  if (!access.canManage) {
    return errorResponse("Only authorized participants can send forms in this group", "FORBIDDEN", 403);
  }

  const body = await req.json();
  const formId = String(body.formId ?? "");

  try {
    const messageId = await sendFormToGroup(user, groupId, formId);
    const created = await prisma.message.findUniqueOrThrow({
      where: { id: messageId },
      select: messageSelect(user.id),
    });
    const message = serializeMessage(created, user.id);
    broadcastToGroup(groupId, "message:new", message);
    return successResponse(message, undefined, 201);
  } catch (error) {
    if (error instanceof FormError) return errorResponse(error.message, error.code, error.status);
    throw error;
  }
}
