"use client";

import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import type { GroupCard as GroupCardData } from "@/lib/api/services/group-service";
import { GroupCard } from "@/components/groups/group-card";
import { GroupFormDialog } from "@/components/groups/group-form-dialog";
import { EmptyGroupsState } from "@/components/dashboard/empty-groups-state";
import { Button } from "@/components/ui/button";

export function GroupsSection({
  groups,
  canCreate,
}: {
  groups: GroupCardData[];
  canCreate: boolean;
}) {
  const router = useRouter();
  const refresh = () => router.refresh();

  const newGroupTrigger = (
    <Button>
      <Plus className="size-4" />
      New group
    </Button>
  );

  return (
    <div className="flex flex-col gap-4">
      {canCreate && groups.length > 0 && (
        <div className="flex justify-end">
          <GroupFormDialog onSuccess={refresh} trigger={newGroupTrigger} />
        </div>
      )}

      {groups.length === 0 ? (
        <EmptyGroupsState
          mentee={!canCreate}
          action={
            canCreate ? <GroupFormDialog onSuccess={refresh} trigger={newGroupTrigger} /> : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <GroupCard key={g.id} group={g} onChanged={refresh} />
          ))}
        </div>
      )}
    </div>
  );
}
