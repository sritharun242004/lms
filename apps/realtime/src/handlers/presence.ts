import type { Server, Socket } from "socket.io";

/**
 * Register presence-related socket event handlers.
 * Tracks online/offline status and provides user presence queries.
 */
export function registerPresenceHandlers(
  io: Server,
  socket: Socket,
  onlineUsers: Map<string, Set<string>>
) {
  // ── Get online users for a group ───────────────────────────
  socket.on(
    "presence:query",
    (data: { userIds: string[] }, callback: (result: Record<string, boolean>) => void) => {
      if (!data?.userIds || !Array.isArray(data.userIds)) return;
      if (typeof callback !== "function") return;

      const result: Record<string, boolean> = {};
      for (const uid of data.userIds) {
        result[uid] = onlineUsers.has(uid);
      }
      callback(result);
    }
  );

  // ── Heartbeat / keep alive ─────────────────────────────────
  socket.on("presence:heartbeat", () => {
    // Refresh the user's online status
    const userId = socket.data.userId;
    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }
    onlineUsers.get(userId)!.add(socket.id);
  });
}
