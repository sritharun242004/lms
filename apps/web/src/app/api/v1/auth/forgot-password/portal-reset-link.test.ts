import { beforeEach, describe, expect, it, vi } from "vitest";
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
  mocks.findUser.mockResolvedValue({ id: "u1" });
  mocks.updateUser.mockResolvedValue({});
  mocks.generatePasswordResetToken.mockReturnValue({
    token: "raw-token",
    hash: "token-hash",
    expiresAt: new Date("2026-08-18T15:00:00.000Z"),
  });
  vi.spyOn(console, "log").mockImplementation(mocks.log);
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
