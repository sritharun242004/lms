/** Plugins spec, Plugin Zip Layout: version detail, the uploadable plugin zip and the share zip. */
import { strToU8, zipSync, type Zippable, type ZippableFile } from "fflate";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { checkSkillPath } from "../format";
import { JOB_LIMITS } from "../limits";
import { isValidSkillName } from "../names";
import { renderPluginReadme } from "../pack-docs";
import { PackTooLargeError } from "../zip";
import { AssetMissingError, JobNotFoundError, VersionNotFoundError } from "./errors";
import { MANIFEST_PATH } from "./plugin";
import type { PluginVersionDetail } from "./types";

const StoredFiles = z.array(z.object({ path: z.string(), content: z.string() }));
const StoredSkills = z.array(
  z.object({ name: z.string(), role: z.enum(["MAIN", "SUB"]), label: z.string(), purpose: z.string(), description: z.string(), files: StoredFiles }),
);
const StoredAssets = z.array(z.object({ fileId: z.string(), skill: z.string(), path: z.string(), fileName: z.string(), bytes: z.number().int().nonnegative() }));
const Manifest = z.object({ name: z.string(), displayName: z.string(), version: z.string(), description: z.string(), author: z.object({ name: z.string() }) });

export type PluginVersionRow = { version: number; name: string; displayName: string; createdAt: Date; skills: unknown; files: unknown; assets: unknown };

/** Stored JSON is parsed before it is shown or zipped: null when any part can't be read. */
export function toPluginVersionDetail(row: PluginVersionRow): PluginVersionDetail | null {
  const skills = StoredSkills.safeParse(row.skills);
  const files = StoredFiles.safeParse(row.files);
  const assets = StoredAssets.safeParse(row.assets);
  if (!skills.success || !files.success || !assets.success) return null;
  const manifestText = files.data.find((f) => f.path === MANIFEST_PATH)?.content;
  let manifest: z.infer<typeof Manifest>;
  try {
    const parsed = Manifest.safeParse(JSON.parse(manifestText ?? ""));
    if (!parsed.success) return null;
    manifest = parsed.data;
  } catch {
    return null;
  }
  return {
    version: row.version,
    name: row.name,
    displayName: row.displayName,
    createdAt: row.createdAt.toISOString(),
    manifest: { name: manifest.name, displayName: manifest.displayName, version: manifest.version, description: manifest.description, author: { name: manifest.author.name } },
    commands: files.data.filter((f) => f.path.startsWith("commands/")),
    skills: skills.data.map((s) => ({
      ...s,
      assets: assets.data.filter((a) => a.skill === s.name).map(({ fileId, path, fileName, bytes }) => ({ fileId, path, fileName, bytes })),
    })),
  };
}

/** One owned plugin version ("latest" = the newest). Null when absent, not owned or unreadable. */
export async function loadPluginVersionDetail(jobId: string, version: number | "latest", userId: string): Promise<PluginVersionDetail | null> {
  const job = await prisma.skillJob.findFirst({ where: { id: jobId, userId }, select: { pluginLatestVersion: true } });
  if (!job) return null;
  const number = version === "latest" ? job.pluginLatestVersion : version;
  if (number < 1) return null;
  const row = await prisma.skillPluginVersion.findUnique({
    where: { jobId_version: { jobId, version: number } },
    select: { version: true, name: true, displayName: true, createdAt: true, skills: true, files: true, assets: true },
  });
  return row ? toPluginVersionDetail(row) : null;
}

const utf8Bytes = (value: string) => new TextEncoder().encode(value).length;
const README_ALLOWANCE = 16 * 1024;

/** The zip's size before any bytes load: the share zip carries the plugin twice (readable and as the upload zip). */
export function pluginZipSize(detail: PluginVersionDetail, format: "plugin" | "share"): number {
  const text = [...detail.commands, ...detail.skills.flatMap((s) => s.files)].reduce((sum, f) => sum + utf8Bytes(f.content), 0) + 4096;
  const assets = detail.skills.flatMap((s) => s.assets).reduce((sum, a) => sum + a.bytes, 0);
  return format === "plugin" ? text + assets : README_ALLOWANCE + 2 * (text + assets);
}

const ALLOWED_PLUGIN_FILE = /^(\.claude-plugin\/plugin\.json|commands\/[a-z0-9]+(-[a-z0-9]+)*\.md)$/;

/** Every entry path is built here from validated names and re-checked paths; nothing else reaches the archive. */
function pluginEntries(prefix: string, detail: PluginVersionDetail, bytes: ReadonlyMap<string, Uint8Array>): Zippable {
  if (!isValidSkillName(detail.name)) throw new Error("unsafe plugin name");
  const root = `${prefix}${detail.name}/`;
  const entries: Zippable = {};
  const add = (path: string, value: ZippableFile) => {
    const key = `${root}${path}`;
    if (key in entries) throw new Error("duplicate plugin file path");
    entries[key] = value;
  };
  add(MANIFEST_PATH, strToU8(`${JSON.stringify(detail.manifest, null, 2)}\n`));
  for (const command of detail.commands) {
    if (!ALLOWED_PLUGIN_FILE.test(command.path)) throw new Error("unsafe plugin file path");
    add(command.path, strToU8(command.content));
  }
  for (const skill of detail.skills) {
    if (!isValidSkillName(skill.name)) throw new Error("unsafe skill name");
    const inSkill = (path: string) => {
      const check = checkSkillPath(path);
      if (!check.ok) throw new Error("unsafe skill file path");
      return `skills/${skill.name}/${check.path}`;
    };
    for (const file of skill.files) add(inSkill(file.path), strToU8(file.content));
    for (const asset of skill.assets) {
      const data = bytes.get(asset.fileId);
      if (!asset.path.startsWith("assets/") || !data) throw new Error("unsafe or missing asset");
      // Office files and images are already compressed: store them as they are.
      add(inSkill(asset.path), [data, { level: 0 }]);
    }
  }
  return entries;
}

/** Stable bytes for the same version: every entry carries the version's creation time. */
const zipOptions = (detail: PluginVersionDetail) => ({ mtime: new Date(detail.createdAt) });

/** `<plugin>/.claude-plugin/plugin.json`, `<plugin>/commands/*.md`, `<plugin>/skills/<skill>/…`: one top folder. */
export function buildPluginZip(detail: PluginVersionDetail, bytes: ReadonlyMap<string, Uint8Array>): Uint8Array {
  return zipSync(pluginEntries("", detail, bytes), zipOptions(detail));
}

/** `<plugin>-share/README.md`, `…/plugin/<plugin>/…` (readable) and `…/upload-to-claude/<plugin>.zip` (stored as is). */
export function buildPluginShareZip(detail: PluginVersionDetail, bytes: ReadonlyMap<string, Uint8Array>): Uint8Array {
  const root = `${detail.name}-share/`;
  const readme = renderPluginReadme({
    name: detail.name,
    displayName: detail.displayName,
    description: detail.manifest.description,
    version: detail.manifest.version,
    skills: detail.skills.map((s) => ({ name: s.name, role: s.role, purpose: s.purpose })),
    hasAssets: detail.skills.some((s) => s.assets.length > 0),
  });
  const entries: Zippable = {
    [`${root}README.md`]: strToU8(readme),
    ...pluginEntries(`${root}plugin/`, detail, bytes),
    [`${root}upload-to-claude/${detail.name}.zip`]: [buildPluginZip(detail, bytes), { level: 0 }],
  };
  return zipSync(entries, zipOptions(detail));
}

/** Loads each bundled original once (a sub-skill's copy shares the main skill's bytes). Removed files still load. */
async function assetBytes(jobId: string, detail: PluginVersionDetail): Promise<Map<string, Uint8Array>> {
  const out = new Map<string, Uint8Array>();
  for (const fileId of new Set(detail.skills.flatMap((s) => s.assets.map((a) => a.fileId)))) {
    const row = await prisma.skillJobFile.findFirst({ where: { id: fileId, jobId }, select: { data: true } });
    if (!row) throw new AssetMissingError();
    out.set(fileId, row.data);
  }
  return out;
}

/** `<plugin>-v<n>.zip` or `<plugin>-v<n>-share.zip`. The size limit is checked before any bytes load. */
export async function downloadPluginVersion(
  jobId: string,
  version: number | "latest",
  userId: string,
  format: "plugin" | "share",
): Promise<{ bytes: Uint8Array; filename: string }> {
  if (!(await prisma.skillJob.findFirst({ where: { id: jobId, userId }, select: { id: true } }))) throw new JobNotFoundError();
  const detail = await loadPluginVersionDetail(jobId, version, userId);
  if (!detail) throw new VersionNotFoundError();
  if (pluginZipSize(detail, format) > JOB_LIMITS.packZipBytes) throw new PackTooLargeError();
  const bytes = await assetBytes(jobId, detail);
  return format === "plugin"
    ? { bytes: buildPluginZip(detail, bytes), filename: `${detail.name}-v${detail.version}.zip` }
    : { bytes: buildPluginShareZip(detail, bytes), filename: `${detail.name}-v${detail.version}-share.zip` };
}
