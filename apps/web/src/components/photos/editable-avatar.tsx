'use client';

import * as React from 'react';
import { Eye, ImagePlus, Pencil, Trash2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { validateClientPhoto } from '@/lib/photos/crop';
import { PhotoCropDialog } from './photo-crop-dialog';
import { PhotoPreviewDialog } from './photo-preview-dialog';

export interface EditableAvatarProps {
  name: string;
  imageUrl?: string | null;
  canManage?: boolean;
  busy?: boolean;
  initials?: string;
  size?: 'sm' | 'md' | 'lg';
  onPhotoChange?: (file: File) => Promise<void> | void;
  onChange?: (file: File) => Promise<void> | void;
  onRemove?: () => Promise<void> | void;
  onRemovePhoto?: () => Promise<void> | void;
}

function initialsFor(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?';
}

export function EditableAvatar({
  name,
  imageUrl = null,
  canManage = false,
  busy = false,
  initials,
  size = 'lg',
  onPhotoChange,
  onChange,
  onRemove,
  onRemovePhoto,
}: EditableAvatarProps) {
  const [cropFile, setCropFile] = React.useState<File | null>(null);
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const dimension = size === 'sm' ? 'size-10' : size === 'md' ? 'size-16' : 'size-28';
  const changePhoto = onPhotoChange ?? onChange;
  const removePhoto = onRemove ?? onRemovePhoto;

  function choosePhoto() { inputRef.current?.click(); }
  function handleInput(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    const result = validateClientPhoto(file);
    if (!result.ok) { setError(result.message); return; }
    setError(null); setCropFile(file);
  }

  return (
    <div className='flex flex-col items-center gap-3'>
      <button type='button' className='rounded-full focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30' onClick={() => imageUrl && setPreviewOpen(true)} disabled={!imageUrl || busy} aria-label={imageUrl ? `${canManage ? 'Open' : 'View'} ${name} photo` : `${name} avatar`}>
        <Avatar className={`${dimension} ring-4 ring-white shadow-lg`}>
          {imageUrl && <AvatarImage src={imageUrl} alt={`${name} profile photo`} />}
          <AvatarFallback>{initials ?? initialsFor(name)}</AvatarFallback>
        </Avatar>
      </button>
      <input ref={inputRef} type='file' accept='image/jpeg,image/png,image/webp' onChange={handleInput} className='sr-only' aria-label={`Select ${name} photo`} />
      {canManage && (
        <div className='flex flex-wrap justify-center gap-2'>
          <Button type='button' variant='outline' size='sm' onClick={choosePhoto} disabled={busy} aria-label={imageUrl ? `Change ${name} photo` : `Add ${name} photo`}>
            {imageUrl ? <Pencil /> : <ImagePlus />}{imageUrl ? 'Change photo' : 'Add photo'}
          </Button>
          {imageUrl && <Button type='button' variant='ghost' size='sm' onClick={() => setPreviewOpen(true)} disabled={busy} aria-label={`View ${name} photo`}><Eye />View</Button>}
          {imageUrl && removePhoto && <Button type='button' variant='ghost' size='sm' onClick={() => void removePhoto()} disabled={busy} aria-label={`Remove ${name} photo`}><Trash2 />Remove</Button>}
        </div>
      )}
      {error && <p role='alert' className='text-center text-sm text-destructive'>{error}</p>}
      {cropFile && <PhotoCropDialog file={cropFile} open={Boolean(cropFile)} onOpenChange={(open) => { if (!open) setCropFile(null); }} onSave={async (file) => { if (changePhoto) await changePhoto(file); setCropFile(null); }} />}
      {imageUrl && <PhotoPreviewDialog open={previewOpen} onOpenChange={setPreviewOpen} src={imageUrl} title={`${name} profile photo`} />}
    </div>
  );
}
