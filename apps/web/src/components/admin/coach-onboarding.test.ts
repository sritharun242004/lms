/** @vitest-environment jsdom */

import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CoachOnboarding } from "./coach-onboarding";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const approvals = [
  {
    id: "approval-1",
    email: "pending@example.com",
    createdAt: "2026-08-18T00:00:00.000Z",
    claimedAt: null,
  },
];

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
    render(createElement(CoachOnboarding, { approvals, coaches }));

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
    render(createElement(CoachOnboarding, { approvals, coaches }));

    await user.click(screen.getByRole("button", { name: "Deactivate Coach One" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Deactivate Coach One?" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Confirm deactivation" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/admin/coaches/coach-1", { method: "DELETE" });
  });

  it("keeps newly entered coach passwords masked without a plaintext reveal control", async () => {
    const user = userEvent.setup();
    render(createElement(CoachOnboarding, { approvals, coaches }));

    await user.click(screen.getByRole("button", { name: "Set new password for Coach One" }));

    expect(screen.getByLabelText("New password").getAttribute("type")).toBe("password");
    expect(screen.getByLabelText("Confirm new password").getAttribute("type")).toBe("password");
    expect(screen.queryByRole("button", { name: "Show password" })).toBeNull();
  });
});
