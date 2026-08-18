import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  findUser: vi.fn(),
  updateUser: vi.fn(),
  generatePasswordResetToken: vi.fn(),
  log: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: { user: { findUnique: mocks.findUser, update: mocks.updateUser } },
}));

vi.mock("@/lib/auth", () => ({
  generatePasswordResetToken: mocks.generatePasswordResetToken,
}));

import { POST } from "./route";

function request(portal: string) {
  return new NextRequest(`http://localhost/api/v1/auth/forgot-password?portal=${encodeURIComponent(portal)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "person@example.com" }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "development");
  mocks.findUser.mockResolvedValue({ id: "u1" });
  mocks.updateUser.mockResolvedValue({});
  mocks.generatePasswordResetToken.mockReturnValue({
    token: "raw-token",
    hash: "token-hash",
    expiresAt: new Date("2026-08-18T15:00:00.000Z"),
  });
  vi.spyOn(console, "log").mockImplementation(mocks.log);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("portal-aware password reset links", () => {
  it("preserves an explicit coach portal in the generated reset URL", async () => {
    await POST(request("coach"));

    expect(mocks.log).toHaveBeenCalledWith(
      "[password-reset] person@example.com → http://localhost:3000/reset-password?token=raw-token&portal=coach"
    );
  });

  it("defaults an invalid portal to participant in the generated reset URL", async () => {
    await POST(request("javascript:alert(1)"));

    expect(mocks.log).toHaveBeenCalledWith(
      "[password-reset] person@example.com → http://localhost:3000/reset-password?token=raw-token&portal=participant"
    );
  });
});

describe("production password recovery safety", () => {
  it("fails closed before lookup or token creation and never logs a raw token or URL", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(request("coach"));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toEqual({
      code: "PASSWORD_RECOVERY_UNAVAILABLE",
      message: "Password recovery is temporarily unavailable. Please contact your administrator.",
    });
    expect(mocks.findUser).not.toHaveBeenCalled();
    expect(mocks.generatePasswordResetToken).not.toHaveBeenCalled();
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.log).not.toHaveBeenCalled();
    expect(errorLog).not.toHaveBeenCalled();
    expect(JSON.stringify(body)).not.toContain("raw-token");
    expect(JSON.stringify(body)).not.toContain("reset-password?");
  });
});
