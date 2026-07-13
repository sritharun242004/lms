import { redirect } from "next/navigation";
import { Users, MessagesSquare, LayoutGrid } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getAdminDashboardStats } from "@/lib/dashboard/queries";
import { getManagedGroups } from "@/lib/groups/queries";
import { StatCard } from "@/components/dashboard/stat-card";
import { GroupsSection } from "@/components/groups/groups-section";

export default async function AdminDashboardPage() {
  const user = await getCurrentUser();
  if (user?.role !== "ADMIN") {
    redirect("/dashboard");
  }

  const [stats, groups] = await Promise.all([getAdminDashboardStats(), getManagedGroups()]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome back, {user.name.split(" ")[0]}
        </h1>
        <p className="text-sm text-muted-foreground">
          A system-wide overview of every group, mentor, and student.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Groups" value={stats.totalGroups} icon={LayoutGrid} />
        <StatCard label="Students" value={stats.totalStudents} icon={Users} />
        <StatCard label="Messages" value={stats.totalMessages} icon={MessagesSquare} />
      </div>

      <GroupsSection groups={groups} canCreate />
    </div>
  );
}
