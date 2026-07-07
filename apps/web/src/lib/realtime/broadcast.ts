const SOCKET_INTERNAL_URL = process.env.SOCKET_INTERNAL_URL || "http://localhost:4000";
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || "dev-internal-secret-change-in-production";

/**
 * Fire-and-forget push to the realtime server so connected clients get
 * an instant update. The REST API is always the source of truth — if
 * the realtime server is unreachable, clients simply fall back to
 * their next poll, so failures here are swallowed rather than thrown.
 */
export function broadcastToGroup(groupId: string, event: string, data: unknown): void {
  fetch(`${SOCKET_INTERNAL_URL}/internal/broadcast`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": INTERNAL_SECRET,
    },
    body: JSON.stringify({ groupId, event, data }),
    signal: AbortSignal.timeout(1500),
  }).catch(() => {
    // Realtime server is optional infrastructure — never fail the request over it.
  });
}
