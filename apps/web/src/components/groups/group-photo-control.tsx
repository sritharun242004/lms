'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { EditableAvatar } from '@/components/photos/editable-avatar';
import { groupService } from '@/lib/api/services/group-service';

export function GroupPhotoControl({
  groupId,
  groupName,
  avatarUrl: initialAvatarUrl,
  canManage,
  onChanged,
}: {
  groupId: string;
  groupName: string;
  avatarUrl: string | null;
  canManage: boolean;
  onChanged: () => void;
}) {
  const [avatarUrl, setAvatarUrl] = React.useState(initialAvatarUrl);
  const [busy, setBusy] = React.useState(false);

  async function updatePhoto(file: File) {
    if (busy) return;
    setBusy(true);
    try {
      const formData = new FormData();
      formData.set('photo', file);
      const response = await groupService.updatePhoto(groupId, formData);
      if (!response.success || !response.data) throw new Error(response.error?.message || 'Could not update the group photo.');
      setAvatarUrl(response.data.avatarUrl);
      toast.success('Group photo updated');
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update the group photo.');
    } finally {
      setBusy(false);
    }
  }

  async function removePhoto() {
    if (busy) return;
    setBusy(true);
    try {
      const response = await groupService.removePhoto(groupId);
      if (!response.success) throw new Error(response.error?.message || 'Could not remove the group photo.');
      setAvatarUrl(null);
      toast.success('Group photo removed');
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove the group photo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <EditableAvatar
      name={`${groupName} group`}
      imageUrl={avatarUrl}
      canManage={canManage}
      busy={busy}
      size='md'
      onPhotoChange={updatePhoto}
      onRemove={removePhoto}
    />
  );
}
