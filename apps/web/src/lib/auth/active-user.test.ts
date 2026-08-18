import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  accessToken: "",
  findUser: vi.fn(),
  updateSessions: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: () => (mocks.accessToken ? { value: mocks.accessToken } : undefined),
    set: vi.fn(),
    delete: vi.fn(),
  })),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.findUser },
    session: { updateMany: mocks.updateSessions },
  },
}));

import { generateAccessToken, getCurrentUser, hashPassword, revokeAllUserSessions } from "./index";

const persistedUser = {
  id: "coach-1",
  name: "Coach One",
  email: "coach@example.com",
  role: "MENTOR" as const,
  avatarUrl: null,
  emailVerified: true,
  isActive: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.accessToken = generateAccessToken(persistedUser);
});

describe("current user active-account enforcement", () => {
  it("returns null for a disabled account even when its access token is valid", async () => {
    mocks.findUser.mockResolvedValue({ ...persistedUser, isActive: false });

    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it("returns the public auth shape for an active account without leaking active-state internals", async () => {
    mocks.findUser.mockResolvedValue(persistedUser);

    await expect(getCurrentUser()).resolves.toEqual({
      id: "coach-1",
      name: "Coach One",
      email: "coach@example.com",
      role: "MENTOR",
      avatarUrl: null,
      emailVerified: true,
    });
  });
});

describe("session revocation", () => {
  it("marks every currently active session for the user inactive", async () => {
    mocks.updateSessions.mockResolvedValue({ count: 2 });

    await revokeAllUserSessions("coach-1");

    expect(mocks.updateSessions).toHaveBeenCalledWith({
      where: { userId: "coach-1", isActive: true },
      data: { isActive: false },
    });
  });
});

describe("password hashing policy", () => {
  it("uses bcrypt cost 12 without embedding the plaintext password", async () => {
    const hash = await hashPassword("StrongPass1!");

    expect(hash).toMatch(/^\$2[aby]\$12\$/);
    expect(hash).not.toContain("StrongPass1!");
  });
});
