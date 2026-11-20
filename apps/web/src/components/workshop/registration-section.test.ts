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
  vi.stubGlobal("open", vi.fn());
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (typeof url === "string" && url.includes("/api/v1/workshop/config")) {
      return Promise.resolve({ ok: true, json: async () => ({ success: true, data: { generalWhatsAppInviteUrl: "https://chat.whatsapp.com/GENERAL1" } }) });
    }
    if (typeof url === "string" && url.includes("/api/v1/workshop/registrations/") && url.endsWith("/qr")) {
      return Promise.resolve({ ok: true, json: async () => ({ success: true, data: { qrDataUrl: "data:image/png;base64,x", demoMode: true } }) });
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
  it("opens the general WhatsApp group in a new tab after registering, with a fallback link", async () => {
    render(createElement(RegistrationSection));

    fireEvent.click(screen.getByLabelText(/day 1 only/i));
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Asha Rao" } });
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: "asha@example.com" } });
    fireEvent.change(screen.getByLabelText(/whatsapp number/i), { target: { value: "+919876543210" } });
    fireEvent.change(screen.getByLabelText(/designation/i), { target: { value: "Founder" } });
    fireEvent.click(screen.getByLabelText(/16 or older/i));
    fireEvent.click(screen.getByRole("button", { name: /continue to payment/i }));

    await waitFor(() => expect(window.open).toHaveBeenCalledWith("https://chat.whatsapp.com/GENERAL1", "_blank", "noopener,noreferrer"));
    expect(screen.getByRole("link", { name: /didn't open\? click here/i }).getAttribute("href")).toBe(
      "https://chat.whatsapp.com/GENERAL1"
    );
  });
});
