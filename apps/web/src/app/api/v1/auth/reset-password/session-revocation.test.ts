import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  findUser: vi.fn(),
  updateUser: vi.fn(),
  createAuditLog: vi.fn(),
  transaction: vi.fn(),
  hashPassword: vi.fn(),
  hashPasswordResetToken: vi.fn(),
  revokeAllUserRefreshTokens: vi.fn(),
  revokeAllUserSessions: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    user: { findFirst: mocks.findUser, update: mocks.updateUser },
    auditLog: { create: mocks.createAuditLog },
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/auth", () => ({
  hashPassword: mocks.hashPassword,
  hashPasswordResetToken: mocks.hashPasswordResetToken,
  revokeAllUserRefreshTokens: mocks.revokeAllUserRefreshTokens,
  revokeAllUserSessions: mocks.revokeAllUserSessions,
}));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findUser.mockResolvedValue({ id: "coach-1" });
  mocks.hashPasswordResetToken.mockReturnValue("reset-token-hash");
  mocks.hashPassword.mockResolvedValue("bcrypt-cost-12-hash");
  mocks.updateUser.mockResolvedValue({});
  mocks.createAuditLog.mockResolvedValue({});
  mocks.transaction.mockResolvedValue([]);
  mocks.revokeAllUserRefreshTokens.mockResolvedValue(undefined);
  mocks.revokeAllUserSessions.mockResolvedValue(undefined);
});

describe("password-reset session revocation", () => {
  it("revokes refresh tokens and active sessions after changing the hash", async () => {
    const request = new NextRequest("http://localhost/api/v1/auth/reset-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token: "raw-reset-token",
        password: "StrongPass1!",
        confirmPassword: "StrongPass1!",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.revokeAllUserRefreshTokens).toHaveBeenCalledWith("coach-1");
    expect(mocks.revokeAllUserSessions).toHaveBeenCalledWith("coach-1");
    expect(mocks.updateUser).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ password: "bcrypt-cost-12-hash" }),
    }));
    expect(JSON.stringify(body)).not.toContain("StrongPass1!");
    expect(JSON.stringify(mocks.updateUser.mock.calls)).not.toContain("StrongPass1!");
  });
});
