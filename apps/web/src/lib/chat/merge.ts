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
 *
 * `keepLocalPoll(id)` marks messages whose poll was updated locally (a vote
 * result applied) AFTER this batch was requested. The batch was read from the
 * server before that vote, so its poll is stale; keeping the local poll stops
 * a slow refresh from rolling a bar back and then forward again.
 * `keepLocalScale(id)` does the same for a Scale whose response was just saved.
 */
export function mergeLatest(
  existing: ChatMessage[],
  latest: ChatMessage[],
  options: {
    keepLocalPoll?: (messageId: string) => boolean;
    keepLocalScale?: (messageId: string) => boolean;
  } = {}
): ChatMessage[] {
  if (latest.length === 0) return existing;
  if (options.keepLocalPoll) {
    const byId = new Map(existing.map((m) => [m.id, m]));
    latest = latest.map((incoming) => {
      const local = byId.get(incoming.id);
      return incoming.poll && local?.poll && options.keepLocalPoll!(incoming.id)
        ? { ...incoming, poll: local.poll }
        : incoming;
    });
  }
  if (options.keepLocalScale) {
    const byId = new Map(existing.map((m) => [m.id, m]));
    latest = latest.map((incoming) => {
      const local = byId.get(incoming.id);
      return incoming.scale && local?.scale && options.keepLocalScale!(incoming.id)
        ? { ...incoming, scale: local.scale }
        : incoming;
    });
  }
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

/**
 * Apply a counts-only `poll:vote` socket event. It carries absolute counts, so
 * applying the same event twice (duplicate delivery) is a no-op: it never adds
 * a vote on top of itself, and it leaves the viewer's own `myVote` alone.
 */
export function applyPollVoteEvent(
  messages: ChatMessage[],
  event: { messageId: string; options: { id: string; voteCount: number }[]; totalVotes: number }
): ChatMessage[] {
  return messages.map((m) => {
    if (m.id !== event.messageId || !m.poll) return m;
    const options = m.poll.options.map((o) => {
      const updated = event.options.find((u) => u.id === o.id);
      return updated ? { ...o, voteCount: updated.voteCount } : o;
    });
    return { ...m, poll: { ...m.poll, options, totalVotes: event.totalVotes } };
  });
}
