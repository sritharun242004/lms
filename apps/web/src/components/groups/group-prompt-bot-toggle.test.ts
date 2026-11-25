/** @vitest-environment jsdom */

import { createElement } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/lib/api/services/group-service", () => ({ groupService: { update: mocks.update } }));
vi.mock("sonner", () => ({ toast: { success: mocks.toastSuccess, error: mocks.toastError } }));

import { GroupPromptBotToggle } from "./group-prompt-bot-toggle";

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

const renderToggle = (initialEnabled = false) =>
  render(createElement(GroupPromptBotToggle, { groupId: "group-1", groupName: "Design cohort", initialEnabled }));

describe("Prompt Bot for participants switch", () => {
  it("labels the switch and explains what it does", () => {
    renderToggle();
    const toggle = screen.getByRole("switch", { name: "Prompt Bot for participants" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(toggle.getAttribute("aria-describedby")).toBeTruthy();
    expect(screen.getByText("Participants in this group can open Prompt Bot.")).toBeTruthy();
  });

  it("flips immediately and saves the new state", async () => {
    let resolve: (value: unknown) => void = () => {};
    mocks.update.mockReturnValue(new Promise((r) => (resolve = r)));
    renderToggle();
    const toggle = screen.getByRole("switch", { name: "Prompt Bot for participants" });

    await userEvent.click(toggle);

    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(mocks.update).toHaveBeenCalledWith("group-1", { promptBotEnabled: true });
    resolve({ success: true, data: { promptBotEnabled: true } });
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith("Prompt Bot is on for Design cohort"));
    expect(toggle.getAttribute("aria-checked")).toBe("true");
  });

  it("rolls back and tells the admin when the save fails", async () => {
    mocks.update.mockResolvedValue({ success: false, error: { message: "Only admins can turn Prompt Bot on or off" } });
    renderToggle(true);
    const toggle = screen.getByRole("switch", { name: "Prompt Bot for participants" });

    await userEvent.click(toggle);

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith("Only admins can turn Prompt Bot on or off")
    );
    expect(toggle.getAttribute("aria-checked")).toBe("true");
  });

  it("rolls back on a network failure with a recovery hint", async () => {
    mocks.update.mockRejectedValue(new TypeError(""));
    renderToggle(false);
    const toggle = screen.getByRole("switch", { name: "Prompt Bot for participants" });

    await userEvent.click(toggle);

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("Couldn't update Prompt Bot. Try again."));
    expect(toggle.getAttribute("aria-checked")).toBe("false");
  });
});
