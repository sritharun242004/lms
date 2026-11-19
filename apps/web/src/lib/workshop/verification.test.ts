import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  registrationFindUnique,
  registrationUpdate,
  userFindFirst,
  userCreate,
  groupFindMany,
  groupMemberCreate,
  verificationLogCreate,
} = vi.hoisted(() => ({
  registrationFindUnique: vi.fn(),
  registrationUpdate: vi.fn(),
  userFindFirst: vi.fn(),
  userCreate: vi.fn(),
  groupFindMany: vi.fn(),
  groupMemberCreate: vi.fn(),
  verificationLogCreate: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    workshopRegistration: { findUnique: registrationFindUnique, update: registrationUpdate },
    user: { findFirst: userFindFirst, create: userCreate },
    group: { findMany: groupFindMany },
    groupMember: { create: groupMemberCreate },
    paymentVerificationLog: { create: verificationLogCreate },
    $transaction: (fn: any) =>
      fn({
        workshopRegistration: { update: registrationUpdate },
        user: { findFirst: userFindFirst, create: userCreate },
        group: { findMany: groupFindMany },
        groupMember: { create: groupMemberCreate },
        paymentVerificationLog: { create: verificationLogCreate },
      }),
  },
}));

vi.mock("@/lib/auth", () => ({
  hashPassword: vi.fn().mockResolvedValue("hashed"),
}));

import { approveRegistration, rejectRegistration } from "./verification";

beforeEach(() => {
  registrationFindUnique.mockReset();
  registrationUpdate.mockReset();
  userFindFirst.mockReset();
  userCreate.mockReset();
  groupFindMany.mockReset();
  groupMemberCreate.mockReset();
  verificationLogCreate.mockReset();
});

describe("approveRegistration", () => {
  it("rejects approving a registration with no payment proof submitted", async () => {
    registrationFindUnique.mockResolvedValue({
      id: "r1",
      status: "PENDING_PAYMENT",
      email: "a@b.com",
      fullName: "A",
      workshopPackage: "DAY1",
    });
    await expect(approveRegistration("admin1", "r1")).rejects.toThrow(/proof/i);
  });

  it("creates a new participant user and group membership on approval", async () => {
    registrationFindUnique.mockResolvedValue({
      id: "r1",
      status: "PROOF_SUBMITTED",
      email: "a@b.com",
      fullName: "A",
      workshopPackage: "DAY1",
    });
    userFindFirst.mockResolvedValue(null);
    userCreate.mockResolvedValue({ id: "u1", email: "a@b.com" });
    groupFindMany.mockResolvedValue([{ id: "g1", name: "XI Workshop · Day 1" }]);
    registrationUpdate.mockResolvedValue({ id: "r1", status: "APPROVED", onboardedUserId: "u1" });

    const result = await approveRegistration("admin1", "r1", "looks good");

    expect(userCreate).toHaveBeenCalled();
    expect(groupMemberCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "u1", groupId: "g1" }) })
    );
    expect(verificationLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "APPROVED", adminId: "admin1" }) })
    );
    expect(result.status).toBe("APPROVED");
  });

  it("reuses an existing user by email instead of creating a duplicate", async () => {
    registrationFindUnique.mockResolvedValue({
      id: "r1",
      status: "PROOF_SUBMITTED",
      email: "existing@b.com",
      fullName: "A",
      workshopPackage: "DAY1",
    });
    userFindFirst.mockResolvedValue({ id: "u-existing", email: "existing@b.com" });
    groupFindMany.mockResolvedValue([{ id: "g1", name: "XI Workshop · Day 1" }]);
    registrationUpdate.mockResolvedValue({ id: "r1", status: "APPROVED" });

    await approveRegistration("admin1", "r1");

    expect(userCreate).not.toHaveBeenCalled();
    expect(groupMemberCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "u-existing" }) })
    );
  });
});

describe("rejectRegistration", () => {
  it("never touches user or group member tables", async () => {
    registrationFindUnique.mockResolvedValue({ id: "r1", status: "PROOF_SUBMITTED" });
    registrationUpdate.mockResolvedValue({ id: "r1", status: "REJECTED" });
    await rejectRegistration("admin1", "r1", "screenshot unreadable");
    expect(userCreate).not.toHaveBeenCalled();
    expect(groupMemberCreate).not.toHaveBeenCalled();
    expect(verificationLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "REJECTED" }) })
    );
  });
});
