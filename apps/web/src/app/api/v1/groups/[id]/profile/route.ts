import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { canEditGroupProfile, getGroupAccess } from "@/lib/groups/access";
import { successResponse, errorResponse } from "@/lib/api/response";

/**
 * Group profile header: identity, member count and whether THIS caller may edit
 * it. Any member can read it; the edit flag is computed here from the database
 * so the UI never has to guess (and never needs a client-supplied role).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  }

  const { id } = await params;
  const access = await getGroupAccess(id, user);
  if (!access.canView) {
    // Same answer for "missing" and "not yours": never confirm a group exists.
    return errorResponse("Group not found", "GROUP_NOT_FOUND", 404);
  }

  const group = await prisma.group.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      description: true,
      avatarUrl: true,
      createdAt: true,
      createdById: true,
      _count: { select: { members: true } },
    },
  });
  if (!group) {
    return errorResponse("Group not found", "GROUP_NOT_FOUND", 404);
  }

  return successResponse({
    id: group.id,
    name: group.name,
    description: group.description,
    avatarUrl: group.avatarUrl,
    createdAt: group.createdAt.toISOString(),
    memberCount: group._count.members,
    canEdit: canEditGroupProfile(group, user, access),
  });
}
