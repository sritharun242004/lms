/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PluginView } from "@/lib/skills/jobs/types";

const mocks = vi.hoisted(() => ({ patchJob: vi.fn(), toastError: vi.fn() }));
vi.mock("@/lib/skills/jobs/client", () => ({ patchJob: mocks.patchJob }));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }));

import { PLUGIN_ID_CHANGE_WARNING, PluginCard } from "./plugin-card";
import { jobView, pluginView } from "./plugin-fixtures";

const ok = <T,>(data: T) => ({ ok: true as const, data });
const mount = (plugin: PluginView = pluginView()) => {
  const onChange = vi.fn();
  render(createElement(PluginCard, { jobId: "j1", plugin, onChange }));
  return onChange;
};
const idInput = () => screen.getByLabelText("Plugin ID") as HTMLInputElement;
const nameInput = () => screen.getByLabelText("Plugin name") as HTMLInputElement;
const V1 = [{ version: 1, name: "acme-quarterly-deck", displayName: "Acme · Quarterly deck", createdAt: "2026-11-25T11:00:00.000Z", skills: 4, assets: 0 }];

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("PluginCard", () => {
  it("shows the plugin's names, marks defaults and how it shows in Claude", () => {
    mount();
    expect(nameInput().value).toBe("Acme · Quarterly deck");
    expect(nameInput().maxLength).toBe(120);
    expect(idInput().value).toBe("acme-quarterly-deck");
    expect(screen.getAllByText("Default")).toHaveLength(2);
    expect(screen.getByText(/Shows in Claude as/).textContent).toBe("Shows in Claude as Acme · Quarterly deck");
    expect(screen.queryByText(PLUGIN_ID_CHANGE_WARNING)).toBeNull();
  });

  it("previews the kebab-case ID while typing and saves it on blur", async () => {
    const saved = pluginView({ name: "acme-deck", nameIsDefault: false });
    mocks.patchJob.mockResolvedValue(ok(jobView({ plugin: saved })));
    const onChange = mount();
    fireEvent.change(idInput(), { target: { value: "Acme Deck!" } });
    expect(screen.getByText("acme-deck", { selector: "code" })).toBeTruthy();
    await act(async () => {
      fireEvent.blur(idInput());
    });
    expect(mocks.patchJob).toHaveBeenCalledWith("j1", { pluginName: "Acme Deck!" });
    expect(onChange).toHaveBeenCalledWith(saved);
    expect(idInput().value).toBe("acme-deck");
  });

  it("saves the display name on Enter and sends nothing when unchanged", async () => {
    mocks.patchJob.mockResolvedValue(ok(jobView({ plugin: pluginView({ displayName: "Acme decks", displayNameIsDefault: false }) })));
    mount();
    fireEvent.blur(nameInput());
    expect(mocks.patchJob).not.toHaveBeenCalled();
    fireEvent.change(nameInput(), { target: { value: "Acme decks" } });
    await act(async () => {
      fireEvent.keyDown(nameInput(), { key: "Enter" });
      fireEvent.blur(nameInput());
    });
    expect(mocks.patchJob).toHaveBeenCalledTimes(1);
    expect(mocks.patchJob).toHaveBeenCalledWith("j1", { pluginDisplayName: "Acme decks" });
  });

  it("resets a set name back to the default", async () => {
    mocks.patchJob.mockResolvedValue(ok(jobView({ plugin: pluginView() })));
    const onChange = mount(pluginView({ name: "my-decks", nameIsDefault: false, displayName: "My decks", displayNameIsDefault: false }));
    expect(screen.queryByText("Default")).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reset plugin ID to default" }));
    });
    expect(mocks.patchJob).toHaveBeenCalledWith("j1", { pluginName: null });
    expect(onChange).toHaveBeenCalledWith(pluginView());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reset plugin name to default" }));
    });
    expect(mocks.patchJob).toHaveBeenLastCalledWith("j1", { pluginDisplayName: null });
  });

  it("warns that a new ID is a new plugin once a version exists", () => {
    mount(pluginView({ latestVersion: 1, versions: V1 }));
    expect(screen.queryByText(PLUGIN_ID_CHANGE_WARNING)).toBeNull();
    fireEvent.change(idInput(), { target: { value: "acme-decks" } });
    expect(screen.getByText(PLUGIN_ID_CHANGE_WARNING)).toBeTruthy();
    expect(PLUGIN_ID_CHANGE_WARNING).toBe("Claude treats a new ID as a new plugin. Remove the old one from Claude after you upload this.");
  });

  it("shows a refused name inline and keeps the typed value", async () => {
    mocks.patchJob.mockResolvedValue({ ok: false, code: "ALREADY_GENERATING", message: "The plugin is being written. Try again when it finishes." });
    mount();
    fireEvent.change(idInput(), { target: { value: "acme-decks" } });
    await act(async () => {
      fireEvent.blur(idInput());
    });
    expect(screen.getByText("The plugin is being written. Try again when it finishes.")).toBeTruthy();
    expect(idInput().getAttribute("aria-invalid")).toBe("true");
    expect(idInput().value).toBe("acme-decks");
  });

  it("locks both names while the plugin is written", () => {
    mount(pluginView({ status: "GENERATING" }));
    expect(idInput().disabled).toBe(true);
    expect(nameInput().disabled).toBe(true);
  });
});
