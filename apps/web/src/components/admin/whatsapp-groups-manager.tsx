"use client";

import * as React from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export type WhatsAppGroupRow = {
  id: string;
  name: string;
  inviteUrl: string;
  isActive: boolean;
  createdAt: string;
};

async function requestJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.error?.message || "The request could not be completed");
  }
  return result.data as T;
}

export function WhatsAppGroupsManager({ groups: initialGroups }: { groups: WhatsAppGroupRow[] }) {
  const [groups, setGroups] = React.useState(initialGroups);
  const [name, setName] = React.useState("");
  const [inviteUrl, setInviteUrl] = React.useState("");
  const [isCreating, setIsCreating] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editName, setEditName] = React.useState("");
  const [editInviteUrl, setEditInviteUrl] = React.useState("");
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  function startEdit(group: WhatsAppGroupRow) {
    setEditingId(group.id);
    setEditName(group.name);
    setEditInviteUrl(group.inviteUrl);
  }

  async function createGroup() {
    setIsCreating(true);
    try {
      const data = await requestJson<{ group: WhatsAppGroupRow }>("/api/v1/admin/whatsapp-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, inviteUrl }),
      });
      setGroups((current) => [data.group, ...current]);
      setName("");
      setInviteUrl("");
      toast.success("WhatsApp group added");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to add group");
    } finally {
      setIsCreating(false);
    }
  }

  async function saveEdit() {
    if (!editingId) return;
    setPendingId(editingId);
    try {
      const data = await requestJson<{ group: WhatsAppGroupRow }>(`/api/v1/admin/whatsapp-groups/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName, inviteUrl: editInviteUrl }),
      });
      setGroups((current) => current.map((g) => (g.id === editingId ? { ...g, ...data.group } : g)));
      setEditingId(null);
      toast.success("WhatsApp group updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update group");
    } finally {
      setPendingId(null);
    }
  }

  async function toggleActive(group: WhatsAppGroupRow) {
    setPendingId(group.id);
    try {
      const data = await requestJson<{ group: WhatsAppGroupRow }>(`/api/v1/admin/whatsapp-groups/${group.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !group.isActive }),
      });
      setGroups((current) => current.map((g) => (g.id === group.id ? { ...g, ...data.group } : g)));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update group");
    } finally {
      setPendingId(null);
    }
  }

  async function deleteGroup(group: WhatsAppGroupRow) {
    if (!window.confirm(`Delete "${group.name}"? Past registrations keep their own copy of this invite, so this is safe.`)) {
      return;
    }
    setPendingId(group.id);
    try {
      await requestJson(`/api/v1/admin/whatsapp-groups/${group.id}`, { method: "DELETE" });
      setGroups((current) => current.filter((g) => g.id !== group.id));
      toast.success("WhatsApp group deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete group");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>WhatsApp groups</CardTitle>
        <CardDescription>
          Manage reusable groups once here, then select one during approval. Deleting a group never changes
          invitations already sent to approved participants.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="text-sm font-medium" htmlFor="new-group-name">
              Group name
            </label>
            <Input id="new-group-name" placeholder="XI Workshop — Day 1" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex-1">
            <label className="text-sm font-medium" htmlFor="new-group-url">
              WhatsApp invite link
            </label>
            <Input
              id="new-group-url"
              placeholder="https://chat.whatsapp.com/..."
              value={inviteUrl}
              onChange={(e) => setInviteUrl(e.target.value)}
            />
          </div>
          <Button onClick={createGroup} disabled={isCreating || !name.trim() || !inviteUrl.trim()}>
            {isCreating ? "Adding..." : "Add group"}
          </Button>
        </div>

        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">No WhatsApp groups yet. Add one above.</p>
        ) : (
          <div className="divide-y divide-border">
            {groups.map((group) => (
              <div key={group.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
                {editingId === group.id ? (
                  <div className="flex flex-1 flex-col gap-2 sm:flex-row">
                    <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="flex-1" />
                    <Input value={editInviteUrl} onChange={(e) => setEditInviteUrl(e.target.value)} className="flex-1" />
                  </div>
                ) : (
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{group.name}</p>
                      <Badge variant={group.isActive ? "success" : "secondary"}>
                        {group.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <p className="truncate text-sm text-muted-foreground">{group.inviteUrl}</p>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {editingId === group.id ? (
                    <>
                      <Button size="sm" onClick={saveEdit} disabled={pendingId === group.id}>
                        Save
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="sm" variant="outline" onClick={() => startEdit(group)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => toggleActive(group)} disabled={pendingId === group.id}>
                        {group.isActive ? "Deactivate" : "Activate"}
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => deleteGroup(group)} disabled={pendingId === group.id}>
                        Delete
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
