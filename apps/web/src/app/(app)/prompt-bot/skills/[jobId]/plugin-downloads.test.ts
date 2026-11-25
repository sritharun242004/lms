/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ downloadZip: vi.fn(), toastError: vi.fn() }));
vi.mock("@/lib/skills/jobs/client", () => ({
  pluginDownloadUrl: (jobId: string, version: number, format: string) => `/dl/${jobId}/${version}/${format}`,
}));
vi.mock("@/lib/skills/client", () => ({ downloadZip: mocks.downloadZip }));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }));

import { HowToUsePlugin, PluginDownloads } from "./plugin-downloads";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.downloadZip.mockResolvedValue({ ok: true });
});
afterEach(cleanup);

describe("PluginDownloads", () => {
  it("downloads the selected version as the plugin zip or the share zip", async () => {
    render(createElement(PluginDownloads, { jobId: "j1", version: 2 }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Download for Claude/ }));
    });
    expect(mocks.downloadZip).toHaveBeenCalledWith("/dl/j1/2/plugin");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Download to share/ }));
    });
    expect(mocks.downloadZip).toHaveBeenLastCalledWith("/dl/j1/2/share");
    expect(screen.getByRole("button", { name: /^Download for Claude/ }).textContent).toContain("v2");
  });

  it("reports a refused download", async () => {
    mocks.downloadZip.mockResolvedValue({ ok: false, message: "A file this plugin uses is missing. Generate it again." });
    render(createElement(PluginDownloads, { jobId: "j1", version: 1 }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Download for Claude/ }));
    });
    expect(mocks.toastError).toHaveBeenCalledWith("A file this plugin uses is missing. Generate it again.");
  });
});

describe("HowToUsePlugin", () => {
  it("walks through uploading the plugin and calling a sub-skill", () => {
    render(createElement(HowToUsePlugin, { plugin: "acme-quarterly-deck", example: "deck-grammar-check" }));
    const text = screen.getByRole("region", { name: "How to use this plugin" }).textContent ?? "";
    expect(text).toContain("In Claude, open Settings → Capabilities and turn on Create and edit files.");
    expect(text).toContain("Then go to Plugins → Add → Upload plugin and choose the zip from Download for Claude.");
    expect(text).toContain("In chat, ask for a sub-skill by name (“use deck-grammar-check on this”), or just ask for the whole job.");
    expect(text).toContain("In Claude Code or Cowork, type /acme-quarterly-deck:deck-grammar-check.");
    expect(text).toContain("To share: readable files, a README and the plugin zip. We keep the last 20 versions of this plugin.");
  });
});
