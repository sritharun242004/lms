import { UserRole } from "@cms/shared";

import { prisma } from "./prisma";

export type CanViewGroup = (userId: string, role: string, groupId: string) => Promise<boolean>;

/**
 * Mirrors getGroupAccess().canView in apps/web/src/lib/groups/access.ts:
 * admins see every group, everyone else needs a GroupMember row. Keep the
 * two in step, or a socket can hear a room its owner cannot open.
 */
export const canViewGroup: CanViewGroup = async (userId, role, groupId) => {
  if (role === UserRole.ADMIN) return true;
  const membership = await prisma.groupMember.findUnique({
    where: { userId_groupId: { userId, groupId } },
    select: { id: true },
  });
  return membership !== null;
};
