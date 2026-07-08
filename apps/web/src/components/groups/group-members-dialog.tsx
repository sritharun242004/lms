"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2, Users } from "lucide-react";
import { groupService, type GroupMemberEntry } from "@/lib/api/services/group-service";
import { getInitials } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const ROLE_LABEL: Record<GroupMemberEntry["role"], string> = {
  OWNER: "Owner",
  MENTOR: "Mentor",
  MENTEE: "Mentee",
};

export function GroupMembersDialog({
  groupId,
  groupName,
  trigger,
}: {
  groupId: string;
  groupName: string;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);

  const { data: members, isLoading } = useQuery({
    queryKey: ["group-members", groupId],
    queryFn: async () => {
      const res = await groupService.members(groupId);
      return res.success ? res.data!.members : [];
    },
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Members of {groupName}</DialogTitle>
          <DialogDescription>
            Everyone who has onboarded into this group, most recent first.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : !members || members.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
            <Users className="size-8" />
            <p className="text-sm">No one has joined this group yet.</p>
          </div>
        ) : (
          <div className="flex max-h-96 flex-col gap-1 overflow-y-auto">
            {members.map((member) => (
              <div
                key={member.id}
                className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/50"
              >
                <Avatar className="size-9">
                  <AvatarImage src={member.user.avatarUrl ?? undefined} alt={member.user.name} />
                  <AvatarFallback>{getInitials(member.user.name)}</AvatarFallback>
                </Avatar>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{member.user.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {member.user.email ?? "Guest"} · Joined {format(new Date(member.joinedAt), "MMM d, yyyy")}
                  </span>
                </div>
                <Badge variant={member.role === "MENTEE" ? "outline" : "secondary"}>
                  {ROLE_LABEL[member.role]}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
