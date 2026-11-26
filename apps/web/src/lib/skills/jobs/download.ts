import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { JOB_LIMITS } from "../limits";
import { normalizeSkillName } from "../names";
import { parseStoredFiles } from "../stored-files";
import { buildPackZip, buildSkillZip, DuplicateSkillNameError, packZipSize, PackTooLargeError, type ZipAsset, type ZipSkill } from "../zip";
import { AssetMissingError, JobNotFoundError, NothingToDownloadError, SkillNotFoundError, VersionNotFoundError } from "./errors";
import type { VersionDetail } from "./types";
import { loadJobFileBytes } from "./storage";

/** Versions are written only by the server, but stored JSON is still parsed before it reaches a zip. */
const StoredAssets = z.array(z.object({ fileId: z.string(), path: z.string(), fileName: z.string(), bytes: z.number().int().nonnegative() }));

type Download = { bytes: Uint8Array; filename: string };

/** "latest" or a positive integer without leading zeros (at most six digits); anything else is null. */
export function parseVersionParam(raw: string): number | "latest" | null {
  if (raw === "latest") return "latest";
  return /^[1-9]\d{0,5}$/.test(raw) ? Number(raw) : null;
}

/** One owned version with its text files and asset entries (no bytes). Null when absent, not owned or unreadable. */
export async function loadVersionDetail(jobId: string, skillId: string, version: number | "latest", userId: string): Promise<VersionDetail | null> {
  const skill = await prisma.skillJobSkill.findFirst({ where: { id: skillId, jobId, job: { userId } }, select: { latestVersion: true } });
  if (!skill) return null;
  const number = version === "latest" ? skill.latestVersion : version;
  if (number < 1) return null;
  const row = await prisma.skillVersion.findUnique({
    where: { skillId_version: { skillId, version: number } },
    select: { version: true, name: true, description: true, createdAt: true, files: true, assets: true },
  });
  if (!row) return null;
  const files = parseStoredFiles(row.files);
  const assets = StoredAssets.safeParse(row.assets);
  if (!files || !assets.success) return null;
  return {
    skillId,
    version: row.version,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt.toISOString(),
    files,
    assets: assets.data,
  };
}

/**
 * Loads each bundled original's bytes, one file at a time. Soft-deleted files still load: a removed file stays
 * in the database exactly while some version needs it (spec: Data Model).
 */
export async function toZipSkill(detail: VersionDetail, purpose: string, jobId: string): Promise<ZipSkill> {
  const assets: ZipAsset[] = [];
  for (const asset of detail.assets) {
    const row = await prisma.skillJobFile.findFirst({ where: { id: asset.fileId, jobId }, select: { data: true, storageKey: true, size: true } });
    if (!row) throw new AssetMissingError();
    assets.push({ path: asset.path, bytes: await loadJobFileBytes(row) });
  }
  return { name: detail.name, purpose, version: detail.version, files: detail.files, assets };
}

async function ownedJob(jobId: string, userId: string) {
  const job = await prisma.skillJob.findFirst({ where: { id: jobId, userId }, select: { title: true, description: true } });
  if (!job) throw new JobNotFoundError();
  return job;
}

const slugFor = (title: string) => normalizeSkillName(title, "skill-pack");

/** One version as its upload zip (`<name>-v<n>.zip`) or as a one-skill pack (`<slug>-<name>-v<n>.zip`). */
export async function buildVersionZip(
  jobId: string,
  skillId: string,
  version: number | "latest",
  userId: string,
  format: "upload" | "pack",
): Promise<Download> {
  const job = await ownedJob(jobId, userId);
  const skill = await prisma.skillJobSkill.findFirst({ where: { id: skillId, jobId }, select: { purpose: true } });
  if (!skill) throw new SkillNotFoundError();
  const detail = await loadVersionDetail(jobId, skillId, version, userId);
  if (!detail) throw new VersionNotFoundError();
  const zipSkill = await toZipSkill(detail, skill.purpose, jobId);
  if (format === "upload") return { bytes: buildSkillZip(zipSkill), filename: `${detail.name}-v${detail.version}.zip` };
  const slug = slugFor(job.title);
  return {
    bytes: buildPackZip({ slug, title: job.title, description: job.description, role: null, skills: [zipSkill] }),
    filename: `${slug}-${detail.name}-v${detail.version}.zip`,
  };
}

/** The pack of every skill's latest version. Name clashes and the size limit are refused before any bytes load. */
export async function buildJobPack(jobId: string, userId: string): Promise<Download> {
  const job = await prisma.skillJob.findFirst({
    where: { id: jobId, userId },
    select: {
      title: true,
      description: true,
      skills: { where: { latestVersion: { gt: 0 } }, orderBy: { order: "asc" }, select: { id: true, purpose: true, latestVersion: true } },
    },
  });
  if (!job) throw new JobNotFoundError();
  const latest: { detail: VersionDetail; purpose: string }[] = [];
  for (const skill of job.skills) {
    const detail = await loadVersionDetail(jobId, skill.id, skill.latestVersion, userId);
    if (detail) latest.push({ detail, purpose: skill.purpose });
  }
  if (latest.length === 0) throw new NothingToDownloadError();
  const names = new Set<string>();
  for (const { detail } of latest) {
    if (names.has(detail.name)) throw new DuplicateSkillNameError(detail.name);
    names.add(detail.name);
  }
  if (packZipSize(latest.map(({ detail }) => detail)) > JOB_LIMITS.packZipBytes) throw new PackTooLargeError();
  const skills: ZipSkill[] = [];
  for (const { detail, purpose } of latest) skills.push(await toZipSkill(detail, purpose, jobId));
  const slug = slugFor(job.title);
  return { bytes: buildPackZip({ slug, title: job.title, description: job.description, role: null, skills }), filename: `${slug}.zip` };
}
