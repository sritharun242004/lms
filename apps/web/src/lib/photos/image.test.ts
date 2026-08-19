import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { MAX_PHOTO_UPLOAD_BYTES } from './contracts';
import { normalizePhotoUpload } from './image';

describe('normalizePhotoUpload', () => {
  it('normalizes a real PNG into a 512px square WebP', async () => {
    const bytes = await sharp({
      create: { width: 800, height: 400, channels: 4, background: '#2563eb' },
    }).png().toBuffer();

    const result = await normalizePhotoUpload(
      new File([new Uint8Array(bytes)], 'photo.png', { type: 'image/png' }),
    );
    const metadata = await sharp(result.data).metadata();

    expect(metadata).toMatchObject({ format: 'webp', width: 512, height: 512 });
    expect(result).toMatchObject({ mimeType: 'image/webp', size: result.data.length, width: 512, height: 512 });
  });

  it('rejects declared image content with invalid bytes', async () => {
    await expect(normalizePhotoUpload(
      new File(['bad'], 'fake.png', { type: 'image/png' }),
    )).rejects.toMatchObject({ code: 'INVALID_PHOTO', status: 400 });
  });

  it('rejects an empty upload before image decoding', async () => {
    await expect(normalizePhotoUpload(
      new File([], 'empty.png', { type: 'image/png' }),
    )).rejects.toMatchObject({ code: 'INVALID_PHOTO', status: 400 });
  });

  it('rejects uploads larger than five MiB', async () => {
    const bytes = new Uint8Array(MAX_PHOTO_UPLOAD_BYTES + 1);

    await expect(normalizePhotoUpload(
      new File([bytes], 'oversize.png', { type: 'image/png' }),
    )).rejects.toMatchObject({ code: 'PHOTO_TOO_LARGE', status: 413 });
  });

  it('rejects GIF MIME declarations', async () => {
    const bytes = Buffer.from('GIF89a');

    await expect(normalizePhotoUpload(
      new File([bytes], 'photo.gif', { type: 'image/gif' }),
    )).rejects.toMatchObject({ code: 'UNSUPPORTED_PHOTO_TYPE', status: 415 });
  });
});
