/** @vitest-environment jsdom */

import { createElement } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CoachOnboarding } from "./coach-onboarding";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const coaches = [
  {
    id: "coach-1",
    name: "Coach One",
    email: "coach@example.com",
    isActive: true,
    disabledAt: null,
    createdAt: "2026-08-17T00:00:00.000Z",
  },
  {
    id: "coach-2",
    name: "Coach Two",
    email: "coach2@example.com",
    isActive: false,
    disabledAt: "2026-08-18T00:00:00.000Z",
    createdAt: "2026-08-16T00:00:00.000Z",
  },
];

describe("super-admin coach account management", () => {
  it("shows actual coach accounts with edit, password, and logical activation controls", () => {
    render(createElement(CoachOnboarding, { coaches }));

    expect(screen.getByRole("heading", { name: "Coach account management" })).toBeTruthy();
    expect(screen.getByText("Coach One")).toBeTruthy();
    expect(screen.getByText("Coach Two")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Edit coach/ })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: /Set new password/ })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Deactivate Coach One" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reactivate Coach Two" })).toBeTruthy();
    expect(document.body.textContent).not.toContain("StrongPass1!");
  });

  it("requires confirmation before requesting logical deactivation", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { coach: { ...coaches[0], isActive: false } } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    const user = userEvent.setup();
    render(createElement(CoachOnboarding, { coaches }));

    await user.click(screen.getByRole("button", { name: "Deactivate Coach One" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Deactivate Coach One?" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Confirm deactivation" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/admin/coaches/coach-1", { method: "DELETE" });
  });

  it("keeps newly entered coach passwords masked without a plaintext reveal control", async () => {
    const user = userEvent.setup();
    render(createElement(CoachOnboarding, { coaches }));

    await user.click(screen.getByRole("button", { name: "Set new password for Coach One" }));

    expect(screen.getByLabelText("New password").getAttribute("type")).toBe("password");
    expect(screen.getByLabelText("Confirm new password").getAttribute("type")).toBe("password");
    expect(screen.queryByRole("button", { name: "Show password" })).toBeNull();
  });

  it("updates a coach account in place after editing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      success: true,
      data: { coach: { ...coaches[0], name: "Coach Updated", email: "updated@example.com" } },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const user = userEvent.setup();
    render(createElement(CoachOnboarding, { coaches }));

    await user.click(screen.getByRole("button", { name: "Edit coach Coach One" }));
    const dialog = screen.getByRole("dialog");
    await user.clear(within(dialog).getByLabelText("Coach name"));
    await user.type(within(dialog).getByLabelText("Coach name"), "Coach Updated");
    await user.clear(within(dialog).getByLabelText("Coach email"));
    await user.type(within(dialog).getByLabelText("Coach email"), "updated@example.com");
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("Coach Updated")).toBeTruthy();
    expect(screen.getAllByText("updated@example.com")).toHaveLength(1);
    expect(screen.queryByText("coach@example.com")).toBeNull();
  });

  it("creates a coach account directly with a name, email, and password, and offers a copy-password action", async () => {
    const writeText = vi.spyOn(window.navigator.clipboard, "writeText").mockResolvedValue(undefined);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        success: true,
        data: { coach: { id: "coach-3", name: "New Coach", email: "new@example.com", isActive: true, disabledAt: null, createdAt: "2026-08-18T00:00:00.000Z" } },
      }), { status: 201, headers: { "content-type": "application/json" } })
    );
    const user = userEvent.setup();
    render(createElement(CoachOnboarding, { coaches }));

    expect(screen.queryByText("Approve coach email")).toBeNull();
    expect(screen.queryByText("Approved coach emails")).toBeNull();

    await user.type(screen.getByPlaceholderText("Coach name"), "New Coach");
    await user.type(screen.getByPlaceholderText("coach@example.com"), "new@example.com");
    await user.type(screen.getByPlaceholderText("Create a secure password"), "StrongPass1!");
    await user.click(screen.getByRole("button", { name: "Copy password" }));

    expect(writeText).toHaveBeenCalledWith("StrongPass1!");

    await user.click(screen.getByRole("button", { name: "Create coach account" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/admin/coaches", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ name: "New Coach", email: "new@example.com", password: "StrongPass1!" }),
    }));
    expect(await screen.findByText("New Coach")).toBeTruthy();
  });
});
