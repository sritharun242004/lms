import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { generateInviteCode } from "@/lib/utils";
import { successResponse, errorResponse } from "@/lib/api/response";
import { AuditAction } from "@cms/shared";

async function assertManageable(groupId: string, userId: string, isAdmin: boolean) {
  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group) return { ok: false as const, response: errorResponse("Group not found", "GROUP_NOT_FOUND", 404) };
  if (!isAdmin && group.createdById !== userId) {
    return {
      ok: false as const,
      response: errorResponse("You don't have permission to manage this group", "FORBIDDEN", 403),
    };
  }
  return { ok: true as const, group };
}

/** Regenerate the group's invite code — deactivates any existing active code and mints a new one. */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  }

  const { id: groupId } = await params;
  const check = await assertManageable(groupId, user.id, user.role === "ADMIN");
  if (!check.ok) return check.response;

  try {
    let code = generateInviteCode();
    for (let attempt = 0; attempt < 5; attempt++) {
      const existing = await prisma.inviteCode.findUnique({ where: { code } });
      if (!existing) break;
      code = generateInviteCode();
    }

    await prisma.inviteCode.updateMany({
      where: { groupId, isActive: true },
      data: { isActive: false },
    });

    const inviteCode = await prisma.inviteCode.create({
      data: { code, groupId, createdById: user.id },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: AuditAction.INVITE_GENERATED,
        entityType: "Group",
        entityId: groupId,
        metadata: { code },
      },
    });

    return successResponse({
      id: inviteCode.id,
      code: inviteCode.code,
      isActive: inviteCode.isActive,
      usageCount: inviteCode.usageCount,
    });
  } catch (error) {
    console.error("Regenerate invite code error:", error);
    return errorResponse("Failed to regenerate invite code", "INVITE_REGENERATE_ERROR", 500);
  }
}

/** Disable the group's currently active invite code, blocking new joins. */
export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  }

  const { id: groupId } = await params;
  const check = await assertManageable(groupId, user.id, user.role === "ADMIN");
  if (!check.ok) return check.response;

  try {
    await prisma.inviteCode.updateMany({
      where: { groupId, isActive: true },
      data: { isActive: false },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: AuditAction.INVITE_DISABLED,
        entityType: "Group",
        entityId: groupId,
      },
    });

    return successResponse({ message: "Invite code disabled" });
  } catch (error) {
    console.error("Disable invite code error:", error);
    return errorResponse("Failed to disable invite code", "INVITE_DISABLE_ERROR", 500);
  }
}
