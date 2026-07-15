import type { Server, Socket } from "socket.io";
import { UserRole } from "@cms/shared";

/**
 * Register chat-related socket event handlers.
 * Handles group room management and message broadcasting.
 */
export function registerChatHandlers(io: Server, socket: Socket) {
  const userId = socket.data.userId;
  const userRole = socket.data.role;

  // ── Join a group room ──────────────────────────────────────
  socket.on("group:join", (groupId: string) => {
    if (!groupId || typeof groupId !== "string") return;

    const room = `group:${groupId}`;
    const alreadyInRoom = socket.rooms.has(room);
    socket.join(room);
    console.log(`  → ${socket.data.userName} joined ${room}`);

    // Announce the arrival to everyone else already in the room. `socket.to`
    // excludes the joiner, who should not be told about their own arrival.
    // Re-emitting for a socket that is already in the room would announce the
    // same person twice for one arrival, so skip it; clients also dedupe.
    if (alreadyInRoom) return;
    socket.to(room).emit("presence:join", {
      groupId,
      userId,
      userName: socket.data.userName,
      role: userRole,
    });
  });

  // ── Leave a group room ─────────────────────────────────────
  socket.on("group:leave", (groupId: string) => {
    if (!groupId || typeof groupId !== "string") return;

    socket.leave(`group:${groupId}`);
    console.log(`  ← ${socket.data.userName} left group:${groupId}`);
  });

  // ── Typing indicator ───────────────────────────────────────
  socket.on(
    "user:typing",
    (data: { groupId: string; userId: string }) => {
      if (!data?.groupId) return;

      // Only mentors/admins can type (mentees are read-only)
      if (userRole === UserRole.MENTEE) return;

      socket.to(`group:${data.groupId}`).emit("user:typing", {
        groupId: data.groupId,
        userId,
      });
    }
  );
}

/**
 * Broadcast a new message to all members of a group.
 * Called from the API server (via HTTP or Redis pub/sub in production).
 */
export function broadcastMessage(io: Server, groupId: string, event: string, data: unknown) {
  io.to(`group:${groupId}`).emit(event, data);
}
