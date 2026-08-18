import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(),
  getCurrentUser: vi.fn(),
  getJoinedGroups: vi.fn(),
  getManagedGroups: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/groups/queries", () => ({
  getJoinedGroups: mocks.getJoinedGroups,
  getManagedGroups: mocks.getManagedGroups,
}));

import ChatIndexPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getJoinedGroups.mockResolvedValue([]);
  mocks.getManagedGroups.mockResolvedValue([]);
});

describe("chat index navigation", () => {
  it.each([
    ["ADMIN", "admin-1"],
    ["MENTOR", "mentor-1"],
  ])("redirects %s managers to their dashboard instead of selecting a chat", async (role, id) => {
    mocks.getCurrentUser.mockResolvedValue({ id, role });

    await ChatIndexPage();

    expect(mocks.redirect).toHaveBeenCalledWith("/dashboard");
    expect(mocks.getManagedGroups).not.toHaveBeenCalled();
  });

  it("keeps a participant with one joined group entering that chat directly", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "participant-1", role: "MENTEE" });
    mocks.getJoinedGroups.mockResolvedValue([{ id: "group-1" }]);

    await ChatIndexPage();

    expect(mocks.redirect).toHaveBeenCalledWith("/chat/group-1");
  });
});
