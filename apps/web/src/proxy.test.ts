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
}));

vi.mock("@/lib/auth", () => ({
  ...mocks,
  getAccessCookieOptions: () => ({ httpOnly: true, sameSite: "lax", path: "/", maxAge: 900 }),
  getRefreshCookieOptions: () => ({ httpOnly: true, sameSite: "lax", path: "/", maxAge: 604800 }),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: { user: { findUnique: vi.fn() } } }));

import { proxy } from "./proxy";

function request(path: string, authenticatedRole?: "MENTOR" | "ADMIN" | "MENTEE") {
  const req = new NextRequest(`http://localhost${path}`);
  if (authenticatedRole) {
    req.cookies.set("access_token", "valid-token");
    mocks.verifyAccessToken.mockReturnValue({ sub: "u1", role: authenticatedRole });
  }
  return req;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyAccessToken.mockReturnValue(null);
});

describe("portal-aware proxy redirects", () => {
  it.each([
    ["/admin/coaches", "/super-admin/login?redirect=%2Fadmin%2Fcoaches"],
    ["/mentor/dashboard", "/coach/login?redirect=%2Fmentor%2Fdashboard"],
    ["/chat/group-1", "/"],
  ] as const)("redirects unauthenticated %s to %s", async (path, expected) => {
    const response = await proxy(request(path));

    expect(response.headers.get("location")).toBe(`http://localhost${expected}`);
  });

  it.each([
    ["/coach/login", "MENTOR", "/mentor/dashboard"],
    ["/super-admin/login", "ADMIN", "/admin/dashboard"],
  ] as const)("redirects an authenticated %s visitor to the existing role destination", async (path, role, expected) => {
    const response = await proxy(request(path, role));

    expect(response.headers.get("location")).toBe(`http://localhost${expected}`);
  });
});
