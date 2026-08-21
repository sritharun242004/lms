export interface GroupPresenceState {
  isActive: boolean;
  lastActiveAt: string | null;
}

export interface GroupPresenceChange extends GroupPresenceState {
  groupId: string;
  changed: boolean;
}

export class GroupPresenceTracker {
  private readonly groupSockets = new Map<string, Set<string>>();
  private readonly socketGroups = new Map<string, Set<string>>();
  private readonly lastActiveAt = new Map<string, string>();

  join(socketId: string, groupId: string, role: string): GroupPresenceChange {
    if (role === 'ADMIN') {
      return {
        groupId,
        isActive: Boolean(this.groupSockets.get(groupId)?.size),
        lastActiveAt: this.lastActiveAt.get(groupId) ?? null,
        changed: false,
      };
    }
    const sockets = this.groupSockets.get(groupId) ?? new Set<string>();
    const wasActive = sockets.size > 0;
    sockets.add(socketId);
    this.groupSockets.set(groupId, sockets);

    const groups = this.socketGroups.get(socketId) ?? new Set<string>();
    groups.add(groupId);
    this.socketGroups.set(socketId, groups);

    return { groupId, isActive: true, lastActiveAt: null, changed: !wasActive };
  }

  leave(socketId: string, groupId: string, now = new Date()): GroupPresenceChange {
    const sockets = this.groupSockets.get(groupId);
    const wasActive = Boolean(sockets?.size);
    sockets?.delete(socketId);

    const groups = this.socketGroups.get(socketId);
    groups?.delete(groupId);
    if (groups?.size === 0) this.socketGroups.delete(socketId);

    if (sockets && sockets.size > 0) {
      return { groupId, isActive: true, lastActiveAt: null, changed: false };
    }

    this.groupSockets.delete(groupId);
    if (!wasActive) {
      return { groupId, isActive: false, lastActiveAt: this.lastActiveAt.get(groupId) ?? null, changed: false };
    }

    const timestamp = now.toISOString();
    this.lastActiveAt.set(groupId, timestamp);
    return { groupId, isActive: false, lastActiveAt: timestamp, changed: true };
  }

  disconnect(socketId: string, now = new Date()): GroupPresenceChange[] {
    return [...(this.socketGroups.get(socketId) ?? [])]
      .map((groupId) => this.leave(socketId, groupId, now))
      .filter((change) => change.changed);
  }

  query(groupIds: string[]): Record<string, GroupPresenceState> {
    return Object.fromEntries(groupIds.map((groupId) => [groupId, {
      isActive: Boolean(this.groupSockets.get(groupId)?.size),
      lastActiveAt: this.lastActiveAt.get(groupId) ?? null,
    }]));
  }
}
