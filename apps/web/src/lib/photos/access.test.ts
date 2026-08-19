import { UserRole, type AuthUser } from "@cms/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ count: vi.fn() }));

vi.mock("@/lib/db/prisma", () => ({
  prisma: { groupMember: { count: mocks.count } },
}));

import { canMutateOwnProfilePhoto, canViewUserPhoto } from "./access";

function user(role: UserRole, id = `${role.toLowerCase()}-1`): AuthUser {
  return {
    id,
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

describe("profile photo access policy", () => {
  it.each([UserRole.ADMIN, UserRole.MENTOR])("allows %s to mutate their own photo", (role) => {
    expect(canMutateOwnProfilePhoto(user(role))).toBe(true);
  });

  it("keeps Participants view-only for their own profile photo", () => {
    expect(canMutateOwnProfilePhoto(user(UserRole.MENTEE))).toBe(false);
  });

  it("allows a user to view their own photo without a membership lookup", async () => {
    await expect(canViewUserPhoto(user(UserRole.MENTEE, "mentee-1"), "mentee-1")).resolves.toBe(true);
    expect(mocks.count).not.toHaveBeenCalled();
  });

  it("allows an Admin to view any user photo without a membership lookup", async () => {
    await expect(canViewUserPhoto(user(UserRole.ADMIN), "stranger")).resolves.toBe(true);
    expect(mocks.count).not.toHaveBeenCalled();
  });

  it("allows a Participant to view a photo when both users share a group", async () => {
    mocks.count.mockResolvedValueOnce(1);

    await expect(canViewUserPhoto(user(UserRole.MENTEE), "coach")).resolves.toBe(true);
    expect(mocks.count).toHaveBeenCalledWith({
      where: {
        userId: "mentee-1",
        group: { members: { some: { userId: "coach" } } },
      },
    });
  });

  it("denies a Participant who does not share a group with the target", async () => {
    mocks.count.mockResolvedValueOnce(0);

    await expect(canViewUserPhoto(user(UserRole.MENTEE), "stranger")).resolves.toBe(false);
  });
});
