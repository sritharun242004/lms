"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Plus, Search } from "lucide-react";
import type { GroupCard as GroupCardData } from "@/lib/api/services/group-service";
import { GroupCard } from "@/components/groups/group-card";
import { GroupFormDialog } from "@/components/groups/group-form-dialog";
import { EmptyGroupsState } from "@/components/dashboard/empty-groups-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getVisibleGroups } from "@/lib/groups/presentation";

export function GroupsSection({
  groups,
  canCreate,
}: {
  groups: GroupCardData[];
  canCreate: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = React.useState("");
  const refresh = () => router.refresh();
  const visibleGroups = getVisibleGroups(groups, search);

  const newGroupTrigger = (
    <Button>
      <Plus className="size-4" />
      New group
    </Button>
  );

  return (
    <div className="flex flex-col gap-4">
      {groups.length > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search groups"
              aria-label="Search groups"
              className="pl-9"
            />
          </div>
          {canCreate && (
          <GroupFormDialog onSuccess={refresh} trigger={newGroupTrigger} />
          )}
        </div>
      )}

      {groups.length === 0 ? (
        <EmptyGroupsState
          mentee={!canCreate}
          action={
            canCreate ? <GroupFormDialog onSuccess={refresh} trigger={newGroupTrigger} /> : undefined
          }
        />
      ) : visibleGroups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
          No groups match &ldquo;{search.trim()}&rdquo;.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleGroups.map((g) => (
            <GroupCard key={g.id} group={g} onChanged={refresh} />
          ))}
        </div>
      )}
    </div>
  );
}
