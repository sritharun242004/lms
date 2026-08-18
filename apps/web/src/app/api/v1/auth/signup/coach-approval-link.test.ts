import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  findUser: vi.fn(),
  findApproval: vi.fn(),
  createUser: vi.fn(),
  updateApproval: vi.fn(),
  transaction: vi.fn(),
  hashPassword: vi.fn(),
  generateAccessToken: vi.fn(),
  generateRefreshToken: vi.fn(),
  storeRefreshToken: vi.fn(),
  setAuthCookies: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.findUser },
    coachEmailApproval: { findUnique: mocks.findApproval },
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/auth", () => ({
  hashPassword: mocks.hashPassword,
  generateAccessToken: mocks.generateAccessToken,
  generateRefreshToken: mocks.generateRefreshToken,
  storeRefreshToken: mocks.storeRefreshToken,
  setAuthCookies: mocks.setAuthCookies,
}));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findUser.mockResolvedValue(null);
  mocks.findApproval.mockResolvedValue({
    id: "approval-1",
    email: "coach@example.com",
    claimedAt: null,
    claimedById: null,
  });
  mocks.hashPassword.mockResolvedValue("bcrypt-hash");
  mocks.createUser.mockResolvedValue({
    id: "coach-1",
    name: "Coach One",
    email: "coach@example.com",
    role: "MENTOR",
    avatarUrl: null,
    emailVerified: true,
  });
  mocks.updateApproval.mockResolvedValue({});
  mocks.transaction.mockImplementation(async (callback) =>
    callback({
      user: { create: mocks.createUser },
      coachEmailApproval: { update: mocks.updateApproval },
    })
  );
  mocks.generateAccessToken.mockReturnValue("access-token");
  mocks.generateRefreshToken.mockReturnValue("refresh-token");
  mocks.storeRefreshToken.mockResolvedValue(undefined);
  mocks.setAuthCookies.mockResolvedValue(undefined);
});

describe("approved coach signup", () => {
  it("atomically links the claimed approval to the newly created mentor account", async () => {
    const request = new NextRequest("http://localhost/api/v1/auth/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Coach One",
        email: "Coach@Example.com",
        password: "StrongPass1!",
        confirmPassword: "StrongPass1!",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(mocks.updateApproval).toHaveBeenCalledWith({
      where: { id: "approval-1" },
      data: { claimedAt: expect.any(Date), claimedById: "coach-1" },
    });
    expect(JSON.stringify(body)).not.toContain("StrongPass1!");
    expect(JSON.stringify(body)).not.toContain("bcrypt-hash");
  });
});
