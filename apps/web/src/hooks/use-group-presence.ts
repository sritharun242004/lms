'use client';

import * as React from 'react';
import { authService } from '@/lib/api/services/auth-service';
import { connectSocket, getSocket } from '@/lib/socket/client';

export interface GroupPresenceState {
  isActive: boolean;
  lastActiveAt: string;
}

interface GroupPresenceEvent {
  groupId: string;
  isActive: boolean;
  lastActiveAt: string | null;
}

export function useGroupPresence(groups: { id: string; lastActivityAt: string }[]): Map<string, GroupPresenceState> {
  const groupsKey = JSON.stringify(
    groups.map((group) => [group.id, group.lastActivityAt] as const).sort(([left], [right]) => left.localeCompare(right))
  );
  const fallbackById = React.useMemo(
    () => new Map<string, string>(JSON.parse(groupsKey)),
    [groupsKey]
  );
  const [presence, setPresence] = React.useState<Map<string, GroupPresenceState>>(
    () => new Map(groups.map((group) => [group.id, { isActive: false, lastActiveAt: group.lastActivityAt }]))
  );

  React.useEffect(() => {
    if (!groupsKey) return;
    const groupIds = [...fallbackById.keys()];
    let cancelled = false;

    function applyEvent(event: GroupPresenceEvent) {
      if (!fallbackById.has(event.groupId)) return;
      setPresence((current) => {
        const next = new Map(current);
        next.set(event.groupId, {
          isActive: event.isActive,
          lastActiveAt: event.lastActiveAt ?? next.get(event.groupId)?.lastActiveAt ?? fallbackById.get(event.groupId)!,
        });
        return next;
      });
    }

    function query() {
      getSocket().emit('presence:groups', { groupIds }, (result: Record<string, { isActive: boolean; lastActiveAt: string | null }>) => {
        if (cancelled) return;
        setPresence(new Map(groupIds.map((groupId) => [groupId, {
          isActive: Boolean(result[groupId]?.isActive),
          lastActiveAt: result[groupId]?.lastActiveAt ?? fallbackById.get(groupId)!,
        }])));
      });
    }

    async function start() {
      const socket = getSocket();
      socket.on('connect', query);
      socket.on('group:presence', applyEvent);
      if (socket.connected) return query();
      const response = await authService.socketToken().catch(() => null);
      if (!cancelled && response?.success && response.data?.token) connectSocket(response.data.token);
    }

    void start();
    return () => {
      cancelled = true;
      const socket = getSocket();
      socket.off('connect', query);
      socket.off('group:presence', applyEvent);
    };
  }, [groupsKey, fallbackById]);

  return presence;
}
