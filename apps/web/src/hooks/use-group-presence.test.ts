/** @vitest-environment jsdom */
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGroupPresence } from './use-group-presence';

const socket = vi.hoisted(() => {
  const listeners = new Map<string, (data?: unknown) => void>();
  return {
    connected: true,
    emit: vi.fn(),
    on: vi.fn((event: string, handler: (data?: unknown) => void) => listeners.set(event, handler)),
    off: vi.fn((event: string) => listeners.delete(event)),
    listeners,
  };
});

vi.mock('@/lib/socket/client', () => ({ getSocket: () => socket, connectSocket: vi.fn() }));
vi.mock('@/lib/api/services/auth-service', () => ({ authService: { socketToken: vi.fn() } }));

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  socket.listeners.clear();
  socket.emit.mockImplementation((event: string, _data: unknown, callback?: (value: unknown) => void) => {
    if (event === 'presence:groups') {
      callback?.({
        'group-1': { isActive: true, lastActiveAt: null },
        'group-2': { isActive: false, lastActiveAt: '2026-08-21T09:00:00.000Z' },
      });
    }
  });
});

describe('useGroupPresence', () => {
  it('queries room-specific state and applies realtime leave timestamps', async () => {
    const { result } = renderHook(() => useGroupPresence([
      { id: 'group-1', lastActivityAt: '2026-08-20T00:00:00.000Z' },
      { id: 'group-2', lastActivityAt: '2026-08-20T00:00:00.000Z' },
    ]));
    await waitFor(() => expect(result.current.get('group-1')?.isActive).toBe(true));
    expect(result.current.get('group-2')).toEqual({
      isActive: false,
      lastActiveAt: '2026-08-21T09:00:00.000Z',
    });
    act(() => socket.listeners.get('group:presence')?.({
      groupId: 'group-1',
      isActive: false,
      lastActiveAt: '2026-08-21T10:05:00.000Z',
    }));
    expect(result.current.get('group-1')).toEqual({
      isActive: false,
      lastActiveAt: '2026-08-21T10:05:00.000Z',
    });
  });
});
