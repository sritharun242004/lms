import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/lib/api/services/message-service";
import { mergeLatest, upsertMessage } from "./merge";

// Minimal factory — the merge logic only reads `id`, `content`, and
// `createdAt`, so the rest is padded to satisfy the type.
function msg(id: string, createdAt: string, content = id): ChatMessage {
  return {
    id,
    content,
    type: "TEXT",
    groupId: "g1",
    senderId: "u1",
    sender: { id: "u1", name: "Mentor", email: null, role: "MENTOR", avatarUrl: null, status: "ONLINE" },
    attachmentUrl: null,
    attachmentName: null,
    isPinned: false,
    isEdited: false,
    isDeleted: false,
    createdAt,
    updatedAt: createdAt,
  } as ChatMessage;
}

describe("mergeLatest", () => {
  it("delivers a mentor's new message into a mentee's thread without a reload", () => {
    const existing = [msg("a", "2026-07-13T10:00:00.000Z"), msg("b", "2026-07-13T10:01:00.000Z")];
    const latest = [...existing, msg("c", "2026-07-13T10:02:00.000Z")];

    const merged = mergeLatest(existing, latest);

    expect(merged.map((m) => m.id)).toEqual(["a", "b", "c"]);
  });

  it("refreshes an edited message in place", () => {
    const existing = [msg("a", "2026-07-13T10:00:00.000Z", "hello")];
    const latest = [msg("a", "2026-07-13T10:00:00.000Z", "hello (edited)")];

    const merged = mergeLatest(existing, latest);

    expect(merged).toHaveLength(1);
    expect(merged[0].content).toBe("hello (edited)");
  });

  it("removes a message deleted within the fetched window", () => {
    const existing = [msg("a", "2026-07-13T10:00:00.000Z"), msg("b", "2026-07-13T10:01:00.000Z")];
    const latest = [msg("a", "2026-07-13T10:00:00.000Z")]; // b was deleted

    const merged = mergeLatest(existing, latest);

    expect(merged.map((m) => m.id)).toEqual(["a"]);
  });

  it("keeps older messages loaded above the fetched window", () => {
    const older = msg("old", "2026-07-13T09:00:00.000Z");
    const existing = [older, msg("a", "2026-07-13T10:00:00.000Z")];
    const latest = [msg("a", "2026-07-13T10:00:00.000Z"), msg("b", "2026-07-13T10:01:00.000Z")];

    const merged = mergeLatest(existing, latest);

    expect(merged.map((m) => m.id)).toEqual(["old", "a", "b"]);
  });

  it("returns messages in chronological order even if fetched out of order", () => {
    const existing: ChatMessage[] = [];
    const latest = [msg("b", "2026-07-13T10:01:00.000Z"), msg("a", "2026-07-13T10:00:00.000Z")];

    const merged = mergeLatest(existing, latest);

    expect(merged.map((m) => m.id)).toEqual(["a", "b"]);
  });

  it("no-ops on an empty fetch (never wipes the thread)", () => {
    const existing = [msg("a", "2026-07-13T10:00:00.000Z")];
    expect(mergeLatest(existing, [])).toBe(existing);
  });
});

describe("upsertMessage", () => {
  it("appends an unseen message", () => {
    const list = [msg("a", "2026-07-13T10:00:00.000Z")];
    expect(upsertMessage(list, msg("b", "2026-07-13T10:01:00.000Z")).map((m) => m.id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("replaces an existing message by id", () => {
    const list = [msg("a", "2026-07-13T10:00:00.000Z", "v1")];
    const out = upsertMessage(list, msg("a", "2026-07-13T10:00:00.000Z", "v2"));
    expect(out).toHaveLength(1);
    expect(out[0].content).toBe("v2");
  });
});
