import { prisma } from "@/lib/db/prisma";
import type { GroupCard } from "@/lib/api/services/group-service";

/** Mentor/admin view: groups they created (or, for admins, every group), with invite codes. */
export async function getManagedGroups(opts: { userId?: string } = {}): Promise<GroupCard[]> {
  const groups = await prisma.group.findMany({
    where: opts.userId ? { createdById: opts.userId } : {},
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      wallpaperUrl: true,
      createdAt: true,
      createdBy: { select: { name: true } },
      _count: { select: { members: true } },
      inviteCodes: {
        where: { isActive: true },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, code: true, isActive: true, usageCount: true },
      },
    },
  });

  return groups.map((g: (typeof groups)[number]) => ({
    id: g.id,
    name: g.name,
    description: g.description,
    wallpaperUrl: g.wallpaperUrl,
    createdAt: g.createdAt.toISOString(),
    mentorName: g.createdBy.name,
    memberCount: g._count.members,
    inviteCode: g.inviteCodes[0] ?? null,
    canManage: true,
  }));
}

/** The active invite code for a single group — mentor-only, never fetched for a mentee viewer. */
export async function getActiveInviteCode(
  groupId: string
): Promise<{ code: string; isActive: boolean } | null> {
  const invite = await prisma.inviteCode.findFirst({
    where: { groupId, isActive: true },
    orderBy: { createdAt: "desc" },
    select: { code: true, isActive: true },
  });
  return invite;
}

/** Mentee view: how many groups they've joined — used to decide whether the group-switcher UI is needed at all. */
export async function getJoinedGroupCount(menteeId: string): Promise<number> {
  return prisma.groupMember.count({ where: { userId: menteeId } });
}

/** Mentee view: groups they've joined — no invite code, no manage actions. */
export async function getJoinedGroups(menteeId: string): Promise<GroupCard[]> {
  const memberships = await prisma.groupMember.findMany({
    where: { userId: menteeId },
    orderBy: { joinedAt: "desc" },
    select: {
      group: {
        select: {
          id: true,
          name: true,
          description: true,
          wallpaperUrl: true,
          createdAt: true,
          createdBy: { select: { name: true } },
          _count: { select: { members: true } },
        },
      },
    },
  });

  return memberships.map((m: (typeof memberships)[number]) => ({
    id: m.group.id,
    name: m.group.name,
    description: m.group.description,
    wallpaperUrl: m.group.wallpaperUrl,
    createdAt: m.group.createdAt.toISOString(),
    mentorName: m.group.createdBy.name,
    memberCount: m.group._count.members,
    inviteCode: null,
    canManage: false,
  }));
}
