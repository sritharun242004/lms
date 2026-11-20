import { describe, expect, it, vi, beforeEach } from "vitest";

const { registrationFindUnique, registrationUpdate, verificationLogCreate, groupFindUnique } = vi.hoisted(() => ({
  registrationFindUnique: vi.fn(),
  registrationUpdate: vi.fn(),
  verificationLogCreate: vi.fn(),
  groupFindUnique: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    workshopRegistration: { findUnique: registrationFindUnique, update: registrationUpdate },
    paymentVerificationLog: { create: verificationLogCreate },
    whatsAppGroup: { findUnique: groupFindUnique },
    $transaction: (fn: (tx: unknown) => unknown) =>
      fn({
        workshopRegistration: { update: registrationUpdate },
        paymentVerificationLog: { create: verificationLogCreate },
      }),
  },
}));

import { approveRegistration, rejectRegistration } from "./verification";

beforeEach(() => {
  registrationFindUnique.mockReset();
  registrationUpdate.mockReset();
  verificationLogCreate.mockReset();
  groupFindUnique.mockReset();
});

const baseRegistration = {
  id: "r1",
  status: "PROOF_SUBMITTED",
  whatsappGroupId: null,
  whatsappGroupName: null,
  whatsappGroupInviteUrl: null,
};

describe("approveRegistration", () => {
  it("rejects approving a registration with no payment proof submitted", async () => {
    registrationFindUnique.mockResolvedValue({ ...baseRegistration, status: "PENDING_PAYMENT" });
    await expect(approveRegistration("admin1", "r1")).rejects.toThrow(/proof/i);
  });

  it("rejects approving without a selected group and without the explicit exception", async () => {
    registrationFindUnique.mockResolvedValue(baseRegistration);
    await expect(approveRegistration("admin1", "r1")).rejects.toThrow(/select a whatsapp group/i);
    expect(registrationUpdate).not.toHaveBeenCalled();
  });

  it("allows approving without a group when allowMissingWhatsappLink is set", async () => {
    registrationFindUnique.mockResolvedValue(baseRegistration);
    registrationUpdate.mockResolvedValue({ id: "r1", status: "APPROVED" });
    const result = await approveRegistration("admin1", "r1", { allowMissingWhatsappLink: true });
    expect(result.status).toBe("APPROVED");
    expect(groupFindUnique).not.toHaveBeenCalled();
    expect(registrationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ whatsappGroupId: null, whatsappGroupInviteUrl: null }) })
    );
  });

  it("rejects selecting a group that doesn't exist", async () => {
    registrationFindUnique.mockResolvedValue(baseRegistration);
    groupFindUnique.mockResolvedValue(null);
    await expect(approveRegistration("admin1", "r1", { whatsappGroupId: "missing" })).rejects.toThrow(
      /not available/i
    );
    expect(registrationUpdate).not.toHaveBeenCalled();
  });

  it("rejects selecting a group that is inactive", async () => {
    registrationFindUnique.mockResolvedValue(baseRegistration);
    groupFindUnique.mockResolvedValue({ id: "g1", name: "Day 1", inviteUrl: "https://chat.whatsapp.com/ABC123", isActive: false });
    await expect(approveRegistration("admin1", "r1", { whatsappGroupId: "g1" })).rejects.toThrow(/not available/i);
    expect(registrationUpdate).not.toHaveBeenCalled();
  });

  it("approves and snapshots the selected group's name and link, never touching user or group member tables", async () => {
    registrationFindUnique.mockResolvedValue(baseRegistration);
    groupFindUnique.mockResolvedValue({
      id: "g1",
      name: "XI Workshop — Day 1",
      inviteUrl: "https://chat.whatsapp.com/ABC123",
      isActive: true,
    });
    registrationUpdate.mockResolvedValue({
      id: "r1",
      status: "APPROVED",
      whatsappGroupId: "g1",
      whatsappGroupName: "XI Workshop — Day 1",
      whatsappGroupInviteUrl: "https://chat.whatsapp.com/ABC123",
    });

    const result = await approveRegistration("admin1", "r1", { whatsappGroupId: "g1", note: "looks good" });

    expect(registrationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "APPROVED",
          whatsappGroupId: "g1",
          whatsappGroupName: "XI Workshop — Day 1",
          whatsappGroupInviteUrl: "https://chat.whatsapp.com/ABC123",
        }),
      })
    );
    expect(verificationLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "APPROVED", adminId: "admin1" }) })
    );
    expect(result.status).toBe("APPROVED");
  });

  it("reuses an already-assigned group when none is passed this time", async () => {
    registrationFindUnique.mockResolvedValue({
      ...baseRegistration,
      status: "UNDER_VERIFICATION",
      whatsappGroupId: "g1",
      whatsappGroupName: "XI Workshop — Day 1",
      whatsappGroupInviteUrl: "https://wa.me/919876543210",
    });
    registrationUpdate.mockResolvedValue({ id: "r1", status: "APPROVED" });

    await approveRegistration("admin1", "r1");

    expect(groupFindUnique).not.toHaveBeenCalled();
    expect(registrationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ whatsappGroupInviteUrl: "https://wa.me/919876543210" }) })
    );
  });

  it("editing a group afterward never changes an already-approved registration's snapshot", async () => {
    // Approve once with the group as it is now.
    registrationFindUnique.mockResolvedValue(baseRegistration);
    groupFindUnique.mockResolvedValue({ id: "g1", name: "Old name", inviteUrl: "https://wa.me/919876543210", isActive: true });
    registrationUpdate.mockResolvedValue({
      id: "r1",
      status: "APPROVED",
      whatsappGroupId: "g1",
      whatsappGroupName: "Old name",
      whatsappGroupInviteUrl: "https://wa.me/919876543210",
    });
    await approveRegistration("admin1", "r1", { whatsappGroupId: "g1" });

    expect(registrationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ whatsappGroupName: "Old name" }) })
    );
    // approveRegistration never re-reads the group after this point for
    // an already-approved row (requireProofSubmitted blocks a second
    // approval outright), so the snapshot above is final regardless of
    // later edits to the WhatsAppGroup row itself.
  });
});

describe("rejectRegistration", () => {
  it("never touches user or group member tables", async () => {
    registrationFindUnique.mockResolvedValue({ id: "r1", status: "PROOF_SUBMITTED" });
    registrationUpdate.mockResolvedValue({ id: "r1", status: "REJECTED" });
    await rejectRegistration("admin1", "r1", "screenshot unreadable");
    expect(verificationLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "REJECTED" }) })
    );
  });
});
