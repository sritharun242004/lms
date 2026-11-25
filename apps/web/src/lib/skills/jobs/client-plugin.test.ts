/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addJobSkill, generatePlugin, getPluginVersion, patchJob, patchJobSkill, pluginDownloadUrl } from "./client";

type Seen = { url: string; init: RequestInit };
let seen: Seen[];

beforeEach(() => {
  seen = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      seen.push({ url, init });
      return new Response(JSON.stringify({ success: true, data: { ok: 1 } }), { status: 200 });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const BASE = "/api/v1/prompt-bot/skill-jobs/j1";
const last = () => seen[seen.length - 1];
const json = () => JSON.parse(String(last().init.body));

describe("plugin client calls", () => {
  it("generates the plugin", async () => {
    await generatePlugin("j1");
    expect(last().url).toBe(`${BASE}/plugin/generate`);
    expect(last().init.method).toBe("POST");
  });

  it("reads a plugin version by number or as latest", async () => {
    await getPluginVersion("j1", 2);
    expect(last().url).toBe(`${BASE}/plugin/versions/2`);
    await getPluginVersion("j1", "latest");
    expect(last().url).toBe(`${BASE}/plugin/versions/latest`);
  });

  it("builds both download URLs", () => {
    expect(pluginDownloadUrl("j1", 3, "plugin")).toBe(`${BASE}/plugin/versions/3/download?format=plugin`);
    expect(pluginDownloadUrl("j1", 3, "share")).toBe(`${BASE}/plugin/versions/3/download?format=share`);
  });

  it("patches the company and plugin names, null resetting to the default", async () => {
    await patchJob("j1", { company: "Acme", pluginName: "acme-deck", pluginDisplayName: null });
    expect(last().init.method).toBe("PATCH");
    expect(json()).toEqual({ company: "Acme", pluginName: "acme-deck", pluginDisplayName: null });
  });

  it("sends label, focus and step for skills", async () => {
    await addJobSkill("j1", { name: "deck-designer", label: "Design", purpose: "Lays out slides.", focus: "Layout only.", step: "Lay out the slides" });
    expect(json()).toEqual({ name: "deck-designer", label: "Design", purpose: "Lays out slides.", focus: "Layout only.", step: "Lay out the slides" });
    await patchJobSkill("j1", "s1", { label: "Grammar", focus: "Wording", step: "Check the wording", order: 2 });
    expect(json()).toEqual({ label: "Grammar", focus: "Wording", step: "Check the wording", order: 2 });
  });
});
