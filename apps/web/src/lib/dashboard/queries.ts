import { prisma } from "@/lib/db/prisma";
import type { AdminDashboardStats, MentorDashboardStats, MenteeDashboardStats } from "@lms/shared";

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function getAdminDashboardStats(): Promise<
  Pick<AdminDashboardStats, "totalGroups" | "totalMentors" | "totalStudents" | "totalMessages">
> {
  const [totalGroups, totalMentors, totalStudents, totalMessages] = await Promise.all([
    prisma.group.count(),
    prisma.user.count({ where: { role: { in: ["ADMIN", "MENTOR"] } } }),
    prisma.user.count({ where: { role: "MENTEE" } }),
    prisma.message.count({ where: { isDeleted: false } }),
  ]);

  return { totalGroups, totalMentors, totalStudents, totalMessages };
}

export async function getMentorDashboardStats(
  mentorId: string
): Promise<
  Pick<MentorDashboardStats, "myGroups" | "totalStudents" | "messagesToday" | "pinnedMessages">
> {
  const myGroupIds = (
    await prisma.group.findMany({
      where: { createdById: mentorId },
      select: { id: true },
    })
  ).map((g: { id: string }) => g.id);

  if (myGroupIds.length === 0) {
    return { myGroups: 0, totalStudents: 0, messagesToday: 0, pinnedMessages: 0 };
  }

  const [totalStudents, messagesToday, pinnedMessages] = await Promise.all([
    prisma.groupMember.count({
      where: { groupId: { in: myGroupIds }, role: "MENTEE" },
    }),
    prisma.message.count({
      where: {
        groupId: { in: myGroupIds },
        isDeleted: false,
        createdAt: { gte: startOfToday() },
      },
    }),
    prisma.message.count({
      where: { groupId: { in: myGroupIds }, isPinned: true, isDeleted: false },
    }),
  ]);

  return { myGroups: myGroupIds.length, totalStudents, messagesToday, pinnedMessages };
}

export async function getMenteeDashboardStats(
  menteeId: string
): Promise<Pick<MenteeDashboardStats, "joinedGroups"> & { recentAnnouncements: RecentAnnouncement[] }> {
  const memberships = await prisma.groupMember.findMany({
    where: { userId: menteeId },
    select: { groupId: true },
  });
  const groupIds = memberships.map((m: { groupId: string }) => m.groupId);

  if (groupIds.length === 0) {
    return { joinedGroups: 0, recentAnnouncements: [] };
  }

  const recentAnnouncements = await prisma.message.findMany({
    where: {
      groupId: { in: groupIds },
      isDeleted: false,
      OR: [{ isPinned: true }, { type: "ANNOUNCEMENT" }],
    },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      content: true,
      createdAt: true,
      group: { select: { id: true, name: true } },
      sender: { select: { name: true } },
    },
  });

  return { joinedGroups: groupIds.length, recentAnnouncements };
}

interface RecentAnnouncement {
  id: string;
  content: string;
  createdAt: Date;
  group: { id: string; name: string };
  sender: { name: string };
}
