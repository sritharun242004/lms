import { buildSkillMd, inFolder } from "../assemble";
import { checkSkillPath, validateSkillFiles } from "../format";
import type { SkillFileKind } from "../files/types";
import { JOB_LIMITS, SKILL_LIMITS } from "../limits";
import { oneLine } from "../names";
import type { SkillFile } from "../types";
import { megabytes } from "./format";
import type { ShippedFile } from "./instructions";
import type { JobSkillDraft, VersionAsset } from "./types";

/** The server writes this file from the analyses; a model file at the same path is dropped (user edits win). */
export const STYLE_GUIDE_PATH = "references/style-guide.md";
export const SHORTENED_MARKER = "[Shortened to fit the 200 KB file limit.]";

export type PlanInputFile = { id: string; fileName: string; assetName: string; kind: SkillFileKind; size: number; analysis: string | null };

const NO_ANALYSIS = "No analysis is available for this file.";
const GUIDE_HEAD = "# Style guide\n\nTaken from the files uploaded for this job. Analyses edited by hand are used exactly as written.";
const REUSE: Record<SkillFileKind, string> = {
  PPTX: "Start from this file and reuse its masters, layouts and theme instead of recreating the design.",
  DOCX: "Start from this file and reuse its styles and page setup instead of recreating them.",
  XLSX: "Start from this file and reuse its sheets, formulas and number formats instead of rebuilding them.",
  PDF: "Use it as the reference for how the result should look.",
  PNG: "Use it as the reference for how the result should look.",
  JPEG: "Use it as the reference for how the result should look.",
};

const utf8Bytes = (value: string) => new TextEncoder().encode(value).length;
/** File names go inside "…" in Markdown that Claude reads; quotes and angle brackets would break that. */
const displayName = (fileName: string) => oneLine(fileName.replace(/["<>]/g, "")) || "Untitled file";

/** Which of the skill's files ship as originals under assets/, in the skill's own file order (spec: Assembly, step 1). */
export function planAssets(files: PlanInputFile[]): ShippedFile[] {
  let bundled = 0;
  return files.map((f): ShippedFile => {
    const base = { id: f.id, fileName: f.fileName, kind: f.kind, size: f.size, analysis: f.analysis };
    if (f.size > JOB_LIMITS.assetBytes) return { ...base, shipping: "analysis-only", reason: "too-large" };
    if (bundled + f.size > JOB_LIMITS.skillAssetBytes) return { ...base, shipping: "analysis-only", reason: "over-budget" };
    bundled += f.size;
    return { ...base, shipping: "bundled", path: `assets/${f.assetName}` };
  });
}

/** The "## Files in this skill" section the server appends to every SKILL.md body that uses files. */
export function filesSection(plan: ShippedFile[]): string {
  if (plan.length === 0) return "";
  const lines = [
    "## Files in this skill",
    "",
    "- `references/style-guide.md`: colours, fonts, layouts and structure taken from the files below. Follow it for anything you produce.",
  ];
  for (const f of plan) {
    const name = displayName(f.fileName);
    if (f.shipping === "bundled") lines.push(`- \`${f.path}\`: the original "${name}". ${REUSE[f.kind]}`);
    else if (f.reason === "too-large") {
      lines.push(`- "${name}" (${megabytes(f.size)}) was too large to include. Its style is described in \`references/style-guide.md\`.`);
    } else {
      lines.push(`- "${name}" (${megabytes(f.size)}) didn't fit in this skill's 25 MB of bundled files. Its style is described in \`references/style-guide.md\`.`);
    }
  }
  return lines.join("\n");
}

function statusLine(f: ShippedFile): string {
  if (f.shipping === "bundled") return `Bundled as ${f.path}.`;
  return f.reason === "too-large" ? "Not bundled (too large)." : "Not bundled (over the 25 MB limit for bundled files).";
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const HEADING = /^( {0,3})(#{1,6})(?=[ \t]|$)/;

/**
 * Pushes an analysis's ATX headings down so its top level is ### under the file's own "## <file name>"
 * (a usual "## Colours" becomes "### Colours"). Lines inside fenced code are left alone.
 */
function demoteHeadings(analysis: string): string {
  const lines = analysis.split("\n");
  let fence: string | null = null;
  const headingAt: boolean[] = lines.map((line) => {
    const open = FENCE.exec(line);
    if (fence) {
      if (open && open[1][0] === fence[0] && open[1].length >= fence.length) fence = null;
      return false;
    }
    if (open) {
      fence = open[1];
      return false;
    }
    return HEADING.test(line);
  });
  const levels = lines.flatMap((line, i) => (headingAt[i] ? [HEADING.exec(line)![2].length] : []));
  if (levels.length === 0) return analysis;
  const shift = Math.max(0, 3 - Math.min(...levels));
  if (shift === 0) return analysis;
  return lines
    .map((line, i) => (headingAt[i] ? line.replace(HEADING, (_, indent: string, marks: string) => `${indent}${"#".repeat(Math.min(6, marks.length + shift))}`) : line))
    .join("\n");
}

function renderGuide(plan: ShippedFile[], analyses: string[]): string {
  return `${[GUIDE_HEAD, ...plan.map((f, i) => [`## ${displayName(f.fileName)}`, statusLine(f), analyses[i]].join("\n\n"))].join("\n\n")}\n`;
}

/** UTF-8-safe cut: never leaves half a character (a partial sequence decodes to U+FFFD, which is stripped). */
function cutToBytes(text: string, maxBytes: number): string {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length <= maxBytes) return text;
  return new TextDecoder().decode(bytes.subarray(0, maxBytes)).replace(/�+$/, "");
}

/** references/style-guide.md: every analysis as stored (edits verbatim, headings demoted), shortened proportionally only to fit 200 KB. */
export function buildStyleGuide(plan: ShippedFile[]): string | null {
  if (plan.length === 0) return null;
  const analyses = plan.map((f) => (f.analysis?.trim() ? demoteHeadings(f.analysis.trim()) : NO_ANALYSIS));
  const full = renderGuide(plan, analyses);
  if (utf8Bytes(full) <= SKILL_LIMITS.fileBytes) return full;
  const fixed = utf8Bytes(renderGuide(plan, plan.map(() => ""))) + plan.length * utf8Bytes(`\n\n${SHORTENED_MARKER}`) + 64;
  const budget = Math.max(0, SKILL_LIMITS.fileBytes - fixed);
  const sizes = analyses.map(utf8Bytes);
  const total = sizes.reduce((sum, n) => sum + n, 0);
  return renderGuide(
    plan,
    analyses.map((text, i) => `${cutToBytes(text, Math.floor((budget * sizes[i]) / total)).trimEnd()}\n\n${SHORTENED_MARKER}`),
  );
}

/** Turns the model's draft and the asset plan into a version's text files and asset entries. `name` owns the folder. */
export function assembleJobSkill(name: string, draft: JobSkillDraft, plan: ShippedFile[]): { files: SkillFile[]; assets: VersionAsset[] } {
  const scripts = draft.scripts.map((s) => ({ path: inFolder("scripts", s.path), content: s.content, purpose: oneLine(s.purpose) }));
  const unlisted = scripts.filter((s) => !draft.body.includes(s.path));
  let body = draft.body.trim();
  if (unlisted.length > 0) {
    body += `\n\n## Scripts\n\nReview each script before running it.\n\n${unlisted.map((s) => `- \`${s.path}\`: ${s.purpose}`).join("\n")}`;
  }
  const section = filesSection(plan);
  if (section) body += `\n\n${section}`;

  const files: SkillFile[] = [{ path: "SKILL.md", content: buildSkillMd(name, draft.description, draft.compatibility, body) }];
  const guide = buildStyleGuide(plan);
  if (guide) files.push({ path: STYLE_GUIDE_PATH, content: guide });
  for (const reference of draft.references) {
    const path = inFolder("references", reference.path);
    if (path.toLowerCase() === STYLE_GUIDE_PATH) continue;
    files.push({ path, content: reference.content });
  }
  files.push(...scripts.map((s) => ({ path: s.path, content: s.content })));

  const assets = plan.flatMap((f): VersionAsset[] => (f.shipping === "bundled" ? [{ fileId: f.id, path: f.path, fileName: f.fileName, bytes: f.size }] : []));
  return { files, assets };
}

/** The Agent Skills rules for the text files, plus the asset rules (spec: Validation). Empty means the version can be written. */
export function validateJobSkill(name: string, files: SkillFile[], assets: VersionAsset[]): string[] {
  const errors = validateSkillFiles(files, name);
  const count = files.length + assets.length;
  if (files.length <= SKILL_LIMITS.files && count > SKILL_LIMITS.files) {
    errors.push(`A skill can have at most ${SKILL_LIMITS.files} files (this one has ${count})`);
  }
  const taken = new Set(files.map((f) => f.path.toLowerCase()));
  let total = 0;
  for (const asset of assets) {
    const shown = JSON.stringify(asset.path);
    const check = checkSkillPath(asset.path);
    if (!check.ok) errors.push(check.error);
    else if (!asset.path.startsWith("assets/")) errors.push(`${shown}: bundled files must be inside assets/`);
    const key = asset.path.toLowerCase();
    if (taken.has(key)) errors.push(`${shown}: duplicate path`);
    taken.add(key);
    if (asset.bytes > JOB_LIMITS.assetBytes) errors.push(`${shown}: ${megabytes(asset.bytes)} is over the 10 MB limit for a bundled file`);
    total += asset.bytes;
  }
  if (total > JOB_LIMITS.skillAssetBytes) errors.push(`The bundled files total ${megabytes(total)}, over the 25 MB limit`);
  return errors;
}
