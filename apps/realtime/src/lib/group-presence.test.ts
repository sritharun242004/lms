import { describe, expect, it } from 'vitest';
import { GroupPresenceTracker } from './group-presence';

describe('GroupPresenceTracker', () => {
  it('does not mark a group active when only a super admin is viewing it', () => {
    const tracker = new GroupPresenceTracker();
    tracker.join('admin-socket', 'group-1', 'ADMIN');
    expect(tracker.query(['group-1'])['group-1'].isActive).toBe(false);

    tracker.join('coach-socket', 'group-1', 'MENTOR');
    expect(tracker.query(['group-1'])['group-1'].isActive).toBe(true);
  });

  it('marks only the room a socket actually joined as active', () => {
    const tracker = new GroupPresenceTracker();
    tracker.join('socket-1', 'group-1', 'MENTEE');
    expect(tracker.query(['group-1', 'group-2'])).toEqual({
      'group-1': { isActive: true, lastActiveAt: null },
      'group-2': { isActive: false, lastActiveAt: null },
    });
  });

  it('records last active only after the final socket leaves', () => {
    const tracker = new GroupPresenceTracker();
    tracker.join('socket-1', 'group-1', 'MENTOR');
    tracker.join('socket-2', 'group-1', 'MENTEE');
    expect(tracker.leave('socket-1', 'group-1', new Date('2026-08-21T10:00:00.000Z'))).toEqual({
      groupId: 'group-1', isActive: true, lastActiveAt: null, changed: false,
    });
    expect(tracker.leave('socket-2', 'group-1', new Date('2026-08-21T10:01:00.000Z'))).toEqual({
      groupId: 'group-1', isActive: false, lastActiveAt: '2026-08-21T10:01:00.000Z', changed: true,
    });
  });
});
