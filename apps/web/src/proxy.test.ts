import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  verifyAccessToken: vi.fn(),
  verifyRefreshToken: vi.fn(),
  generateAccessToken: vi.fn(),
  generateRefreshToken: vi.fn(),
  isRefreshTokenValid: vi.fn(),
  revokeRefreshToken: vi.fn(),
  storeRefreshToken: vi.fn(),
  findUser: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  ...mocks,
  getAccessCookieOptions: () => ({ httpOnly: true, sameSite: "lax", path: "/", maxAge: 900 }),
  getRefreshCookieOptions: () => ({ httpOnly: true, sameSite: "lax", path: "/", maxAge: 604800 }),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: { user: { findUnique: mocks.findUser } } }));

import { proxy } from "./proxy";

function request(path: string, authenticatedRole?: "MENTOR" | "ADMIN" | "MENTEE") {
  const req = new NextRequest(`http://localhost${path}`);
  if (authenticatedRole) {
    req.cookies.set("access_token", "valid-token");
    mocks.verifyAccessToken.mockReturnValue({ sub: "u1", role: authenticatedRole, authVersion: 0 });
  }
  return req;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyAccessToken.mockReturnValue(null);
  mocks.revokeRefreshToken.mockResolvedValue(undefined);
  mocks.findUser.mockResolvedValue({
    id: "u1", name: "User", email: "user@example.com", role: "MENTOR",
    isActive: true, authVersion: 0,
  });
});

describe("portal-aware proxy redirects", () => {
  it.each([
    ["/admin/coaches", "/super-admin/login?redirect=%2Fadmin%2Fcoaches"],
    ["/mentor/dashboard", "/coach/login?redirect=%2Fmentor%2Fdashboard"],
    ["/questions?returnTo=%2Fchat%2Fgroup-1", "/coach/login?redirect=%2Fquestions%3FreturnTo%3D%252Fchat%252Fgroup-1"],
    ["/dashboard", "/coach/login?redirect=%2Fdashboard"],
    ["/chat/group-1", "/"],
  ] as const)("redirects unauthenticated %s to %s", async (path, expected) => {
    const response = await proxy(request(path));

    expect(response.headers.get("location")).toBe(`http://localhost${expected}`);
  });

  it.each([
    ["/coach/login", "MENTOR", "/mentor/dashboard"],
    ["/super-admin/login", "ADMIN", "/admin/dashboard"],
    ["/participant/login", "MENTEE", "/chat"],
  ] as const)("redirects an authenticated %s visitor to the existing role destination", async (path, role, expected) => {
    const response = await proxy(request(path, role));

    expect(response.headers.get("location")).toBe(`http://localhost${expected}`);
  });

  it("refuses silent refresh for an inactive account and clears the stale session", async () => {
    const req = request("/admin/coaches");
    req.cookies.set("refresh_token", "stored-refresh-token");
    mocks.verifyRefreshToken.mockReturnValue({ sub: "coach-1", role: "MENTOR", authVersion: 0 });
    mocks.isRefreshTokenValid.mockResolvedValue(true);
    mocks.findUser.mockResolvedValue({
      id: "coach-1",
      name: "Coach One",
      email: "coach@example.com",
      role: "MENTOR",
      isActive: false,
      authVersion: 0,
    });

    const response = await proxy(req);

    expect(response.headers.get("location")).toBe(
      "http://localhost/super-admin/login?redirect=%2Fadmin%2Fcoaches"
    );
    expect(mocks.revokeRefreshToken).toHaveBeenCalledWith("stored-refresh-token");
    expect(mocks.generateAccessToken).not.toHaveBeenCalled();
    expect(mocks.generateRefreshToken).not.toHaveBeenCalled();
  });

  it("rejects an otherwise valid unexpired access JWT when its auth version is stale", async () => {
    const req = request("/mentor/dashboard", "MENTOR");
    mocks.findUser.mockResolvedValue({
      id: "u1", name: "Coach", email: "coach@example.com", role: "MENTOR",
      isActive: true, authVersion: 1,
    });

    const response = await proxy(req);

    expect(response.headers.get("location")).toBe(
      "http://localhost/coach/login?redirect=%2Fmentor%2Fdashboard"
    );
    expect(response.cookies.get("access_token")?.value).toBe("");
    expect(mocks.findUser).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "u1" } }));
  });

  it("does not redirect-loop on a public login page with a stale access JWT", async () => {
    const req = request("/coach/login", "MENTOR");
    mocks.findUser.mockResolvedValue({
      id: "u1", name: "Coach", email: "coach@example.com", role: "MENTOR",
      isActive: true, authVersion: 2,
    });

    const response = await proxy(req);

    expect(response.headers.get("location")).toBeNull();
    expect(response.cookies.get("access_token")?.value).toBe("");
  });

  it("accepts a legacy missing-version access token only for a database version of zero", async () => {
    const req = request("/mentor/dashboard");
    req.cookies.set("access_token", "legacy-token");
    mocks.verifyAccessToken.mockReturnValue({ sub: "u1", role: "MENTOR" });

    const accepted = await proxy(req);
    expect(accepted.headers.get("location")).toBeNull();

    mocks.findUser.mockResolvedValue({
      id: "u1", name: "Coach", email: "coach@example.com", role: "MENTOR",
      isActive: true, authVersion: 1,
    });
    const rejected = await proxy(req);
    expect(rejected.headers.get("location")).toBe(
      "http://localhost/coach/login?redirect=%2Fmentor%2Fdashboard"
    );
  });
});
