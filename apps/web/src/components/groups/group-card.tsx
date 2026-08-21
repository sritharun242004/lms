"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Copy,
  MessageSquare,
  MoreVertical,
  Pencil,
  RefreshCw,
  ShieldOff,
  Trash2,
  Users,
} from "lucide-react";
import type { GroupCard as GroupCardData } from "@/lib/api/services/group-service";
import { groupService } from "@/lib/api/services/group-service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { GroupFormDialog } from "@/components/groups/group-form-dialog";
import { GroupMembersDialog } from "@/components/groups/group-members-dialog";
import { useConfirm } from "@/hooks/use-confirm";
import { formatLastActive } from "@/lib/groups/presentation";
import { getInitials } from "@/lib/utils";

export function GroupCard({
  group,
  onChanged,
  isActive = false,
  lastActivityAt,
}: {
  group: GroupCardData;
  onChanged: () => void;
  isActive?: boolean;
  lastActivityAt?: string;
}) {
  const [isBusy, setIsBusy] = React.useState(false);
  const [confirm, confirmDialog] = useConfirm();
  const [now, setNow] = React.useState(() => new Date());

  React.useEffect(() => {
    if (isActive) return;
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, [isActive]);

  async function copyCode() {
    if (!group.inviteCode) return;
    await navigator.clipboard.writeText(group.inviteCode.code);
    toast.success("Meeting or course code copied");
  }

  async function handleRegenerate() {
    setIsBusy(true);
    try {
      const res = await groupService.regenerateInviteCode(group.id);
      if (!res.success) throw new Error(res.error?.message);
      toast.success("Meeting or course code regenerated");
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to regenerate code");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDisable() {
    setIsBusy(true);
    try {
      const res = await groupService.disableInviteCode(group.id);
      if (!res.success) throw new Error(res.error?.message);
      toast.success("Meeting or course code disabled");
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to disable code");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDelete() {
    const ok = await confirm({
      title: `Delete "${group.name}"?`,
      description: "This removes all its messages and members. This can't be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    setIsBusy(true);
    try {
      const res = await groupService.remove(group.id);
      if (!res.success) throw new Error(res.error?.message);
      toast.success("Group deleted");
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete group");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <Card>
      {confirmDialog}
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div className='flex min-w-0 items-start gap-3'>
          <Avatar
            className="size-16 shrink-0 ring-4 ring-white shadow-lg"
            aria-label={`${group.name} group photo`}
          >
            {group.avatarUrl && (
              <AvatarImage src={group.avatarUrl} alt={`${group.name} group photo`} />
            )}
            <AvatarFallback>{getInitials(group.name)}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col gap-1">
            <CardTitle className="text-base">{group.name}</CardTitle>
            {group.description && (
              <p className="line-clamp-2 text-sm text-muted-foreground">{group.description}</p>
            )}
            {isActive ? (
              <span className="flex items-center gap-1.5 text-xs font-medium text-success">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-success" />
                </span>
                Active now
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="size-2 rounded-full bg-muted-foreground/40" />
                Last active {formatLastActive(lastActivityAt ?? group.lastActivityAt, now)}
              </span>
            )}
          </div>
        </div>
        {group.canManage && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0"
                disabled={isBusy}
                aria-label={`Manage ${group.name}`}
              >
                <MoreVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <GroupFormDialog
                mode="edit"
                group={group}
                onSuccess={onChanged}
                trigger={
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                    <Pencil />
                    Edit group
                  </DropdownMenuItem>
                }
              />
              <DropdownMenuItem onSelect={handleRegenerate}>
                <RefreshCw />
                Regenerate meeting/course code
              </DropdownMenuItem>
              {group.inviteCode?.isActive && (
                <DropdownMenuItem onSelect={handleDisable}>
                  <ShieldOff />
                  Disable meeting/course code
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={handleDelete}>
                <Trash2 />
                Delete group
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {group.canManage ? (
          <GroupMembersDialog
            groupId={group.id}
            groupName={group.name}
            trigger={
              <button
                type="button"
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
              >
                <Users className="size-3.5" />
                {group.memberCount} {group.memberCount === 1 ? "member" : "members"}
              </button>
            }
          />
        ) : (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Users className="size-3.5" />
            {group.memberCount} {group.memberCount === 1 ? "member" : "members"}
            <span>· by {group.mentorName}</span>
          </div>
        )}

        {group.inviteCode && (
          <button
            type="button"
            onClick={copyCode}
            disabled={!group.inviteCode.isActive}
            className="flex items-center justify-between gap-2 rounded-2xl border border-primary/15 bg-primary/[.055] px-3 py-2.5 text-left transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="flex items-center gap-2">
              <span className="font-mono text-sm font-medium tracking-wide">
                {group.inviteCode.code}
              </span>
              <Badge variant={group.inviteCode.isActive ? "success" : "outline"}>
                {group.inviteCode.isActive ? "Active" : "Disabled"}
              </Badge>
            </span>
            <Copy className="size-3.5 text-muted-foreground" />
          </button>
        )}

        <Button variant="outline" size="sm" asChild>
          <Link href={`/chat/${group.id}`}>
            <MessageSquare className="size-3.5" />
            Open chat
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
