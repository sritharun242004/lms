"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Plus, Search, Users } from "lucide-react";
import type { GroupCard as GroupCardData } from "@/lib/api/services/group-service";
import { GroupFormDialog } from "@/components/groups/group-form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getInitials, cn } from "@/lib/utils";

export function ChatSidebar({
  groups,
  canCreate,
}: {
  groups: GroupCardData[];
  canCreate: boolean;
}) {
  const params = useParams<{ groupId?: string }>();
  const router = useRouter();
  const [query, setQuery] = React.useState("");

  const filtered = query.trim()
    ? groups.filter((g) => g.name.toLowerCase().includes(query.trim().toLowerCase()))
    : groups;

  return (
    <div className="flex h-full w-full flex-col bg-white/24 md:max-w-xs md:border-r md:border-white/60 dark:bg-white/[.02] dark:md:border-white/10">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 p-4">
        <h2 className="text-lg font-semibold">Chats</h2>
        {canCreate && (
          <GroupFormDialog
            onSuccess={() => router.refresh()}
            trigger={
              <Button size="icon" variant="ghost" aria-label="New group">
                <Plus className="size-4" />
              </Button>
            }
          />
        )}
      </div>

      <div className="p-3">
        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search groups"
            className="pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            {groups.length === 0 ? "No groups yet" : "No matches"}
          </p>
        ) : (
          filtered.map((group) => {
            const isActive = params.groupId === group.id;
            return (
              <Link
                key={group.id}
                href={`/chat/${group.id}`}
                className={cn(
                  "mx-2 mb-1 flex items-center gap-3 rounded-2xl px-3 py-3 transition-all hover:bg-white/65 hover:shadow-sm dark:hover:bg-white/5",
                  isActive && "bg-primary/10 text-primary shadow-sm"
                )}
              >
                <Avatar>
                  <AvatarFallback>{getInitials(group.name)}</AvatarFallback>
                </Avatar>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{group.name}</span>
                  <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                    <Users className="size-3" />
                    {group.memberCount} {group.memberCount === 1 ? "member" : "members"}
                    {!group.canManage && <span>· {group.mentorName}</span>}
                  </span>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
