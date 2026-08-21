import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  notFound: vi.fn(),
  redirect: vi.fn(),
  getCurrentUser: vi.fn(),
  getGroupAccess: vi.fn(),
  getGroupHeader: vi.fn(),
  getInitialMessages: vi.fn(),
  getActiveInviteCode: vi.fn(),
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound, redirect: mocks.redirect }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/groups/access", () => ({ getGroupAccess: mocks.getGroupAccess }));
vi.mock("@/lib/groups/queries", () => ({ getActiveInviteCode: mocks.getActiveInviteCode }));
vi.mock("@/lib/messages/queries", () => ({
  getGroupHeader: mocks.getGroupHeader,
  getInitialMessages: mocks.getInitialMessages,
}));
vi.mock("@/components/chat/chat-thread", () => ({ ChatThread: () => null }));

import GroupChatPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "user-1", role: "MENTOR" });
  mocks.getGroupHeader.mockResolvedValue({
    name: "Design cohort",
    description: "Weekly work",
    avatarUrl: "/api/v1/groups/group-1/photo?v=1",
    _count: { members: 4 },
  });
  mocks.getInitialMessages.mockResolvedValue({ messages: [], hasMore: false });
  mocks.getActiveInviteCode.mockResolvedValue({ code: "JOIN-42", isActive: true });
});

describe("group chat role-shaped code data", () => {
  it("passes the active code to an authorized manager only after access is established", async () => {
    mocks.getGroupAccess.mockResolvedValue({ canView: true, canManage: true });

    const tree = await GroupChatPage({ params: Promise.resolve({ groupId: "group-1" }) });

    expect(mocks.getActiveInviteCode).toHaveBeenCalledWith("group-1");
    expect(tree.props).toMatchObject({
      canManage: true,
      groupCode: "JOIN-42",
      groupAvatarUrl: "/api/v1/groups/group-1/photo?v=1",
      backHref: "/dashboard",
    });
  });

  it("does not query or pass a group code to a participant", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "participant-1", role: "MENTEE" });
    mocks.getGroupAccess.mockResolvedValue({ canView: true, canManage: false });

    const tree = await GroupChatPage({ params: Promise.resolve({ groupId: "group-1" }) });

    expect(mocks.getActiveInviteCode).not.toHaveBeenCalled();
    expect(tree.props).toMatchObject({
      canManage: false,
      groupCode: null,
      backHref: null,
    });
  });
});
