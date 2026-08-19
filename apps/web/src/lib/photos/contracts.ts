export const MAX_PHOTO_UPLOAD_BYTES = 5 * 1024 * 1024;

export const PHOTO_INPUT_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export interface NormalizedPhoto {
  data: Buffer;
  mimeType: 'image/webp';
  size: number;
  width: 512;
  height: 512;
}

export function buildUserPhotoUrl(userId: string, version: number): string {
  return `/api/v1/users/${encodeURIComponent(userId)}/photo?v=${version}`;
}

export function buildGroupPhotoUrl(groupId: string, version: number): string {
  return `/api/v1/groups/${encodeURIComponent(groupId)}/photo?v=${version}`;
}
