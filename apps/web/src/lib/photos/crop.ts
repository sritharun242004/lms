import { MAX_PHOTO_UPLOAD_BYTES, PHOTO_INPUT_MIME_TYPES } from './contracts';

export type ClientPhotoValidation = { ok: true } | { ok: false; message: string };
export interface CropInput { sourceWidth: number; sourceHeight: number; zoom: number; x: number; y: number }
export interface CropRect { sx: number; sy: number; size: number }

export function validateClientPhoto(file: File | Blob | null | undefined): ClientPhotoValidation {
  if (!file || file.size === 0) return { ok: false, message: 'Choose a photo before continuing.' };
  if (file.size > MAX_PHOTO_UPLOAD_BYTES) return { ok: false, message: 'Photo must be 5 MB or smaller.' };
  if (!(PHOTO_INPUT_MIME_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, message: 'Use a JPEG, PNG, or WebP photo.' };
  }
  return { ok: true };
}

export function calculateCrop({ sourceWidth, sourceHeight, zoom, x, y }: CropInput): CropRect {
  const width = Math.max(1, sourceWidth);
  const height = Math.max(1, sourceHeight);
  const size = Math.min(width, height) / Math.max(1, zoom);
  const maxX = Math.max(0, (width - size) / 2);
  const maxY = Math.max(0, (height - size) / 2);
  const clamp = (value: number, max: number) => Math.min(max, Math.max(0, Number.isFinite(value) ? value : 0));
  return { sx: clamp((width - size) / 2 + x * maxX, width - size), sy: clamp((height - size) / 2 + y * maxY, height - size), size };
}

export function exportCroppedWebP(source: CanvasImageSource, crop: CropRect, outputSize = 512): Promise<Blob> {
  if (typeof document === 'undefined') return Promise.reject(new Error('Photo cropping requires a browser.'));
  const canvas = document.createElement('canvas');
  canvas.width = outputSize;
  canvas.height = outputSize;
  const context = canvas.getContext('2d');
  if (!context) return Promise.reject(new Error('Your browser cannot crop this photo.'));
  context.drawImage(source, crop.sx, crop.sy, crop.size, crop.size, 0, 0, outputSize, outputSize);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Your browser cannot export this photo.')), 'image/webp', 0.82);
  });
}
