import sharp from 'sharp';
import {
  MAX_PHOTO_UPLOAD_BYTES,
  NormalizedPhoto,
  PHOTO_INPUT_MIME_TYPES,
} from './contracts';

export type PhotoUploadErrorCode =
  | 'INVALID_PHOTO'
  | 'PHOTO_TOO_LARGE'
  | 'UNSUPPORTED_PHOTO_TYPE';

export class PhotoUploadError extends Error {
  constructor(
    readonly code: PhotoUploadErrorCode,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'PhotoUploadError';
  }
}

function validateDeclaredFile(file: File): void {
  if (file.size === 0) {
    throw new PhotoUploadError('INVALID_PHOTO', 'The selected file is empty.', 400);
  }

  if (file.size > MAX_PHOTO_UPLOAD_BYTES) {
    throw new PhotoUploadError('PHOTO_TOO_LARGE', 'The selected file exceeds the 5 MiB limit.', 413);
  }

  if (!(PHOTO_INPUT_MIME_TYPES as readonly string[]).includes(file.type)) {
    throw new PhotoUploadError(
      'UNSUPPORTED_PHOTO_TYPE',
      'Only JPEG, PNG, and WebP photos are supported.',
      415,
    );
  }
}

export async function normalizePhotoUpload(file: File): Promise<NormalizedPhoto> {
  validateDeclaredFile(file);

  try {
    const input = Buffer.from(await file.arrayBuffer());
    const data = await sharp(input, { failOn: 'warning' })
      .rotate()
      .resize(512, 512, { fit: 'cover', position: 'centre' })
      .webp({ quality: 82 })
      .toBuffer();

    return { data, mimeType: 'image/webp', size: data.length, width: 512, height: 512 };
  } catch {
    throw new PhotoUploadError('INVALID_PHOTO', 'The selected file is not a valid photo.', 400);
  }
}
