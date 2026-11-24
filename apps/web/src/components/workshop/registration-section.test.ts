/** @vitest-environment jsdom */

import { createElement } from "react";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RegistrationSection } from "./registration-section";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  vi.stubGlobal("open", vi.fn());
  Element.prototype.scrollIntoView = vi.fn();
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (typeof url === "string" && url.includes("/api/v1/workshop/config")) {
      return Promise.resolve({ ok: true, json: async () => ({ success: true, data: { generalWhatsAppInviteUrl: "https://chat.whatsapp.com/GENERAL1" } }) });
    }
    if (typeof url === "string" && url.includes("/api/v1/workshop/registrations/") && url.endsWith("/qr")) {
      return Promise.resolve({ ok: true, json: async () => ({ success: true, data: { qrDataUrl: "data:image/png;base64,x", demoMode: true } }) });
    }
    if (typeof url === "string" && url.endsWith("/payment-done")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          success: true,
          data: { registration: { registrationCode: "XI-2026-0001", amountInInr: 28250, workshopPackage: "DAY1", status: "PAYMENT_DONE" } },
        }),
      });
    }
    if (typeof url === "string" && url.includes("/api/v1/workshop/registrations")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          success: true,
          data: { registration: { registrationCode: "XI-2026-0001", amountInInr: 28250, workshopPackage: "DAY1", status: "PENDING_PAYMENT", whatsappGroupInviteUrl: null } },
        }),
      });
    }
    return Promise.resolve({ ok: true, json: async () => ({ success: true, data: {} }) });
  }) as unknown as typeof fetch;
});

describe("RegistrationSection", () => {
  it("walks the form to payment, then offers the WhatsApp group on the thank-you step", async () => {
    render(createElement(RegistrationSection));
    const next = () => fireEvent.click(screen.getByRole("button", { name: /^next$/i }));

    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Asha Rao" } });
    next();
    await waitFor(() => expect(screen.getByLabelText(/^email$/i)).toBeTruthy());
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: "asha@example.com" } });
    fireEvent.change(screen.getByLabelText(/whatsapp number/i), { target: { value: "+919876543210" } });
    fireEvent.change(screen.getByLabelText(/designation/i), { target: { value: "Founder" } });
    next();
    await waitFor(() => expect(screen.getByText(/registering as/i)).toBeTruthy());
    next();
    await waitFor(() => expect(screen.getByLabelText(/day 1 only/i)).toBeTruthy());
    fireEvent.click(screen.getByLabelText(/day 1 only/i));
    next();
    await waitFor(() => expect(screen.getByLabelText(/16 or older/i)).toBeTruthy());
    fireEvent.click(screen.getByLabelText(/16 or older/i));
    fireEvent.click(screen.getByRole("button", { name: /continue to payment/i }));

    await waitFor(() => expect(screen.getByRole("button", { name: /payment done/i })).toBeTruthy());
    expect(screen.getByText(/step 6 of 7/i)).toBeTruthy();
    // No surprise tab: the group is offered only once payment is done.
    expect(window.open).not.toHaveBeenCalled();
    expect(screen.queryByRole("link", { name: /join whatsapp group/i })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /payment done/i }));
    await waitFor(() =>
      expect(screen.getByRole("link", { name: /join whatsapp group/i }).getAttribute("href")).toBe(
        "https://chat.whatsapp.com/GENERAL1"
      )
    );
    expect(screen.getByText(/step 7 of 7/i)).toBeTruthy();
  });
});
