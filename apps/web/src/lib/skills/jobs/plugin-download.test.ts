import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ jobFindFirst: vi.fn(), versionFindUnique: vi.fn(), fileFindFirst: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { skillJob: { findFirst: mocks.jobFindFirst }, skillPluginVersion: { findUnique: mocks.versionFindUnique }, skillJobFile: { findFirst: mocks.fileFindFirst } },
}));

import { AssetMissingError, JobNotFoundError, VersionNotFoundError } from "./errors";
import { pluginVersionRecord } from "./plugin";
import { downloadPluginVersion, loadPluginVersionDetail, toPluginVersionDetail } from "./plugin-download";
import { buildFixturePlugin, FIXTURE_PLUGIN, fixtureFiles } from "./plugin-fixture.test-helper";
import { PackTooLargeError } from "../zip";

const DECK = new Uint8Array(2048);
const LOGO = new Uint8Array(512);
const built = buildFixturePlugin(fixtureFiles(DECK, LOGO), 3);
const ROW = { version: 3, name: FIXTURE_PLUGIN.name, displayName: FIXTURE_PLUGIN.displayName, createdAt: new Date("2026-11-25T12:00:00Z"), ...pluginVersionRecord(built.skills, built.files) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.jobFindFirst.mockResolvedValue({ id: "j1", pluginLatestVersion: 3 });
  mocks.versionFindUnique.mockResolvedValue(ROW);
  mocks.fileFindFirst.mockImplementation(async ({ where }: { where: { id: string } }) => ({ data: where.id === "deck" ? DECK : LOGO }));
});

describe("loadPluginVersionDetail", () => {
  it("reads an owned version by number or as latest, main skill first, with each skill's assets", async () => {
    const detail = await loadPluginVersionDetail("j1", "latest", "u1");
    expect(mocks.jobFindFirst.mock.calls[0][0].where).toEqual({ id: "j1", userId: "u1" });
    expect(mocks.versionFindUnique.mock.calls[0][0].where).toEqual({ jobId_version: { jobId: "j1", version: 3 } });
    expect(detail?.manifest.version).toBe("1.2.0");
    expect(detail?.commands.map((c) => c.path)).toEqual(["commands/quarterly-deck.md", "commands/deck-designer.md", "commands/deck-grammar-check.md"]);
    expect(detail?.skills.map((s) => [s.name, s.role, s.assets.length])).toEqual([
      ["quarterly-deck", "MAIN", 2],
      ["deck-designer", "SUB", 2],
      ["deck-grammar-check", "SUB", 0],
    ]);
    expect(Object.keys(detail!.skills[0].assets[0])).toEqual(["fileId", "path", "fileName", "bytes"]);
  });

  it("is null when not owned, never generated, missing or unreadable", async () => {
    mocks.jobFindFirst.mockResolvedValueOnce(null);
    expect(await loadPluginVersionDetail("j1", 1, "u2")).toBeNull();
    mocks.jobFindFirst.mockResolvedValueOnce({ pluginLatestVersion: 0 });
    expect(await loadPluginVersionDetail("j1", "latest", "u1")).toBeNull();
    mocks.versionFindUnique.mockResolvedValueOnce(null);
    expect(await loadPluginVersionDetail("j1", 9, "u1")).toBeNull();
    expect(toPluginVersionDetail({ ...ROW, skills: [{ name: 1 }] })).toBeNull();
    expect(toPluginVersionDetail({ ...ROW, files: [{ path: ".claude-plugin/plugin.json", content: "{" }] })).toBeNull();
  });
});

describe("downloadPluginVersion", () => {
  it("names the zips after the plugin and version, loading each original once", async () => {
    expect((await downloadPluginVersion("j1", 3, "u1", "plugin")).filename).toBe("acme-quarterly-deck-v3.zip");
    expect(mocks.fileFindFirst).toHaveBeenCalledTimes(2);
    expect(mocks.fileFindFirst.mock.calls[0][0]).toEqual({ where: { id: "deck", jobId: "j1" }, select: { data: true } });
    expect((await downloadPluginVersion("j1", "latest", "u1", "share")).filename).toBe("acme-quarterly-deck-v3-share.zip");
  });

  it("refuses a foreign task, a missing version, a missing original and an oversized zip", async () => {
    mocks.jobFindFirst.mockResolvedValueOnce(null);
    await expect(downloadPluginVersion("j1", 3, "u2", "plugin")).rejects.toBeInstanceOf(JobNotFoundError);
    mocks.versionFindUnique.mockResolvedValueOnce(null);
    await expect(downloadPluginVersion("j1", 3, "u1", "plugin")).rejects.toBeInstanceOf(VersionNotFoundError);
    mocks.fileFindFirst.mockResolvedValueOnce(null);
    await expect(downloadPluginVersion("j1", 3, "u1", "plugin")).rejects.toBeInstanceOf(AssetMissingError);
    const huge = { ...ROW, assets: [{ fileId: "deck", skill: "quarterly-deck", path: "assets/board-deck.pptx", fileName: "x", bytes: 60 * 1024 * 1024 }] };
    mocks.versionFindUnique.mockResolvedValueOnce(huge);
    mocks.fileFindFirst.mockClear();
    await expect(downloadPluginVersion("j1", 3, "u1", "share")).rejects.toBeInstanceOf(PackTooLargeError);
    expect(mocks.fileFindFirst).not.toHaveBeenCalled();
  });
});
