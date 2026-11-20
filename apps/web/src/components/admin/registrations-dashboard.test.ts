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
  previousDay1Attendance: null,
  previousDay1When: null,
  aiExperienceLevel: "SOMETIMES" as const,
  aiUseCase: null,
  subscriptions: [] as string[],
  needsGstInvoice: false,
  gstCompanyName: null,
  gstin: null,
  referredBy: null,
  amountInInr: 28250,
  status: "PROOF_SUBMITTED",
  whatsappGroupId: null as string | null,
  whatsappGroupName: null as string | null,
  whatsappGroupInviteUrl: null as string | null,
  createdAt: "2026-11-20T00:00:00Z",
  updatedAt: "2026-11-20T00:00:00Z",
  paymentProofs: [{ id: "p1", mimeType: "image/png", submittedAt: "2026-11-20T00:00:00Z" }],
  verificationLogs: [] as Array<{ id: string; action: string; note: string | null; createdAt: string; adminId: string; admin: { name: string | null; email: string } | null }>,
};

function mockFetch() {
  return vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    if (typeof url === "string" && url.includes("/api/v1/admin/whatsapp-groups")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          success: true,
          data: { groups: [{ id: "g1", name: "XI Workshop — Day 1", inviteUrl: "https://chat.whatsapp.com/ABC123", isActive: true }] },
        }),
      });
    }
    if (typeof url === "string" && url.includes("/api/v1/admin/registrations/") && init?.method === "PATCH") {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            registration: {
              ...baseRegistration,
              status: "APPROVED",
              whatsappGroupId: "g1",
              whatsappGroupName: "XI Workshop — Day 1",
              whatsappGroupInviteUrl: "https://chat.whatsapp.com/ABC123",
            },
          },
        }),
      });
    }
    return Promise.resolve({ ok: true, json: async () => ({ success: true, data: {} }) });
  });
}

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
  global.fetch = mockFetch() as unknown as typeof fetch;
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

  it("loads active WhatsApp groups into the approval dropdown and sends the selected group id", async () => {
    render(
      createElement(RegistrationsDashboard, {
        registrations: [baseRegistration],
        summary: { total: 1, byStatus: { PROOF_SUBMITTED: 1 }, approvedRevenueInInr: 0 },
      })
    );
    fireEvent.click(screen.getByRole("button", { name: /^approve$/i }));

    await waitFor(() => expect(screen.getByText("XI Workshop — Day 1")).toBeTruthy());

    fireEvent.change(screen.getByLabelText(/whatsapp group/i), { target: { value: "g1" } });
    fireEvent.click(screen.getByRole("button", { name: /confirm approval/i }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/admin/registrations/r1"),
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            action: "APPROVE",
            note: "",
            whatsappGroupId: "g1",
            allowMissingWhatsappLink: false,
          }),
        })
      )
    );
  });

  it("disables confirming approval until a group is selected or the exception is checked", async () => {
    render(
      createElement(RegistrationsDashboard, {
        registrations: [baseRegistration],
        summary: { total: 1, byStatus: { PROOF_SUBMITTED: 1 }, approvedRevenueInInr: 0 },
      })
    );
    fireEvent.click(screen.getByRole("button", { name: /^approve$/i }));
    await waitFor(() => expect(screen.getByText("XI Workshop — Day 1")).toBeTruthy());

    expect(screen.getByRole("button", { name: /confirm approval/i })).toHaveProperty("disabled", true);

    fireEvent.click(screen.getByText(/approve without a group/i));
    expect(screen.getByRole("button", { name: /confirm approval/i })).toHaveProperty("disabled", false);
  });

  it("opens a details view showing all submitted fields", () => {
    render(
      createElement(RegistrationsDashboard, {
        registrations: [
          {
            ...baseRegistration,
            registrationKind: "COMPANY" as const,
            companyName: "Acme Co",
            companyAddress: "Chennai",
            companyGstin: "33AAACA1234A1Z5",
            aiUseCase: "internal reporting",
            needsGstInvoice: true,
            gstCompanyName: "Acme Invoicing Pvt Ltd",
            gstin: "33AAACA1234A1Z6",
          },
        ],
        summary: { total: 1, byStatus: {}, approvedRevenueInInr: 0 },
      })
    );
    fireEvent.click(screen.getByRole("button", { name: /view details/i }));
    expect(screen.getByText(/internal reporting/i)).toBeTruthy();
    expect(screen.getByText(/acme invoicing pvt ltd/i)).toBeTruthy();
    expect(screen.getByText(/33aaaca1234a1z6/i)).toBeTruthy();
  });

  it("filters the table by status", () => {
    render(
      createElement(RegistrationsDashboard, {
        registrations: [baseRegistration, { ...baseRegistration, id: "r2", fullName: "Ravi Kumar", status: "APPROVED" }],
        summary: { total: 2, byStatus: {}, approvedRevenueInInr: 0 },
      })
    );
    fireEvent.change(screen.getByLabelText(/filter by status/i), { target: { value: "APPROVED" } });
    expect(screen.queryByText(/asha rao/i)).toBeNull();
    expect(screen.getByText(/ravi kumar/i)).toBeTruthy();
  });
});
