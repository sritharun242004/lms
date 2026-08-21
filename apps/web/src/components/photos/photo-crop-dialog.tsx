'use client';

import * as React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { calculateCrop, exportCroppedWebP, type CropRect } from '@/lib/photos/crop';

export function PhotoCropDialog({
  file,
  open,
  onOpenChange,
  onSave,
}: {
  file: File | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (file: File) => Promise<void> | void;
}) {
  const [src, setSrc] = React.useState<string | null>(null);
  const [image, setImage] = React.useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = React.useState(1);
  const [x, setX] = React.useState(0);
  const [y, setY] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!file) { setSrc(null); setImage(null); return; }
    const objectUrl = URL.createObjectURL(file);
    setSrc(objectUrl); setImage(null); setZoom(1); setX(0); setY(0); setError(null);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  async function save() {
    if (!image || !src) return;
    setSaving(true); setError(null);
    try {
      const crop: CropRect = calculateCrop({ sourceWidth: image.naturalWidth, sourceHeight: image.naturalHeight, zoom, x, y });
      const blob = await exportCroppedWebP(image, crop);
      await onSave(new File([blob], file?.name.replace(/\.[^.]+$/, '.webp') || 'photo.webp', { type: 'image/webp' }));
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The photo could not be prepared. Try again.');
    } finally { setSaving(false); }
  }

  function move(dx: number, dy: number) { setX((value) => Math.max(-1, Math.min(1, value + dx))); setY((value) => Math.max(-1, Math.min(1, value + dy))); }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-lg'>
        <DialogHeader>
          <DialogTitle>Crop photo</DialogTitle>
          <DialogDescription>Position your photo inside the circle, then save it.</DialogDescription>
        </DialogHeader>
        <div className='space-y-4'>
          <div className='relative flex aspect-square items-center justify-center overflow-hidden rounded-3xl bg-slate-950 p-4'>
            {src && <img ref={(node) => { if (node && node.complete) setImage(node); }} onLoad={(event) => setImage(event.currentTarget)} src={src} alt='Photo crop preview' className='max-h-full max-w-full object-contain' style={{ transform: `scale(${zoom}) translate(${x * 8}%, ${y * 8}%)` }} />}
            <span className='pointer-events-none absolute inset-8 rounded-full border-2 border-white shadow-[0_0_0_999px_rgba(15,23,42,.45)]' aria-hidden='true' />
          </div>
          <label className='block text-sm font-medium' htmlFor='photo-zoom'>Zoom</label>
          <input id='photo-zoom' aria-label='Zoom photo' type='range' min='1' max='3' step='0.01' value={zoom} onChange={(event) => setZoom(Number(event.target.value))} className='w-full' />
          <div className='flex justify-center gap-2' aria-label='Move photo'>
            <Button type='button' variant='outline' size='sm' onClick={() => move(-0.1, 0)} aria-label='Move photo left'>Left</Button>
            <Button type='button' variant='outline' size='sm' onClick={() => move(0, -0.1)} aria-label='Move photo up'>Up</Button>
            <Button type='button' variant='outline' size='sm' onClick={() => move(0, 0.1)} aria-label='Move photo down'>Down</Button>
            <Button type='button' variant='outline' size='sm' onClick={() => move(0.1, 0)} aria-label='Move photo right'>Right</Button>
          </div>
          {error && <p role='alert' className='text-sm text-destructive'>{error}</p>}
        </div>
        <DialogFooter>
          <Button type='button' variant='outline' onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button type='button' onClick={save} disabled={!image || saving}>{saving ? 'Saving…' : 'Save photo'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
