import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getGroupAccess } from "@/lib/groups/access";
import { messageSelect, serializeMessage } from "@/lib/messages/serialize";
import { validateScaleResponses } from "@/lib/cms/scale";
import { successResponse, errorResponse, parseBody } from "@/lib/api/response";
import { submitScaleSchema } from "@cms/shared";
import type { NextRequest } from "next/server";

/**
 * Save (or update) a participant's value for one or more statements of a
 * published Scale. Every value is re-validated here against the snapshot
 * range stored on the statement — the slider's limits are not trusted.
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

  const parsed = await parseBody(req, submitScaleSchema);
  if (parsed.error) return parsed.error;
  const { responses } = parsed.data;

  try {
    const message = await prisma.message.findFirst({
      where: { id: messageId, groupId, isDeleted: false },
      select: {
        scale: {
          select: {
            id: true,
            isClosed: true,
            statements: { select: { id: true, min: true, max: true } },
          },
        },
      },
    });

    if (!message?.scale) {
      return errorResponse("Scale not found", "SCALE_NOT_FOUND", 404);
    }
    if (message.scale.isClosed) {
      return errorResponse("This scale is closed", "SCALE_CLOSED", 400);
    }

    const check = validateScaleResponses(message.scale.statements, responses);
    if (!check.ok) {
      return errorResponse(check.message, "SCALE_INVALID_RESPONSE", 400);
    }

    await prisma.$transaction(
      responses.map((response) =>
        prisma.scaleResponse.upsert({
          where: { statementId_userId: { statementId: response.statementId, userId: user.id } },
          update: { value: response.value },
          create: { statementId: response.statementId, userId: user.id, value: response.value },
        })
      )
    );

    const fresh = await prisma.message.findUniqueOrThrow({
      where: { id: messageId },
      select: messageSelect(user.id, access.canManage),
    });
    const serialized = serializeMessage(fresh, user.id, access.canManage);

    return successResponse({ scale: serialized.scale! });
  } catch (error) {
    console.error("Submit scale error:", error);
    return errorResponse("Failed to submit scale", "SCALE_SUBMIT_ERROR", 500);
  }
}
