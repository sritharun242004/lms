/** @vitest-environment jsdom */

import { createElement } from "react";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WhatsAppGroupsManager } from "./whatsapp-groups-manager";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const baseGroup = {
  id: "g1",
  name: "XI Workshop — Day 1",
  inviteUrl: "https://chat.whatsapp.com/ABC123",
  isActive: true,
  createdAt: "2026-11-20T00:00:00Z",
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
});

describe("WhatsAppGroupsManager", () => {
  it("lists existing groups with their active state", () => {
    render(createElement(WhatsAppGroupsManager, { groups: [baseGroup] }));
    expect(screen.getByText("XI Workshop — Day 1")).toBeTruthy();
    expect(screen.getByText(/^active$/i)).toBeTruthy();
  });

  it("creates a new group", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { group: { id: "g2", name: "XI Workshop — Day 2", inviteUrl: "https://wa.me/919876543210", isActive: true, createdAt: "2026-11-20T00:00:00Z" } } }),
    }) as unknown as typeof fetch;

    render(createElement(WhatsAppGroupsManager, { groups: [] }));
    fireEvent.change(screen.getByLabelText(/group name/i), { target: { value: "XI Workshop — Day 2" } });
    fireEvent.change(screen.getByLabelText(/whatsapp invite link/i), { target: { value: "https://wa.me/919876543210" } });
    fireEvent.click(screen.getByRole("button", { name: /add group/i }));

    await waitFor(() => expect(screen.getByText("XI Workshop — Day 2")).toBeTruthy());
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/v1/admin/whatsapp-groups",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "XI Workshop — Day 2", inviteUrl: "https://wa.me/919876543210" }),
      })
    );
  });

  it("deactivates a group", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { group: { ...baseGroup, isActive: false } } }),
    }) as unknown as typeof fetch;

    render(createElement(WhatsAppGroupsManager, { groups: [baseGroup] }));
    fireEvent.click(screen.getByRole("button", { name: /deactivate/i }));

    await waitFor(() => expect(screen.getByText(/^inactive$/i)).toBeTruthy());
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/v1/admin/whatsapp-groups/g1",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ isActive: false }) })
    );
  });

  it("deletes a group after confirming", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { deleted: true } }),
    }) as unknown as typeof fetch;

    render(createElement(WhatsAppGroupsManager, { groups: [baseGroup] }));
    fireEvent.click(screen.getByRole("button", { name: /delete/i }));

    await waitFor(() => expect(screen.queryByText("XI Workshop — Day 1")).toBeNull());
    expect(global.fetch).toHaveBeenCalledWith("/api/v1/admin/whatsapp-groups/g1", expect.objectContaining({ method: "DELETE" }));
  });

  it("edits a group's name and link", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { group: { ...baseGroup, name: "XI Workshop — Day 1 (updated)" } } }),
    }) as unknown as typeof fetch;

    render(createElement(WhatsAppGroupsManager, { groups: [baseGroup] }));
    fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    const inputs = screen.getAllByDisplayValue("XI Workshop — Day 1");
    fireEvent.change(inputs[0], { target: { value: "XI Workshop — Day 1 (updated)" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(screen.getByText("XI Workshop — Day 1 (updated)")).toBeTruthy());
  });
});
