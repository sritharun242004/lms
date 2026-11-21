import { describe, expect, it, vi } from "vitest";

vi.mock("../lib/prisma", () => ({ prisma: {} }));

import { registerChatHandlers } from "./chat";
import type { GroupPresenceTracker } from "../lib/group-presence";

function setup(role: string, canView: boolean) {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const rooms = new Set<string>();
  const roomEmit = vi.fn();
  const socket = {
    id: "socket-1",
    connected: true,
    data: { userId: "user-1", role, userName: "Tester" },
    rooms,
    on: (event: string, handler: (...args: unknown[]) => unknown) => handlers.set(event, handler),
    join: vi.fn((room: string) => rooms.add(room)),
    leave: vi.fn(),
    to: vi.fn(() => ({ emit: roomEmit })),
  };
  const io = { emit: vi.fn() };
  const groupPresence = { join: vi.fn(() => ({ changed: false })), leave: vi.fn() } as unknown as GroupPresenceTracker;
  const canViewGroup = vi.fn(async () => canView);
  registerChatHandlers(io as never, socket as never, groupPresence, canViewGroup);
  return { handlers, socket, roomEmit, canViewGroup };
}

describe("group:join", () => {
  it("refuses a socket whose user is not in the group", async () => {
    const { handlers, socket, canViewGroup } = setup("MENTEE", false);
    await handlers.get("group:join")!("other-group");
    expect(canViewGroup).toHaveBeenCalledWith("user-1", "MENTEE", "other-group");
    expect(socket.join).not.toHaveBeenCalled();
  });

  it("lets a member into the room", async () => {
    const { handlers, socket } = setup("MENTEE", true);
    await handlers.get("group:join")!("my-group");
    expect(socket.join).toHaveBeenCalledWith("group:my-group");
  });
});

describe("user:typing", () => {
  it("is ignored for a room the socket never joined", async () => {
    const { handlers, roomEmit } = setup("MENTOR", true);
    handlers.get("user:typing")!({ groupId: "elsewhere", userId: "user-1" });
    expect(roomEmit).not.toHaveBeenCalled();
  });

  it("reaches a room the socket joined", async () => {
    const { handlers, roomEmit } = setup("MENTOR", true);
    await handlers.get("group:join")!("mine");
    handlers.get("user:typing")!({ groupId: "mine", userId: "user-1" });
    expect(roomEmit).toHaveBeenCalledWith("user:typing", { groupId: "mine", userId: "user-1" });
  });
});
