/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ProfilePage from './page';

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), replaceUser: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock('@/providers/auth-provider', () => ({ useAuth: () => ({ replaceUser: mocks.replaceUser }) }));
afterEach(cleanup);

describe('ProfilePage photo controls', () => {
  it.each(['ADMIN', 'MENTOR'] as const)('lets %s manage their own profile photo', async (role) => {
    mocks.getCurrentUser.mockResolvedValue({
      id: `${role.toLowerCase()}-1`, name: 'Asha Coach', email: 'asha@example.com',
      role, avatarUrl: null, emailVerified: true,
    });
    render(await ProfilePage());
    expect(screen.getByRole('button', { name: 'Add Asha Coach photo' })).toBeTruthy();
  });

  it('keeps a participant profile photo view-only', async () => {
    mocks.getCurrentUser.mockResolvedValue({
      id: 'mentee-1', name: 'Ravi Participant', email: null, role: 'MENTEE',
      avatarUrl: '/api/v1/users/mentee-1/photo?v=1', emailVerified: false,
    });
    render(await ProfilePage());
    expect(screen.getByRole('button', { name: 'View Ravi Participant photo' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /change ravi participant photo/i })).toBeNull();
  });
});
