/** @vitest-environment jsdom */

import { createElement, type ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesktopNav } from "./desktop-nav";

const { usePathname } = vi.hoisted(() => ({ usePathname: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) =>
    createElement("a", { href, ...rest }, children),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("DesktopNav", () => {
  it("lists items in the required order: Prompt Bot, Dashboard, Question Repository, Forms & Feedback, Coach Management, Workshop Registrations", () => {
    usePathname.mockReturnValue("/dashboard");
    render(createElement(DesktopNav, { isMentee: false, isAdmin: true }));
    const labels = screen.getAllByRole("link").map((el) => el.textContent);
    expect(labels).toEqual(["Prompt Bot", "Dashboard", "Question Repository", "Forms & Feedback", "Coach Management", "Workshop Registrations"]);
  });

  it("combines Forms and Feedback into one nav item pointing at /forms", () => {
    usePathname.mockReturnValue("/dashboard");
    render(createElement(DesktopNav, { isMentee: false, isAdmin: true }));
    expect(screen.queryByText(/^forms$/i)).toBeNull();
    expect(screen.queryByText(/^feedback$/i)).toBeNull();
    const combined = screen.getByText("Forms & Feedback");
    expect(combined.getAttribute("href")).toBe("/forms");
  });

  it("highlights Forms & Feedback as active while on /feedback (the old route)", () => {
    usePathname.mockReturnValue("/feedback");
    render(createElement(DesktopNav, { isMentee: false, isAdmin: true }));
    expect(screen.getByText("Forms & Feedback").getAttribute("aria-current")).toBe("page");
  });

  it("highlights Workshop Registrations as active on a nested registrations route, and nothing else", () => {
    usePathname.mockReturnValue("/admin/registrations");
    render(createElement(DesktopNav, { isMentee: false, isAdmin: true }));
    expect(screen.getByText("Workshop Registrations").getAttribute("aria-current")).toBe("page");
    expect(screen.getByText("Coach Management").getAttribute("aria-current")).toBeNull();
  });

  it("hides staff-only and admin-only items for a MENTEE, leaving only Prompt Bot", () => {
    usePathname.mockReturnValue("/chat");
    render(createElement(DesktopNav, { isMentee: true, isAdmin: false }));
    expect(screen.getAllByRole("link").map((el) => el.getAttribute("href"))).toEqual(["/prompt-bot"]);
  });

  it("hides admin-only items for a MENTOR", () => {
    usePathname.mockReturnValue("/dashboard");
    render(createElement(DesktopNav, { isMentee: false, isAdmin: false }));
    const labels = screen.getAllByRole("link").map((el) => el.textContent);
    expect(labels).toEqual(["Prompt Bot", "Dashboard", "Question Repository", "Forms & Feedback"]);
  });

  it.each([
    [false, true],
    [false, false],
    [true, false],
  ])("offers Prompt Bot first for isMentee=%s isAdmin=%s", (isMentee, isAdmin) => {
    usePathname.mockReturnValue("/prompt-bot/skills");
    render(createElement(DesktopNav, { isMentee, isAdmin }));
    const [first] = screen.getAllByRole("link");
    expect(first.textContent).toBe("Prompt Bot");
    expect(first.getAttribute("href")).toBe("/prompt-bot");
    expect(first.getAttribute("aria-current")).toBe("page");
  });
});
