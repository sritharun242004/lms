import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  hashPassword: vi.fn(),
  findTarget: vi.fn(),
  findCollision: vi.fn(),
  updateUser: vi.fn(),
  deleteRefreshTokens: vi.fn(),
  disableSessions: vi.fn(),
  createAuditLog: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: mocks.getCurrentUser,
  hashPassword: mocks.hashPassword,
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    user: {
      findFirst: (...args: unknown[]) => {
        const targetCalls = mocks.findTarget.mock.calls.length;
        return targetCalls === 0 ? mocks.findTarget(...args) : mocks.findCollision(...args);
      },
    },
    $transaction: mocks.transaction,
  },
}));

import { DELETE, PATCH, POST } from "./route";
import { PATCH as PATCH_PASSWORD } from "./password/route";

const coach = {
  id: "coach-1",
  name: "Coach One",
  email: "coach@example.com",
  role: "MENTOR" as const,
  isActive: true,
  disabledAt: null,
  createdAt: new Date("2026-08-17T00:00:00.000Z"),
};

const context = { params: Promise.resolve({ id: "coach-1" }) };

function request(body?: unknown) {
  return new NextRequest("http://localhost/api/v1/admin/coaches/coach-1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "admin-1", role: "ADMIN" });
  mocks.findTarget.mockResolvedValue(coach);
  mocks.findCollision.mockResolvedValue(null);
  mocks.hashPassword.mockResolvedValue("bcrypt-cost-12-hash");
  mocks.updateUser.mockImplementation(async ({ data }) => ({ ...coach, ...data }));
  mocks.deleteRefreshTokens.mockResolvedValue({ count: 2 });
  mocks.disableSessions.mockResolvedValue({ count: 3 });
  mocks.transaction.mockImplementation(async (callback) =>
    callback({
      user: { update: mocks.updateUser },
      refreshToken: { deleteMany: mocks.deleteRefreshTokens },
      session: { updateMany: mocks.disableSessions },
      auditLog: { create: mocks.createAuditLog },
    })
  );
});

describe("ADMIN-only coach account routes", () => {
  it("rejects a MENTOR caller before looking up or mutating the target", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "coach-2", role: "MENTOR" });

    const response = await PATCH(
      request({ name: "Coach Updated", email: "updated@example.com" }),
      context
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("FORBIDDEN");
    expect(mocks.findTarget).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("validates edits and returns a password-free coach response", async () => {
    const invalidResponse = await PATCH(request({ name: " ", email: "not-an-email" }), context);
    expect(invalidResponse.status).toBe(400);
    expect(mocks.findTarget).not.toHaveBeenCalled();

    const response = await PATCH(
      request({ name: "Coach Updated", email: "Updated@Example.com" }),
      context
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.coach.email).toBe("updated@example.com");
    expect(JSON.stringify(body)).not.toContain("password");
  });

  it("sets only a strong password and never returns or persists its plaintext", async () => {
    const weakResponse = await PATCH_PASSWORD(request({ password: "weakpass" }), context);
    expect(weakResponse.status).toBe(400);
    expect(mocks.hashPassword).not.toHaveBeenCalled();

    const response = await PATCH_PASSWORD(request({ password: "StrongPass1!" }), context);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.message).toMatch(/password/i);
    expect(JSON.stringify(body)).not.toContain("StrongPass1!");
    expect(mocks.updateUser).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ password: "bcrypt-cost-12-hash" }),
    }));
    expect(JSON.stringify(mocks.updateUser.mock.calls)).not.toContain("StrongPass1!");
  });

  it("implements DELETE as logical deactivation with session revocation", async () => {
    const response = await DELETE(request(), context);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.coach.isActive).toBe(false);
    expect(mocks.updateUser).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        isActive: false, disabledAt: expect.any(Date), status: "OFFLINE",
      }),
    }));
    expect(mocks.deleteRefreshTokens).toHaveBeenCalled();
    expect(mocks.disableSessions).toHaveBeenCalled();
  });

  it("reactivates a coach without recreating revoked sessions", async () => {
    mocks.findTarget.mockResolvedValueOnce({ ...coach, isActive: false, disabledAt: new Date() });

    const response = await POST(request(), context);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.coach.isActive).toBe(true);
    expect(mocks.deleteRefreshTokens).not.toHaveBeenCalled();
    expect(mocks.disableSessions).not.toHaveBeenCalled();
  });
});
