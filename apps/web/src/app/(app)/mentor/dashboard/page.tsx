import { redirect } from "next/navigation";
import { Users, MessagesSquare, Pin, LayoutGrid } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getMentorDashboardStats } from "@/lib/dashboard/queries";
import { getManagedGroups } from "@/lib/groups/queries";
import { StatCard } from "@/components/dashboard/stat-card";
import { GroupsSection } from "@/components/groups/groups-section";

export default async function MentorDashboardPage() {
  const user = await getCurrentUser();
  if (user?.role !== "ADMIN" && user?.role !== "MENTOR") {
    redirect("/dashboard");
  }

  const [stats, groups] = await Promise.all([
    getMentorDashboardStats(user.id),
    getManagedGroups({ userId: user.id }),
  ]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome back, {user.name.split(" ")[0]}
        </h1>
        <p className="text-sm text-muted-foreground">
          Here&apos;s what&apos;s happening in your groups today.
        </p>
      </div>

      {stats.myGroups > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="My groups" value={stats.myGroups} icon={LayoutGrid} />
          <StatCard label="Students" value={stats.totalStudents} icon={Users} />
          <StatCard label="Messages today" value={stats.messagesToday} icon={MessagesSquare} />
          <StatCard label="Pinned messages" value={stats.pinnedMessages} icon={Pin} />
        </div>
      )}

      <GroupsSection groups={groups} canCreate />
    </div>
  );
}
