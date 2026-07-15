import { prisma } from "@/lib/db/prisma";
import type { AuthUser } from "@cms/shared";

export interface GroupAccess {
  canView: boolean;
  /** Mentor/admin who can post, pin, and manage the group. */
  canManage: boolean;
}

/**
 * Resolves what a user may do in a group: admins see and manage
 * everything; everyone else needs an actual GroupMember row, and
 * only mentors/owners within that membership can post or manage.
 */
export async function getGroupAccess(groupId: string, user: AuthUser): Promise<GroupAccess> {
  if (user.role === "ADMIN") {
    return { canView: true, canManage: true };
  }

  const membership = await prisma.groupMember.findUnique({
    where: { userId_groupId: { userId: user.id, groupId } },
    select: { role: true },
  });

  if (!membership) {
    return { canView: false, canManage: false };
  }

  const canManage = membership.role === "OWNER" || membership.role === "MENTOR";
  return { canView: true, canManage };
}
