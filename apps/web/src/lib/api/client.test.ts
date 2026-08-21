/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from './client';

afterEach(() => vi.restoreAllMocks());

describe('multipart API client', () => {
  it('sends PUT FormData with credentials and lets fetch set Content-Type', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: { ok: true } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const form = new FormData();
    form.set('photo', new File(['bytes'], 'photo.webp', { type: 'image/webp' }));
    await apiClient.putForm('/profile/photo', form);
    const [, config] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(config.method).toBe('PUT');
    expect(config.body).toBe(form);
    expect(config.credentials).toBe('include');
    expect(new Headers(config.headers).has('Content-Type')).toBe(false);
  });
});
