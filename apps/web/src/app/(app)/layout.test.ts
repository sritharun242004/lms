import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), redirect: vi.fn(), DesktopNav: vi.fn() }));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement("a", { href }, children),
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/components/layout/prompt-bot-button", () => ({
  PromptBotButton: () => createElement("a", { href: "/prompt-bot" }, "Prompt Bot"),
}));
vi.mock("@/components/layout/theme-toggle", () => ({ ThemeToggle: () => createElement("span", null, "Theme") }));
vi.mock("@/components/layout/user-menu", () => ({ UserMenu: () => createElement("span", null, "User menu") }));
vi.mock("@/components/layout/mobile-nav", () => ({ MobileNav: () => createElement("span", null, "Mobile navigation") }));
vi.mock("@/components/layout/desktop-nav", () => ({
  DesktopNav: (props: { isMentee: boolean; isAdmin: boolean }) => {
    mocks.DesktopNav(props);
    return createElement("span", null, "Desktop navigation");
  },
}));
vi.mock("@/components/layout/page-motion", () => ({ PageMotion: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/components/layout/app-frame", () => ({
  AppFrame: ({ header, children }: { header: ReactNode; children: ReactNode }) => createElement("div", null, header, children),
}));

import AppLayout from "./layout";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("desktop shared navigation", () => {
  it.each(["ADMIN", "MENTOR", "MENTEE"])("does not offer Chats to %s users", async (role) => {
    mocks.getCurrentUser.mockResolvedValue({ id: "user-1", role, name: "Portal User" });

    const tree = await AppLayout({ children: createElement("main", null, "Content") });
    const markup = renderToStaticMarkup(tree);

    expect(markup).not.toContain("Chats");
  });

  it.each(["ADMIN", "MENTOR", "MENTEE"])("renders the Prompt Bot header button for %s before the theme and user controls", async (role) => {
    mocks.getCurrentUser.mockResolvedValue({ id: "user-1", role, name: "Portal User" });

    const markup = renderToStaticMarkup(await AppLayout({ children: createElement("main", null, "Content") }));

    expect(markup).toContain('href="/prompt-bot"');
    expect(markup.indexOf("Prompt Bot")).toBeGreaterThan(-1);
    expect(markup.indexOf("Prompt Bot")).toBeLessThan(markup.indexOf("Theme"));
    expect(markup.indexOf("Theme")).toBeLessThan(markup.indexOf("User menu"));
  });

  it("passes isAdmin=true only for an ADMIN, and isMentee correctly for a MENTEE", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "admin-1", role: "ADMIN", name: "Admin" });
    renderToStaticMarkup(await AppLayout({ children: createElement("main", null, "Content") }));
    expect(mocks.DesktopNav).toHaveBeenCalledWith({ isMentee: false, isAdmin: true });

    mocks.getCurrentUser.mockResolvedValue({ id: "mentee-1", role: "MENTEE", name: "Participant" });
    renderToStaticMarkup(await AppLayout({ children: createElement("main", null, "Content") }));
    expect(mocks.DesktopNav).toHaveBeenCalledWith({ isMentee: true, isAdmin: false });
  });

  it("passes isAdmin=false for a MENTOR (staff is not admin)", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "coach-1", role: "MENTOR", name: "Coach" });
    renderToStaticMarkup(await AppLayout({ children: createElement("main", null, "Content") }));
    expect(mocks.DesktopNav).toHaveBeenCalledWith({ isMentee: false, isAdmin: false });
  });
});
