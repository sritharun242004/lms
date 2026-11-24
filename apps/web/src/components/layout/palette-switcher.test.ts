/** @vitest-environment jsdom */

import { createElement, type ReactNode } from "react";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => children,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  DropdownMenuContent: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  DropdownMenuItem: ({ children, onSelect }: { children: ReactNode; onSelect?: () => void }) =>
    createElement("button", { onClick: onSelect }, children),
}));

import { PaletteSwitcher } from "./palette-switcher";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.documentElement.removeAttribute("data-palette");
});

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: {} }) }) as unknown as typeof fetch;
});

describe("PaletteSwitcher", () => {
  it("sets the data-palette attribute and persists the choice", async () => {
    render(createElement(PaletteSwitcher, { initialPalette: "xi-blue" }));
    fireEvent.click(screen.getByLabelText(/choose colour theme/i));
    fireEvent.click(screen.getByText("Emerald"));

    expect(document.documentElement.getAttribute("data-palette")).toBe("emerald");
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/v1/profile/theme",
        expect.objectContaining({ method: "PATCH" })
      )
    );
  });
});
