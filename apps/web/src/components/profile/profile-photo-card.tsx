'use client';

import * as React from 'react';
import type { AuthUser } from '@cms/shared';
import { toast } from 'sonner';
import { authService } from '@/lib/api/services/auth-service';
import { useAuth } from '@/providers/auth-provider';
import { getInitials } from '@/lib/utils';
import { EditableAvatar } from '@/components/photos/editable-avatar';

function canManageProfilePhoto(role: AuthUser['role']): boolean {
  return role === 'ADMIN' || role === 'MENTOR';
}

export function ProfilePhotoCard({ user: initialUser }: { user: AuthUser }) {
  const { replaceUser } = useAuth();
  const [user, setUser] = React.useState(initialUser);
  const [busy, setBusy] = React.useState(false);
  const canManage = canManageProfilePhoto(user.role);

  async function updatePhoto(file: File) {
    if (busy) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.set('photo', file);
      const response = await authService.updatePhoto(form);
      if (!response.success) throw new Error(response.error?.message || 'Could not update your profile photo.');
      const updatedUser = response.data!.user;
      setUser(updatedUser);
      replaceUser(updatedUser);
      toast.success('Profile photo updated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update your profile photo.');
    } finally {
      setBusy(false);
    }
  }

  async function removePhoto() {
    if (busy) return;
    setBusy(true);
    try {
      const response = await authService.removePhoto();
      if (!response.success) throw new Error(response.error?.message || 'Could not remove your profile photo.');
      const updatedUser = response.data!.user;
      setUser(updatedUser);
      replaceUser(updatedUser);
      toast.success('Profile photo removed');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove your profile photo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby='profile-photo-heading' className='flex flex-col gap-4 sm:flex-row sm:items-center'>
      <div className='shrink-0'>
        <h2 id='profile-photo-heading' className='sr-only'>Profile photo</h2>
        <EditableAvatar
          name={user.name}
          imageUrl={user.avatarUrl}
          initials={getInitials(user.name)}
          canManage={canManage}
          busy={busy}
          onPhotoChange={updatePhoto}
          onRemove={removePhoto}
        />
      </div>
      <div className='min-w-0'>
        <p className='font-medium'>{user.name}</p>
        <p className='mt-1 text-sm text-muted-foreground'>
          {canManage ? 'Add a photo so people can recognize you in chats and groups.' : 'Your profile photo is visible to people in your groups.'}
        </p>
      </div>
    </section>
  );
}
