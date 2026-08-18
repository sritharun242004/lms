/** @vitest-environment jsdom */

import { createElement, type ReactNode } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser, UserRole } from "@cms/shared";
import { UserMenu } from "./user-menu";

const mocks = vi.hoisted(() => ({ push: vi.fn(), logout: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/providers/auth-provider", () => ({ useAuth: () => ({ logout: mocks.logout }) }));
vi.mock("@/components/ui/dropdown-menu", async () => {
  const { createElement } = await vi.importActual<typeof import("react")>("react");
  return {
    DropdownMenu: ({ children }: { children: ReactNode }) => children,
    DropdownMenuTrigger: ({ children }: { children: ReactNode }) => createElement("div", null, children),
    DropdownMenuContent: ({ children }: { children: ReactNode }) => createElement("div", null, children),
    DropdownMenuLabel: ({ children }: { children: ReactNode }) => createElement("div", null, children),
    DropdownMenuSeparator: () => createElement("hr"),
    DropdownMenuItem: ({ children, onSelect }: { children: ReactNode; onSelect?: () => void }) => createElement("button", { onClick: onSelect }, children),
  };
});

function authUser(role: UserRole): AuthUser {
  return { id: "u1", name: "Portal User", email: "user@example.com", role, avatarUrl: null, emailVerified: true };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.logout.mockResolvedValue(undefined);
});

afterEach(cleanup);

describe("role-aware logout", () => {
  it.each([
    ["ADMIN", "/super-admin/login"],
    ["MENTOR", "/coach/login"],
    ["MENTEE", "/participant/login"],
  ] as const)("returns %s users to %s", async (role, expected) => {
    const user = userEvent.setup();
    render(createElement(UserMenu, { user: authUser(role as UserRole) }));

    await user.click(screen.getByRole("button", { name: /sign out/i }));

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(expected));
  });
});
