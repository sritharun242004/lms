/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JobSkillView, VersionDetail } from "@/lib/skills/jobs/types";

const mocks = vi.hoisted(() => ({ getVersion: vi.fn(), downloadZip: vi.fn(), toastError: vi.fn() }));
vi.mock("@/lib/skills/jobs/client", () => ({
  getVersion: mocks.getVersion,
  versionDownloadUrl: (j: string, s: string, v: number, f: string) => `/dl/${j}/${s}/${v}/${f}`,
}));
vi.mock("@/lib/skills/client", () => ({ downloadZip: mocks.downloadZip }));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }));

import { VERSION_PRUNED_MESSAGE, VersionPreview } from "./version-preview";

const detail = (version: number): VersionDetail => ({
  skillId: "s1",
  version,
  name: version === 1 ? "board-notes" : "board-update",
  description: "Writes it.",
  createdAt: "2026-11-25T14:02:00.000Z",
  files: [{ path: "SKILL.md", content: `---\nname: x\ndescription: "d"\n---\n\n# Version ${version}\n` }],
  assets: [{ fileId: "f1", path: "assets/deck.pptx", fileName: "deck.pptx", bytes: 2048 }],
});
const skill = (over: Partial<JobSkillView> = {}): JobSkillView => ({
  id: "s1",
  order: 0,
  name: "board-update",
  purpose: "Writes it.",
  fileIds: [],
  status: "READY",
  validationErrors: [],
  latestVersion: 2,
  versions: [
    { version: 2, name: "board-update", createdAt: "2026-11-25T14:02:00.000Z", assets: 1 },
    { version: 1, name: "board-notes", createdAt: "2026-11-24T09:00:00.000Z", assets: 0 },
  ],
  ...over,
});
const flush = () => act(async () => {});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getVersion.mockImplementation(async (_j: string, _s: string, v: number) => ({ ok: true, data: detail(v) }));
  mocks.downloadZip.mockResolvedValue({ ok: true });
});
afterEach(cleanup);

describe("VersionPreview", () => {
  it("shows the latest version first and lists every version", async () => {
    render(createElement(VersionPreview, { jobId: "j1", skill: skill() }));
    await flush();
    expect(mocks.getVersion).toHaveBeenCalledWith("j1", "s1", 2);
    expect(screen.getByRole("heading", { name: "Version 2" })).toBeTruthy();
    const options = Array.from((screen.getByLabelText("Version: board-update") as HTMLSelectElement).options).map((o) => o.textContent ?? "");
    expect(options).toHaveLength(2);
    expect(options[0].startsWith("v2 · ")).toBe(true);
    expect(options[1].startsWith("v1 · ")).toBe(true);
    // "v3 · 25 Nov 14:02": day, short month, 24-hour time, no comma (local time zone).
    for (const option of options) expect(option).toMatch(/^v\d+ · \d{1,2} [A-Z][a-z]{2,3} \d{2}:\d{2}$/);
    expect(screen.getByText(/We keep the last 20 versions of each skill\./)).toBeTruthy();
    expect(screen.getByText("board-update/")).toBeTruthy();
  });

  it("previews an older version and remembers loaded ones", async () => {
    render(createElement(VersionPreview, { jobId: "j1", skill: skill() }));
    await flush();
    fireEvent.change(screen.getByLabelText("Version: board-update"), { target: { value: "1" } });
    await flush();
    expect(mocks.getVersion).toHaveBeenLastCalledWith("j1", "s1", 1);
    expect(screen.getByRole("heading", { name: "Version 1" })).toBeTruthy();
    expect(screen.getByText("board-notes/")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Version: board-update"), { target: { value: "2" } });
    await flush();
    expect(mocks.getVersion).toHaveBeenCalledTimes(2);
  });

  it("downloads the selected version as an upload zip or a pack", async () => {
    render(createElement(VersionPreview, { jobId: "j1", skill: skill() }));
    await flush();
    fireEvent.change(screen.getByLabelText("Version: board-update"), { target: { value: "1" } });
    await flush();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Download for Claude/ }));
    });
    expect(mocks.downloadZip).toHaveBeenCalledWith("/dl/j1/s1/1/upload");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Download to share/ }));
    });
    expect(mocks.downloadZip).toHaveBeenCalledWith("/dl/j1/s1/1/pack");
  });

  it("names the skill on its version picker and downloads for screen readers", async () => {
    render(createElement(VersionPreview, { jobId: "j1", skill: skill() }));
    await flush();
    expect(screen.getByLabelText("Version: board-update")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Download for Claude: board-update" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Download to share: board-update" })).toBeTruthy();
  });

  it("reports a refused download", async () => {
    mocks.downloadZip.mockResolvedValue({ ok: false, message: "A file this version uses is no longer available. Generate the skill again." });
    render(createElement(VersionPreview, { jobId: "j1", skill: skill() }));
    await flush();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Download for Claude/ }));
    });
    expect(mocks.toastError).toHaveBeenCalledWith("A file this version uses is no longer available. Generate the skill again.");
  });

  it("jumps to a new version when one arrives", async () => {
    const view = render(createElement(VersionPreview, { jobId: "j1", skill: skill() }));
    await flush();
    fireEvent.change(screen.getByLabelText("Version: board-update"), { target: { value: "1" } });
    await flush();
    view.rerender(
      createElement(VersionPreview, {
        jobId: "j1",
        skill: skill({ latestVersion: 3, versions: [{ version: 3, name: "board-update", createdAt: "2026-11-25T15:00:00.000Z", assets: 1 }, ...skill().versions] }),
      }),
    );
    await flush();
    expect((screen.getByLabelText("Version: board-update") as HTMLSelectElement).value).toBe("3");
    expect(mocks.getVersion).toHaveBeenLastCalledWith("j1", "s1", 3);
  });

  it("offers to load again when a version can't be read", async () => {
    mocks.getVersion.mockResolvedValueOnce({ ok: false, code: "NETWORK_ERROR", message: "Couldn't reach the server." });
    render(createElement(VersionPreview, { jobId: "j1", skill: skill() }));
    await flush();
    expect(screen.getByRole("alert").textContent).toContain("couldn't load this version");
    fireEvent.click(screen.getByRole("button", { name: /Load again/ }));
    await flush();
    expect(screen.getByRole("heading", { name: "Version 2" })).toBeTruthy();
  });

  it("says a pruned version is no longer kept, with nothing to retry", async () => {
    mocks.getVersion.mockResolvedValueOnce({ ok: false, code: "NOT_FOUND", message: "Version not found" });
    render(createElement(VersionPreview, { jobId: "j1", skill: skill() }));
    await flush();
    expect(screen.getByRole("alert").textContent).toBe(VERSION_PRUNED_MESSAGE);
    expect(VERSION_PRUNED_MESSAGE).toBe("This version is no longer kept (only the last 20 are kept).");
    expect(screen.queryByRole("button", { name: /Load again/ })).toBeNull();
  });
});
