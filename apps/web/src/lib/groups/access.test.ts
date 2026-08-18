import { UserRole, type AuthUser } from "@cms/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findUnique: vi.fn() }));

vi.mock("@/lib/db/prisma", () => ({
  prisma: { groupMember: { findUnique: mocks.findUnique } },
}));

import { getGroupAccess } from "./access";

function user(role: UserRole): AuthUser {
  return {
    id: `${role.toLowerCase()}-1`,
    name: "Portal User",
    email: "user@example.com",
    role,
    avatarUrl: null,
    emailVerified: true,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("group access management boundary", () => {
  it("lets an ADMIN manage without a membership lookup", async () => {
    await expect(getGroupAccess("group-1", user(UserRole.ADMIN))).resolves.toEqual({
      canView: true,
      canManage: true,
    });

    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it.each([
    ["OWNER", true],
    ["MENTOR", true],
    ["MEMBER", false],
  ] as const)("lets a MENTOR manage only with a %s membership", async (membershipRole, canManage) => {
    mocks.findUnique.mockResolvedValue({ role: membershipRole });

    await expect(getGroupAccess("group-1", user(UserRole.MENTOR))).resolves.toEqual({
      canView: true,
      canManage,
    });
  });

  it.each(["OWNER", "MENTOR", "MEMBER"] as const)(
    "never lets a MENTEE manage even when the membership is malformed as %s",
    async (membershipRole) => {
      mocks.findUnique.mockResolvedValue({ role: membershipRole });

      await expect(getGroupAccess("group-1", user(UserRole.MENTEE))).resolves.toEqual({
        canView: true,
        canManage: false,
      });
    }
  );

  it.each([UserRole.MENTOR, UserRole.MENTEE] as const)("denies %s users with no membership", async (role) => {
    mocks.findUnique.mockResolvedValue(null);

    await expect(getGroupAccess("group-1", user(role))).resolves.toEqual({
      canView: false,
      canManage: false,
    });
  });
});
