/** @vitest-environment jsdom */
import { createElement, type ReactNode } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GroupCard } from './group-card';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) =>
    createElement('a', { href, ...props }, children),
}));
vi.mock('@/hooks/use-confirm', () => ({ useConfirm: () => [vi.fn(), null] }));
vi.mock('@/components/groups/group-members-dialog', () => ({
  GroupMembersDialog: ({ trigger }: { trigger: ReactNode }) => createElement('div', null, trigger),
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function group(canManage = true) {
  return {
    id: 'group-42', name: 'Design cohort', description: null, wallpaperUrl: null,
    avatarUrl: null, createdAt: '2026-08-18T00:00:00.000Z',
    lastActivityAt: '2026-08-21T10:00:00.000Z', mentorName: 'Asha Coach',
    memberCount: 4, memberIds: [], inviteCode: null, canManage,
  };
}

describe('GroupCard live presence and photo controls', () => {
  it('advances the relative last-active label while the dashboard stays open', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-21T10:01:00.000Z'));
    render(createElement(GroupCard, { group: group(), onChanged: vi.fn(), isActive: false }));
    expect(screen.getByText('Last active 1m ago')).toBeTruthy();
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByText('Last active 2m ago')).toBeTruthy();
  });

  it('shows group photo controls to managers', () => {
    render(createElement(GroupCard, { group: group(), onChanged: vi.fn() }));
    expect(screen.getByRole('button', { name: 'Add Design cohort group photo' })).toBeTruthy();
  });

  it('keeps group photo controls view-only for participants', () => {
    render(createElement(GroupCard, { group: { ...group(false), avatarUrl: '/api/v1/groups/group-42/photo?v=1' }, onChanged: vi.fn() }));
    expect(screen.getByRole('button', { name: 'View Design cohort group photo' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /change design cohort group photo/i })).toBeNull();
  });
});
