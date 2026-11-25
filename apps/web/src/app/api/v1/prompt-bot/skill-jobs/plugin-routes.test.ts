import { existsSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  isAiConfigured: vi.fn(),
  start: vi.fn(),
  run: vi.fn(),
  after: vi.fn(),
  detail: vi.fn(),
  download: vi.fn(),
}));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: mocks.after }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/ai/config", async (orig) => ({ ...(await orig<typeof import("@/lib/ai/config")>()), isAiConfigured: mocks.isAiConfigured }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/ai/claude", () => ({}));
vi.mock("@/lib/skills/jobs/plugin-generate", () => ({ startPluginGeneration: mocks.start, runPluginGeneration: mocks.run }));
vi.mock("@/lib/skills/jobs/plugin-download", () => ({ loadPluginVersionDetail: mocks.detail, downloadPluginVersion: mocks.download }));

import { LimitReachedError } from "@/lib/ai/usage";
import * as E from "@/lib/skills/jobs/errors";
import { PackTooLargeError } from "@/lib/skills/zip";
import * as generate from "./[id]/plugin/generate/route";
import * as version from "./[id]/plugin/versions/[version]/route";
import * as download from "./[id]/plugin/versions/[version]/download/route";

const req = (url = "http://localhost/x", method = "GET") => new NextRequest(url, { method });
const ctx = { params: Promise.resolve({ id: "j1" }) };
const vctx = (v: string) => ({ params: Promise.resolve({ id: "j1", version: v }) });
const error = async (res: Response) => ({ status: res.status, ...(await res.json()).error });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "u1", role: "MENTEE" });
  mocks.isAiConfigured.mockReturnValue(true);
  mocks.start.mockResolvedValue({ name: "acme-deck", status: "GENERATING" });
  mocks.detail.mockResolvedValue({ version: 2, name: "acme-deck" });
  mocks.download.mockResolvedValue({ bytes: new Uint8Array([80, 75, 5, 6]), filename: "acme-deck-v2.zip" });
});

describe("POST /:id/plugin/generate", () => {
  it("claims the plugin, answers 202 with it and writes it after the response", async () => {
    const res = await generate.POST(req("http://localhost/x", "POST"), ctx);
    expect(res.status).toBe(202);
    expect((await res.json()).data).toEqual({ name: "acme-deck", status: "GENERATING" });
    expect(mocks.start).toHaveBeenCalledWith("j1", "u1");
    expect(mocks.run).not.toHaveBeenCalled();
    await mocks.after.mock.calls[0][0]();
    expect(mocks.run).toHaveBeenCalledWith("j1", "u1");
  });

  it("answers 401 without a session and 503 without the AI, before spending anything", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce(null);
    expect((await generate.POST(req(), ctx)).status).toBe(401);
    mocks.isAiConfigured.mockReturnValueOnce(false);
    expect((await generate.POST(req(), ctx)).status).toBe(503);
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it.each([
    [new E.JobNotFoundError(), 404, "NOT_FOUND"],
    [new E.EmptyDescriptionError(), 400, "EMPTY_DESCRIPTION"],
    [new E.PluginGeneratingError(), 409, "ALREADY_GENERATING"],
    [new E.FilesAnalysingError(), 409, "FILES_ANALYSING"],
    [new LimitReachedError("plugin_generate", new Date("2026-11-26T00:00:00Z")), 429, "LIMIT_REACHED"],
  ])("maps %s", async (thrown, status, code) => {
    mocks.start.mockRejectedValueOnce(thrown);
    expect(await error(await generate.POST(req(), ctx))).toMatchObject({ status, code });
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("says what to fix: the empty description and the structure details", async () => {
    mocks.start.mockRejectedValueOnce(new E.EmptyDescriptionError());
    expect((await error(await generate.POST(req(), ctx))).message).toBe("Describe the task first.");
    mocks.start.mockRejectedValueOnce(new E.PluginInvalidError(["Add at least 2 sub-skills."]));
    expect(await error(await generate.POST(req(), ctx))).toMatchObject({ status: 400, code: "PLUGIN_INVALID", details: { skills: ["Add at least 2 sub-skills."] } });
  });
});

describe("GET /:id/plugin/versions/:version", () => {
  it("reads a version by number or latest for its owner", async () => {
    expect((await version.GET(req(), vctx("2"))).status).toBe(200);
    expect(mocks.detail).toHaveBeenCalledWith("j1", 2, "u1");
    await version.GET(req(), vctx("latest"));
    expect(mocks.detail).toHaveBeenLastCalledWith("j1", "latest", "u1");
  });

  it("answers 401, 400 for a bad version and 404 for a missing or foreign one", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce(null);
    expect((await version.GET(req(), vctx("1"))).status).toBe(401);
    expect((await version.GET(req(), vctx("0"))).status).toBe(400);
    expect((await version.GET(req(), vctx("v1"))).status).toBe(400);
    mocks.detail.mockResolvedValueOnce(null);
    expect(await error(await version.GET(req(), vctx("9")))).toMatchObject({ status: 404, message: "Version not found" });
  });
});

describe("GET /:id/plugin/versions/:version/download", () => {
  it("sends the plugin zip by default and the share zip on request, as attachments", async () => {
    const res = await download.GET(req("http://localhost/x"), vctx("2"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/zip");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="acme-deck-v2.zip"');
    expect(mocks.download).toHaveBeenCalledWith("j1", 2, "u1", "plugin");
    mocks.download.mockResolvedValueOnce({ bytes: new Uint8Array([1]), filename: "acme-deck-v2-share.zip" });
    const share = await download.GET(req("http://localhost/x?format=share"), vctx("2"));
    expect(share.headers.get("content-disposition")).toBe('attachment; filename="acme-deck-v2-share.zip"');
    expect(mocks.download).toHaveBeenLastCalledWith("j1", 2, "u1", "share");
  });

  it("validates the format and version, and maps the refusals", async () => {
    expect((await download.GET(req("http://localhost/x?format=pack"), vctx("2"))).status).toBe(400);
    expect((await download.GET(req(), vctx("x"))).status).toBe(400);
    mocks.getCurrentUser.mockResolvedValueOnce(null);
    expect((await download.GET(req(), vctx("2"))).status).toBe(401);
    for (const [thrown, status, code] of [
      [new E.JobNotFoundError(), 404, "NOT_FOUND"],
      [new E.VersionNotFoundError(), 404, "NOT_FOUND"],
      [new E.AssetMissingError(), 409, "ASSET_MISSING"],
      [new PackTooLargeError(), 409, "PACK_TOO_LARGE"],
    ] as const) {
      mocks.download.mockRejectedValueOnce(thrown);
      expect(await error(await download.GET(req(), vctx("2")))).toMatchObject({ status, code });
    }
  });
});

describe("per-skill generation (route 21)", () => {
  it("is gone", () => {
    expect(existsSync(path.join(__dirname, "[id]/skills/[skillId]/generate/route.ts"))).toBe(false);
  });
});
