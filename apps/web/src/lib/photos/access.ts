import type { AuthUser } from "@cms/shared";

import { prisma } from "@/lib/db/prisma";

export const canMutateOwnProfilePhoto = (user: AuthUser): boolean =>
  user.role === "ADMIN" || user.role === "MENTOR";

export async function canViewUserPhoto(viewer: AuthUser, targetId: string): Promise<boolean> {
  if (viewer.id === targetId || viewer.role === "ADMIN") {
    return true;
  }

  const sharedGroupCount = await prisma.groupMember.count({
    where: {
      userId: viewer.id,
      group: { members: { some: { userId: targetId } } },
    },
  });

  return sharedGroupCount > 0;
}
