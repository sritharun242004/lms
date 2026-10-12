"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Pencil, Users } from "lucide-react";
import { groupService, type GroupProfile } from "@/lib/api/services/group-service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { GroupPhotoControl } from "@/components/groups/group-photo-control";
import {
  DocumentsTab,
  LinksTab,
  MediaTab,
  MembersTab,
} from "@/components/groups/group-shared-content";

const NAME_MIN = 2;
const NAME_MAX = 100;
const DESCRIPTION_MAX = 1000;

export interface GroupProfilePatch {
  name?: string;
  description?: string | null;
  avatarUrl?: string | null;
}

/**
 * WhatsApp-style group profile: photo, name, description, member count, and
 * Members / Media / Documents / Links tabs.
 *
 * What the caller may do comes from the server (`canEdit` on the profile
 * response), so edit controls only ever appear for real group admins and a
 * demoted user loses them on the next refresh. The API re-checks every write.
 * Opening it never touches the chat's own scroll position: it is a modal whose
 * single scroll area is inside the dialog.
 */
export function GroupProfileDialog({
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
  const [open, setOpen] = React.useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        className={[
          "flex max-h-[92dvh] flex-col gap-0 overflow-hidden bg-background/95 p-0 backdrop-blur-xl sm:max-w-3xl",
          // Phones: a full-screen panel instead of a small centred card.
          "max-sm:top-0 max-sm:left-0 max-sm:h-dvh max-sm:max-h-none max-sm:w-screen",
          "max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none",
        ].join(" ")}
      >
        <DialogTitle className="sr-only">{groupName} group profile</DialogTitle>
        <DialogDescription className="sr-only">
          Group photo, description, members, and shared media, documents and links.
        </DialogDescription>
        {open && <ProfileBody groupId={groupId} fallbackName={groupName} onUpdated={onUpdated} />}
      </DialogContent>
    </Dialog>
  );
}

function ProfileBody({
  groupId,
  fallbackName,
  onUpdated,
}: {
  groupId: string;
  fallbackName: string;
  onUpdated?: (patch: GroupProfilePatch) => void;
}) {
  const queryClient = useQueryClient();
  const profileQuery = useQuery({
    queryKey: ["group-profile", groupId],
    queryFn: async (): Promise<GroupProfile> => {
      const res = await groupService.profile(groupId);
      if (!res.success || !res.data) throw new Error(res.error?.message || "Could not load the group profile.");
      return res.data;
    },
    refetchOnWindowFocus: true,
    // Pick up a changed name/photo or lost admin rights while the profile is open.
    refetchInterval: 30_000,
  });
  const profile = profileQuery.data;

  // Keep the chat header in step with what the server says.
  const reported = React.useRef<string>("");
  React.useEffect(() => {
    if (!profile) return;
    const key = JSON.stringify([profile.name, profile.description, profile.avatarUrl]);
    if (reported.current === key) return;
    reported.current = key;
    onUpdated?.({ name: profile.name, description: profile.description, avatarUrl: profile.avatarUrl });
  }, [profile, onUpdated]);

  const refresh = React.useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["group-profile", groupId] }),
    [queryClient, groupId]
  );

  if (profileQuery.isPending) {
    return (
      <div role="status" aria-label="Loading group profile" className="flex flex-1 items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }

  if (profileQuery.isError || !profile) {
    return (
      <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-24 text-center">
        <p className="text-sm text-muted-foreground">
          {profileQuery.error?.message || "Could not load the group profile."}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => void profileQuery.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain" data-testid="group-profile-scroll">
      <header className="flex flex-col items-center gap-4 border-b border-border/60 px-5 pt-8 pb-6 text-center sm:px-8">
        <GroupPhotoControl
          key={profile.avatarUrl ?? "no-photo"}
          groupId={groupId}
          groupName={profile.name || fallbackName}
          avatarUrl={profile.avatarUrl}
          canManage={profile.canEdit}
          size="lg"
          onChanged={() => void refresh()}
        />
        <IdentityEditor
          key={`${profile.name}|${profile.description ?? ""}`}
          groupId={groupId}
          profile={profile}
          onSaved={(patch) => {
            onUpdated?.(patch);
            void refresh();
          }}
          onForbidden={() => void refresh()}
        />
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Users className="size-4" aria-hidden />
          <span data-testid="group-member-count">
            {profile.memberCount} {profile.memberCount === 1 ? "member" : "members"}
          </span>
        </p>
      </header>

      <Tabs defaultValue="members" className="min-h-0 flex-1 gap-0">
        <div className="sticky top-0 z-10 border-b border-border/60 bg-background/95 px-4 py-2 backdrop-blur sm:px-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="members">Members</TabsTrigger>
            <TabsTrigger value="media">Media</TabsTrigger>
            <TabsTrigger value="documents">Docs</TabsTrigger>
            <TabsTrigger value="links">Links</TabsTrigger>
          </TabsList>
        </div>
        <div className="px-4 py-3 sm:px-6">
          <TabsContent value="members">
            <MembersTab groupId={groupId} />
          </TabsContent>
          <TabsContent value="media">
            <MediaTab groupId={groupId} />
          </TabsContent>
          <TabsContent value="documents">
            <DocumentsTab groupId={groupId} />
          </TabsContent>
          <TabsContent value="links">
            <LinksTab groupId={groupId} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

function IdentityEditor({
  groupId,
  profile,
  onSaved,
  onForbidden,
}: {
  groupId: string;
  profile: GroupProfile;
  onSaved: (patch: GroupProfilePatch) => void;
  onForbidden: () => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState(profile.name);
  const [description, setDescription] = React.useState(profile.description ?? "");
  const [saving, setSaving] = React.useState(false);
  const inFlight = React.useRef(false);

  // If this user stops being an admin while the form is open, drop the form.
  const canEdit = profile.canEdit;
  const showEditor = editing && canEdit;

  const trimmedName = name.trim();
  const trimmedDescription = description.trim();
  const nameError =
    trimmedName.length < NAME_MIN
      ? `Name must be at least ${NAME_MIN} characters`
      : trimmedName.length > NAME_MAX
        ? `Name must be at most ${NAME_MAX} characters`
        : null;
  const descriptionError =
    trimmedDescription.length > DESCRIPTION_MAX ? `Description must be at most ${DESCRIPTION_MAX} characters` : null;
  const unchanged =
    trimmedName === profile.name && trimmedDescription === (profile.description ?? "");

  async function save() {
    if (inFlight.current || nameError || descriptionError || unchanged) return;
    inFlight.current = true;
    setSaving(true);
    try {
      const res = await groupService.update(groupId, { name: trimmedName, description: trimmedDescription });
      if (!res.success || !res.data) {
        if (res.error?.code === "FORBIDDEN") {
          toast.error("You no longer have permission to edit this group.");
          setEditing(false);
          onForbidden();
        } else {
          toast.error(res.error?.message || "Could not save the group. Please try again.");
        }
        return;
      }
      toast.success("Group updated");
      setEditing(false);
      onSaved({ name: res.data.name, description: res.data.description });
    } catch {
      toast.error("Could not save the group. Check your connection and try again.");
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  function cancel() {
    setName(profile.name);
    setDescription(profile.description ?? "");
    setEditing(false);
  }

  if (showEditor) {
    return (
      <form
        className="flex w-full max-w-lg flex-col gap-3 text-left"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="group-profile-name">Group name</Label>
          <Input
            id="group-profile-name"
            value={name}
            maxLength={NAME_MAX + 50}
            disabled={saving}
            aria-invalid={Boolean(nameError)}
            onChange={(event) => setName(event.target.value)}
            autoFocus
          />
          {nameError && <p className="text-xs text-destructive">{nameError}</p>}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="group-profile-description">Description</Label>
          <Textarea
            id="group-profile-description"
            value={description}
            rows={3}
            disabled={saving}
            aria-invalid={Boolean(descriptionError)}
            placeholder="Add a group description"
            onChange={(event) => setDescription(event.target.value)}
          />
          <div className="flex justify-between text-xs">
            <span className="text-destructive">{descriptionError}</span>
            <span className="text-muted-foreground">
              {trimmedDescription.length}/{DESCRIPTION_MAX}
            </span>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={cancel} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={saving || Boolean(nameError || descriptionError) || unchanged}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex w-full max-w-lg flex-col items-center gap-2">
      <h2 className="text-xl font-semibold [overflow-wrap:anywhere]" data-testid="group-profile-name">
        {profile.name}
      </h2>
      {profile.description ? (
        <p className="text-sm whitespace-pre-wrap text-muted-foreground [overflow-wrap:anywhere]" data-testid="group-profile-description">
          {profile.description}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground italic">
          {canEdit ? "No description yet." : "No description."}
        </p>
      )}
      {canEdit && (
        <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
          <Pencil className="size-4" />
          Edit name &amp; description
        </Button>
      )}
    </div>
  );
}
