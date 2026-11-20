/** @vitest-environment jsdom */

import { createElement } from "react";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RegistrationForm } from "./registration-form";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// jsdom has no ResizeObserver, which the Radix Checkbox/Switch primitives
// used in this form need.
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
      data: {
        registration: {
          registrationCode: "XI-2026-0001",
          amountInInr: 28250,
          workshopPackage: "DAY1",
        },
      },
    }),
  }) as unknown as typeof fetch;
});

describe("RegistrationForm", () => {
  it("shows the Day-2-requires-Day-1 hint when Day 2 only is picked without prior attendance", () => {
    render(createElement(RegistrationForm, { onRegistered: () => {} }));
    fireEvent.click(screen.getByLabelText(/day 2 only/i));
    fireEvent.click(screen.getByLabelText(/^no$/i));
    expect(screen.getByText(/switch to both days/i)).toBeTruthy();
  });

  it("submits the form and calls onRegistered with the created registration", async () => {
    const onRegistered = vi.fn();
    render(createElement(RegistrationForm, { onRegistered }));
    fireEvent.click(screen.getByLabelText(/day 1 only/i));
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Asha Rao" } });
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: "asha@example.com" } });
    fireEvent.change(screen.getByLabelText(/whatsapp/i), { target: { value: "+919876543210" } });
    fireEvent.change(screen.getByLabelText(/company \/ organisation/i), { target: { value: "Acme" } });
    fireEvent.change(screen.getByLabelText(/designation/i), { target: { value: "Founder" } });
    fireEvent.click(screen.getByLabelText(/16 or older/i));
    fireEvent.click(screen.getByRole("button", { name: /continue to payment/i }));
    await waitFor(() => expect(onRegistered).toHaveBeenCalled());
  });

  it("defaults to Individual and shows the optional Company/organisation field", () => {
    render(createElement(RegistrationForm, { onRegistered: () => {} }));
    expect(screen.getByLabelText(/company \/ organisation/i)).toBeTruthy();
    expect(screen.queryByLabelText(/company gstin/i)).toBeNull();
  });

  it("switches to Company Registration and shows the company detail fields", () => {
    render(createElement(RegistrationForm, { onRegistered: () => {} }));
    fireEvent.click(screen.getByLabelText(/company registration/i));
    expect(screen.getByLabelText(/^company name$/i)).toBeTruthy();
    expect(screen.getByLabelText(/company address/i)).toBeTruthy();
    expect(screen.getByLabelText(/company gstin/i)).toBeTruthy();
    expect(screen.queryByLabelText(/company \/ organisation/i)).toBeNull();
  });

  it("shows the Need a GST invoice toggle for Individual", () => {
    render(createElement(RegistrationForm, { onRegistered: () => {} }));
    expect(screen.getByText(/need a gst invoice/i)).toBeTruthy();
  });

  it("hides the Need a GST invoice toggle for Company, since the company details already cover it", () => {
    render(createElement(RegistrationForm, { onRegistered: () => {} }));
    fireEvent.click(screen.getByLabelText(/company registration/i));
    expect(screen.queryByText(/need a gst invoice/i)).toBeNull();
    expect(screen.getByText(/gst invoice will use the company details/i)).toBeTruthy();
  });
});
