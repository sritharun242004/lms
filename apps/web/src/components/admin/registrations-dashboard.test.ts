/** @vitest-environment jsdom */

import { createElement } from "react";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RegistrationsDashboard } from "./registrations-dashboard";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const baseRegistration = {
  id: "r1",
  registrationCode: "XI-2026-0001",
  registrationKind: "INDIVIDUAL" as const,
  fullName: "Asha Rao",
  email: "asha@example.com",
  whatsappNumber: "+919876543210",
  designation: "Founder",
  companyName: null,
  companyAddress: null,
  companyGstin: null,
  workshopPackage: "DAY1" as const,
  amountInInr: 28250,
  status: "PROOF_SUBMITTED",
  whatsappGroupInviteUrl: null,
  createdAt: "2026-11-20T00:00:00Z",
  paymentProofs: [{ id: "p1", mimeType: "image/png", submittedAt: "2026-11-20T00:00:00Z" }],
  verificationLogs: [],
};

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
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      success: true,
      data: { registration: { ...baseRegistration, status: "APPROVED", whatsappGroupInviteUrl: "https://chat.whatsapp.com/ABC123" } },
    }),
  }) as unknown as typeof fetch;
});

describe("RegistrationsDashboard", () => {
  it("shows the summary counts passed in", () => {
    render(
      createElement(RegistrationsDashboard, {
        registrations: [baseRegistration],
        summary: { total: 1, byStatus: { PROOF_SUBMITTED: 1 }, approvedRevenueInInr: 0 },
      })
    );
    expect(screen.getByText(/asha rao/i)).toBeTruthy();
    expect(screen.getByText(/individual/i)).toBeTruthy();
    expect(screen.getByText(/day 1/i)).toBeTruthy();
    expect(screen.getByText(/founder/i)).toBeTruthy();
  });

  it("shows company details for a COMPANY registration", () => {
    render(
      createElement(RegistrationsDashboard, {
        registrations: [
          { ...baseRegistration, registrationKind: "COMPANY" as const, companyName: "Acme Co", companyAddress: "Chennai", companyGstin: "33AAACA1234A1Z5" },
        ],
        summary: { total: 1, byStatus: {}, approvedRevenueInInr: 0 },
      })
    );
    expect(screen.getByText(/acme co/i)).toBeTruthy();
    expect(screen.getByText(/33aaaca1234a1z5/i)).toBeTruthy();
  });

  it("sends the WhatsApp group link entered by the admin when approving", async () => {
    render(
      createElement(RegistrationsDashboard, {
        registrations: [baseRegistration],
        summary: { total: 1, byStatus: { PROOF_SUBMITTED: 1 }, approvedRevenueInInr: 0 },
      })
    );
    fireEvent.click(screen.getByRole("button", { name: /^approve$/i }));
    fireEvent.change(screen.getByLabelText(/whatsapp group invitation link/i), {
      target: { value: "https://chat.whatsapp.com/ABC123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /confirm approval/i }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/admin/registrations/r1"),
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            action: "APPROVE",
            note: "",
            whatsappGroupInviteUrl: "https://chat.whatsapp.com/ABC123",
            allowMissingWhatsappLink: false,
          }),
        })
      )
    );
  });
});
