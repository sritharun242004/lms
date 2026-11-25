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

// The form is a wizard; these walk it the way a visitor would.
async function next() {
  fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
}

async function fillToCompanyStep() {
  fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Asha Rao" } });
  await next();
  await waitFor(() => expect(screen.getByLabelText(/^email$/i)).toBeTruthy());
  fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: "asha@example.com" } });
  fireEvent.change(screen.getByLabelText(/whatsapp/i), { target: { value: "+919876543210" } });
  fireEvent.change(screen.getByLabelText(/designation/i), { target: { value: "Founder" } });
  await next();
  await waitFor(() => expect(screen.getByText(/registering as/i)).toBeTruthy());
}

describe("RegistrationForm", () => {
  it("starts by asking only for the name", () => {
    render(createElement(RegistrationForm, { onRegistered: () => {} }));
    expect(screen.getByText("What's your name?")).toBeTruthy();
    expect(screen.getByText(/step 1 of 7/i)).toBeTruthy();
    expect(screen.queryByLabelText(/^email$/i)).toBeNull();
  });

  it("does not grab focus on page load (which would scroll visitors past the landing page)", () => {
    render(createElement(RegistrationForm, { onRegistered: () => {} }));
    expect(document.activeElement).not.toBe(screen.getByLabelText(/full name/i));
  });

  it("moves focus into the next step once the visitor taps Next", async () => {
    render(createElement(RegistrationForm, { onRegistered: () => {} }));
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Asha Rao" } });
    await next();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(/^email$/i)));
  });

  it("does not advance past a step with a missing required field", async () => {
    render(createElement(RegistrationForm, { onRegistered: () => {} }));
    await next();
    await waitFor(() => expect(screen.getByText(/enter your full name/i)).toBeTruthy());
    expect(screen.getByText("What's your name?")).toBeTruthy();
  });

  it("goes back a step and keeps what was typed", async () => {
    render(createElement(RegistrationForm, { onRegistered: () => {} }));
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Asha Rao" } });
    await next();
    await waitFor(() => expect(screen.getByLabelText(/^email$/i)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect((screen.getByLabelText(/full name/i) as HTMLInputElement).value).toBe("Asha Rao");
  });

  it("pops up a Day 1 heads-up for Day 2 only without Day 1, but still lets them continue", async () => {
    render(createElement(RegistrationForm, { onRegistered: () => {} }));
    await fillToCompanyStep();
    await next();
    await waitFor(() => expect(screen.getByLabelText(/day 2 only/i)).toBeTruthy());
    fireEvent.click(screen.getByLabelText(/day 2 only/i));
    fireEvent.click(screen.getByLabelText(/^no$/i));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    expect(screen.getByText(/you need to know the day 1 material/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /continue with day 2/i }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect((screen.getByLabelText(/day 2 only/i) as HTMLInputElement).checked).toBe(true);
    await next();
    await waitFor(() => expect(screen.getByText("A little about you")).toBeTruthy());
  });

  it("lets the Day 1 heads-up switch the booking to Both days", async () => {
    render(createElement(RegistrationForm, { onRegistered: () => {} }));
    await fillToCompanyStep();
    await next();
    await waitFor(() => expect(screen.getByLabelText(/day 2 only/i)).toBeTruthy());
    fireEvent.click(screen.getByLabelText(/day 2 only/i));
    fireEvent.click(screen.getByLabelText(/^no$/i));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /switch to both days/i }));
    await waitFor(() => expect((screen.getByLabelText(/both days/i) as HTMLInputElement).checked).toBe(true));
  });

  it("walks every step and calls onRegistered with the created registration", async () => {
    const onRegistered = vi.fn();
    render(createElement(RegistrationForm, { onRegistered }));
    await fillToCompanyStep();
    fireEvent.change(screen.getByLabelText(/company \/ organisation/i), { target: { value: "Acme" } });
    await next();
    await waitFor(() => expect(screen.getByLabelText(/day 1 only/i)).toBeTruthy());
    fireEvent.click(screen.getByLabelText(/day 1 only/i));
    await next();
    await waitFor(() => expect(screen.getByLabelText(/16 or older/i)).toBeTruthy());
    fireEvent.click(screen.getByLabelText(/16 or older/i));
    fireEvent.click(screen.getByRole("button", { name: /continue to payment/i }));
    await waitFor(() => expect(onRegistered).toHaveBeenCalled());
    const body = JSON.parse((global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body).toMatchObject({ fullName: "Asha Rao", company: "Acme", workshopPackage: "DAY1" });
  });

  it("sends one registration even when Continue is tapped twice in quick succession", async () => {
    const onRegistered = vi.fn();
    render(createElement(RegistrationForm, { onRegistered }));
    await fillToCompanyStep();
    await next();
    await waitFor(() => expect(screen.getByLabelText(/day 1 only/i)).toBeTruthy());
    fireEvent.click(screen.getByLabelText(/day 1 only/i));
    await next();
    await waitFor(() => expect(screen.getByLabelText(/16 or older/i)).toBeTruthy());
    fireEvent.click(screen.getByLabelText(/16 or older/i));
    const submit = screen.getByRole("button", { name: /continue to payment/i });
    fireEvent.click(submit);
    fireEvent.click(submit);
    await waitFor(() => expect(onRegistered).toHaveBeenCalled());
    const posts = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([url]) => url === "/api/v1/workshop/registrations"
    );
    expect(posts).toHaveLength(1);
  });

  it("defaults to Individual and shows the optional Company/organisation field", async () => {
    render(createElement(RegistrationForm, { onRegistered: () => {} }));
    await fillToCompanyStep();
    expect(screen.getByLabelText(/company \/ organisation/i)).toBeTruthy();
    expect(screen.queryByLabelText(/company gstin/i)).toBeNull();
  });

  it("switches to Company Registration and shows the company detail fields", async () => {
    render(createElement(RegistrationForm, { onRegistered: () => {} }));
    await fillToCompanyStep();
    fireEvent.click(screen.getByLabelText(/company registration/i));
    expect(screen.getByLabelText(/^company name$/i)).toBeTruthy();
    expect(screen.getByLabelText(/company address/i)).toBeTruthy();
    expect(screen.getByLabelText(/company gstin/i)).toBeTruthy();
    expect(screen.queryByLabelText(/company \/ organisation/i)).toBeNull();
  });

  it("requires the company details before leaving the company step for a Company registration", async () => {
    render(createElement(RegistrationForm, { onRegistered: () => {} }));
    await fillToCompanyStep();
    fireEvent.click(screen.getByLabelText(/company registration/i));
    await next();
    await waitFor(() => expect(screen.getByText(/enter your company name/i)).toBeTruthy());
    expect(screen.getByLabelText(/company gstin/i)).toBeTruthy();
  });

  it("shows the Need a GST invoice toggle for Individual", async () => {
    render(createElement(RegistrationForm, { onRegistered: () => {} }));
    await fillToCompanyStep();
    expect(screen.getByText(/need a gst invoice/i)).toBeTruthy();
  });

  it("hides the Need a GST invoice toggle for Company, since the company details already cover it", async () => {
    render(createElement(RegistrationForm, { onRegistered: () => {} }));
    await fillToCompanyStep();
    fireEvent.click(screen.getByLabelText(/company registration/i));
    expect(screen.queryByText(/need a gst invoice/i)).toBeNull();
    expect(screen.getByText(/gst invoice will use the company details/i)).toBeTruthy();
  });
});
