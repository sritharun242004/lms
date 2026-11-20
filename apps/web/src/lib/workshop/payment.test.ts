import { describe, expect, it, vi, beforeEach } from "vitest";

const { findUnique, update } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: { workshopRegistration: { findUnique, update } },
}));

import { markPaymentDone, PaymentError } from "./payment";

beforeEach(() => {
  findUnique.mockReset();
  update.mockReset();
});

describe("markPaymentDone", () => {
  it("rejects an unknown registration code", async () => {
    findUnique.mockResolvedValue(null);
    await expect(markPaymentDone("XI-2026-9999")).rejects.toThrow(PaymentError);
    expect(update).not.toHaveBeenCalled();
  });

  it("marks a pending registration as payment done with a timestamp", async () => {
    findUnique.mockResolvedValue({ id: "r1", registrationCode: "XI-2026-0001", status: "PENDING_PAYMENT" });
    update.mockResolvedValue({ id: "r1", status: "PAYMENT_DONE", paymentMarkedDoneAt: new Date() });

    const result = await markPaymentDone("XI-2026-0001");

    expect(update).toHaveBeenCalledWith({
      where: { id: "r1" },
      data: { status: "PAYMENT_DONE", paymentMarkedDoneAt: expect.any(Date) },
    });
    expect(result.status).toBe("PAYMENT_DONE");
  });

  it("is idempotent: clicking it again on an already-done registration does not error or re-write", async () => {
    findUnique.mockResolvedValue({ id: "r1", registrationCode: "XI-2026-0001", status: "PAYMENT_DONE" });

    const result = await markPaymentDone("XI-2026-0001");

    expect(update).not.toHaveBeenCalled();
    expect(result.status).toBe("PAYMENT_DONE");
  });
});
