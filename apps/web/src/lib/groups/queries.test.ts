import { beforeEach, describe, expect, it, vi } from "vitest";
const findMany = vi.hoisted(() => vi.fn()); const memberFindMany = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/prisma", () => ({ prisma: { group: { findMany }, groupMember: { findMany: memberFindMany, count: vi.fn() } } }));
import { getJoinedGroups, getManagedGroups } from "./queries";
beforeEach(() => { vi.clearAllMocks(); findMany.mockResolvedValue([]); memberFindMany.mockResolvedValue([]); });
describe("group query photo contracts", () => {
  it("selects avatarUrl, not binary photo data, for managed groups", async () => { await getManagedGroups({ userId: "coach-1" }); const select = findMany.mock.calls[0][0].select; expect(select.avatarUrl).toBe(true); expect(select.profilePhoto).toBeUndefined(); });
  it("selects avatarUrl, not binary photo data, for joined groups", async () => { await getJoinedGroups("mentee-1"); const select = memberFindMany.mock.calls[0][0].select.group.select; expect(select.avatarUrl).toBe(true); expect(select.profilePhoto).toBeUndefined(); });
});
