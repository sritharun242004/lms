import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ jobFindFirst: vi.fn(), jobUpdate: vi.fn(), jobUpdateMany: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { skillJob: { findFirst: mocks.jobFindFirst, update: mocks.jobUpdate, updateMany: mocks.jobUpdateMany } } }));
vi.mock("@/lib/ai/claude", () => ({}));

import { PluginGeneratingError } from "./errors";
import { updateJob } from "./jobs";

const VIEW_ROW = {
  id: "j1", userId: "u1", title: "Deck", description: "", scoreRevision: 0, suggestedAt: null, questionsGeneratedAt: null, outputType: null,
  company: "", pluginName: null, pluginDisplayName: null, pluginStatus: "DRAFT", pluginValidationErrors: [], pluginGenerationStartedAt: null,
  pluginLatestVersion: 0, pluginVersions: [], createdAt: new Date(), updatedAt: new Date(), questions: [], files: [], skills: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.jobFindFirst.mockImplementation(async (args: { include?: unknown }) => (args.include ? VIEW_ROW : { id: "j1", title: "Deck", description: "" }));
  mocks.jobUpdateMany.mockResolvedValue({ count: 1 });
});

describe("updateJob plugin fields", () => {
  it("trims the company and normalises the plugin id", async () => {
    await updateJob("j1", "u1", { company: "  Acme  ", pluginName: "Acme Quarterly Deck!" });
    expect(mocks.jobUpdateMany.mock.calls[0][0].data).toEqual({ company: "Acme", pluginName: "acme-quarterly-deck" });
  });

  it("keeps the display name on one line and resets either name with null", async () => {
    await updateJob("j1", "u1", { pluginDisplayName: " Acme\n· Deck " });
    expect(mocks.jobUpdateMany.mock.calls[0][0].data).toEqual({ pluginDisplayName: "Acme · Deck" });
    await updateJob("j1", "u1", { pluginName: null, pluginDisplayName: null });
    expect(mocks.jobUpdateMany.mock.calls[1][0].data).toEqual({ pluginName: null, pluginDisplayName: null });
  });

  it("falls back to my-plugin when nothing kebab-able is typed", async () => {
    await updateJob("j1", "u1", { pluginName: "日本" });
    expect(mocks.jobUpdateMany.mock.calls[0][0].data).toEqual({ pluginName: "my-plugin" });
  });

  it("guards a plugin rename against a fresh generation, and lets title and company through", async () => {
    await updateJob("j1", "u1", { pluginName: "deck" });
    const where = mocks.jobUpdateMany.mock.calls[0][0].where;
    expect(where.id).toBe("j1");
    expect(where.OR).toEqual([{ pluginStatus: { not: "GENERATING" } }, { pluginGenerationStartedAt: null }, { pluginGenerationStartedAt: { lte: expect.any(Date) } }]);
    await updateJob("j1", "u1", { title: "New", company: "Acme" });
    expect(mocks.jobUpdateMany.mock.calls[1][0].where).toEqual({ id: "j1" });
  });

  it("throws PluginGeneratingError when the guarded rename matches nothing", async () => {
    mocks.jobUpdateMany.mockResolvedValue({ count: 0 });
    await expect(updateJob("j1", "u1", { pluginDisplayName: "Deck" })).rejects.toBeInstanceOf(PluginGeneratingError);
  });
});
