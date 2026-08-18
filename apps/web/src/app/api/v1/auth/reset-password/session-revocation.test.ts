import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  findUser: vi.fn(),
  updateUser: vi.fn(),
  createAuditLog: vi.fn(),
  deleteRefreshTokens: vi.fn(),
  disableSessions: vi.fn(),
  transaction: vi.fn(),
  hashPassword: vi.fn(),
  hashPasswordResetToken: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    user: { findFirst: mocks.findUser, update: mocks.updateUser },
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/auth", () => ({
  hashPassword: mocks.hashPassword,
  hashPasswordResetToken: mocks.hashPasswordResetToken,
}));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findUser.mockResolvedValue({ id: "coach-1" });
  mocks.hashPasswordResetToken.mockReturnValue("reset-token-hash");
  mocks.hashPassword.mockResolvedValue("bcrypt-cost-12-hash");
  mocks.updateUser.mockResolvedValue({});
  mocks.createAuditLog.mockResolvedValue({});
  mocks.deleteRefreshTokens.mockResolvedValue({ count: 2 });
  mocks.disableSessions.mockResolvedValue({ count: 3 });
  mocks.transaction.mockImplementation(async (callback) => callback({
    user: { update: mocks.updateUser },
    refreshToken: { deleteMany: mocks.deleteRefreshTokens },
    session: { updateMany: mocks.disableSessions },
    auditLog: { create: mocks.createAuditLog },
  }));
});

describe("password-reset session revocation", () => {
  it("atomically changes the password, increments auth version, revokes sessions, and audits safely", async () => {
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
    expect(mocks.updateUser).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        password: "bcrypt-cost-12-hash",
        authVersion: { increment: 1 },
        passwordResetToken: null,
        passwordResetExpiry: null,
      }),
    }));
    expect(mocks.deleteRefreshTokens).toHaveBeenCalledWith({ where: { userId: "coach-1" } });
    expect(mocks.disableSessions).toHaveBeenCalledWith({
      where: { userId: "coach-1", isActive: true }, data: { isActive: false },
    });
    expect(mocks.createAuditLog).toHaveBeenCalledWith({ data: expect.objectContaining({
      userId: "coach-1", action: "PASSWORD_RESET", entityType: "User", entityId: "coach-1",
    }) });
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(JSON.stringify(body)).not.toContain("StrongPass1!");
    expect(JSON.stringify({
      user: mocks.updateUser.mock.calls,
      audit: mocks.createAuditLog.mock.calls,
    })).not.toContain("StrongPass1!");
  });
});
