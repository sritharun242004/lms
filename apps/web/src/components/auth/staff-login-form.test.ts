/** @vitest-environment jsdom */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { StaffLoginForm } from "./staff-login-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({ login: vi.fn() }),
}));

describe("separate staff portal forms", () => {
  it("renders coach-specific login copy and approved coach signup access", () => {
    const html = renderToStaticMarkup(createElement(StaffLoginForm, { portal: "coach" }));

    expect(html).toContain("Coach sign in");
    expect(html).toContain("approved coach email");
    expect(html).toContain('href="/coach/signup"');
    expect(html).not.toContain("Super Admin sign in");
  });

  it("renders super-admin-specific login copy without coach signup", () => {
    const html = renderToStaticMarkup(createElement(StaffLoginForm, { portal: "super-admin" }));

    expect(html).toContain("Super Admin sign in");
    expect(html).not.toContain('href="/coach/signup"');
  });
});
