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

describe("common staff login form", () => {
  it("renders one login for coaches and Super Admins", () => {
    const html = renderToStaticMarkup(createElement(StaffLoginForm));

    expect(html).toContain("Staff sign in");
    expect(html).toContain("Coach or Super Admin");
    expect(html).toContain('href="/forgot-password?portal=admin"');
    expect(html).toContain("text-black");
  });

  it("routes a coach to the canonical coach dashboard and rejects an unsafe redirect", async () => {
    mocks.search = "redirect=javascript%3Aalert(1)";
    const user = userEvent.setup();
    render(createElement(StaffLoginForm));

    await user.type(screen.getByLabelText("Email"), "coach@example.com");
    await user.type(screen.getByLabelText("Password"), "Password123!");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/coach/dashboard"));
  });

  it("routes a Super Admin to the canonical admin dashboard", async () => {
    mocks.login.mockResolvedValue({ id: "admin-1", name: "Admin One", role: "ADMIN" });
    const user = userEvent.setup();
    render(createElement(StaffLoginForm));

    await user.type(screen.getByLabelText("Email"), "admin@example.com");
    await user.type(screen.getByLabelText("Password"), "Password123!");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/admin/dashboard"));
  });
});
