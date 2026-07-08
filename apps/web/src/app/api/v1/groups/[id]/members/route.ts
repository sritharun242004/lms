import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getGroupAccess } from "@/lib/groups/access";
import { successResponse, errorResponse } from "@/lib/api/response";

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
    return errorResponse("Group not found", "GROUP_NOT_FOUND", 404);
  }
  if (!access.canManage) {
    return errorResponse(
      "You don't have permission to view this group's members",
      "FORBIDDEN",
      403
    );
  }

  const members = await prisma.groupMember.findMany({
    where: { groupId: id },
    orderBy: { joinedAt: "desc" },
    select: {
      id: true,
      role: true,
      joinedAt: true,
      user: {
        select: { id: true, name: true, email: true, avatarUrl: true },
      },
    },
  });

  return successResponse({
    members: members.map((m: (typeof members)[number]) => ({
      id: m.id,
      role: m.role,
      joinedAt: m.joinedAt.toISOString(),
      user: m.user,
    })),
  });
}
