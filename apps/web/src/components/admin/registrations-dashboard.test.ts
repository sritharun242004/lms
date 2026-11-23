/** @vitest-environment jsdom */

import { createElement } from "react";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));

import { RegistrationsDashboard } from "./registrations-dashboard";

const baseRegistration = {
  id: "r1",
  registrationCode: "XI-2026-0001",
  registrationKind: "INDIVIDUAL" as const,
  fullName: "Asha Rao",
  email: "asha@example.com",
  whatsappNumber: "+919876543210",
  designation: "Founder",
  company: null as string | null,
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
  status: "PENDING_PAYMENT",
  paymentMarkedDoneAt: null as string | null,
  createdAt: "2026-11-20T00:00:00Z",
  updatedAt: "2026-11-20T00:00:00Z",
};

afterEach(() => {
  cleanup();
  mocks.refresh.mockReset();
  vi.unstubAllGlobals();
});

describe("RegistrationsDashboard", () => {
  it("shows the summary counts and the new status label, not the old verification language", () => {
    render(
      createElement(RegistrationsDashboard, {
        registrations: [baseRegistration],
        summary: { total: 1, byStatus: { PENDING_PAYMENT: 1 }, paymentDoneRevenueInInr: 0 },
      })
    );
    expect(screen.getByText(/asha rao/i)).toBeTruthy();
    expect(screen.getAllByText(/registered — payment pending/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /^approve$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^reject$/i })).toBeNull();
    expect(screen.queryByText(/whatsapp group/i)).toBeNull();
  });

  it("shows company details for a COMPANY registration", () => {
    render(
      createElement(RegistrationsDashboard, {
        registrations: [
          { ...baseRegistration, registrationKind: "COMPANY" as const, companyName: "Acme Co", companyAddress: "Chennai", companyGstin: "33AAACA1234A1Z5" },
        ],
        summary: { total: 1, byStatus: {}, paymentDoneRevenueInInr: 0 },
      })
    );
    expect(screen.getByText(/acme co/i)).toBeTruthy();
    // Address and GSTIN live in the details view, not the list row.
    expect(screen.queryByText(/33aaaca1234a1z5/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /view details/i }));
    expect(screen.getByText(/33aaaca1234a1z5/i)).toBeTruthy();
  });

  it("shows Payment Marked Done status and the confirmation timestamp in details", () => {
    render(
      createElement(RegistrationsDashboard, {
        registrations: [{ ...baseRegistration, status: "PAYMENT_DONE", paymentMarkedDoneAt: "2026-11-20T10:30:00Z" }],
        summary: { total: 1, byStatus: { PAYMENT_DONE: 1 }, paymentDoneRevenueInInr: 28250 },
      })
    );
    expect(screen.getAllByText(/payment marked done/i).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /view details/i }));
    expect(screen.getByText(/payment done clicked/i)).toBeTruthy();
    expect(screen.getByText(/payment confirmation timestamp/i)).toBeTruthy();
  });

  it("filters by status and by workshop package", () => {
    render(
      createElement(RegistrationsDashboard, {
        registrations: [
          baseRegistration,
          { ...baseRegistration, id: "r2", fullName: "Ravi Kumar", status: "PAYMENT_DONE", workshopPackage: "BOTH" as const },
        ],
        summary: { total: 2, byStatus: {}, paymentDoneRevenueInInr: 0 },
      })
    );
    fireEvent.change(screen.getByLabelText(/filter by status/i), { target: { value: "PAYMENT_DONE" } });
    expect(screen.queryByText(/asha rao/i)).toBeNull();
    expect(screen.getByText(/ravi kumar/i)).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/filter by status/i), { target: { value: "ALL" } });
    fireEvent.change(screen.getByLabelText(/filter by workshop package/i), { target: { value: "BOTH" } });
    expect(screen.queryByText(/asha rao/i)).toBeNull();
    expect(screen.getByText(/ravi kumar/i)).toBeTruthy();
  });

  it("links the export buttons to the export endpoint with the active filters", () => {
    render(
      createElement(RegistrationsDashboard, {
        registrations: [baseRegistration],
        summary: { total: 1, byStatus: {}, paymentDoneRevenueInInr: 0 },
      })
    );
    fireEvent.change(screen.getByLabelText(/filter by status/i), { target: { value: "PENDING_PAYMENT" } });
    const csvLink = screen.getByRole("link", { name: /export csv/i });
    expect(csvLink.getAttribute("href")).toBe("/api/v1/admin/registrations/export?format=csv&status=PENDING_PAYMENT");
  });

  it("opens a details view showing all submitted fields, including GST invoice billing details", () => {
    render(
      createElement(RegistrationsDashboard, {
        registrations: [
          {
            ...baseRegistration,
            aiUseCase: "internal reporting",
            needsGstInvoice: true,
            gstCompanyName: "Acme Invoicing Pvt Ltd",
            gstin: "33AAACA1234A1Z6",
          },
        ],
        summary: { total: 1, byStatus: {}, paymentDoneRevenueInInr: 0 },
      })
    );
    fireEvent.click(screen.getByRole("button", { name: /view details/i }));
    expect(screen.getByText(/internal reporting/i)).toBeTruthy();
    expect(screen.getByText(/acme invoicing pvt ltd/i)).toBeTruthy();
    expect(screen.getByText(/33aaaca1234a1z6/i)).toBeTruthy();
  });

  it("flags a Day 2 booking made without Day 1 and shows the individual's organisation", () => {
    render(
      createElement(RegistrationsDashboard, {
        registrations: [
          { ...baseRegistration, workshopPackage: "DAY2" as const, previousDay1Attendance: false, company: "Acme Labs" },
        ],
        summary: { total: 1, byStatus: { PENDING_PAYMENT: 1 }, paymentDoneRevenueInInr: 0 },
      })
    );
    expect(screen.getByText("No Day 1 yet")).toBeTruthy();
    expect(screen.getByText(/Acme Labs/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /view details/i }));
    expect(screen.getAllByText("Acme Labs").length).toBeGreaterThan(0);
    expect(screen.getByText("No")).toBeTruthy();
  });

  it("formats times in India time regardless of the viewer's locale", () => {
    render(
      createElement(RegistrationsDashboard, {
        registrations: [baseRegistration],
        summary: { total: 1, byStatus: { PENDING_PAYMENT: 1 }, paymentDoneRevenueInInr: 0 },
      })
    );
    // 2026-11-20T00:00:00Z is 5:30 am in Asia/Kolkata.
    expect(screen.getByText(/20\/11\/2026, 5:30:00 am/)).toBeTruthy();
  });

  it("deletes a registration only after confirmation, then refreshes the list", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: { id: "r1" } }) });
    vi.stubGlobal("fetch", fetchMock);
    render(
      createElement(RegistrationsDashboard, {
        registrations: [baseRegistration],
        summary: { total: 1, byStatus: { PENDING_PAYMENT: 1 }, paymentDoneRevenueInInr: 0 },
      })
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete Asha Rao" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("Delete Asha Rao's registration?")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Delete registration" }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/admin/registrations/r1", { method: "DELETE" });
  });

  it("keeps the dialog open and does not refresh when the delete fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({ success: false, error: { message: "Registration not found" } }) })
    );
    render(
      createElement(RegistrationsDashboard, {
        registrations: [baseRegistration],
        summary: { total: 1, byStatus: { PENDING_PAYMENT: 1 }, paymentDoneRevenueInInr: 0 },
      })
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete Asha Rao" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete registration" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Delete registration" })).toBeTruthy());
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(screen.getByText("Delete Asha Rao's registration?")).toBeTruthy();
  });

  it("marks a registration as paid from the row switch, then refreshes the list", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: {} }) });
    vi.stubGlobal("fetch", fetchMock);
    render(
      createElement(RegistrationsDashboard, {
        registrations: [baseRegistration],
        summary: { total: 1, byStatus: { PENDING_PAYMENT: 1 }, paymentDoneRevenueInInr: 0 },
      })
    );

    const toggle = screen.getByRole("switch", { name: "Mark Asha Rao as paid" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(toggle);
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/admin/registrations/r1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paid: true }),
    });
  });

  it("shows the switch on for a paid registration and turning it off sends paid: false", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: {} }) });
    vi.stubGlobal("fetch", fetchMock);
    render(
      createElement(RegistrationsDashboard, {
        registrations: [{ ...baseRegistration, status: "PAYMENT_DONE", paymentMarkedDoneAt: "2026-11-20T00:00:00Z" }],
        summary: { total: 1, byStatus: { PAYMENT_DONE: 1 }, paymentDoneRevenueInInr: 28250 },
      })
    );

    const toggle = screen.getByRole("switch", { name: "Mark Asha Rao as paid" });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(toggle);
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ paid: false });
  });
});
