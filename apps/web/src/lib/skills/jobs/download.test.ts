import { strFromU8, unzipSync } from "fflate";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { parse } from "yaml";

const mocks = vi.hoisted(() => ({ jobFindFirst: vi.fn(), skillFindFirst: vi.fn(), versionFindUnique: vi.fn(), fileFindFirst: vi.fn(), s3Send: vi.fn() }));
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    send = mocks.s3Send;
  },
  GetObjectCommand: class {
    constructor(readonly input: Record<string, unknown>) {}
  },
  HeadObjectCommand: class {},
  PutObjectCommand: class {},
  DeleteObjectCommand: class {},
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    skillJob: { findFirst: mocks.jobFindFirst },
    skillJobSkill: { findFirst: mocks.skillFindFirst },
    skillVersion: { findUnique: mocks.versionFindUnique },
    skillJobFile: { findFirst: mocks.fileFindFirst },
  },
}));

import { buildSkillMd } from "../assemble";
import { sha256Hex, tinyPng } from "../files/fixtures";
import { validateSkillMd } from "../format";
import { splitFrontmatter } from "../frontmatter";
import { DuplicateSkillNameError, PackTooLargeError } from "../zip";
import { buildJobPack, buildVersionZip, loadVersionDetail, parseVersionParam, toZipSkill } from "./download";
import { AssetMissingError, JobNotFoundError, NothingToDownloadError, VersionNotFoundError } from "./errors";
import type { VersionAsset } from "./types";

const NOW = new Date("2026-11-25T12:00:00Z");
const MB = 1024 * 1024;
let png: Uint8Array;
let ASSET: VersionAsset;
const versionRow = (name: string, version: number, assets: VersionAsset[] = []) => ({
  version,
  name,
  description: "Writes the board update.",
  createdAt: NOW,
  files: [{ path: "SKILL.md", content: buildSkillMd(name, "Writes the board update. Use for board updates.", "", "Write it.") }],
  assets,
});
const roots = (zip: Uint8Array) => [...new Set(Object.keys(unzipSync(zip)).map((k) => k.split("/")[0]))];
const frontmatterName = (content: string) => parse(splitFrontmatter(content)!.frontmatter, { version: "1.1" }).name;

beforeAll(async () => {
  png = await tinyPng(16, 16);
  ASSET = { fileId: "f1", path: "assets/logo.png", fileName: "Logo.png", bytes: png.byteLength };
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.jobFindFirst.mockResolvedValue({ title: "Monthly board update", description: "Every month I write the board update." });
  mocks.skillFindFirst.mockResolvedValue({ purpose: "Writes the board update.", latestVersion: 1 });
  mocks.versionFindUnique.mockResolvedValue(versionRow("board-update", 1, [ASSET]));
  mocks.fileFindFirst.mockResolvedValue({ data: png });
});

describe("parseVersionParam", () => {
  it.each([
    ["latest", "latest"],
    ["1", 1],
    ["12", 12],
    ["0", null],
    ["-1", null],
    ["01", null],
    ["1.5", null],
    ["abc", null],
    ["1000000", null],
  ])("reads %j as %j", (raw, expected) => {
    expect(parseVersionParam(raw)).toBe(expected);
  });
});

describe("loadVersionDetail", () => {
  it("resolves latest through the owned skill and returns files and asset entries", async () => {
    mocks.skillFindFirst.mockResolvedValue({ latestVersion: 2 });
    mocks.versionFindUnique.mockResolvedValue(versionRow("board-update", 2, [ASSET]));
    const detail = (await loadVersionDetail("j1", "s1", "latest", "u1"))!;
    expect(mocks.skillFindFirst).toHaveBeenCalledWith({ where: { id: "s1", jobId: "j1", job: { userId: "u1" } }, select: { latestVersion: true } });
    expect(mocks.versionFindUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { skillId_version: { skillId: "s1", version: 2 } } }));
    expect(detail).toMatchObject({ skillId: "s1", version: 2, name: "board-update", createdAt: NOW.toISOString(), assets: [ASSET] });
    expect(detail.files.map((f) => f.path)).toEqual(["SKILL.md"]);
  });

  it("returns null for someone else's skill, a skill with no version yet, or unreadable stored data", async () => {
    mocks.skillFindFirst.mockResolvedValueOnce(null);
    expect(await loadVersionDetail("j1", "s1", 1, "u2")).toBeNull();
    mocks.skillFindFirst.mockResolvedValueOnce({ latestVersion: 0 });
    expect(await loadVersionDetail("j1", "s1", "latest", "u1")).toBeNull();
    expect(mocks.versionFindUnique).not.toHaveBeenCalled();
    mocks.versionFindUnique.mockResolvedValueOnce({ ...versionRow("board-update", 1), files: { not: "an array" } });
    expect(await loadVersionDetail("j1", "s1", 1, "u1")).toBeNull();
  });
});

describe("toZipSkill", () => {
  it("loads each original by id within the job, including files removed from the job since", async () => {
    const detail = (await loadVersionDetail("j1", "s1", 1, "u1"))!;
    const skill = await toZipSkill(detail, "Writes it.", "j1");
    // No deletedAt filter: a soft-deleted file is still the bytes this version shipped.
    expect(mocks.fileFindFirst).toHaveBeenCalledWith({ where: { id: "f1", jobId: "j1" }, select: { data: true, storageKey: true, size: true } });
    expect(sha256Hex(skill.assets![0].bytes)).toBe(sha256Hex(png));
    expect(skill).toMatchObject({ name: "board-update", purpose: "Writes it.", version: 1 });
  });

  it("bundles a direct upload's original from S3, byte for byte", async () => {
    vi.stubEnv("FORM_UPLOADS_BUCKET", "uploads-bucket");
    mocks.fileFindFirst.mockResolvedValue({ data: null, storageKey: "skills/j1/f1", size: png.byteLength });
    mocks.s3Send.mockResolvedValue({ Body: (async function* () { yield png; })() });
    const detail = (await loadVersionDetail("j1", "s1", 1, "u1"))!;
    const skill = await toZipSkill(detail, "Writes it.", "j1");
    expect(mocks.s3Send.mock.calls[0][0].input).toEqual({ Bucket: "uploads-bucket", Key: "skills/j1/f1" });
    expect(sha256Hex(skill.assets![0].bytes)).toBe(sha256Hex(png));
    vi.unstubAllEnvs();
  });

  it("refuses when an original is gone", async () => {
    mocks.fileFindFirst.mockResolvedValue(null);
    const detail = (await loadVersionDetail("j1", "s1", 1, "u1"))!;
    await expect(toZipSkill(detail, "Writes it.", "j1")).rejects.toBeInstanceOf(AssetMissingError);
  });
});

describe("buildVersionZip", () => {
  it("builds the upload zip: one root folder named after the version, original bytes intact", async () => {
    const { bytes, filename } = await buildVersionZip("j1", "s1", 1, "u1", "upload");
    expect(filename).toBe("board-update-v1.zip");
    expect(roots(bytes)).toEqual(["board-update"]);
    const entries = unzipSync(bytes);
    expect(sha256Hex(entries["board-update/assets/logo.png"])).toBe(sha256Hex(png));
    expect(frontmatterName(strFromU8(entries["board-update/SKILL.md"]))).toBe("board-update");
  });

  it("builds a one-skill pack", async () => {
    const { bytes, filename } = await buildVersionZip("j1", "s1", "latest", "u1", "pack");
    expect(filename).toBe("monthly-board-update-board-update-v1.zip");
    const entries = unzipSync(bytes);
    expect(Object.keys(entries).sort()).toEqual([
      "monthly-board-update/README.md",
      "monthly-board-update/skills/board-update/SKILL.md",
      "monthly-board-update/skills/board-update/assets/logo.png",
      "monthly-board-update/upload-to-claude/board-update.zip",
    ]);
    expect(sha256Hex(unzipSync(entries["monthly-board-update/upload-to-claude/board-update.zip"])["board-update/assets/logo.png"])).toBe(sha256Hex(png));
  });

  it("keeps each version's own name after a rename, so both zips stay valid", async () => {
    mocks.skillFindFirst.mockResolvedValue({ purpose: "Writes it.", latestVersion: 2 });
    mocks.versionFindUnique.mockImplementation(async ({ where }: { where: { skillId_version: { version: number } } }) =>
      where.skillId_version.version === 1 ? versionRow("board-update", 1) : versionRow("monthly-board-update", 2),
    );
    for (const [version, name] of [
      [1, "board-update"],
      [2, "monthly-board-update"],
    ] as const) {
      const { bytes, filename } = await buildVersionZip("j1", "s1", version, "u1", "upload");
      expect(filename).toBe(`${name}-v${version}.zip`);
      expect(roots(bytes)).toEqual([name]);
      const skillMd = strFromU8(unzipSync(bytes)[`${name}/SKILL.md`]);
      expect(frontmatterName(skillMd)).toBe(name);
      expect(validateSkillMd(skillMd, name)).toEqual([]);
    }
  });

  it("refuses someone else's job and a missing version", async () => {
    mocks.jobFindFirst.mockResolvedValueOnce(null);
    await expect(buildVersionZip("j1", "s1", 1, "u2", "upload")).rejects.toBeInstanceOf(JobNotFoundError);
    expect(mocks.jobFindFirst).toHaveBeenCalledWith({ where: { id: "j1", userId: "u2" }, select: { title: true, description: true } });
    mocks.versionFindUnique.mockResolvedValueOnce(null);
    await expect(buildVersionZip("j1", "s1", 7, "u1", "upload")).rejects.toBeInstanceOf(VersionNotFoundError);
  });
});

describe("buildJobPack", () => {
  const withSkills = (skills: { id: string; purpose: string; latestVersion: number }[]) =>
    mocks.jobFindFirst.mockResolvedValue({ title: "Monthly board update", description: "d", skills });
  const byId: Record<string, { latestVersion: number }> = { s1: { latestVersion: 2 }, s2: { latestVersion: 1 } };

  beforeEach(() => {
    mocks.skillFindFirst.mockImplementation(async ({ where }: { where: { id: string } }) => byId[where.id] ?? null);
  });

  it("zips the latest version of every skill that has one", async () => {
    withSkills([
      { id: "s1", purpose: "Writes the board update.", latestVersion: 2 },
      { id: "s2", purpose: "Builds the deck.", latestVersion: 1 },
    ]);
    mocks.versionFindUnique.mockImplementation(async ({ where }: { where: { skillId_version: { skillId: string } } }) =>
      where.skillId_version.skillId === "s1" ? versionRow("board-update", 2, [ASSET]) : versionRow("deck-builder", 1),
    );
    const { bytes, filename } = await buildJobPack("j1", "u1");
    expect(filename).toBe("monthly-board-update.zip");
    expect(mocks.jobFindFirst).toHaveBeenCalledWith({
      where: { id: "j1", userId: "u1" },
      select: {
        title: true,
        description: true,
        skills: { where: { latestVersion: { gt: 0 } }, orderBy: { order: "asc" }, select: { id: true, purpose: true, latestVersion: true } },
      },
    });
    const entries = unzipSync(bytes);
    expect(Object.keys(entries)).toEqual(
      expect.arrayContaining([
        "monthly-board-update/upload-to-claude/board-update.zip",
        "monthly-board-update/upload-to-claude/deck-builder.zip",
        "monthly-board-update/skills/board-update/assets/logo.png",
        "monthly-board-update/skills/deck-builder/SKILL.md",
      ]),
    );
    expect(strFromU8(entries["monthly-board-update/README.md"])).toContain("- `board-update` (v2): Writes the board update.");
  });

  it("refuses an owned job with nothing generated, and someone else's job", async () => {
    withSkills([]);
    await expect(buildJobPack("j1", "u1")).rejects.toBeInstanceOf(NothingToDownloadError);
    mocks.jobFindFirst.mockResolvedValue(null);
    await expect(buildJobPack("j1", "u2")).rejects.toBeInstanceOf(JobNotFoundError);
  });

  it("refuses two latest versions with the same name before reading any file bytes", async () => {
    withSkills([
      { id: "s1", purpose: "a", latestVersion: 2 },
      { id: "s2", purpose: "b", latestVersion: 1 },
    ]);
    mocks.versionFindUnique.mockResolvedValue(versionRow("board-update", 1, [ASSET]));
    await expect(buildJobPack("j1", "u1")).rejects.toBeInstanceOf(DuplicateSkillNameError);
    expect(mocks.fileFindFirst).not.toHaveBeenCalled();
  });

  it("refuses a pack over 100 MB from the recorded sizes, before reading any file bytes", async () => {
    withSkills([
      { id: "s1", purpose: "a", latestVersion: 2 },
      { id: "s2", purpose: "b", latestVersion: 1 },
    ]);
    mocks.versionFindUnique.mockImplementation(async ({ where }: { where: { skillId_version: { skillId: string } } }) =>
      versionRow(where.skillId_version.skillId === "s1" ? "one" : "two", 1, [{ ...ASSET, bytes: 26 * MB }]),
    );
    await expect(buildJobPack("j1", "u1")).rejects.toBeInstanceOf(PackTooLargeError);
    expect(mocks.fileFindFirst).not.toHaveBeenCalled();
  });
});
