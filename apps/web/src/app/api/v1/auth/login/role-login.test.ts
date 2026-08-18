import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  findUser: vi.fn(),
  updateUser: vi.fn(),
  createSession: vi.fn(),
  createAuditLog: vi.fn(),
  verifyPassword: vi.fn(),
  generateAccessToken: vi.fn(),
  generateRefreshToken: vi.fn(),
  setAuthCookies: vi.fn(),
  storeRefreshToken: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.findUser, update: mocks.updateUser },
    session: { create: mocks.createSession },
    auditLog: { create: mocks.createAuditLog },
  },
}));

vi.mock("@/lib/auth", () => ({
  verifyPassword: mocks.verifyPassword,
  generateAccessToken: mocks.generateAccessToken,
  generateRefreshToken: mocks.generateRefreshToken,
  setAuthCookies: mocks.setAuthCookies,
  storeRefreshToken: mocks.storeRefreshToken,
}));

import { POST as staffLogin } from "../admin/login/route";

function user(role: "MENTEE" | "MENTOR" | "ADMIN") {
  return {
    id: `${role.toLowerCase()}-1`,
    name: role === "MENTOR" ? "Coach One" : "Admin One",
    email: `${role.toLowerCase()}@example.com`,
    password: "hash",
    role,
    avatarUrl: null,
    emailVerified: true,
    status: "OFFLINE",
    isActive: true,
    authVersion: 0,
  };
}

function request() {
  return new NextRequest("http://localhost/api/v1/auth/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "person@example.com", password: "Password123!", rememberMe: false }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyPassword.mockResolvedValue(true);
  mocks.generateAccessToken.mockReturnValue("access-token");
  mocks.generateRefreshToken.mockReturnValue("refresh-token");
  mocks.storeRefreshToken.mockResolvedValue(undefined);
  mocks.setAuthCookies.mockResolvedValue(undefined);
  mocks.updateUser.mockResolvedValue({});
  mocks.createSession.mockResolvedValue({});
  mocks.createAuditLog.mockResolvedValue({});
});

describe("common staff login", () => {
  it("rejects valid participant credentials before issuing tokens", async () => {
    mocks.findUser.mockResolvedValue(user("MENTEE"));

    const response = await staffLogin(request());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("WRONG_PORTAL");
    expect(mocks.generateAccessToken).not.toHaveBeenCalled();
  });

  it.each([
    "MENTOR",
    "ADMIN",
  ] as const)("authenticates %s credentials at the common staff endpoint", async (role) => {
    mocks.findUser.mockResolvedValue(user(role));

    const response = await staffLogin(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.user.role).toBe(role);
    expect(mocks.setAuthCookies).toHaveBeenCalledWith("access-token", "refresh-token", false);
  });

  it("returns invalid credentials for a wrong password on an inactive email before exposing status", async () => {
    mocks.findUser.mockResolvedValue({ ...user("MENTOR"), isActive: false });
    mocks.verifyPassword.mockResolvedValue(false);

    const response = await staffLogin(request());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("INVALID_CREDENTIALS");
    expect(mocks.verifyPassword).toHaveBeenCalledWith("Password123!", "hash");
    expect(mocks.generateAccessToken).not.toHaveBeenCalled();
    expect(mocks.setAuthCookies).not.toHaveBeenCalled();
  });

  it("returns inactive status only after the submitted password is verified", async () => {
    mocks.findUser.mockResolvedValue({ ...user("MENTOR"), isActive: false });

    const response = await staffLogin(request());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("ACCOUNT_DISABLED");
    expect(mocks.verifyPassword).toHaveBeenCalledOnce();
  });
});
