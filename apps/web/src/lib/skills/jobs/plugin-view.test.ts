import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ jobFindFirst: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { skillJob: { findFirst: mocks.jobFindFirst } } }));

import { loadJobView, toPluginView } from "./jobs";
import { PLUGIN_GENERATION_INTERRUPTED_MESSAGE } from "./staleness";

const NOW = new Date("2026-11-25T12:00:00Z");
const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60_000);
const versionRow = (version: number) => ({
  version,
  name: "acme-deck",
  displayName: "Acme · Deck",
  createdAt: minutesAgo(version),
  files: [{ path: ".claude-plugin/plugin.json", content: "{}" }, { path: "commands/a.md", content: "" }, { path: "commands/b.md", content: "" }, { path: "commands/c.md", content: "" }],
  assets: [{ fileId: "f1" }, { fileId: "f1" }],
});
const job = (over: Record<string, unknown> = {}) => ({
  title: "Quarterly deck",
  company: "Acme",
  pluginName: null,
  pluginDisplayName: null,
  pluginStatus: "DRAFT",
  pluginValidationErrors: [],
  pluginGenerationStartedAt: null,
  pluginLatestVersion: 0,
  pluginVersions: [],
  ...over,
}) as never;
const skill = (id: string, role: string, order: number) => ({
  id, jobId: "j1", order, role, name: id, label: "", purpose: "p", focus: "", step: "", fileIds: [], status: "DRAFT",
  validationErrors: [], generationStartedAt: null, latestVersion: 0, createdAt: NOW, updatedAt: NOW, versions: [],
});

beforeEach(() => vi.clearAllMocks());

describe("toPluginView", () => {
  it("reports the defaults while nothing is set", () => {
    expect(toPluginView(job(), NOW)).toEqual({
      name: "acme-quarterly-deck",
      nameIsDefault: true,
      displayName: "Acme · Quarterly deck",
      displayNameIsDefault: true,
      status: "DRAFT",
      validationErrors: [],
      latestVersion: 0,
      versions: [],
    });
  });

  it("uses set names and summarises versions in the order given (newest first)", () => {
    const view = toPluginView(job({ pluginName: "deck-kit", pluginDisplayName: "Deck kit", pluginStatus: "READY", pluginLatestVersion: 2, pluginVersions: [versionRow(2), versionRow(1)] }), NOW);
    expect(view).toMatchObject({ name: "deck-kit", nameIsDefault: false, displayName: "Deck kit", displayNameIsDefault: false, latestVersion: 2 });
    expect(view.versions).toEqual([
      { version: 2, name: "acme-deck", displayName: "Acme · Deck", createdAt: minutesAgo(2).toISOString(), skills: 3, assets: 2 },
      { version: 1, name: "acme-deck", displayName: "Acme · Deck", createdAt: minutesAgo(1).toISOString(), skills: 3, assets: 2 },
    ]);
  });

  it("shows a stale generation as failed and a fresh one as generating", () => {
    expect(toPluginView(job({ pluginStatus: "GENERATING", pluginGenerationStartedAt: minutesAgo(11) }), NOW)).toMatchObject({
      status: "FAILED",
      validationErrors: [PLUGIN_GENERATION_INTERRUPTED_MESSAGE],
    });
    expect(toPluginView(job({ pluginStatus: "GENERATING", pluginGenerationStartedAt: minutesAgo(1) }), NOW).status).toBe("GENERATING");
  });
});

describe("loadJobView plugin fields", () => {
  it("adds company and plugin, lists the main skill first and reads only small version columns", async () => {
    mocks.jobFindFirst.mockResolvedValue({
      ...(job() as object), id: "j1", userId: "u1", description: "", scoreRevision: 0, suggestedAt: null, questionsGeneratedAt: null,
      outputType: null, createdAt: NOW, updatedAt: NOW, questions: [], files: [],
      skills: [skill("sub-a", "SUB", 0), skill("main", "MAIN", 1), skill("sub-b", "SUB", 2)],
    });
    const view = await loadJobView("j1", "u1", NOW);
    expect(view?.company).toBe("Acme");
    expect(view?.plugin.name).toBe("acme-quarterly-deck");
    expect(view?.skills.map((s) => [s.name, s.role])).toEqual([["main", "MAIN"], ["sub-a", "SUB"], ["sub-b", "SUB"]]);
    const include = mocks.jobFindFirst.mock.calls[0][0].include;
    expect(include.pluginVersions).toEqual({
      select: { version: true, name: true, displayName: true, createdAt: true, files: true, assets: true },
      orderBy: { version: "desc" },
      take: 20,
    });
  });
});
