import { LayoutGrid, Megaphone } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getMenteeDashboardStats } from "@/lib/dashboard/queries";
import { getJoinedGroups } from "@/lib/groups/queries";
import { StatCard } from "@/components/dashboard/stat-card";
import { GroupsSection } from "@/components/groups/groups-section";
import { SecureAccountBanner } from "@/components/auth/secure-account-banner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRelativeTime } from "@/lib/utils";

export default async function MenteeDashboardPage() {
  const user = await getCurrentUser();
  if (!user) return null; // guarded by layout

  const [stats, groups] = await Promise.all([
    getMenteeDashboardStats(user.id),
    getJoinedGroups(user.id),
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

      {!user.email && <SecureAccountBanner />}

      {stats.joinedGroups === 0 ? (
        <GroupsSection groups={groups} canCreate={false} />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <StatCard label="Joined groups" value={stats.joinedGroups} icon={LayoutGrid} />
            <StatCard
              label="Recent announcements"
              value={stats.recentAnnouncements.length}
              icon={Megaphone}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent announcements</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col divide-y divide-border p-0">
              {stats.recentAnnouncements.length === 0 ? (
                <p className="px-6 pb-6 text-sm text-muted-foreground">
                  No announcements yet — check back soon.
                </p>
              ) : (
                stats.recentAnnouncements.map((a) => (
                  <div key={a.id} className="flex flex-col gap-1 px-6 py-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{a.group.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatRelativeTime(a.createdAt)}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-sm text-muted-foreground">{a.content}</p>
                    <span className="text-xs text-muted-foreground">— {a.sender.name}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <GroupsSection groups={groups} canCreate={false} />
        </div>
      )}
    </div>
  );
}
