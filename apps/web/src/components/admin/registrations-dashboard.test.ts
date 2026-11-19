/** @vitest-environment jsdom */

import { createElement } from "react";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RegistrationsDashboard } from "./registrations-dashboard";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const baseRegistration = {
  id: "r1",
  registrationCode: "XI-2026-0001",
  fullName: "Asha Rao",
  email: "asha@example.com",
  workshopPackage: "DAY1" as const,
  amountInInr: 28250,
  status: "PROOF_SUBMITTED",
  paymentProofs: [{ id: "p1", mimeType: "image/png", submittedAt: "2026-11-20T00:00:00Z" }],
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ success: true, data: { registration: { ...baseRegistration, status: "APPROVED" } } }),
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
  });

  it("calls the approve endpoint and reflects the new status", async () => {
    render(
      createElement(RegistrationsDashboard, {
        registrations: [baseRegistration],
        summary: { total: 1, byStatus: { PROOF_SUBMITTED: 1 }, approvedRevenueInInr: 0 },
      })
    );
    fireEvent.click(screen.getByRole("button", { name: /^approve$/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm approval/i }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/admin/registrations/r1"),
        expect.objectContaining({ method: "PATCH" })
      )
    );
  });
});
