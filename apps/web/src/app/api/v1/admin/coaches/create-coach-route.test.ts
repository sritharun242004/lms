import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  hashPassword: vi.fn(),
  findUser: vi.fn(),
  createUser: vi.fn(),
  createAuditLog: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: mocks.getCurrentUser,
  hashPassword: mocks.hashPassword,
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    user: { findFirst: mocks.findUser },
    $transaction: mocks.transaction,
  },
}));

import { POST } from "./route";

function request(body?: unknown) {
  return new NextRequest("http://localhost/api/v1/admin/coaches", {
    method: "POST",
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "admin-1", role: "ADMIN" });
  mocks.findUser.mockResolvedValue(null);
  mocks.hashPassword.mockResolvedValue("bcrypt-cost-12-hash");
  mocks.createUser.mockImplementation(async ({ data }) => ({
    id: "coach-new",
    name: data.name,
    email: data.email,
    isActive: true,
    disabledAt: null,
    createdAt: new Date("2026-08-18T00:00:00.000Z"),
  }));
  mocks.createAuditLog.mockResolvedValue({});
  mocks.transaction.mockImplementation(async (callback) =>
    callback({
      user: { create: mocks.createUser },
      auditLog: { create: mocks.createAuditLog },
    })
  );
});

describe("POST /api/v1/admin/coaches", () => {
  it("rejects a non-admin caller", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "coach-1", role: "MENTOR" });

    const response = await POST(request({ name: "New Coach", email: "new@example.com", password: "StrongPass1!" }));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("FORBIDDEN");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("creates the coach directly with a hashed password, never returning the plaintext", async () => {
    const response = await POST(request({ name: "New Coach", email: "New@Example.com", password: "StrongPass1!" }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.data.coach.email).toBe("new@example.com");
    expect(mocks.createUser).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ password: "bcrypt-cost-12-hash", role: "MENTOR" }),
    }));
    expect(JSON.stringify(body)).not.toContain("StrongPass1!");
  });

  it("rejects a weak password before creating the account", async () => {
    const response = await POST(request({ name: "New Coach", email: "new@example.com", password: "weak" }));

    expect(response.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects an email already in use", async () => {
    mocks.findUser.mockResolvedValue({ id: "existing-user" });

    const response = await POST(request({ name: "New Coach", email: "new@example.com", password: "StrongPass1!" }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.code).toBe("EMAIL_IN_USE");
  });
});
