/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PluginView } from "@/lib/skills/jobs/types";

const mocks = vi.hoisted(() => ({ getPluginVersion: vi.fn(), downloadZip: vi.fn(), toastError: vi.fn() }));
vi.mock("@/lib/skills/jobs/client", () => ({
  getPluginVersion: mocks.getPluginVersion,
  pluginDownloadUrl: (jobId: string, version: number, format: string) => `/dl/${jobId}/${version}/${format}`,
}));
vi.mock("@/lib/skills/client", () => ({ downloadZip: mocks.downloadZip }));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }));
vi.mock("@/components/prompt-bot/skills/skill-files-view", async () => {
  const { createElement: h } = await import("react");
  return {
    SkillFilesView: ({ files, assets = [] }: { files: { path: string }[]; assets?: { path: string }[] }) =>
      h("p", { "data-testid": "files" }, [...files, ...assets].map((f) => f.path).join(",")),
  };
});

import { FIXTURES, pluginVersionDetail } from "./plugin-fixtures";
import { PLUGIN_VERSION_PRUNED_MESSAGE, PluginVersionPreview } from "./plugin-version-preview";

const ok = <T,>(data: T) => ({ ok: true as const, data });
const READY = FIXTURES.readyV2.plugin;
const mount = async (plugin: PluginView = READY) => {
  const view = render(createElement(PluginVersionPreview, { jobId: "j1", plugin }));
  await act(async () => {});
  return view;
};
const tab = (name: RegExp | string) => screen.getByRole("tab", { name });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getPluginVersion.mockImplementation(async (_j: string, v: number) => ok(pluginVersionDetail(v)));
  mocks.downloadZip.mockResolvedValue({ ok: true });
});
afterEach(cleanup);

describe("PluginVersionPreview", () => {
  it("lists every plugin version, newest first, and previews the latest", async () => {
    await mount();
    const select = screen.getByLabelText("Plugin version") as HTMLSelectElement;
    const options = [...select.options].map((o) => o.textContent ?? "");
    // "v2 · 25 Nov 14:02 · 4 skills" in the local time zone.
    expect(options.map((o) => o.slice(0, 2))).toEqual(["v2", "v1"]);
    for (const option of options) expect(option).toMatch(/^v\d+ · \d{1,2} [A-Z][a-z]{2,3} \d{2}:\d{2} · 4 skills$/);
    expect(mocks.getPluginVersion).toHaveBeenCalledWith("j1", 2);
    expect(screen.getByText("acme-quarterly-deck/")).toBeTruthy();
  });

  it("has a tab per skill, main first, plus the plugin's own files", async () => {
    await mount();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["quarterly-deckMain", "deck-designer", "plugin.json and commands"]);
    expect(tab(/^quarterly-deck/).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("files").textContent).toBe("SKILL.md,assets/template.pptx");
    fireEvent.click(tab("deck-designer"));
    expect(screen.getByTestId("files").textContent).toBe("SKILL.md");
    fireEvent.click(tab("plugin.json and commands"));
    expect(screen.getByTestId("files").textContent).toBe(".claude-plugin/plugin.json,commands/quarterly-deck.md,commands/deck-designer.md");
  });

  it("moves between tabs with the arrow keys", async () => {
    await mount();
    fireEvent.keyDown(tab(/^quarterly-deck/), { key: "ArrowRight" });
    expect(tab("deck-designer").getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tab("deck-designer"));
    fireEvent.keyDown(tab("deck-designer"), { key: "End" });
    expect(tab("plugin.json and commands").getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(tab("plugin.json and commands"), { key: "ArrowRight" });
    expect(tab(/^quarterly-deck/).getAttribute("aria-selected")).toBe("true");
  });

  it("previews an older version and keeps loaded ones", async () => {
    await mount();
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Plugin version"), { target: { value: "1" } });
    });
    expect(mocks.getPluginVersion).toHaveBeenLastCalledWith("j1", 1);
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Plugin version"), { target: { value: "2" } });
    });
    expect(mocks.getPluginVersion).toHaveBeenCalledTimes(2);
  });

  it("jumps to a new version when one arrives", async () => {
    const view = await mount();
    const v3 = { ...READY.versions[0], version: 3 };
    await act(async () => {
      view.rerender(createElement(PluginVersionPreview, { jobId: "j1", plugin: { ...READY, latestVersion: 3, versions: [v3, ...READY.versions] } }));
    });
    expect((screen.getByLabelText("Plugin version") as HTMLSelectElement).value).toBe("3");
    expect(mocks.getPluginVersion).toHaveBeenLastCalledWith("j1", 3);
  });

  it("says a pruned version is no longer kept, and offers to load again otherwise", async () => {
    mocks.getPluginVersion.mockResolvedValue({ ok: false, code: "NOT_FOUND", message: "Version not found" });
    await mount();
    expect(screen.getByRole("alert").textContent).toBe(PLUGIN_VERSION_PRUNED_MESSAGE);
    expect(PLUGIN_VERSION_PRUNED_MESSAGE).toBe("This version is no longer kept (only the last 20 are kept).");
    cleanup();
    mocks.getPluginVersion.mockResolvedValueOnce({ ok: false, code: "NETWORK_ERROR", message: "Offline" });
    mocks.getPluginVersion.mockResolvedValueOnce(ok(pluginVersionDetail(2)));
    await mount();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Load again/ }));
    });
    expect(screen.getByText("acme-quarterly-deck/")).toBeTruthy();
  });
});
