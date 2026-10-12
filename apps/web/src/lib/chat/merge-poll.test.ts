import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/lib/api/services/message-service";
import { applyPollVoteEvent, mergeLatest } from "./merge";

const poll = (votes: number[], myVote: string | null) => ({
  id: "p",
  question: "Q",
  chartType: "BAR",
  allowMultiple: false,
  options: votes.map((voteCount, i) => ({ id: `o${i}`, text: `O${i}`, voteCount })),
  totalVotes: votes.reduce((a, b) => a + b, 0),
  myVote,
});
const msg = (id: string, createdAt: string, p?: ReturnType<typeof poll>) =>
  ({ id, createdAt, content: id, type: p ? "POLL" : "TEXT", poll: p ?? null }) as unknown as ChatMessage;

describe("mergeLatest with keepLocalPoll", () => {
  const local = [msg("m1", "2026-10-12T09:00:00Z", poll([4, 5, 3, 5], "o3"))];
  const staleLatest = [msg("m1", "2026-10-12T09:00:00Z", poll([4, 5, 4, 4], "o2"))];

  it("keeps the newer local poll when the batch was requested before the vote", () => {
    const merged = mergeLatest(local, staleLatest, { keepLocalPoll: () => true });
    expect(merged[0].poll).toEqual(local[0].poll);
  });

  it("takes the server's poll when no local write happened after the request", () => {
    const merged = mergeLatest(local, staleLatest, { keepLocalPoll: () => false });
    expect(merged[0].poll).toEqual(staleLatest[0].poll);
    expect(mergeLatest(local, staleLatest)[0].poll).toEqual(staleLatest[0].poll);
  });

  it("only protects the polls it is asked about", () => {
    const existing = [local[0], msg("m2", "2026-10-12T09:01:00Z", poll([1, 1], null))];
    const latest = [
      staleLatest[0],
      msg("m2", "2026-10-12T09:01:00Z", poll([2, 1], "o0")),
      msg("m3", "2026-10-12T09:02:00Z"),
    ];
    const merged = mergeLatest(existing, latest, { keepLocalPoll: (id) => id === "m1" });
    expect(merged.find((m) => m.id === "m1")!.poll).toEqual(local[0].poll);
    expect(merged.find((m) => m.id === "m2")!.poll).toEqual(latest[1].poll); // fresh data still flows
    expect(merged.map((m) => m.id)).toEqual(["m1", "m2", "m3"]); // new messages still arrive
  });

  it("still applies every non-poll field of an incoming message", () => {
    const edited = [{ ...staleLatest[0], content: "edited", isEdited: true } as ChatMessage];
    const merged = mergeLatest(local, edited, { keepLocalPoll: () => true });
    expect(merged[0].content).toBe("edited");
    expect(merged[0].poll).toEqual(local[0].poll);
  });
});

describe("applyPollVoteEvent", () => {
  const event = { messageId: "m1", options: [{ id: "o1", voteCount: 7 }, { id: "o2", voteCount: 2 }], totalVotes: 20 };
  const start = [msg("m1", "2026-10-12T09:00:00Z", poll([4, 5, 3, 5], "o3")), msg("m2", "2026-10-12T09:01:00Z")];

  it("sets absolute counts and leaves the viewer's own vote alone", () => {
    const next = applyPollVoteEvent(start, event);
    expect(next[0].poll!.options.map((o) => o.voteCount)).toEqual([4, 7, 2, 5]);
    expect(next[0].poll!.totalVotes).toBe(20);
    expect(next[0].poll!.myVote).toBe("o3");
    expect(next[1]).toBe(start[1]);
  });

  it("is idempotent: duplicate delivery of the same event changes nothing", () => {
    const once = applyPollVoteEvent(start, event);
    const twice = applyPollVoteEvent(once, event);
    const thrice = applyPollVoteEvent(twice, event);
    expect(thrice[0].poll).toEqual(once[0].poll);
  });

  it("ignores events for unknown messages", () => {
    expect(applyPollVoteEvent(start, { ...event, messageId: "nope" })).toEqual(start);
  });
});
