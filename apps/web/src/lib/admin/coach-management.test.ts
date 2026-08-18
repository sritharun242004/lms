import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  findUser: vi.fn(),
  findEmailCollision: vi.fn(),
  findApprovalCollision: vi.fn(),
  updateUser: vi.fn(),
  updateApproval: vi.fn(),
  deleteRefreshTokens: vi.fn(),
  disableSessions: vi.fn(),
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
    coachEmailApproval: { findFirst: mocks.findApprovalCollision },
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/auth", () => ({ hashPassword: mocks.hashPassword }));

import {
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
  mocks.findApprovalCollision.mockResolvedValue(null);
  mocks.updateUser.mockImplementation(async ({ data }) => ({ ...coach, ...data }));
  mocks.updateApproval.mockResolvedValue({ count: 1 });
  mocks.deleteRefreshTokens.mockResolvedValue({ count: 2 });
  mocks.disableSessions.mockResolvedValue({ count: 3 });
  mocks.transaction.mockImplementation(async (callback) =>
    callback({
      user: { update: mocks.updateUser },
      coachEmailApproval: { updateMany: mocks.updateApproval },
      refreshToken: { deleteMany: mocks.deleteRefreshTokens },
      session: { updateMany: mocks.disableSessions },
    })
  );
  mocks.hashPassword.mockResolvedValue("bcrypt-cost-12-hash");
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

  it("updates the coach and linked approval email atomically using normalized email", async () => {
    const result = await updateCoachAccount(admin, "coach-1", {
      name: "  Coach Updated  ",
      email: "Coach.Updated@Example.com",
    });

    expect(mocks.updateUser).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "coach-1" },
      data: { name: "Coach Updated", email: "coach.updated@example.com" },
    }));
    expect(mocks.updateApproval).toHaveBeenCalledWith({
      where: { claimedById: "coach-1" },
      data: { email: "coach.updated@example.com" },
    });
    expect(result.email).toBe("coach.updated@example.com");
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
      data: { password: "bcrypt-cost-12-hash" },
    }));
    expect(mocks.deleteRefreshTokens).toHaveBeenCalledWith({ where: { userId: "coach-1" } });
    expect(mocks.disableSessions).toHaveBeenCalledWith({
      where: { userId: "coach-1", isActive: true },
      data: { isActive: false },
    });
    expect(JSON.stringify(mocks.updateUser.mock.calls)).not.toContain("StrongPass1!");
  });

  it("logically deactivates a MENTOR and revokes refresh tokens and active sessions", async () => {
    await deactivateCoachAccount(admin, "coach-1");

    expect(mocks.updateUser).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "coach-1" },
      data: { isActive: false, disabledAt: expect.any(Date), status: "OFFLINE" },
    }));
    expect(mocks.deleteRefreshTokens).toHaveBeenCalledWith({ where: { userId: "coach-1" } });
    expect(mocks.disableSessions).toHaveBeenCalledWith({
      where: { userId: "coach-1", isActive: true },
      data: { isActive: false },
    });
  });

  it("reactivates a MENTOR without restoring revoked sessions", async () => {
    mocks.findUser.mockResolvedValueOnce({ ...coach, isActive: false, disabledAt: new Date() });

    await reactivateCoachAccount(admin, "coach-1");

    expect(mocks.updateUser).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "coach-1" },
      data: { isActive: true, disabledAt: null },
    }));
    expect(mocks.deleteRefreshTokens).not.toHaveBeenCalled();
    expect(mocks.disableSessions).not.toHaveBeenCalled();
  });
});
