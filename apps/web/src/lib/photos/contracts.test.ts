import { describe, expect, it } from 'vitest';
import {
  buildGroupPhotoUrl,
  buildUserPhotoUrl,
  MAX_PHOTO_UPLOAD_BYTES,
  PHOTO_INPUT_MIME_TYPES,
} from './contracts';

describe('photo contracts', () => {
  it('limits original uploads to exactly five MiB and accepted image MIME types', () => {
    expect(MAX_PHOTO_UPLOAD_BYTES).toBe(5 * 1024 * 1024);
    expect(PHOTO_INPUT_MIME_TYPES).toEqual(['image/jpeg', 'image/png', 'image/webp']);
  });

  it('builds versioned user-photo URLs with an encoded user ID', () => {
    expect(buildUserPhotoUrl('user/a', 1724050000000))
      .toBe('/api/v1/users/user%2Fa/photo?v=1724050000000');
  });

  it('builds versioned group-photo URLs with an encoded group ID', () => {
    expect(buildGroupPhotoUrl('group/a', 1724050000000))
      .toBe('/api/v1/groups/group%2Fa/photo?v=1724050000000');
  });
});
