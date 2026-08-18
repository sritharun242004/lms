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

import { POST as coachLogin } from "../coach/login/route";
import { POST as participantLogin } from "../participant/login/route";
import { POST as superAdminLogin } from "../super-admin/login/route";

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

function request(portal: "participant" | "coach" | "super-admin") {
  return new NextRequest(`http://localhost/api/v1/auth/${portal}/login`, {
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

describe("role-specific staff login", () => {
  it("authenticates a claimed mentee only at the participant endpoint", async () => {
    mocks.findUser.mockResolvedValue(user("MENTEE"));

    const response = await participantLogin(request("participant"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.user.role).toBe("MENTEE");
  });

  it("rejects valid coach credentials at the participant endpoint", async () => {
    mocks.findUser.mockResolvedValue(user("MENTOR"));

    const response = await participantLogin(request("participant"));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("WRONG_PORTAL");
    expect(mocks.generateAccessToken).not.toHaveBeenCalled();
  });

  it("rejects valid admin credentials at the coach endpoint before issuing tokens", async () => {
    mocks.findUser.mockResolvedValue(user("ADMIN"));

    const response = await coachLogin(request("coach"));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("WRONG_PORTAL");
    expect(mocks.generateAccessToken).not.toHaveBeenCalled();
    expect(mocks.setAuthCookies).not.toHaveBeenCalled();
  });

  it("rejects valid coach credentials at the super-admin endpoint before issuing tokens", async () => {
    mocks.findUser.mockResolvedValue(user("MENTOR"));

    const response = await superAdminLogin(request("super-admin"));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("WRONG_PORTAL");
    expect(mocks.generateAccessToken).not.toHaveBeenCalled();
    expect(mocks.setAuthCookies).not.toHaveBeenCalled();
  });

  it.each([
    ["coach", "MENTOR"],
    ["super-admin", "ADMIN"],
  ] as const)("authenticates the expected role at the %s endpoint", async (portal, role) => {
    mocks.findUser.mockResolvedValue(user(role));

    const handler = portal === "coach" ? coachLogin : superAdminLogin;
    const response = await handler(request(portal));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.user.role).toBe(role);
    expect(mocks.setAuthCookies).toHaveBeenCalledWith("access-token", "refresh-token", false);
  });

  it("returns invalid credentials for a wrong password on an inactive email before exposing status", async () => {
    mocks.findUser.mockResolvedValue({ ...user("MENTOR"), isActive: false });
    mocks.verifyPassword.mockResolvedValue(false);

    const response = await coachLogin(request("coach"));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("INVALID_CREDENTIALS");
    expect(mocks.verifyPassword).toHaveBeenCalledWith("Password123!", "hash");
    expect(mocks.generateAccessToken).not.toHaveBeenCalled();
    expect(mocks.setAuthCookies).not.toHaveBeenCalled();
  });

  it("returns inactive status only after the submitted password is verified", async () => {
    mocks.findUser.mockResolvedValue({ ...user("MENTOR"), isActive: false });

    const response = await coachLogin(request("coach"));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("ACCOUNT_DISABLED");
    expect(mocks.verifyPassword).toHaveBeenCalledOnce();
  });
});
