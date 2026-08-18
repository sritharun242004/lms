import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  findUser: vi.fn(),
  verifyRefreshToken: vi.fn(),
  generateAccessToken: vi.fn(),
  generateRefreshToken: vi.fn(),
  setAuthCookies: vi.fn(),
  clearAuthCookies: vi.fn(),
  storeRefreshToken: vi.fn(),
  revokeRefreshToken: vi.fn(),
  isRefreshTokenValid: vi.fn(),
  getRefreshTokenFromCookies: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: { user: { findUnique: mocks.findUser } },
}));

vi.mock("@/lib/auth", () => ({
  verifyRefreshToken: mocks.verifyRefreshToken,
  generateAccessToken: mocks.generateAccessToken,
  generateRefreshToken: mocks.generateRefreshToken,
  setAuthCookies: mocks.setAuthCookies,
  clearAuthCookies: mocks.clearAuthCookies,
  storeRefreshToken: mocks.storeRefreshToken,
  revokeRefreshToken: mocks.revokeRefreshToken,
  isRefreshTokenValid: mocks.isRefreshTokenValid,
  getRefreshTokenFromCookies: mocks.getRefreshTokenFromCookies,
}));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyRefreshToken.mockReturnValue({ sub: "coach-1", role: "MENTOR", authVersion: 0 });
  mocks.isRefreshTokenValid.mockResolvedValue(true);
  mocks.revokeRefreshToken.mockResolvedValue(undefined);
  mocks.clearAuthCookies.mockResolvedValue(undefined);
});

describe("refresh active-account enforcement", () => {
  it("revokes and rejects refresh for an inactive account before issuing new tokens", async () => {
    mocks.findUser.mockResolvedValue({
      id: "coach-1",
      name: "Coach One",
      email: "coach@example.com",
      role: "MENTOR",
      avatarUrl: null,
      emailVerified: true,
      isActive: false,
      authVersion: 0,
    });
    const request = new NextRequest("http://localhost/api/v1/auth/refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: "refresh-token" }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("ACCOUNT_DISABLED");
    expect(mocks.revokeRefreshToken).toHaveBeenCalledWith("refresh-token");
    expect(mocks.clearAuthCookies).toHaveBeenCalledOnce();
    expect(mocks.generateAccessToken).not.toHaveBeenCalled();
    expect(mocks.generateRefreshToken).not.toHaveBeenCalled();
  });

  it("revokes and rejects a refresh token whose auth version is stale", async () => {
    mocks.findUser.mockResolvedValue({
      id: "coach-1", name: "Coach One", email: "coach@example.com", role: "MENTOR",
      avatarUrl: null, emailVerified: true, isActive: true, authVersion: 1,
    });
    const request = new NextRequest("http://localhost/api/v1/auth/refresh", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: "refresh-token" }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("STALE_SESSION");
    expect(mocks.revokeRefreshToken).toHaveBeenCalledWith("refresh-token");
    expect(mocks.clearAuthCookies).toHaveBeenCalledOnce();
    expect(mocks.generateAccessToken).not.toHaveBeenCalled();
  });
});
