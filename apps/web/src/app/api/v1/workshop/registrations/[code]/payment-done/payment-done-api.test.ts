import { NextRequest } from "next/server";
import { describe, expect, it, vi, beforeEach } from "vitest";

const { markPaymentDone } = vi.hoisted(() => ({ markPaymentDone: vi.fn() }));

vi.mock("@/lib/workshop/payment", () => ({
  markPaymentDone,
  PaymentError: class PaymentError extends Error {
    constructor(message: string, public code: string, public status: number) {
      super(message);
    }
  },
}));

import { POST } from "./route";

beforeEach(() => {
  markPaymentDone.mockReset();
});

describe("POST /api/v1/workshop/registrations/[code]/payment-done", () => {
  it("marks the registration as payment done", async () => {
    markPaymentDone.mockResolvedValue({
      registrationCode: "XI-2026-0001",
      status: "PAYMENT_DONE",
      workshopPackage: "DAY1",
      amountInInr: 28250,
    });
    const res = await POST(new NextRequest("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ code: "XI-2026-0001" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.registration.status).toBe("PAYMENT_DONE");
  });

  it("returns 404 for an unknown registration code", async () => {
    const { PaymentError } = await import("@/lib/workshop/payment");
    markPaymentDone.mockRejectedValue(new PaymentError("Registration not found", "NOT_FOUND", 404));
    const res = await POST(new NextRequest("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ code: "XI-2026-9999" }),
    });
    expect(res.status).toBe(404);
  });
});
