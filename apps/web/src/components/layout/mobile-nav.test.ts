/** @vitest-environment jsdom */

import { createElement, type ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MobileNav } from "./mobile-nav";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) =>
    createElement("a", { href, ...props }, children),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));
vi.mock("@/components/ui/sheet", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  return {
    Sheet: ({ children }: { children: ReactNode }) => React.createElement("div", null, children),
    SheetContent: ({ children }: { children: ReactNode }) => React.createElement("aside", null, children),
    SheetHeader: ({ children }: { children: ReactNode }) => React.createElement("div", null, children),
    SheetTitle: ({ children }: { children: ReactNode }) => React.createElement("h2", null, children),
    SheetTrigger: ({ children }: { children: ReactNode }) => React.createElement("div", null, children),
  };
});

afterEach(cleanup);

describe("mobile navigation", () => {
  it.each([
    [false, false],
    [false, true],
    [true, false],
  ])("does not offer Chats for isMentee=%s isSuperAdmin=%s", (isMentee, isSuperAdmin) => {
    render(createElement(MobileNav, { isMentee, isSuperAdmin }));

    expect(screen.queryByRole("link", { name: "Chats" })).toBeNull();
  });
});
