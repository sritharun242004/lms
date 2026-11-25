import { buildSkillMd, inFolder } from "../assemble";
import { checkSkillPath, validateSkillFiles } from "../format";
import type { SkillFileKind } from "../files/types";
import { JOB_LIMITS, SKILL_LIMITS } from "../limits";
import { oneLine } from "../names";
import type { SkillFile } from "../types";
import { megabytes } from "./format";
import { SUB_BEFORE_YOU_START_NOTE } from "./plugin-assemble";
import type { ShippedFile } from "./instructions";
import type { JobSkillDraft, PerUseInput, VersionAsset } from "./types";

/** The server writes this file from the analyses; a model file at the same path is dropped (user edits win). */
export const STYLE_GUIDE_PATH = "references/style-guide.md";
export const SHORTENED_MARKER = "[Shortened to fit the 200 KB file limit.]";

export type PlanInputFile = {
  id: string;
  fileName: string;
  assetName: string;
  kind: SkillFileKind;
  size: number;
  analysis: string | null;
  /** The FIXED question the file answers; null = a general file. */
  questionId: string | null;
};
/** A FIXED question as assembly names it. */
export type QuestionRef = { id: string; text: string };

const NO_ANALYSIS = "No analysis is available for this file.";
const GUIDE_HEAD =
  "# Style guide\n\nTaken from the files uploaded for this task, grouped by the question each file answers. Analyses edited by hand are used exactly as written.";
const GENERAL_FILES = "## General files";
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
    const base = { id: f.id, fileName: f.fileName, kind: f.kind, size: f.size, analysis: f.analysis, questionId: f.questionId };
    if (f.size > JOB_LIMITS.assetBytes) return { ...base, shipping: "analysis-only", reason: "too-large" };
    if (bundled + f.size > JOB_LIMITS.skillAssetBytes) return { ...base, shipping: "analysis-only", reason: "over-budget" };
    bundled += f.size;
    return { ...base, shipping: "bundled", path: `assets/${f.assetName}` };
  });
}

/** The question a file was added for, when it is one of `questions`. */
function questionOf(f: { questionId: string | null }, questions: QuestionRef[]): QuestionRef | undefined {
  return f.questionId ? questions.find((q) => q.id === f.questionId) : undefined;
}

/** The "## Files in this skill" section the server appends to every SKILL.md body that uses files. */
export function filesSection(plan: ShippedFile[], questions: QuestionRef[] = []): string {
  if (plan.length === 0) return "";
  const lines = [
    "## Files in this skill",
    "",
    "- `references/style-guide.md`: colours, fonts, layouts and structure taken from the files below. Follow it for anything you produce.",
  ];
  for (const f of plan) {
    const name = displayName(f.fileName);
    const question = questionOf(f, questions);
    const added = question ? ` Added for the question "${displayName(question.text)}".` : "";
    if (f.shipping === "bundled") lines.push(`- \`${f.path}\`: the original "${name}". ${REUSE[f.kind]}${added}`);
    else if (f.shipping === "in-main") {
      lines.push(`- "${name}": Kept in the \`${f.mainSkill}\` skill of this plugin (\`${f.path}\`). If you can't open it, ask the user to attach it.${added}`);
    } else if (f.reason === "too-large") {
      lines.push(`- "${name}" (${megabytes(f.size)}) was too large to include. Its style is described in \`references/style-guide.md\`.${added}`);
    } else {
      lines.push(
        `- "${name}" (${megabytes(f.size)}) didn't fit in this skill's 25 MB of bundled files. Its style is described in \`references/style-guide.md\`.${added}`,
      );
    }
  }
  return lines.join("\n");
}

function statusLine(f: ShippedFile): string {
  if (f.shipping === "bundled") return `Bundled as ${f.path}.`;
  if (f.shipping === "in-main") return `Bundled in the ${f.mainSkill} skill of this plugin as ${f.path}.`;
  return f.reason === "too-large" ? "Not bundled (too large)." : "Not bundled (over the 25 MB limit for bundled files).";
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const HEADING = /^( {0,3})(#{1,6})(?=[ \t]|$)/;

/**
 * Pushes an analysis's ATX headings down so its top level is #### under the file's own "### <file name>"
 * (a usual "## Colours" becomes "#### Colours"). Lines inside fenced code are left alone.
 */
function demoteHeadings(analysis: string, top = 4): string {
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
  const shift = Math.max(0, top - Math.min(...levels));
  if (shift === 0) return analysis;
  return lines
    .map((line, i) => (headingAt[i] ? line.replace(HEADING, (_, indent: string, marks: string) => `${indent}${"#".repeat(Math.min(6, marks.length + shift))}`) : line))
    .join("\n");
}

/** One "## For "<question>"" section per question with files, in question order, then "## General files". */
function renderGuide(plan: ShippedFile[], analyses: string[], questions: QuestionRef[]): string {
  const entry = (i: number) => [`### ${displayName(plan[i].fileName)}`, statusLine(plan[i]), analyses[i]].join("\n\n");
  const indexes = plan.map((_, i) => i);
  const sections: string[] = [];
  for (const question of questions) {
    const own = indexes.filter((i) => plan[i].questionId === question.id);
    if (own.length > 0) sections.push([`## For "${displayName(question.text)}"`, ...own.map(entry)].join("\n\n"));
  }
  const general = indexes.filter((i) => !questionOf(plan[i], questions));
  if (general.length > 0) sections.push([GENERAL_FILES, ...general.map(entry)].join("\n\n"));
  return `${[GUIDE_HEAD, ...sections].join("\n\n")}\n`;
}

/** UTF-8-safe cut: never leaves half a character (a partial sequence decodes to U+FFFD, which is stripped). */
function cutToBytes(text: string, maxBytes: number): string {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length <= maxBytes) return text;
  return new TextDecoder().decode(bytes.subarray(0, maxBytes)).replace(/�+$/, "");
}

/** references/style-guide.md: every analysis as stored (edits verbatim, headings demoted), shortened proportionally only to fit 200 KB. */
export function buildStyleGuide(plan: ShippedFile[], questions: QuestionRef[] = []): string | null {
  if (plan.length === 0) return null;
  const analyses = plan.map((f) => (f.analysis?.trim() ? demoteHeadings(f.analysis.trim()) : NO_ANALYSIS));
  const full = renderGuide(plan, analyses, questions);
  if (utf8Bytes(full) <= SKILL_LIMITS.fileBytes) return full;
  const fixed = utf8Bytes(renderGuide(plan, plan.map(() => ""), questions)) + plan.length * utf8Bytes(`\n\n${SHORTENED_MARKER}`) + 64;
  const budget = Math.max(0, SKILL_LIMITS.fileBytes - fixed);
  const sizes = analyses.map(utf8Bytes);
  const total = sizes.reduce((sum, n) => sum + n, 0);
  return renderGuide(
    plan,
    analyses.map((text, i) => `${cutToBytes(text, Math.floor((budget * sizes[i]) / total)).trimEnd()}\n\n${SHORTENED_MARKER}`),
    questions,
  );
}

/** The server-owned section listing the per-use inputs (spec 2026-11-25 tasks, Step 3). */
export const BEFORE_YOU_START_HEADING = "## Before you start — ask the user for";
const BEFORE_YOU_START_NOTE =
  "These change every time this skill is used. Check the request first, then ask for anything missing in one message before doing any work. Never guess or invent them.";
const BEFORE_YOU_START = /^ {0,3}(#{1,6})[ \t]+before you start\b/i;

export function beforeYouStartSection(perUse: PerUseInput[], note = BEFORE_YOU_START_NOTE): string {
  if (perUse.length === 0) return "";
  const items = perUse.map((p) => {
    const hint = oneLine(p.hint);
    return `- **${oneLine(p.label).replace(/\*/g, "")}** (${p.required ? "required" : "if available"})${hint ? `: ${hint}` : ""}`;
  });
  return [BEFORE_YOU_START_HEADING, "", note, "", ...items].join("\n");
}

const HOW_THIS_SKILL_WORKS = /^ {0,3}(#{1,6})[ \t]+how this skill works\b/i;

/** Removes every section the model wrote whose heading matches: from its heading to the next heading of the same or a higher level. */
function withoutModelSection(body: string, pattern = BEFORE_YOU_START): string {
  const lines = body.split("\n");
  const out: string[] = [];
  let skipLevel = 0;
  for (const line of lines) {
    const heading = HEADING.exec(line);
    if (skipLevel > 0) {
      if (!heading || heading[2].length > skipLevel) continue;
      skipLevel = 0;
    }
    const own = pattern.exec(line);
    if (own) {
      skipLevel = own[1].length;
      continue;
    }
    out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Inserts `section` after the body's first "# " title line (else at the top). */
function afterTitle(body: string, section: string): string {
  if (!section) return body;
  const lines = body.split("\n");
  const title = lines.findIndex((line) => /^# /.test(line));
  if (title === -1) return body ? `${section}\n\n${body}` : section;
  const head = lines.slice(0, title + 1).join("\n");
  const rest = lines.slice(title + 1).join("\n").trim();
  return rest ? `${head}\n\n${section}\n\n${rest}` : `${head}\n\n${section}`;
}

/** Puts the server's section after the body's first "# " title line (else at the top), replacing any model-written copy. */
export function withBeforeYouStart(body: string, perUse: PerUseInput[], note?: string): string {
  return afterTitle(withoutModelSection(body), beforeYouStartSection(perUse, note));
}

/** The main skill's workflow goes after "Before you start" (else after the title), replacing any model-written copy. */
function withHowThisSkillWorks(body: string, section: string): string {
  const clean = withoutModelSection(body, HOW_THIS_SKILL_WORKS);
  const lines = clean.split("\n");
  const start = lines.findIndex((line) => line === BEFORE_YOU_START_HEADING);
  if (start === -1) return afterTitle(clean, section);
  const next = lines.findIndex((line, i) => i > start && /^ {0,3}#{1,2}[ \t]/.test(line));
  const end = next === -1 ? lines.length : next;
  const head = lines.slice(0, end).join("\n").trimEnd();
  const rest = lines.slice(end).join("\n").trim();
  return rest ? `${head}\n\n${section}\n\n${rest}` : `${head}\n\n${section}`;
}

/** Plugins: the main skill carries the workflow section; a sub-skill carries the stand-alone note under its title. */
export type PluginSkillSections = { role: "MAIN"; section: string } | { role: "SUB"; note: string };

/** Turns the model's draft and the asset plan into a version's text files and asset entries. `name` owns the folder. */
export function assembleJobSkill(
  name: string,
  draft: JobSkillDraft,
  plan: ShippedFile[],
  context: { questions?: QuestionRef[]; perUse?: PerUseInput[]; plugin?: PluginSkillSections } = {},
): { files: SkillFile[]; assets: VersionAsset[] } {
  const questions = context.questions ?? [];
  const scripts = draft.scripts.map((s) => ({ path: inFolder("scripts", s.path), content: s.content, purpose: oneLine(s.purpose) }));
  const unlisted = scripts.filter((s) => !draft.body.includes(s.path));
  const plugin = context.plugin;
  let body = withBeforeYouStart(draft.body.trim(), context.perUse ?? [], plugin?.role === "SUB" ? SUB_BEFORE_YOU_START_NOTE : undefined);
  if (plugin?.role === "MAIN") body = withHowThisSkillWorks(body, plugin.section);
  else if (plugin?.role === "SUB") body = afterTitle(body, plugin.note);
  if (unlisted.length > 0) {
    body += `\n\n## Scripts\n\nReview each script before running it.\n\n${unlisted.map((s) => `- \`${s.path}\`: ${s.purpose}`).join("\n")}`;
  }
  const section = filesSection(plan, questions);
  if (section) body += `\n\n${section}`;

  const files: SkillFile[] = [{ path: "SKILL.md", content: buildSkillMd(name, draft.description, draft.compatibility, body) }];
  const guide = buildStyleGuide(plan, questions);
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
