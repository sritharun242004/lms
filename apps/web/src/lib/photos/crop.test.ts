/** @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';
import { calculateCrop, validateClientPhoto } from './crop';

describe('photo crop helpers', () => {
  it('validates supported photo declarations and the upload limit', () => {
    expect(validateClientPhoto(new File(['x'], 'photo.gif', { type: 'image/gif' }))).toEqual({ ok: false, message: 'Use a JPEG, PNG, or WebP photo.' });
    expect(validateClientPhoto(new File([], 'empty.png', { type: 'image/png' }))).toEqual({ ok: false, message: 'Choose a photo before continuing.' });
    expect(validateClientPhoto(new File(['x'], 'photo.webp', { type: 'image/webp' }))).toEqual({ ok: true });
  });

  it('calculates a centered cover crop and clamps offsets', () => {
    expect(calculateCrop({ sourceWidth: 800, sourceHeight: 400, zoom: 1, x: 0, y: 0 })).toEqual({ sx: 200, sy: 0, size: 400 });
    expect(calculateCrop({ sourceWidth: 800, sourceHeight: 400, zoom: 2, x: 1, y: 1 })).toEqual({ sx: 600, sy: 200, size: 200 });
    expect(calculateCrop({ sourceWidth: 800, sourceHeight: 400, zoom: 2, x: 9, y: -9 })).toEqual({ sx: 600, sy: 0, size: 200 });
  });
});
