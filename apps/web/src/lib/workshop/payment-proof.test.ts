import { describe, expect, it, vi, beforeEach } from "vitest";

const { findFirst, update, create } = vi.hoisted(() => ({
  findFirst: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    workshopRegistration: { findFirst, update },
    paymentProof: { create },
    $transaction: (fn: any) => fn({ workshopRegistration: { update }, paymentProof: { create } }),
  },
}));

import { submitPaymentProof, MAX_PROOF_SIZE_BYTES, ALLOWED_PROOF_MIME_TYPES } from "./payment-proof";

beforeEach(() => {
  findFirst.mockReset();
  update.mockReset();
  create.mockReset();
});

describe("submitPaymentProof", () => {
  it("rejects a disallowed mime type", async () => {
    findFirst.mockResolvedValue({ id: "r1", registrationCode: "XI-2026-0001" });
    await expect(
      submitPaymentProof("XI-2026-0001", { mimeType: "text/plain", size: 10, data: Buffer.from("x") })
    ).rejects.toThrow(/file type/i);
  });

  it("rejects a file over the size limit", async () => {
    findFirst.mockResolvedValue({ id: "r1", registrationCode: "XI-2026-0001" });
    await expect(
      submitPaymentProof("XI-2026-0001", {
        mimeType: "image/png",
        size: MAX_PROOF_SIZE_BYTES + 1,
        data: Buffer.alloc(1),
      })
    ).rejects.toThrow(/too large/i);
  });

  it("throws when the registration does not exist", async () => {
    findFirst.mockResolvedValue(null);
    await expect(
      submitPaymentProof("XI-2026-9999", { mimeType: "image/png", size: 10, data: Buffer.alloc(10) })
    ).rejects.toThrow(/not found/i);
  });

  it("accepts a valid PDF proof and moves status to PROOF_SUBMITTED", async () => {
    findFirst.mockResolvedValue({ id: "r1", registrationCode: "XI-2026-0001", status: "PENDING_PAYMENT" });
    update.mockResolvedValue({ id: "r1", status: "PROOF_SUBMITTED" });
    expect(ALLOWED_PROOF_MIME_TYPES).toContain("application/pdf");
    const result = await submitPaymentProof("XI-2026-0001", {
      mimeType: "application/pdf",
      size: 1000,
      data: Buffer.alloc(1000),
    });
    expect(result.status).toBe("PROOF_SUBMITTED");
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PROOF_SUBMITTED" }) })
    );
  });
});
