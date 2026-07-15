import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { successResponse, errorResponse, parseBody } from "@/lib/api/response";
import { updateGroupSchema, AuditAction } from "@cms/shared";

async function getManageableGroup(groupId: string, userId: string, isAdmin: boolean) {
  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group) return { group: null, allowed: false };
  return { group, allowed: isAdmin || group.createdById === userId };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  }

  const { id } = await params;
  const { group, allowed } = await getManageableGroup(id, user.id, user.role === "ADMIN");
  if (!group) {
    return errorResponse("Group not found", "GROUP_NOT_FOUND", 404);
  }
  if (!allowed) {
    return errorResponse("You don't have permission to edit this group", "FORBIDDEN", 403);
  }

  const parsed = await parseBody(req, updateGroupSchema);
  if (parsed.error) return parsed.error;

  try {
    const updated = await prisma.group.update({
      where: { id },
      data: parsed.data,
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: AuditAction.GROUP_UPDATED,
        entityType: "Group",
        entityId: id,
        metadata: parsed.data,
      },
    });

    return successResponse({
      id: updated.id,
      name: updated.name,
      description: updated.description,
    });
  } catch (error) {
    console.error("Update group error:", error);
    return errorResponse("Failed to update group", "GROUP_UPDATE_ERROR", 500);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  }

  const { id } = await params;
  const { group, allowed } = await getManageableGroup(id, user.id, user.role === "ADMIN");
  if (!group) {
    return errorResponse("Group not found", "GROUP_NOT_FOUND", 404);
  }
  if (!allowed) {
    return errorResponse("You don't have permission to delete this group", "FORBIDDEN", 403);
  }

  try {
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: AuditAction.GROUP_DELETED,
        entityType: "Group",
        entityId: id,
        metadata: { name: group.name },
      },
    });

    // Cascades to members, messages, message history, and invite codes.
    await prisma.group.delete({ where: { id } });

    return successResponse({ message: "Group deleted" });
  } catch (error) {
    console.error("Delete group error:", error);
    return errorResponse("Failed to delete group", "GROUP_DELETE_ERROR", 500);
  }
}
