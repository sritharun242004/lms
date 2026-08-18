/** @vitest-environment jsdom */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StaffLoginForm } from "./staff-login-form";

const mocks = vi.hoisted(() => ({
  search: "",
  push: vi.fn(),
  login: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams(mocks.search),
}));

vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({ login: mocks.login }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.search = "";
  mocks.login.mockResolvedValue({ id: "coach-1", name: "Coach One", role: "MENTOR" });
});

afterEach(cleanup);

describe("separate staff portal forms", () => {
  it("renders participant credential login without staff or coach copy", () => {
    expect(() => renderToStaticMarkup(createElement(StaffLoginForm, { portal: "participant" }))).not.toThrow();
    const html = renderToStaticMarkup(createElement(StaffLoginForm, { portal: "participant" }));

    expect(html).toContain("Participant sign in");
    expect(html).not.toContain("Coach sign in");
    expect(html).not.toContain("Super Admin sign in");
    expect(html).not.toContain('href="/coach/signup"');
    expect(html).toContain('href="/forgot-password?portal=participant"');
  });

  it("renders coach-specific login copy and approved coach signup access", () => {
    const html = renderToStaticMarkup(createElement(StaffLoginForm, { portal: "coach" }));

    expect(html).toContain("Coach sign in");
    expect(html).toContain("approved coach email");
    expect(html).toContain('href="/coach/signup"');
    expect(html).toContain('href="/forgot-password?portal=coach"');
    expect(html).not.toContain("Super Admin sign in");
  });

  it("renders super-admin-specific login copy without coach signup", () => {
    const html = renderToStaticMarkup(createElement(StaffLoginForm, { portal: "super-admin" }));

    expect(html).toContain("Super Admin sign in");
    expect(html).not.toContain('href="/coach/signup"');
    expect(html).toContain('href="/forgot-password?portal=super-admin"');
  });

  it("never sends an untrusted redirect value to the client router", async () => {
    mocks.search = "redirect=javascript%3Aalert(1)";
    const user = userEvent.setup();
    render(createElement(StaffLoginForm, { portal: "coach" }));

    await user.type(screen.getByLabelText("Email"), "coach@example.com");
    await user.type(screen.getByLabelText("Password"), "Password123!");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/dashboard"));
  });
});
