"use client";

import * as React from "react";
import {
  GroupProfileDialog,
  type GroupProfilePatch,
} from "@/components/groups/group-profile-dialog";

/**
 * Entry point used by the chat header and the dashboard group cards. It now
 * opens the full group profile (photo, description, members, media, documents
 * and links) instead of the old manager-only roster, so existing call sites and
 * their mocks keep working unchanged.
 */
export function GroupMembersDialog({
  groupId,
  groupName,
  trigger,
  onUpdated,
}: {
  groupId: string;
  groupName: string;
  trigger: React.ReactNode;
  onUpdated?: (patch: GroupProfilePatch) => void;
}) {
  return (
    <GroupProfileDialog
      groupId={groupId}
      groupName={groupName}
      trigger={trigger}
      onUpdated={onUpdated}
    />
  );
}
