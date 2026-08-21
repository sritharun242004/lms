'use client';

import * as React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export function PhotoPreviewDialog({
  open,
  onOpenChange,
  src,
  title = 'Profile photo',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  src: string;
  title?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-xl'>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className='sr-only'>Large preview of {title.toLowerCase()}</DialogDescription>
        </DialogHeader>
        <div className='flex justify-center rounded-3xl bg-muted/40 p-4'>
          <img src={src} alt={title} className='max-h-[65vh] w-full rounded-2xl object-contain' />
        </div>
      </DialogContent>
    </Dialog>
  );
}
