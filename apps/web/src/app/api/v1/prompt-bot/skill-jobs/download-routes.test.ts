import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), loadVersionDetail: vi.fn(), buildVersionZip: vi.fn(), buildJobPack: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/skills/jobs/download", async (orig) => ({
  ...(await orig<typeof import("@/lib/skills/jobs/download")>()),
  loadVersionDetail: mocks.loadVersionDetail,
  buildVersionZip: mocks.buildVersionZip,
  buildJobPack: mocks.buildJobPack,
}));

import { AssetMissingError, JobNotFoundError, NothingToDownloadError, VersionNotFoundError } from "@/lib/skills/jobs/errors";
import { DuplicateSkillNameError, PackTooLargeError } from "@/lib/skills/zip";
import * as jobDownload from "./[id]/download/route";
import * as versionDownload from "./[id]/skills/[skillId]/versions/[version]/download/route";
import * as version from "./[id]/skills/[skillId]/versions/[version]/route";

const ZIP = { bytes: new Uint8Array([80, 75, 3, 4]), filename: "board-update-v2.zip" };
const get = (query = "") => new NextRequest(`http://localhost/x${query}`);
const versionCtx = (v: string) => ({ params: Promise.resolve({ id: "j1", skillId: "s1", version: v }) });
const jobCtx = { params: Promise.resolve({ id: "j1" }) };
const codeOf = async (res: Response) => (await res.json()).error.code;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "u1", role: "MENTEE" });
  mocks.buildVersionZip.mockResolvedValue(ZIP);
  mocks.buildJobPack.mockResolvedValue({ ...ZIP, filename: "monthly-board-update.zip" });
});

describe("GET …/versions/:version", () => {
  it("returns the owned version, by number or latest", async () => {
    mocks.loadVersionDetail.mockResolvedValue({ skillId: "s1", version: 2, name: "board-update", files: [], assets: [] });
    const res = await version.GET(get(), versionCtx("2"));
    expect(res.status).toBe(200);
    expect((await res.json()).data.version).toBe(2);
    expect(mocks.loadVersionDetail).toHaveBeenCalledWith("j1", "s1", 2, "u1");
    await version.GET(get(), versionCtx("latest"));
    expect(mocks.loadVersionDetail).toHaveBeenLastCalledWith("j1", "s1", "latest", "u1");
  });

  it("answers 400 for a bad version, 404 when not found, 401 without a session", async () => {
    for (const bad of ["0", "abc", "1.5"]) expect(await codeOf(await version.GET(get(), versionCtx(bad)))).toBe("VALIDATION_ERROR");
    expect(mocks.loadVersionDetail).not.toHaveBeenCalled();
    mocks.loadVersionDetail.mockResolvedValue(null);
    expect((await version.GET(get(), versionCtx("3"))).status).toBe(404);
    mocks.getCurrentUser.mockResolvedValue(null);
    expect((await version.GET(get(), versionCtx("3"))).status).toBe(401);
  });
});

describe("GET …/versions/:version/download", () => {
  it("downloads the upload zip by default and a pack on request", async () => {
    const res = await versionDownload.GET(get(), versionCtx("2"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/zip");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="board-update-v2.zip"');
    expect(mocks.buildVersionZip).toHaveBeenCalledWith("j1", "s1", 2, "u1", "upload");
    await versionDownload.GET(get("?format=pack"), versionCtx("latest"));
    expect(mocks.buildVersionZip).toHaveBeenLastCalledWith("j1", "s1", "latest", "u1", "pack");
  });

  it("answers 400 for a bad format or version", async () => {
    expect(await codeOf(await versionDownload.GET(get("?format=tar"), versionCtx("2")))).toBe("VALIDATION_ERROR");
    expect(await codeOf(await versionDownload.GET(get(), versionCtx("v2")))).toBe("VALIDATION_ERROR");
    expect(mocks.buildVersionZip).not.toHaveBeenCalled();
  });

  it.each([
    [new VersionNotFoundError(), 404, "NOT_FOUND"],
    [new AssetMissingError(), 409, "ASSET_MISSING"],
    [new PackTooLargeError(), 409, "PACK_TOO_LARGE"],
  ])("maps %s", async (error, status, code) => {
    mocks.buildVersionZip.mockRejectedValueOnce(error);
    const res = await versionDownload.GET(get(), versionCtx("2"));
    expect(res.status).toBe(status);
    expect(await codeOf(res)).toBe(code);
  });
});

describe("GET /skill-jobs/:id/download", () => {
  it("downloads the pack of latest versions", async () => {
    const res = await jobDownload.GET(get(), jobCtx);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="monthly-board-update.zip"');
    expect(mocks.buildJobPack).toHaveBeenCalledWith("j1", "u1");
  });

  it.each([
    [new JobNotFoundError(), 404, "NOT_FOUND"],
    [new NothingToDownloadError(), 409, "NOTHING_TO_DOWNLOAD"],
    [new PackTooLargeError(), 409, "PACK_TOO_LARGE"],
    [new AssetMissingError(), 409, "ASSET_MISSING"],
    [new DuplicateSkillNameError("board-update"), 409, "DUPLICATE_NAME"],
  ])("maps %s", async (error, status, code) => {
    mocks.buildJobPack.mockRejectedValueOnce(error);
    const res = await jobDownload.GET(get(), jobCtx);
    expect(res.status).toBe(status);
    expect(await codeOf(res)).toBe(code);
  });

  it("requires a session", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    expect((await jobDownload.GET(get(), jobCtx)).status).toBe(401);
  });
});
