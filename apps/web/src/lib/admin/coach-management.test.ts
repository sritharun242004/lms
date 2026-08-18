import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  findUser: vi.fn(),
  findEmailCollision: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  deleteRefreshTokens: vi.fn(),
  disableSessions: vi.fn(),
  createAuditLog: vi.fn(),
  transaction: vi.fn(),
  hashPassword: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    user: {
      findMany: mocks.findMany,
      findFirst: (...args: unknown[]) => {
        const call = mocks.findUser.mock.calls.length;
        return call === 0 ? mocks.findUser(...args) : mocks.findEmailCollision(...args);
      },
    },
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/auth", () => ({ hashPassword: mocks.hashPassword }));

import {
  createCoachAccount,
  deactivateCoachAccount,
  listCoachAccounts,
  reactivateCoachAccount,
  setCoachPassword,
  updateCoachAccount,
} from "./coach-management";

const admin = { id: "admin-1", role: "ADMIN" as const };
const coach = {
  id: "coach-1",
  name: "Coach One",
  email: "coach@example.com",
  role: "MENTOR" as const,
  isActive: true,
  disabledAt: null,
  createdAt: new Date("2026-08-17T00:00:00.000Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findUser.mockResolvedValue(coach);
  mocks.findEmailCollision.mockResolvedValue(null);
  mocks.updateUser.mockImplementation(async ({ data }) => ({ ...coach, ...data }));
  mocks.createUser.mockImplementation(async ({ data }) => ({ ...coach, id: "coach-new", ...data }));
  mocks.deleteRefreshTokens.mockResolvedValue({ count: 2 });
  mocks.disableSessions.mockResolvedValue({ count: 3 });
  mocks.transaction.mockImplementation(async (callback) =>
    callback({
      user: { update: mocks.updateUser, create: mocks.createUser },
      refreshToken: { deleteMany: mocks.deleteRefreshTokens },
      session: { updateMany: mocks.disableSessions },
      auditLog: { create: mocks.createAuditLog },
    })
  );
  mocks.hashPassword.mockResolvedValue("bcrypt-cost-12-hash");
  mocks.createAuditLog.mockResolvedValue({});
});

describe("coach account management service", () => {
  it("allows only ADMIN actors to list role-constrained safe coach records", async () => {
    mocks.findMany.mockResolvedValue([{ ...coach, password: "never-return-this" }]);

    await expect(listCoachAccounts({ id: "coach-2", role: "MENTOR" })).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });

    const result = await listCoachAccounts(admin);

    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { role: "MENTOR" } }));
    expect(result).toEqual([
      {
        id: "coach-1",
        name: "Coach One",
        email: "coach@example.com",
        isActive: true,
        disabledAt: null,
        createdAt: new Date("2026-08-17T00:00:00.000Z"),
      },
    ]);
    expect(JSON.stringify(result)).not.toContain("never-return-this");
  });

  it("rejects self and non-MENTOR targets before mutating data", async () => {
    await expect(
      updateCoachAccount({ id: "coach-1", role: "ADMIN" }, "coach-1", {
        name: "Changed",
        email: "changed@example.com",
      })
    ).rejects.toMatchObject({ code: "INVALID_COACH_TARGET", status: 400 });

    mocks.findUser.mockResolvedValueOnce({ ...coach, role: "ADMIN" });
    await expect(
      updateCoachAccount(admin, "other-admin", {
        name: "Changed",
        email: "changed@example.com",
      })
    ).rejects.toMatchObject({ code: "COACH_NOT_FOUND", status: 404 });

    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects case-insensitive user email collisions before the transaction", async () => {
    mocks.findEmailCollision.mockResolvedValueOnce({ id: "someone-else" });

    await expect(
      updateCoachAccount(admin, "coach-1", {
        name: "Coach One",
        email: "TAKEN@Example.com",
      })
    ).rejects.toMatchObject({ code: "EMAIL_IN_USE", status: 409 });

    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("updates the coach using a normalized email", async () => {
    const result = await updateCoachAccount(admin, "coach-1", {
      name: "  Coach Updated  ",
      email: "Coach.Updated@Example.com",
    });

    expect(mocks.updateUser).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "coach-1" },
      data: { name: "Coach Updated", email: "coach.updated@example.com" },
    }));
    expect(mocks.createAuditLog).toHaveBeenCalledWith({ data: expect.objectContaining({
      userId: "admin-1", action: "MENTOR_UPDATED", entityType: "User", entityId: "coach-1",
      metadata: { actorId: "admin-1", targetUserId: "coach-1" },
    }) });
    expect(result.email).toBe("coach.updated@example.com");
  });

  it("creates a coach account directly with a hashed password and audit log, never returning the plaintext", async () => {
    mocks.findUser.mockResolvedValueOnce(null);

    const result = await createCoachAccount(admin, {
      name: "  New Coach  ",
      email: "New.Coach@Example.com",
      password: "StrongPass1!",
    });

    expect(mocks.hashPassword).toHaveBeenCalledWith("StrongPass1!");
    expect(mocks.createUser).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        name: "New Coach",
        email: "new.coach@example.com",
        password: "bcrypt-cost-12-hash",
        role: "MENTOR",
        emailVerified: true,
      }),
    }));
    expect(mocks.createAuditLog).toHaveBeenCalledWith({ data: expect.objectContaining({
      userId: "admin-1", action: "MENTOR_CREATED",
    }) });
    expect(result.email).toBe("new.coach@example.com");
    expect(JSON.stringify(result)).not.toContain("StrongPass1!");
  });

  it("rejects creating a coach account for an email already in use", async () => {
    mocks.findUser.mockResolvedValueOnce({ id: "existing-user" });

    await expect(
      createCoachAccount(admin, { name: "New Coach", email: "coach@example.com", password: "StrongPass1!" })
    ).rejects.toMatchObject({ code: "EMAIL_IN_USE", status: 409 });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("uses the strong-password policy, persists only a hash, and revokes every login session", async () => {
    await expect(setCoachPassword(admin, "coach-1", "weakpass")).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      status: 400,
    });
    expect(mocks.hashPassword).not.toHaveBeenCalled();

    await setCoachPassword(admin, "coach-1", "StrongPass1!");

    expect(mocks.hashPassword).toHaveBeenCalledWith("StrongPass1!");
    expect(mocks.updateUser).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "coach-1" },
      data: { password: "bcrypt-cost-12-hash", authVersion: { increment: 1 } },
    }));
    expect(mocks.deleteRefreshTokens).toHaveBeenCalledWith({ where: { userId: "coach-1" } });
    expect(mocks.disableSessions).toHaveBeenCalledWith({
      where: { userId: "coach-1", isActive: true },
      data: { isActive: false },
    });
    expect(mocks.createAuditLog).toHaveBeenCalledWith({ data: expect.objectContaining({
      userId: "admin-1", action: "MENTOR_PASSWORD_RESET", entityType: "User", entityId: "coach-1",
      metadata: { actorId: "admin-1", targetUserId: "coach-1" },
    }) });
    expect(JSON.stringify({ update: mocks.updateUser.mock.calls, audit: mocks.createAuditLog.mock.calls }))
      .not.toContain("StrongPass1!");
  });

  it("logically deactivates a MENTOR and revokes refresh tokens and active sessions", async () => {
    await deactivateCoachAccount(admin, "coach-1");

    expect(mocks.updateUser).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "coach-1" },
      data: {
        isActive: false, disabledAt: expect.any(Date), status: "OFFLINE",
        authVersion: { increment: 1 },
      },
    }));
    expect(mocks.deleteRefreshTokens).toHaveBeenCalledWith({ where: { userId: "coach-1" } });
    expect(mocks.disableSessions).toHaveBeenCalledWith({
      where: { userId: "coach-1", isActive: true },
      data: { isActive: false },
    });
    expect(mocks.createAuditLog).toHaveBeenCalledWith({ data: expect.objectContaining({
      userId: "admin-1", action: "MENTOR_DEACTIVATED", entityType: "User", entityId: "coach-1",
    }) });
  });

  it("reactivates a MENTOR without restoring revoked sessions", async () => {
    mocks.findUser.mockResolvedValueOnce({ ...coach, isActive: false, disabledAt: new Date() });

    await reactivateCoachAccount(admin, "coach-1");

    expect(mocks.updateUser).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "coach-1" },
      data: { isActive: true, disabledAt: null },
    }));
    expect(mocks.createAuditLog).toHaveBeenCalledWith({ data: expect.objectContaining({
      userId: "admin-1", action: "MENTOR_REACTIVATED", entityType: "User", entityId: "coach-1",
    }) });
    expect(mocks.deleteRefreshTokens).not.toHaveBeenCalled();
    expect(mocks.disableSessions).not.toHaveBeenCalled();
  });
});
