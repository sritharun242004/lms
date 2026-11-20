import { describe, expect, it, vi, beforeEach } from "vitest";

const { registrationFindUnique, registrationUpdate, verificationLogCreate } = vi.hoisted(() => ({
  registrationFindUnique: vi.fn(),
  registrationUpdate: vi.fn(),
  verificationLogCreate: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    workshopRegistration: { findUnique: registrationFindUnique, update: registrationUpdate },
    paymentVerificationLog: { create: verificationLogCreate },
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
});

describe("approveRegistration", () => {
  it("rejects approving a registration with no payment proof submitted", async () => {
    registrationFindUnique.mockResolvedValue({
      id: "r1",
      status: "PENDING_PAYMENT",
      whatsappGroupInviteUrl: null,
    });
    await expect(approveRegistration("admin1", "r1")).rejects.toThrow(/proof/i);
  });

  it("rejects approving without a WhatsApp link and without the explicit exception", async () => {
    registrationFindUnique.mockResolvedValue({ id: "r1", status: "PROOF_SUBMITTED", whatsappGroupInviteUrl: null });
    await expect(approveRegistration("admin1", "r1")).rejects.toThrow(/whatsapp group invitation link/i);
    expect(registrationUpdate).not.toHaveBeenCalled();
  });

  it("allows approving without a link when allowMissingWhatsappLink is set", async () => {
    registrationFindUnique.mockResolvedValue({ id: "r1", status: "PROOF_SUBMITTED", whatsappGroupInviteUrl: null });
    registrationUpdate.mockResolvedValue({ id: "r1", status: "APPROVED" });
    const result = await approveRegistration("admin1", "r1", { allowMissingWhatsappLink: true });
    expect(result.status).toBe("APPROVED");
    expect(registrationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.not.objectContaining({ whatsappGroupInviteUrl: expect.anything() }) })
    );
  });

  it("rejects an invalid WhatsApp URL", async () => {
    registrationFindUnique.mockResolvedValue({ id: "r1", status: "PROOF_SUBMITTED", whatsappGroupInviteUrl: null });
    await expect(
      approveRegistration("admin1", "r1", { whatsappGroupInviteUrl: "https://example.com/group" })
    ).rejects.toThrow(/whatsapp invite link/i);
  });

  it("approves and saves a valid WhatsApp link, never touching user or group tables", async () => {
    registrationFindUnique.mockResolvedValue({ id: "r1", status: "PROOF_SUBMITTED", whatsappGroupInviteUrl: null });
    registrationUpdate.mockResolvedValue({ id: "r1", status: "APPROVED", whatsappGroupInviteUrl: "https://chat.whatsapp.com/ABC123" });

    const result = await approveRegistration("admin1", "r1", {
      whatsappGroupInviteUrl: "https://chat.whatsapp.com/ABC123",
      note: "looks good",
    });

    expect(registrationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "APPROVED", whatsappGroupInviteUrl: "https://chat.whatsapp.com/ABC123" }),
      })
    );
    expect(verificationLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "APPROVED", adminId: "admin1" }) })
    );
    expect(result.status).toBe("APPROVED");
  });

  it("reuses an already-saved WhatsApp link when none is passed this time", async () => {
    registrationFindUnique.mockResolvedValue({
      id: "r1",
      status: "UNDER_VERIFICATION",
      whatsappGroupInviteUrl: "https://wa.me/919876543210",
    });
    registrationUpdate.mockResolvedValue({ id: "r1", status: "APPROVED" });

    await approveRegistration("admin1", "r1");

    expect(registrationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ whatsappGroupInviteUrl: "https://wa.me/919876543210" }) })
    );
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
