/** @vitest-environment jsdom */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ForgotPasswordPage from "./forgot-password/page";
import ResetPasswordPage from "./reset-password/page";

const mocks = vi.hoisted(() => ({
  search: "",
  push: vi.fn(),
  forgotPassword: vi.fn(),
  resetPassword: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams(mocks.search),
}));

vi.mock("@/lib/api/services/auth-service", () => ({
  authService: {
    forgotPassword: mocks.forgotPassword,
    resetPassword: mocks.resetPassword,
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.search = "";
  mocks.forgotPassword.mockResolvedValue({ success: true, data: { message: "Check your email" } });
  mocks.resetPassword.mockResolvedValue({ success: true, data: { message: "Password reset" } });
});

afterEach(cleanup);

describe("password portal context", () => {
  it("returns the forgot-password flow to the explicit coach portal", () => {
    mocks.search = "portal=coach";
    const html = renderToStaticMarkup(createElement(ForgotPasswordPage));

    expect(html).toContain('href="/coach/login"');
  });

  it("defaults an invalid forgot-password portal to participant", () => {
    mocks.search = "portal=javascript%3Aalert(1)";
    const html = renderToStaticMarkup(createElement(ForgotPasswordPage));

    expect(html).toContain('href="/participant/login"');
  });

  it("preserves the portal when an invalid reset link requests a replacement", () => {
    mocks.search = "portal=super-admin";
    const html = renderToStaticMarkup(createElement(ResetPasswordPage));

    expect(html).toContain('href="/forgot-password?portal=super-admin"');
  });

  it("returns a successful reset to the validated canonical portal", async () => {
    mocks.search = "token=reset-token&portal=super-admin";
    const user = userEvent.setup();
    render(createElement(ResetPasswordPage));

    await user.type(screen.getByLabelText("New password"), "Password123!");
    await user.type(screen.getByLabelText("Confirm new password"), "Password123!");
    await user.click(screen.getByRole("button", { name: "Reset password" }));

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/super-admin/login"));
  });

  it("truthfully shows password recovery unavailable when delivery is not configured", async () => {
    mocks.forgotPassword.mockResolvedValue({
      success: false,
      error: {
        code: "PASSWORD_RECOVERY_UNAVAILABLE",
        message: "Password recovery is temporarily unavailable. Please contact your administrator.",
      },
    });
    const user = userEvent.setup();
    render(createElement(ForgotPasswordPage));

    await user.type(screen.getByLabelText("Email"), "person@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Password recovery is temporarily unavailable"
    );
    expect(screen.queryByRole("heading", { name: "Check your email" })).toBeNull();
  });
});
