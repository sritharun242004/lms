/** @vitest-environment jsdom */

import { createElement } from "react";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SendFormDialog } from "./send-form-dialog";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (typeof url === "string" && url.includes("/api/v1/forms?")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ success: true, data: { forms: [{ id: "f1", title: "Day 1 feedback" }] } }),
      });
    }
    return Promise.resolve({ ok: true, json: async () => ({ success: true, data: { id: "msg1", type: "FORM" } }) });
  }) as unknown as typeof fetch;
});

describe("SendFormDialog", () => {
  it("lists published forms and sends the selected one", async () => {
    const onSent = vi.fn();
    render(createElement(SendFormDialog, { trigger: createElement("button", null, "Open"), groupId: "g1", onSent }));

    fireEvent.click(screen.getByText("Open"));
    await waitFor(() => expect(screen.getByText("Day 1 feedback")).toBeTruthy());

    fireEvent.click(screen.getByRole("radio"));
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));

    await waitFor(() => expect(onSent).toHaveBeenCalledWith(expect.objectContaining({ id: "msg1" })));
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/v1/groups/g1/messages/form",
      expect.objectContaining({ method: "POST" })
    );
  });
});
