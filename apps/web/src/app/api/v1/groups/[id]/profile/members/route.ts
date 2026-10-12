import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getGroupAccess } from "@/lib/groups/access";
import { clampLimit, memberRoleLabel } from "@/lib/groups/profile";
import { successResponse, errorResponse } from "@/lib/api/response";

/**
 * Paginated member roster for the group profile. Unlike the staff-only
 * /members endpoint this is readable by every member, so it deliberately
 * returns only what a roster needs: name, avatar, role and join date - no
 * email addresses or other contact details.
 *
 * Ordering is admins first (OWNER, then MENTOR, then participants - the enum's
 * declared order), then by name, with the row id as a stable tie-break so
 * cursor pages never skip or repeat a person.
 */
export async function GET(
  req: NextRequest,
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

  const limit = clampLimit(req.nextUrl.searchParams.get("limit"), 30, 100);
  const cursor = req.nextUrl.searchParams.get("cursor");

  const rows = await prisma.groupMember.findMany({
    where: { groupId: id },
    orderBy: [{ role: "asc" }, { user: { name: "asc" } }, { id: "asc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      role: true,
      joinedAt: true,
      user: { select: { id: true, name: true, avatarUrl: true } },
    },
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  // One entry per person, even if the underlying rows ever repeat a user.
  const seen = new Set<string>();
  const members = page
    .filter((row: (typeof page)[number]) => {
      if (seen.has(row.user.id)) return false;
      seen.add(row.user.id);
      return true;
    })
    .map((row: (typeof page)[number]) => ({
      id: row.id,
      userId: row.user.id,
      name: row.user.name,
      avatarUrl: row.user.avatarUrl,
      role: memberRoleLabel(row.role),
      joinedAt: row.joinedAt.toISOString(),
    }));

  return successResponse({
    members,
    nextCursor: hasMore ? page[page.length - 1].id : null,
  });
}
