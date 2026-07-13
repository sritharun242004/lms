import type { ChatMessage } from "@/lib/api/services/message-service";

/** Add `incoming` to the list, replacing any existing message with the same id. */
export function upsertMessage(messages: ChatMessage[], incoming: ChatMessage): ChatMessage[] {
  const index = messages.findIndex((m) => m.id === incoming.id);
  if (index === -1) return [...messages, incoming];
  const next = messages.slice();
  next[index] = incoming;
  return next;
}

/**
 * Reconcile the current thread with a freshly fetched batch of the newest
 * messages. This is the polling fallback that keeps chats live even when the
 * realtime socket server is unreachable: new messages are added, edited ones
 * are refreshed, and messages deleted within the fetched window disappear.
 * Older messages already loaded above the window are left untouched.
 */
export function mergeLatest(existing: ChatMessage[], latest: ChatMessage[]): ChatMessage[] {
  if (latest.length === 0) return existing;
  const oldestInWindow = latest[0].createdAt;
  const latestIds = new Set(latest.map((m) => m.id));
  // Drop messages that fall inside the fetched window but are no longer
  // present (deleted elsewhere); keep everything older than the window.
  const kept = existing.filter((m) => m.createdAt < oldestInWindow || latestIds.has(m.id));
  let merged = kept;
  for (const message of latest) merged = upsertMessage(merged, message);
  return merged
    .slice()
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
}
