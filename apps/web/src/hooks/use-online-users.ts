"use client";

import * as React from "react";
import { authService } from "@/lib/api/services/auth-service";
import { connectSocket, getSocket } from "@/lib/socket/client";

/**
 * Tracks which of the given user IDs are online right now, via the realtime
 * presence server. Dashboards use this to show a live "Active" indicator on
 * a group card instead of always falling back to the last-activity time.
 * Best-effort: if the socket never connects, it just returns an empty set
 * and callers fall back to showing last-active timestamps.
 */
const EMPTY_SET: Set<string> = new Set();

export function useOnlineUsers(userIds: string[]): Set<string> {
  const idsKey = React.useMemo(() => Array.from(new Set(userIds)).sort().join(","), [userIds]);
  const [online, setOnline] = React.useState<Set<string>>(EMPTY_SET);

  React.useEffect(() => {
    if (!idsKey) return;
    const ids = idsKey.split(",");

    let cancelled = false;

    function query() {
      getSocket().emit("presence:query", { userIds: ids }, (result: Record<string, boolean>) => {
        if (cancelled) return;
        setOnline(new Set(ids.filter((id) => result[id])));
      });
    }

    function handleOnline(data: { userId: string; status: "ONLINE" | "OFFLINE" }) {
      if (!ids.includes(data.userId)) return;
      setOnline((prev) => {
        const next = new Set(prev);
        if (data.status === "ONLINE") next.add(data.userId);
        else next.delete(data.userId);
        return next;
      });
    }

    async function start() {
      const socket = getSocket();
      socket.on("connect", query);
      socket.on("user:online", handleOnline);

      if (socket.connected) {
        query();
        return;
      }

      try {
        const res = await authService.socketToken();
        if (cancelled || !res.success || !res.data?.token) return;
        connectSocket(res.data.token);
      } catch {
        // Presence is best-effort — leave the set empty on failure.
      }
    }

    start();

    return () => {
      cancelled = true;
      const socket = getSocket();
      socket.off("connect", query);
      socket.off("user:online", handleOnline);
    };
  }, [idsKey]);

  return idsKey ? online : EMPTY_SET;
}
