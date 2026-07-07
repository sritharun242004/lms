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

export function GroupCard({
  group,
  onChanged,
}: {
  group: GroupCardData;
  onChanged: () => void;
}) {
  const [isBusy, setIsBusy] = React.useState(false);

  async function copyCode() {
    if (!group.inviteCode) return;
    await navigator.clipboard.writeText(group.inviteCode.code);
    toast.success("Invite code copied");
  }

  async function handleRegenerate() {
    setIsBusy(true);
    try {
      const res = await groupService.regenerateInviteCode(group.id);
      if (!res.success) throw new Error(res.error?.message);
      toast.success("Invite code regenerated");
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
      toast.success("Invite code disabled");
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to disable code");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete "${group.name}"? This removes all its messages and members.`)) {
      return;
    }
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
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <CardTitle className="text-base">{group.name}</CardTitle>
          {group.description && (
            <p className="line-clamp-2 text-sm text-muted-foreground">{group.description}</p>
          )}
        </div>
        {group.canManage && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="shrink-0" disabled={isBusy}>
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
                Regenerate invite code
              </DropdownMenuItem>
              {group.inviteCode?.isActive && (
                <DropdownMenuItem onSelect={handleDisable}>
                  <ShieldOff />
                  Disable invite code
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
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Users className="size-3.5" />
          {group.memberCount} {group.memberCount === 1 ? "member" : "members"}
          {!group.canManage && <span>· by {group.mentorName}</span>}
        </div>

        {group.inviteCode && (
          <button
            type="button"
            onClick={copyCode}
            disabled={!group.inviteCode.isActive}
            className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-border bg-muted/50 px-3 py-2 text-left transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
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
