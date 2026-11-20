/** @vitest-environment jsdom */

import { createElement } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PaymentStep } from "./payment-step";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const baseRegistration = {
  registrationCode: "XI-2026-0001",
  amountInInr: 28250,
  workshopPackage: "DAY1" as const,
  status: "PROOF_SUBMITTED",
  whatsappGroupInviteUrl: null as string | null,
};

function mockFetchSequence(registrations: (typeof baseRegistration)[]) {
  let call = 0;
  return vi.fn().mockImplementation((url: string) => {
    if (typeof url === "string" && url.includes("/qr")) {
      return Promise.resolve({ ok: true, json: async () => ({ success: true, data: { qrDataUrl: "data:image/png;base64,x", demoMode: true } }) });
    }
    const registration = registrations[Math.min(call, registrations.length - 1)];
    call += 1;
    return Promise.resolve({ ok: true, json: async () => ({ success: true, data: { registration } }) });
  });
}

describe("PaymentStep", () => {
  it("shows the demo QR and upload control while awaiting verification", async () => {
    global.fetch = mockFetchSequence([baseRegistration]) as unknown as typeof fetch;
    render(createElement(PaymentStep, { registrationCode: "XI-2026-0001" }));
    await waitFor(() => expect(screen.getByText("XI-2026-0001")).toBeTruthy());
    expect(screen.getByText(/demo payment qr/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /upload payment proof/i })).toBeTruthy();
  });

  it("shows the rejection message and no Join button when rejected", async () => {
    global.fetch = mockFetchSequence([{ ...baseRegistration, status: "REJECTED" }]) as unknown as typeof fetch;
    render(createElement(PaymentStep, { registrationCode: "XI-2026-0001" }));
    await waitFor(() => expect(screen.getByText(/was not accepted/i)).toBeTruthy());
    expect(screen.queryByRole("link", { name: /join whatsapp group/i })).toBeNull();
  });

  it("shows the approved success state with a Join WhatsApp Group link", async () => {
    global.fetch = mockFetchSequence([
      { ...baseRegistration, status: "APPROVED", whatsappGroupInviteUrl: "https://chat.whatsapp.com/ABC123" },
    ]) as unknown as typeof fetch;
    render(createElement(PaymentStep, { registrationCode: "XI-2026-0001" }));
    await waitFor(() => expect(screen.getByText(/payment verified/i)).toBeTruthy());
    const link = screen.getByRole("link", { name: /join whatsapp group/i });
    expect(link.getAttribute("href")).toBe("https://chat.whatsapp.com/ABC123");
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("polls for status and switches to the approved view without a manual refresh", async () => {
    // Fake timers from the start, so the setInterval the component
    // creates is one the fake clock actually owns — installing fake
    // timers only after a real setInterval already exists leaves that
    // interval running on the real clock, un-advanceable here. Promise
    // microtasks (the fetch mocks) still flush normally under fake
    // timers; only literal timer callbacks are faked.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      global.fetch = mockFetchSequence([
        baseRegistration,
        { ...baseRegistration, status: "APPROVED", whatsappGroupInviteUrl: "https://wa.me/919876543210" },
      ]) as unknown as typeof fetch;

      render(createElement(PaymentStep, { registrationCode: "XI-2026-0001" }));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(screen.getByText(/submitted/i)).toBeTruthy();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(screen.getByText(/payment verified/i)).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});
