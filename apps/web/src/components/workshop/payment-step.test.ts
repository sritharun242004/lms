/** @vitest-environment jsdom */

import { createElement } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PaymentStep } from "./payment-step";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const baseRegistration = {
  registrationCode: "XI-2026-0001",
  amountInInr: 28250,
  workshopPackage: "DAY1" as const,
  status: "PENDING_PAYMENT",
};

function mockFetch(registration = baseRegistration, paymentDoneResponse?: typeof baseRegistration) {
  return vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    if (typeof url === "string" && url.includes("/qr")) {
      return Promise.resolve({ ok: true, json: async () => ({ success: true, data: { qrDataUrl: "data:image/png;base64,x", demoMode: true } }) });
    }
    if (typeof url === "string" && url.includes("/payment-done") && init?.method === "POST") {
      return Promise.resolve({
        ok: true,
        json: async () => ({ success: true, data: { registration: paymentDoneResponse ?? { ...registration, status: "PAYMENT_DONE" } } }),
      });
    }
    return Promise.resolve({ ok: true, json: async () => ({ success: true, data: { registration } }) });
  });
}

describe("PaymentStep", () => {
  it("shows the demo QR, amount, and a Payment Done button while pending", async () => {
    global.fetch = mockFetch() as unknown as typeof fetch;
    render(createElement(PaymentStep, { registrationCode: "XI-2026-0001" }));
    await waitFor(() => expect(screen.getAllByText("XI-2026-0001").length).toBeGreaterThan(0));
    expect(screen.getByText(/demo payment qr/i)).toBeTruthy();
    expect(screen.getAllByText("₹28,250").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /payment done/i })).toBeTruthy();
  });

  it("shows no proof-upload control and no verification language anywhere", async () => {
    global.fetch = mockFetch() as unknown as typeof fetch;
    render(createElement(PaymentStep, { registrationCode: "XI-2026-0001" }));
    await waitFor(() => expect(screen.getAllByText("XI-2026-0001").length).toBeGreaterThan(0));
    expect(screen.queryByRole("button", { name: /upload/i })).toBeNull();
    expect(screen.queryByText(/payment verified/i)).toBeNull();
    expect(screen.queryByText(/payment approved/i)).toBeNull();
    // The disclaimer correctly says payment is NOT verified in-app — confirm
    // that honest copy is present, not absent.
    expect(screen.getByText(/we do not verify payment/i)).toBeTruthy();
  });

  it("shows the exact confirmation message after clicking Payment Done", async () => {
    global.fetch = mockFetch() as unknown as typeof fetch;
    render(createElement(PaymentStep, { registrationCode: "XI-2026-0001" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /payment done/i })).toBeTruthy());

    await act(async () => {
      screen.getByRole("button", { name: /payment done/i }).click();
    });

    await waitFor(() =>
      expect(screen.getByText("Thank you for registering! We will reach out to you shortly.")).toBeTruthy()
    );
    expect(screen.queryByText(/payment verified/i)).toBeNull();
    expect(screen.queryByText(/payment approved/i)).toBeNull();
  });

  it("shows the confirmation message immediately on reload if already marked done", async () => {
    global.fetch = mockFetch({ ...baseRegistration, status: "PAYMENT_DONE" }) as unknown as typeof fetch;
    render(createElement(PaymentStep, { registrationCode: "XI-2026-0001" }));
    await waitFor(() =>
      expect(screen.getByText("Thank you for registering! We will reach out to you shortly.")).toBeTruthy()
    );
    expect(screen.queryByRole("button", { name: /payment done/i })).toBeNull();
  });

  it("copies the registration ID with the copy button", async () => {
    global.fetch = mockFetch() as unknown as typeof fetch;
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(createElement(PaymentStep, { registrationCode: "XI-2026-0001" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /copy registration id/i })).toBeTruthy());
    await act(async () => {
      screen.getByRole("button", { name: /copy registration id/i }).click();
    });
    expect(writeText).toHaveBeenCalledWith("XI-2026-0001");
    expect(screen.getByText("Copied")).toBeTruthy();
  });
});
