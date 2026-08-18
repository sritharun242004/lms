import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), redirect: vi.fn() }));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement("a", { href }, children),
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/components/layout/theme-toggle", () => ({ ThemeToggle: () => createElement("span", null, "Theme") }));
vi.mock("@/components/layout/user-menu", () => ({ UserMenu: () => createElement("span", null, "User menu") }));
vi.mock("@/components/layout/mobile-nav", () => ({ MobileNav: () => createElement("span", null, "Mobile navigation") }));
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

  it("labels the ADMIN coach route as Coach account management", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "admin-1", role: "ADMIN", name: "Admin" });

    const tree = await AppLayout({ children: createElement("main", null, "Content") });
    const markup = renderToStaticMarkup(tree);

    expect(markup).toContain('href="/admin/coaches"');
    expect(markup).toContain("Coach account management");
    expect(markup).not.toContain("Participant onboarding");
  });
});
