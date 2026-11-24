# Skills Builder Jobs Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Skills Builder's describe → split → refine flow with **Jobs**: describe one recurring job, upload the files used for it (analysed into an editable style guide), answer the 8 skill-definition questions, accept AI-suggested skills, and generate versioned Agent Skills that bundle the original templates; remove the catalog; keep old packs as read-only legacy.

**Architecture:** Everything stays in `apps/web`.
- **Data:** five new Prisma models (`SkillJob`, `SkillJobAnswer`, `SkillJobFile` with bytes in Postgres, `SkillJobSkill`, `SkillVersion`) and two enums in one additive migration. Catalog and pack tables stay, unused or read-only.
- **Parsers:** pure, synchronous extractors under `src/lib/skills/files/` (byte sniffing, a tolerant XML scanner, OOXML via `fflate.unzipSync` with size-bounded filters, PDF header facts, `sharp` for images) produce `FileFacts` during the upload request; malformed, encrypted and macro files are refused before anything is stored or spent.
- **AI:** three calls in `src/lib/ai/claude.ts`: `analyseFile` (Haiku, plain text, PDF `document` / `image` blocks, run in `after()`), `suggestJobSkills` (Opus, structured, in the request), `generateJobSkillDraft` (Opus, structured, in `after()`). The server owns `SKILL.md`'s "Files in this skill" section, `references/style-guide.md` and the `assets/` originals; the existing Agent Skills validator gates every version.
- **Routes:** `/api/v1/prompt-bot/skill-jobs/**`, each thin: auth, parse, call the data layer, map errors with one `jobErrorResponse`.
- **UI:** `/prompt-bot/skills` (jobs + legacy list), `/prompt-bot/skills/[jobId]` (four-step workspace reusing `useMatrixAnswers`/`MatrixPanel`), `/prompt-bot/skills/legacy/[packId]` (read-only), one read-only `SkillFilesView` shared by version previews and legacy packs.

**Tech Stack:** Next.js 16.2 App Router (`after` from `next/server`), React 19, TypeScript, Prisma 6 (PostgreSQL, `Bytes`, `omit`), Zod 3, `@anthropic-ai/sdk` 1.13 (`Base64PDFSource`, `Base64ImageSource`, `output_config.format`, beta server-side fallback), `fflate` 0.8 (unzip with filter, zip with per-entry level), `sharp` 0.34, `yaml`, `react-markdown`, Vitest 3 with Testing Library (jsdom via a `/** @vitest-environment jsdom */` header), the LMS UI kit. **No new dependencies.**

**Spec:** `docs/superpowers/specs/2026-11-25-skills-builder-jobs-design.md` (format rules: `docs/superpowers/specs/2026-11-24-prompt-bot-skills-builder-design.md`; AI foundation: `docs/superpowers/specs/2026-11-24-prompt-bot-enhancer-design.md`). Executors read the jobs spec in full before Task 0.

## Batches

| Batch | Tasks | Delivers | Gate at the boundary |
|---|---|---|---|
| **1 — Data and parsers** | 0–7 | limits, usage feature, bounded byte reader, schema + migration, fixtures, sniffing, PPTX/DOCX/XLSX/PDF/image extraction, asset names | full suite, `tsc`, `eslint`, `prisma migrate status` |
| **2 — AI and routes** | 8–15 | Claude calls, job/file/skill data layers, analysis and generation runs, versions, zips with binary assets, all routes, catalog removal, legacy read-only API | full suite, `tsc`, `eslint`, `next build` |
| **3 — UI** | 16–21 | client, `SkillFilesView`, home, legacy page, job workspace and its four panels | full suite, `tsc`, `eslint`, `next build` |
| **4 — End to end** | 22–23 | fake Anthropic shapes, fixture script, browser run, `quick_validate.py` oracle, real-API smoke, production checklist | the oracle passes |

Each batch ends with a **Batch gate** task step; do not start the next batch until it is green. Batches run in order (later batches consume earlier interfaces).

## Global Constraints

- **Scope:** only `apps/web` and `docs/`. The enhancer's behaviour does not change and its tests keep passing unchanged.
- **Branch and commits:** `feat/skills-builder-jobs` from an up-to-date `main`. Commit at the end of every task with a Conventional Commit subject (`feat(skills-builder): …`, `refactor(skills-builder): …`, `test(skills-builder): …`, `chore(skills-builder): …`). Do not push. Never `git add` files you did not create or change in the task.
- **Migrations:** forward-only and additive. Generate SQL with `npx prisma migrate diff --from-schema-datamodel <schema at HEAD> --to-schema-datamodel prisma/schema.prisma --script`, save it as `prisma/migrations/20261125120000_add_skill_jobs/migration.sql`, apply with `npx prisma migrate deploy`. Never run `prisma migrate dev`, `migrate reset`, `db push`, or any SQL containing `DROP`.
- **Deprecated, kept:** the `SkillCatalogEntry` model, `skill_catalog_entries` table and `SkillPackItem.catalogEntryId` stay in `schema.prisma` with `/// Deprecated 2026-11-25: unused since the Jobs redesign; kept so no data is dropped.` No code reads or writes them.
- **Environment:** no new environment variables. The fake API uses the SDK's standard `ANTHROPIC_BASE_URL` only during end-to-end checks.
- **Models:** `FAST_MODEL` (`claude-haiku-4-5`) for analysis and scoring; `BEST_MODEL` (`claude-opus-5-5`) for suggest and generate with `betas: ["server-side-fallback-2026-07-01"]` and `fallbacks: "default"`. Never guess SDK shapes: the block shapes used are exactly `{ type: "document", source: { type: "base64", media_type: "application/pdf", data }, title }` and `{ type: "image", source: { type: "base64", media_type: "image/png" | "image/jpeg", data } }` (`@anthropic-ai/sdk` 1.13 `Base64PDFSource`, `Base64ImageSource`), document/image blocks before the text block.
- **SDK request options:** analysis `{ timeout: 90_000, maxRetries: 1 }`; suggest `{ timeout: 100_000, maxRetries: 0 }`; generation `{ timeout: 240_000, maxRetries: 0 }` (two attempts). All below App Runner's 120 s request cap where they run inside a request.
- **Usage features:** `score` (job scoring), `skill_split` (Suggest), `skill_generate` (Generate; the retry is free), new `skill_analyze` (upload and Analyse again, default 40/day). Spent with `consumeAiUsage` after every cheap check and before the AI call.
- **Access:** every signed-in role; anything not the caller's is 404. 401 `UNAUTHORIZED` without a session.
- **Error codes:** 400 `VALIDATION_ERROR` / `UPLOAD_INCOMPLETE`, 401 `UNAUTHORIZED`, 404 `NOT_FOUND`, 409 `ALREADY_ANALYSING` / `ALREADY_GENERATING` / `FILES_ANALYSING` / `TOO_MANY_FILES` / `TOO_MANY_SKILLS` / `DUPLICATE_NAME` / `NOTHING_TO_DOWNLOAD` / `ASSET_MISSING` / `PACK_TOO_LARGE`, 413 `FILE_TOO_LARGE`, 415 `UNSUPPORTED_FILE`, 422 `FILE_ENCRYPTED` / `FILE_UNREADABLE`, 429 `LIMIT_REACHED`, 502 `AI_FAILED`, 503 `AI_NOT_CONFIGURED`.
- **Limits:** exactly the `JOB_LIMITS` values in the Interface Contract below (20 MB upload, 10 files, 10 MB bundle per file, 25 MB bundle per version, 5 skills, 12 000-char analysis, 64 KB facts, 16 MB / 64 MB OOXML parts, 300 parts parsed, 60 slides detailed, 100 PDF pages, 1568 px images, 20 versions, 100 MB pack).
- **Agent Skills format:** unchanged from the 2026-11-24 spec and enforced by the existing `validateSkillFiles` / `checkSkillPath`. Upload zips have exactly one folder, the skill name, at the root.
- **Binary safety:** asset bytes are `Uint8Array` end to end (Prisma `Bytes` → zip entry, `level: 0`), never decoded to text. Text files use `strToU8`.
- **Privacy:** never log descriptions, answers, file names, file bytes, facts, analyses or prompts. Log `error.name` only, with the prefix `[skills-builder]`.
- **Scripts and macros:** never executed or rendered. Macro-enabled packages are refused at upload.
- **Tests:** Vitest only collects `src/**/*.test.ts`. Component tests use `React.createElement` (no JSX in tests) and start with `/** @vitest-environment jsdom */`. Prisma, `@/lib/auth`, `next/server`'s `after`, and `@/lib/ai/claude` are mocked with `vi.hoisted` exactly as the existing Skills Builder tests do. Binary fixtures are built in code by `src/lib/skills/files/fixtures.ts`; no binary file is committed. Every production change follows a witnessed failing-test-first cycle.
- **Design:** LMS design system (`glass`, `components/ui`, `--primary`, `rounded-2xl`/`rounded-[1.75rem]`, lucide icons, dark mode). Before writing UI code in Tasks 16–21, invoke the `impeccable` skill with the Skill tool (the user's global CLAUDE.md requires it) and follow it on top of the existing design system; finish each UI task with the `fixing-accessibility` checks for its controls. Everything works at 360 px wide.
- **Confirmations:** `ConfirmDialog` only; never `window.confirm` in the Skills Builder. Generate asks once, and only when questions are unanswered.

## Review Focus

1. **A deploy restarts the server while a file is being analysed.** The file must not read "Analysing…" forever: after 5 minutes it reads `FAILED` with "Analysing this file was interrupted. Analyse it again." and **Analyse again** claims it. Pinned by the stale-analysis view test in Task 9 and the stale-claim test in Task 10.
2. **The connection drops in the middle of a 20 MB upload** (mobile, slow network). Nothing may be stored and no `skill_analyze` unit spent; the user sees "The upload didn't finish. Try again." Pinned by the erroring-stream test in Task 1 and the upload-route test in Task 10.
3. **The user removes a file after a version bundled it.** That version must still download with the exact original bytes (soft delete), and the bytes must disappear once no version needs them. Pinned by the soft/hard delete tests in Task 10 and the SHA-256 round-trip test in Task 14.
4. **The user renames a skill after v1.** v1 must still download as `<old-name>/` with a matching `SKILL.md` name (valid for `quick_validate.py`), v2 must use the new name, and a pack of latest versions must refuse two latest versions with the same name. Pinned by the rename test in Task 11 and the version-name tests in Task 14.
5. **Real-world Office files are messier than fixtures:** slides listed out of numeric order, `sysClr` theme colours, layouts without names, Google-exported decks without `p:cSld@name`, Unicode and quote characters in file names. Extraction must fall back (never throw) and names must stay safe. Pinned by the quirks tests in Tasks 4 and 7.

## File Structure

Created (C) or modified (M) or deleted (D), by task. Paths are under `apps/web/` unless they start with `docs/`.

| Path | Task | Responsibility |
|---|---|---|
| `src/lib/skills/limits.ts` (M) | 1, 15 | `JOB_LIMITS` and time constants; legacy edit limits removed in 15 |
| `src/lib/ai/usage.ts` (M) | 1 | `skill_analyze` feature |
| `src/lib/api/body.ts` (M) | 1 | `readBytesWithin`; `readJsonWithin` built on it |
| `prisma/schema.prisma` (M), `prisma/migrations/20261125120000_add_skill_jobs/migration.sql` (C), `src/lib/skills/jobs/migration.test.ts` (C) | 2 | models, enums, deprecation comments, migration guard |
| `src/lib/skills/files/types.ts` (C) | 3 | `FileFacts` union, kinds, MIME/extension tables, `FileReadError` |
| `src/lib/skills/files/xml.ts` (C) | 3 | tolerant XML element scanner |
| `src/lib/skills/files/ooxml.ts` (C) | 3 | bounded OOXML package reader, rels, theme, colours |
| `src/lib/skills/files/sniff.ts` (C) | 3 | kind from magic bytes, encrypted/macro/legacy refusal |
| `src/lib/skills/files/fixtures.ts` (C) | 3 (grows in 4–7) | test-only builders for real PPTX/DOCX/XLSX/PDF/PNG/JPEG/OLE bytes |
| `src/lib/skills/files/pptx.ts` (C) | 4 | `extractPptx` |
| `src/lib/skills/files/docx.ts` (C) | 5 | `extractDocx` |
| `src/lib/skills/files/xlsx.ts` (C) | 6 | `extractXlsx` |
| `src/lib/skills/files/pdf.ts`, `image.ts`, `extract.ts`, `safe-name.ts` (C) | 7 | PDF/image facts, image copy for Claude, `readUpload`, `boundFacts`, `assetFileName` |
| `src/lib/skills/jobs/types.ts` (C) | 8 | view and draft types (verbatim below) |
| `src/lib/skills/jobs/instructions.ts` (C) | 8 | system prompts and message builders |
| `src/lib/ai/claude.ts` (M) | 8, 15 | `analyseFile`, `suggestJobSkills`, `generateJobSkillDraft`; `splitWork`/`generateSkillDraft` removed in 15 |
| `src/lib/skills/matrix.ts` (C) | 9 | `loadSkillMatrix` (moved out of `packs.ts`) |
| `src/lib/skills/jobs/staleness.ts` (C) | 9 | generation and analysis staleness rules and messages |
| `src/lib/skills/jobs/errors.ts`, `http.ts` (C) | 9 | domain errors and the single `jobErrorResponse` mapper |
| `src/lib/skills/jobs/jobs.ts` (C) | 9 | job views, create/patch/delete, scoring |
| `src/app/api/v1/prompt-bot/skill-jobs/route.ts`, `[id]/route.ts`, `[id]/answers/[questionId]/route.ts`, `[id]/score/route.ts`, `job-routes.test.ts` (C) | 9 | job routes |
| `src/lib/skills/jobs/files.ts` (C) | 10 | store upload, analysis run, re-analyse, edit, delete, purge |
| `src/app/api/v1/prompt-bot/skill-jobs/[id]/files/route.ts`, `[id]/files/[fileId]/route.ts`, `[id]/files/[fileId]/analyse/route.ts`, `file-routes.test.ts` (C) | 10 | file routes |
| `src/lib/skills/jobs/skills.ts` (C) | 11 | suggestions clean-up/apply, add/update/delete skill |
| `src/app/api/v1/prompt-bot/skill-jobs/[id]/suggest/route.ts`, `[id]/skills/route.ts`, `[id]/skills/[skillId]/route.ts`, `skill-routes.test.ts` (C) | 11 | suggest and skill routes |
| `src/lib/skills/assemble.ts` (M) | 12 | keeps `buildSkillMd`, exports `inFolder`; old draft assembly removed |
| `src/lib/skills/jobs/assemble.ts` (C) | 12 | asset plan, files section, style guide, assembly, validation |
| `src/lib/skills/jobs/generate.ts` (C), `src/app/api/v1/prompt-bot/skill-jobs/[id]/skills/[skillId]/generate/route.ts`, `generate-routes.test.ts` (C) | 13 | generation runs and versions |
| `src/lib/skills/zip.ts`, `src/lib/skills/pack-docs.ts` (M) | 14 | binary assets, size guard, README without recommendations |
| `src/lib/skills/jobs/download.ts` (C), `…/versions/[version]/route.ts`, `…/versions/[version]/download/route.ts`, `[id]/download/route.ts`, `download-routes.test.ts` (C) | 14 | version detail and zips |
| catalog files, old flow files (D); `src/lib/skills/packs.ts`, `types.ts`, `client.ts`, legacy routes (M) | 15 | catalog removal, legacy read-only API |
| `src/lib/skills/jobs/client.ts` (C), `src/components/prompt-bot/skills/file-tree.tsx` (M), `skill-files-view.tsx` (C) | 16 | client calls, read-only viewer |
| `src/app/(app)/prompt-bot/skills/page.tsx` (M), `new-job-form.tsx` (C), `legacy/[packId]/page.tsx`, `legacy-pack-view.tsx` (C), `src/components/prompt-bot/prompt-bot-tabs.tsx` (M) | 17 | home, legacy page, tabs |
| `src/app/(app)/prompt-bot/skills/[jobId]/page.tsx`, `job-steps.ts`, `job-workspace.tsx`, `describe-panel.tsx` (C) | 18 | workspace shell, steps, polling, describe |
| `…/[jobId]/files-panel.tsx` (C) | 19 | uploads and analyses |
| `…/[jobId]/questions-panel.tsx` (C) | 20 | matrix and answers |
| `…/[jobId]/skills-panel.tsx`, `skill-card.tsx`, `version-preview.tsx` (C) | 21 | suggest, skills, generate, versions, downloads |
| `scripts/fake-anthropic.mjs` (M), `scripts/make-skill-fixtures.ts` (C), `src/lib/skills/files/e2e-fixtures.ts` (C) | 22 | fake API shapes, E2E fixture files (`writeSkillFixtures`) |
| — | 23 | browser run, oracle, smoke, checklist |

## Interface Contract

Every task's **Interfaces** block repeats the slice it consumes and produces. These names, signatures and types are binding across tasks; a task that needs a change updates this section in the same commit.

### `src/lib/skills/limits.ts` (Task 1 adds)

```ts
export const JOB_LIMITS = {
  titleChars: 120,
  descriptionChars: 20_000,
  filesPerJob: 10,
  fileBytes: 20 * 1024 * 1024,
  assetBytes: 10 * 1024 * 1024,
  skillAssetBytes: 25 * 1024 * 1024,
  skillsPerJob: 5,
  fileIdsPerSkill: 10,
  analysisChars: 12_000,
  analysisExcerptChars: 1_500,
  scoringBaseChars: 12_000,
  factsBytes: 64 * 1024,
  ooxmlPartBytes: 16 * 1024 * 1024,
  ooxmlTotalBytes: 64 * 1024 * 1024,
  ooxmlPartsParsed: 300,
  slidesDetailed: 60,
  pdfPagesForAnalysis: 100,
  imageEdgePx: 1568,
  versionsKept: 20,
  packZipBytes: 100 * 1024 * 1024,
} as const;
export const ANALYSIS_TIMEOUT_MS = 90_000;
export const ANALYSIS_STALE_MS = 5 * 60_000;
export const SUGGEST_TIMEOUT_MS = 100_000;
// existing, unchanged: SKILL_LIMITS, GENERATION_TIMEOUT_MS (240_000), GENERATION_STALE_MS (10 * 60_000)
```

### `src/lib/api/body.ts` (Task 1)

```ts
export type BoundedBytes = { ok: true; bytes: Uint8Array } | { ok: false; reason: "too_large" | "aborted" };
export async function readBytesWithin(req: Request, maxBytes: number): Promise<BoundedBytes>;
export async function readJsonWithin(req: Request, maxBytes: number): Promise<BoundedJson>; // unchanged contract, now built on readBytesWithin; an aborted body reads as {} (schema validation then reports it)
```

### `src/lib/ai/usage.ts` (Task 1)

```ts
export type AiFeature = "score" | "enhance" | "skill_split" | "skill_generate" | "skill_analyze";
export const DEFAULT_LIMITS = { score: 300, enhance: 30, skill_split: 10, skill_generate: 20, skill_analyze: 40 };
```

### `src/lib/skills/files/types.ts` (Task 3, verbatim)

```ts
/** Deterministic facts read from an uploaded file (spec: File Analysis Pipeline, stage 2). No server imports: client-safe. */
export type SkillFileKind = "PPTX" | "DOCX" | "XLSX" | "PDF" | "PNG" | "JPEG";

export const THEME_SLOTS = ["dk1", "lt1", "dk2", "lt2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6", "hlink", "folHlink"] as const;
export type ThemeSlot = (typeof THEME_SLOTS)[number];
export type ThemeFacts = { name: string | null; colors: { slot: ThemeSlot; hex: string }[]; majorFont: string | null; minorFont: string | null };
export type ColorUse = { hex: string; count: number };

export type SlideFacts = {
  index: number; // 1-based, presentation order
  layout: string | null;
  title: string | null;
  placeholders: string[];
  text: string; // <= 300 chars
  tables: number;
  charts: number;
  images: number;
};
export type PptxFacts = {
  kind: "PPTX";
  slideSize: { widthIn: number; heightIn: number; aspect: "16:9" | "4:3" | "16:10" | "A4" | "custom" } | null;
  theme: ThemeFacts | null;
  themes: string[]; // names of every theme part, in part-number order
  masters: string[];
  layouts: string[];
  slideCount: number;
  slides: SlideFacts[]; // first JOB_LIMITS.slidesDetailed
  colorsUsed: ColorUse[]; // top 12
  fontsUsed: string[]; // up to 12
  truncated: boolean;
};

export type DocxStyle = {
  id: string;
  name: string;
  type: "paragraph" | "character" | "table" | "numbering";
  basedOn: string | null;
  font: string | null;
  sizePt: number | null;
  color: string | null;
  bold: boolean;
};
export type DocxFacts = {
  kind: "DOCX";
  theme: ThemeFacts | null;
  defaults: { font: string | null; sizePt: number | null };
  styles: DocxStyle[]; // <= 40
  headings: { level: number; text: string }[]; // <= 100; Title = level 0
  paragraphs: number;
  tables: number;
  images: number;
  page: { widthIn: number; heightIn: number; orientation: "portrait" | "landscape" } | null;
  textSample: string; // <= 4000 chars
  truncated: boolean;
};

export type SheetFacts = { name: string; dimension: string | null; rows: number; headerRow: string[]; formulas: number; formulaSamples: string[] };
export type XlsxFacts = {
  kind: "XLSX";
  theme: ThemeFacts | null;
  sheets: SheetFacts[]; // <= 20
  numberFormats: string[]; // <= 20
  charts: number;
  definedNames: string[]; // <= 30
  truncated: boolean;
};

export type PdfFacts = { kind: "PDF"; version: string | null; pages: number | null; title: string | null };
export type ImageFacts = { kind: "PNG" | "JPEG"; width: number; height: number };
export type FileFacts = PptxFacts | DocxFacts | XlsxFacts | PdfFacts | ImageFacts;

export const KIND_MIME: Record<SkillFileKind, string> = {
  PPTX: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  DOCX: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  XLSX: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  PDF: "application/pdf",
  PNG: "image/png",
  JPEG: "image/jpeg",
};
export const KIND_EXTENSION: Record<SkillFileKind, string> = { PPTX: "pptx", DOCX: "docx", XLSX: "xlsx", PDF: "pdf", PNG: "png", JPEG: "jpg" };
export const KIND_LABEL: Record<SkillFileKind, string> = { PPTX: "PowerPoint", DOCX: "Word", XLSX: "Excel", PDF: "PDF", PNG: "PNG image", JPEG: "JPG image" };

export type FileReadErrorCode = "UNSUPPORTED_FILE" | "FILE_ENCRYPTED" | "FILE_UNREADABLE";
export const FILE_READ_MESSAGES = {
  unsupported: "Upload a PowerPoint, Word, Excel, PDF, PNG or JPG file.",
  macro: "Macro-enabled files aren't supported. Save it as .pptx, .docx or .xlsx without macros.",
  ole: "This file is password-protected or in an old Office format. Remove the password or save it as .pptx, .docx or .xlsx, then upload it again.",
  encryptedPdf: "This PDF is password-protected. Remove the password, then upload it again.",
  unreadable: "We couldn't read this file. It may be damaged. Open and save it again, then upload it.",
} as const;

export class FileReadError extends Error {
  constructor(
    readonly code: FileReadErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "FileReadError";
  }
  get status(): 415 | 422 {
    return this.code === "UNSUPPORTED_FILE" ? 415 : 422;
  }
}
```

### Parsers (Tasks 3–7)

```ts
// src/lib/skills/files/xml.ts
export type XmlElement = { name: string; attrs: Record<string, string>; inner: string };
export function decodeXml(text: string): string;
/** Every <prefix:localName …>…</prefix:localName> or self-closing <prefix:localName …/>; prefix-agnostic; same-name nesting is not supported. */
export function elements(xml: string, localName: string): XmlElement[];
export function first(xml: string, localName: string): XmlElement | null;
/** Attribute by local name ("val" matches "w:val" and "val"); null when absent. */
export function attr(el: XmlElement | null | undefined, localName: string): string | null;
/** Decoded text of every <…:t> (or `localName`) element in order, joined with no separator. */
export function textOf(xml: string, localName?: string): string;
export const collapse: (text: string, max?: number) => string; // whitespace-collapsed, trimmed, cut to max chars

// src/lib/skills/files/ooxml.ts
export const EMU_PER_INCH = 914_400;
export type OoxmlPackage = { names: string[]; parts: Map<string, string>; truncated: boolean };
/** Unzips only XML/rels parts (not customXml/), each <= ooxmlPartBytes, total <= ooxmlTotalBytes; names lists every entry. Throws FileReadError("FILE_UNREADABLE"). */
export function openOoxml(bytes: Uint8Array): OoxmlPackage;
/** rId -> absolute part path, resolved against the part the rels file belongs to. */
export function relTargets(relsXml: string | undefined, fromPart: string): Map<string, string>;
export function relsPathFor(part: string): string; // "ppt/slides/slide1.xml" -> "ppt/slides/_rels/slide1.xml.rels"
export function partNumber(name: string): number; // trailing digits before ".xml", else 0
export function toHex(value: string | null): string | null; // "1f4e79" -> "#1F4E79"; invalid -> null
export function colorOf(el: XmlElement | null): string | null; // srgbClr@val or sysClr@lastClr inside el.inner
export function readTheme(xml: string | undefined): ThemeFacts | null;
export function topColors(xmls: string[], limit?: number): ColorUse[]; // srgbClr@val counts, desc, then hex asc

// src/lib/skills/files/sniff.ts
export type Sniffed = { kind: "PPTX" | "DOCX" | "XLSX"; pkg: OoxmlPackage } | { kind: "PDF" | "PNG" | "JPEG"; pkg: null };
export function sniffFile(bytes: Uint8Array): Sniffed; // throws FileReadError

// src/lib/skills/files/pptx.ts | docx.ts | xlsx.ts
export function extractPptx(pkg: OoxmlPackage): PptxFacts;
export function extractDocx(pkg: OoxmlPackage): DocxFacts;
export function extractXlsx(pkg: OoxmlPackage): XlsxFacts;

// src/lib/skills/files/pdf.ts
export function isEncryptedPdf(bytes: Uint8Array): boolean;
export function extractPdf(bytes: Uint8Array): PdfFacts;

// src/lib/skills/files/image.ts
export async function extractImage(bytes: Uint8Array, kind: "PNG" | "JPEG"): Promise<ImageFacts>; // throws FileReadError("FILE_UNREADABLE")
export async function imageForClaude(bytes: Uint8Array, kind: "PNG" | "JPEG"): Promise<{ mediaType: "image/png" | "image/jpeg"; base64: string }>;

// src/lib/skills/files/extract.ts
export type ReadUpload = { kind: SkillFileKind; mimeType: string; facts: FileFacts; sha256: string };
export async function readUpload(bytes: Uint8Array): Promise<ReadUpload>; // sniff + extract + boundFacts; any extractor exception -> FileReadError("FILE_UNREADABLE")
export function boundFacts(facts: FileFacts, maxBytes?: number): FileFacts; // trims arrays until JSON <= maxBytes, sets truncated where the type has it

// src/lib/skills/files/safe-name.ts
export function assetFileName(original: string, kind: SkillFileKind, taken: Iterable<string>): string;
```

### `src/lib/skills/files/fixtures.ts` (Task 3 creates, Tasks 4–7 extend; test-only)

```ts
export type FixtureTheme = { name?: string; colors?: Partial<Record<ThemeSlot, string>>; sysDk1?: boolean; majorFont?: string; minorFont?: string };
export type FixtureSlide = { title?: string; body?: string[]; layout?: number; table?: boolean; chart?: boolean; picture?: boolean; colors?: string[]; fonts?: string[] };
export function zip(entries: Record<string, string | Uint8Array>, level?: 0 | 6): Uint8Array;
export function buildPptx(opts?: {
  slides?: FixtureSlide[]; theme?: FixtureTheme; slideSize?: { cx: number; cy: number };
  layouts?: (string | null)[]; masters?: (string | null)[]; order?: number[]; macro?: boolean; padBytes?: number;
}): Uint8Array;
export type FixtureStyle = { id: string; name: string; type?: "paragraph" | "character" | "table"; font?: string; sizePt?: number; color?: string; bold?: boolean; basedOn?: string };
export function buildDocx(opts?: {
  paragraphs?: { text: string; style?: string }[]; styles?: FixtureStyle[]; defaults?: { font?: string; sizePt?: number };
  theme?: FixtureTheme; page?: { widthIn: number; heightIn: number; orientation?: "portrait" | "landscape" }; tables?: number; images?: number;
}): Uint8Array;
export type FixtureCell = string | number | { formula: string; value?: number };
export function buildXlsx(opts?: {
  sheets?: { name: string; rows: FixtureCell[][]; inlineStrings?: boolean }[]; numFmts?: string[]; definedNames?: string[]; charts?: number; theme?: FixtureTheme;
}): Uint8Array;
export function tinyPdf(opts?: { pages?: number; title?: string; encrypted?: boolean }): Uint8Array;
export async function tinyPng(width?: number, height?: number): Promise<Uint8Array>;
export async function tinyJpeg(width?: number, height?: number): Promise<Uint8Array>;
export function oleHeader(): Uint8Array; // D0 CF 11 E0 A1 B1 1A E1 + 504 zero bytes
export function sha256Hex(bytes: Uint8Array): string;
```

### `src/lib/skills/jobs/types.ts` (Task 8, verbatim)

```ts
import type { AnswerView } from "@/lib/prompt-bot/sessions";
import type { FileFacts, SkillFileKind } from "../files/types";
import type { SkillFile, SkillItemStatus, SkillMatrixView } from "../types";

export type AnalysisStatus = "PENDING" | "READY" | "FAILED";

export type JobFileView = {
  id: string;
  fileName: string;
  assetName: string;
  kind: SkillFileKind;
  size: number;
  createdAt: string;
  analysisStatus: AnalysisStatus;
  analysis: string | null;
  analysisEdited: boolean;
  analysisError: string | null;
  /** size <= JOB_LIMITS.assetBytes: can be bundled under assets/. */
  bundlable: boolean;
};
export type JobFileDetail = JobFileView & { facts: FileFacts | null };

export type VersionSummary = { version: number; name: string; createdAt: string; assets: number };

export type JobSkillView = {
  id: string;
  order: number;
  name: string;
  purpose: string;
  fileIds: string[];
  status: SkillItemStatus;
  validationErrors: string[];
  latestVersion: number;
  /** Newest first. */
  versions: VersionSummary[];
};

export type JobView = {
  id: string;
  title: string;
  description: string;
  scoreRevision: number;
  updatedAt: string;
  suggestedAt: string | null;
  matrix: SkillMatrixView;
  answers: AnswerView[];
  files: JobFileView[];
  skills: JobSkillView[];
};

export type VersionAsset = { fileId: string; path: string; fileName: string; bytes: number };
export type VersionDetail = {
  skillId: string;
  version: number;
  name: string;
  description: string;
  createdAt: string;
  files: SkillFile[];
  assets: VersionAsset[];
};

/** Suggest's structured reply before clean-up. */
export type RawSuggestions = { skills: { name: string; purpose: string; fileIds: string[] }[] };
/** Generation's structured reply. The server writes SKILL.md, the style guide and assets/. */
export type JobSkillDraft = {
  description: string;
  compatibility: string;
  body: string;
  references: { path: string; content: string }[];
  scripts: { path: string; content: string; purpose: string }[];
};
```

### Instructions and Claude calls (Task 8)

```ts
// src/lib/skills/jobs/instructions.ts
export const ANALYSE_SYSTEM: string; // contains the phrase "style guide" (the fake API keys on it)
export const SUGGEST_SYSTEM: string;
export const GENERATE_JOB_SYSTEM: string;
export function buildAnalysisText(input: { fileName: string; kind: SkillFileKind; facts: FileFacts | null }): string;
export type PromptFile = { id: string; fileName: string; kind: SkillFileKind; size: number; analysis: string | null };
export type ShippedFile = PromptFile & ({ shipping: "bundled"; path: string } | { shipping: "analysis-only"; reason: "too-large" | "over-budget" });
export function buildSuggestMessage(input: {
  title: string; description: string; questions: PromptQuestionContext[]; files: PromptFile[]; built: { name: string; purpose: string }[];
}): string;
export function buildJobGenerateMessage(input: {
  title: string; description: string; questions: PromptQuestionContext[]; skill: { name: string; purpose: string }; files: ShippedFile[];
}): string;
export function buildJobRetryMessage(original: string, draft: JobSkillDraft, errors: string[]): string;

// src/lib/ai/claude.ts
export type AnalysisContent = {
  text: string;
  document?: { base64: string; title: string };
  image?: { base64: string; mediaType: "image/png" | "image/jpeg" };
};
export async function analyseFile(content: AnalysisContent): Promise<string>; // FAST_MODEL, messages.create, plain text; AiResponseError on max_tokens/refusal/empty
export async function suggestJobSkills(message: string): Promise<RawSuggestions>; // BEST_MODEL + fallback, structured
export async function generateJobSkillDraft(message: string): Promise<JobSkillDraft>; // BEST_MODEL + fallback, structured
```

### Data layer (Tasks 9–14)

```ts
// src/lib/skills/matrix.ts
export async function loadSkillMatrix(): Promise<SkillMatrixView>;

// src/lib/skills/jobs/staleness.ts
export const GENERATION_INTERRUPTED_MESSAGE = "Writing this skill was interrupted. Generate it again.";
export const ANALYSIS_INTERRUPTED_MESSAGE = "Analysing this file was interrupted. Analyse it again.";
export const generationCutoff: (now?: Date) => Date;
export const analysisCutoff: (now?: Date) => Date;
export function isGenerating(status: string, startedAt: Date | null, now?: Date): boolean;
export function isAnalysing(status: string, startedAt: Date | null, now?: Date): boolean;

// src/lib/skills/jobs/errors.ts  (all extend Error, set this.name to the class name)
export class JobNotFoundError {}       export class FileNotFoundError {}     export class SkillNotFoundError {}
export class VersionNotFoundError {}   export class AlreadyAnalysingError {} export class AlreadyGeneratingError {}
export class FilesAnalysingError {}    export class TooManyFilesError {}     export class TooManySkillsError {}
export class EmptyDescriptionError {}  export class NothingToDownloadError {} export class AssetMissingError {}
export class PackTooLargeError {}      // defined here; zip.ts imports and re-exports it
export class DuplicateNameError { constructor(readonly skillName: string) }
// zip.ts keeps DuplicateSkillNameError (pack collisions) and re-exports PackTooLargeError from jobs/errors.ts

// src/lib/skills/jobs/http.ts
/** The one mapper for every skill-jobs route: domain errors, FileReadError, zip errors and AI-layer errors. Null = not ours, rethrow. */
export function jobErrorResponse(error: unknown): Response | null;
export const unauthorized: () => Response;

// src/lib/skills/jobs/jobs.ts
export const fileViewOmit: { data: true; facts: true };
export function toFileView(row: FileViewRow, now?: Date): JobFileView;
export function toSkillView(row: SkillViewRow, now?: Date): JobSkillView;
export async function loadJobView(jobId: string, userId: string, now?: Date): Promise<JobView | null>;
export async function findOwnedJob(jobId: string, userId: string): Promise<{ id: string; title: string; description: string } | null>;
export async function createJob(userId: string, input: { title?: string; description?: string }): Promise<string>;
export async function updateJob(jobId: string, userId: string, patch: { title?: string; description?: string }): Promise<JobView>; // JobNotFoundError
export async function deleteJob(jobId: string, userId: string): Promise<void>; // JobNotFoundError
export function jobScoringBase(job: { title: string; description: string }, files: { fileName: string; analysis: string | null; analysisStatus: string }[]): string;
export async function runJobScoring(jobId: string, userId: string, revision: number): Promise<{ applied: boolean; revision: number; answers: AnswerView[] }>;
export async function saveJobAnswer(jobId: string, userId: string, questionId: string, fields: { answer?: string; notRelevant?: boolean }): Promise<"saved" | "no-question">; // JobNotFoundError; "no-question" -> route answers 404 "Question not found"
export async function activeFiles(jobId: string): Promise<FileViewRow[]>; // deletedAt null, createdAt asc, no bytes/facts
export async function jobQuestionContext(jobId: string): Promise<PromptQuestionContext[]>;

// src/lib/skills/jobs/files.ts
export const ANALYSIS_FAILED_MESSAGE = "We couldn't analyse this file. Try again, or write the style guide yourself.";
export const PDF_TOO_LONG_MESSAGE = "This PDF has more than 100 pages, so it can't be analysed. Upload the pages that show the style, or write the style guide yourself.";
export async function countActiveFiles(jobId: string): Promise<number>;
export async function storeJobFile(input: { jobId: string; userId: string; fileName: string; bytes: Uint8Array }, now?: Date): Promise<JobFileView>; // FileReadError, TooManyFilesError, LimitReachedError
export async function runFileAnalysis(jobId: string, fileId: string, userId: string): Promise<void>; // never throws
export async function startReanalysis(jobId: string, fileId: string, userId: string, now?: Date): Promise<JobFileView>; // FileNotFoundError, AlreadyAnalysingError, LimitReachedError
export async function saveAnalysisEdit(jobId: string, fileId: string, userId: string, analysis: string, now?: Date): Promise<JobFileView>; // FileNotFoundError, AlreadyAnalysingError
export async function deleteJobFile(jobId: string, fileId: string, userId: string, now?: Date): Promise<"soft" | "hard">; // FileNotFoundError, AlreadyGeneratingError
export async function purgeUnreferencedFiles(jobId: string): Promise<number>;
export async function loadFileDetail(jobId: string, fileId: string, userId: string): Promise<JobFileDetail | null>;

// src/lib/skills/jobs/skills.ts
export type CleanSuggestion = { name: string; purpose: string; fileIds: string[] };
export function cleanFileIds(ids: readonly string[], activeFileIds: readonly string[]): string[]; // order kept, dedupe, cap fileIdsPerSkill
export function cleanSuggestions(raw: RawSuggestions, ctx: { activeFileIds: string[]; keptNames: string[]; room: number }): CleanSuggestion[];
export function fallbackSuggestion(job: { title: string; description: string }, activeFileIds: string[], taken: string[]): CleanSuggestion;
export async function suggestForJob(jobId: string, userId: string, now?: Date): Promise<JobView>;
export async function loadSkillView(jobId: string, skillId: string, userId: string): Promise<JobSkillView | null>;
export async function addSkill(jobId: string, userId: string, input: { name: string; purpose: string; fileIds?: string[] }): Promise<JobSkillView>;
export async function updateSkill(jobId: string, skillId: string, userId: string, patch: { name?: string; purpose?: string; fileIds?: string[]; order?: number }): Promise<JobSkillView>;
export async function deleteSkill(jobId: string, skillId: string, userId: string): Promise<void>;

// src/lib/skills/assemble.ts (Task 12 trims to)
export function inFolder(folder: string, path: string): string;
export function buildSkillMd(name: string, description: string, compatibility: string, body: string): string;

// src/lib/skills/jobs/assemble.ts
export type PlanInputFile = { id: string; fileName: string; assetName: string; kind: SkillFileKind; size: number; analysis: string | null };
export function planAssets(files: PlanInputFile[]): ShippedFile[]; // ShippedFile from instructions.ts
export function filesSection(plan: ShippedFile[]): string;
export function buildStyleGuide(plan: ShippedFile[]): string | null;
export function assembleJobSkill(name: string, draft: JobSkillDraft, plan: ShippedFile[]): { files: SkillFile[]; assets: VersionAsset[] };
export function validateJobSkill(name: string, files: SkillFile[], assets: VersionAsset[]): string[];

// src/lib/skills/jobs/generate.ts
export const JOB_GENERATION_FAILED_MESSAGE = "The AI couldn't finish writing this skill. Try again.";
export async function startJobSkillGeneration(jobId: string, skillId: string, userId: string, now?: Date): Promise<JobSkillView>;
export async function runJobSkillGeneration(jobId: string, skillId: string, userId: string): Promise<void>; // never throws

// src/lib/skills/zip.ts (Task 14)
export type ZipAsset = { path: string; bytes: Uint8Array };
export type ZipSkill = { name: string; purpose: string; version?: number; files: SkillFile[]; assets?: ZipAsset[] };
export class DuplicateSkillNameError extends Error { skillName: string }
export class PackTooLargeError extends Error {}
export function buildSkillZip(skill: ZipSkill): Uint8Array;
export function packZipSize(skills: ZipSkill[]): number;
export function buildPackZip(input: { slug: string; title: string; description: string; role: string | null; skills: ZipSkill[] }): Uint8Array;
export function zipResponse(bytes: Uint8Array, filename: string): Response;

// src/lib/skills/pack-docs.ts (Task 14)
export function renderReadme(input: { title: string; description: string; role: string | null; skills: { name: string; purpose: string; version?: number }[]; hasAssets: boolean }): string;

// src/lib/skills/jobs/download.ts
export function parseVersionParam(raw: string): number | "latest" | null;
export async function loadVersionDetail(jobId: string, skillId: string, version: number | "latest", userId: string): Promise<VersionDetail | null>;
export async function toZipSkill(detail: VersionDetail, purpose: string, jobId: string): Promise<ZipSkill>; // loads asset bytes one at a time; AssetMissingError
export async function buildVersionZip(jobId: string, skillId: string, version: number | "latest", userId: string, format: "upload" | "pack"): Promise<{ bytes: Uint8Array; filename: string }>;
export async function buildJobPack(jobId: string, userId: string): Promise<{ bytes: Uint8Array; filename: string }>;
```

### Client and UI (Tasks 16–21)

```ts
// src/lib/skills/jobs/client.ts  (all return CallResult<T> from @/lib/prompt-bot/client)
export const jobUrl: (jobId: string) => string; // "/api/v1/prompt-bot/skill-jobs/<id>"
export const createJob: (input: { title?: string; description?: string }) => Promise<CallResult<JobView>>;
export const getJob: (jobId: string) => Promise<CallResult<JobView>>;
export const patchJob: (jobId: string, patch: { title?: string; description?: string }, options?: SaveOptions) => Promise<CallResult<JobView>>;
export const deleteJob: (jobId: string) => Promise<CallResult<{ deleted: true }>>;
export const saveJobAnswer: (jobId: string, questionId: string, patch: { answer?: string; notRelevant?: boolean }, options?: SaveOptions) => Promise<CallResult<{ saved: true }>>;
export const scoreJob: (jobId: string, revision: number) => Promise<CallResult<ScoreReply>>;
export const uploadJobFile: (jobId: string, file: File) => Promise<CallResult<JobFileView>>;
export const getJobFile: (jobId: string, fileId: string) => Promise<CallResult<JobFileDetail>>;
export const saveAnalysis: (jobId: string, fileId: string, analysis: string) => Promise<CallResult<JobFileView>>;
export const analyseAgain: (jobId: string, fileId: string) => Promise<CallResult<JobFileView>>;
export const removeJobFile: (jobId: string, fileId: string) => Promise<CallResult<{ deleted: true }>>;
export const suggestSkills: (jobId: string) => Promise<CallResult<JobView>>;
export const addJobSkill: (jobId: string, input: { name: string; purpose: string; fileIds?: string[] }) => Promise<CallResult<JobSkillView>>;
export const patchJobSkill: (jobId: string, skillId: string, patch: { name?: string; purpose?: string; fileIds?: string[]; order?: number }, options?: SaveOptions) => Promise<CallResult<JobSkillView>>;
export const removeJobSkill: (jobId: string, skillId: string) => Promise<CallResult<{ deleted: true }>>;
export const generateJobSkill: (jobId: string, skillId: string) => Promise<CallResult<JobSkillView>>;
export const getVersion: (jobId: string, skillId: string, version: number | "latest") => Promise<CallResult<VersionDetail>>;
export const versionDownloadUrl: (jobId: string, skillId: string, version: number, format: "upload" | "pack") => string;
export const jobDownloadUrl: (jobId: string) => string;
// downloadZip(url) stays in src/lib/skills/client.ts and is reused.

// components
export function SkillFilesView(props: { files: SkillFile[]; assets?: { path: string; bytes: number; fileName?: string }[] }): JSX.Element; // src/components/prompt-bot/skills/skill-files-view.tsx
export function NewJobForm(props: { draftKey: string }): JSX.Element;               // src/app/(app)/prompt-bot/skills/new-job-form.tsx
export function LegacyPackView(props: { pack: SkillPackView }): JSX.Element;        // src/app/(app)/prompt-bot/skills/legacy/[packId]/legacy-pack-view.tsx
export function JobWorkspace(props: { initial: JobView; aiConfigured: boolean; isAdmin: boolean }): JSX.Element; // …/[jobId]/job-workspace.tsx
// …/[jobId]/job-steps.ts (pure)
export type JobStep = "job" | "files" | "questions" | "skills";
export const JOB_STEPS: { id: JobStep; label: string }[];
export function stepFromHash(hash: string): JobStep; // "#files" -> "files"; unknown -> "job"
export function nextPollDelay(previous: number): number; // 3000 -> 4500 … capped at 15_000
export const POLL_FIRST_MS = 3000; export const POLL_CAP_MS = 11 * 60_000;
export function unansweredCount(questions: { id: string }[], answerFor: (id: string) => AnswerView): number;
export function DescribePanel(props: { jobId: string; description: string; onDescriptionChange(value: string): void }): JSX.Element;
export function FilesPanel(props: { jobId: string; files: JobFileView[]; aiConfigured: boolean; onFileChange(file: JobFileView): void; onFileRemoved(fileId: string): void }): JSX.Element;
export function QuestionsPanel(props: { matrix: SkillMatrixView; state: ReturnType<typeof useMatrixAnswers> }): JSX.Element;
export function SkillsPanel(props: { job: JobView; gaps: number; aiConfigured: boolean; flushSaves(): Promise<void>; onJobChange(job: JobView): void; onSkillChange(skill: JobSkillView): void; onSkillRemoved(skillId: string): void }): JSX.Element;
export function SkillCard(props: { jobId: string; skill: JobSkillView; files: JobFileView[]; gaps: number; aiConfigured: boolean; flushSaves(): Promise<void>; onChange(skill: JobSkillView): void; onRemoved(skillId: string): void }): JSX.Element;
export function VersionPreview(props: { jobId: string; skill: JobSkillView }): JSX.Element;
```

### Amendments recorded while writing the tasks (binding)

- `src/lib/skills/jobs/http.ts` also exports `notFound(what: "Job" | "File" | "Skill" | "Version" | "Question"): Response`.
- `src/lib/skills/jobs/jobs.ts` also exports `skillInclude`, `type FileViewRow`, `type SkillViewRow`, `ensureJobAnswerRows(jobId, questionIds)`; `activeFiles` rows include `assetName` and `analysisStatus`.
- `src/lib/skills/jobs/skills.ts` exports `SKILL_PURPOSE_MAX = 300` (replaces `PURPOSE_MAX` from `split.ts`). `addSkill` without `fileIds` uses every active file. `suggestForJob` throws `TooManySkillsError` (409) before spending a unit when 5 skills already have versions.
- `src/lib/skills/jobs/assemble.ts` also exports `STYLE_GUIDE_PATH` and `SHORTENED_MARKER`; `filesSection` words each line by file kind (the spec's PPTX wording verbatim) and gives over-budget files their own line.
- `src/lib/skills/zip.ts` exports `type SizedSkill = { files: SkillFile[]; assets?: { bytes: Uint8Array | number }[] }`; `packZipSize(skills: SizedSkill[])`, so size and duplicate names are checked before any asset bytes load.
- `src/lib/skills/files/fixtures.ts` also exports `themeXml`, `DEFAULT_DOCX_STYLES`; `buildXlsx` takes `reverseFiles?: boolean`; `FixtureSlide.layout` is a 1-based layout index and `0` writes a slide without rels; colours are six hex digits without `#`; `padBytes` adds a stored, incompressible `ppt/media/pad.bin`. Task 3 writes `pdf.ts` with `isEncryptedPdf` only; Task 7 adds `extractPdf`. The `A4` aspect is PowerPoint's "A4 Paper" slide preset (10.83 × 7.5 in).
- `src/lib/skills/files/e2e-fixtures.ts` (Task 22) exports `WrittenFixture`, `VALID_FIXTURES`, `LOCKED_FIXTURE`, `writeSkillFixtures(outDir, options?: { bigDeckBytes?: number })`.
- UI: `QuestionsPanel` owns `useActiveQuestion`; `DescribePanel` only edits text and the workspace performs `state.queueSave("description", …)` with `patchJob`; `job-steps.ts` also exports `POLL_MAX_MS`, `pollKey(job)`, `mergePolled(local, fresh)`; `file-tree.tsx` exports `FileTreeEntry`, `formatBytes`; `files-panel.tsx` exports `FILE_ACCEPT`; `skill-card.tsx` exports `unansweredPhrase(gaps)`. Delete job is a labelled icon button in the header (not an overflow menu). Task 18 creates stub panels with the final props that Tasks 19–21 replace.
- Legacy (Task 15): `packs.ts` drops the `now` parameter (only READY items are shown); `format.ts` loses `withSkillName` and `withinStorageLimits`; `src/lib/skills/http.ts` and `src/lib/skills/instructions.ts` are deleted.

---

## Batch 1 — Data and parsers (Tasks 0–7)

Everything in this batch is pure or schema-only: no route, AI call or UI changes. All commands run from `cd "/Users/tharunkumarl/Full Stack/lms/apps/web"` unless shown otherwise.

---

### Task 0: Workspace baseline

**Files:** none (environment only).

**Interfaces:**
- Consumes: nothing.
- Produces: the branch `feat/skills-builder-jobs` and a recorded green baseline.

- [ ] **Step 1: Create the branch from an up-to-date `main`**

```bash
cd "/Users/tharunkumarl/Full Stack/lms"
git status --short
git switch main
git pull --ff-only
git switch -c feat/skills-builder-jobs
npm ci
```
Expected: before switching, `git status --short` shows only files that are not yours to touch (at planning time: untracked `.superpowers/`, `docs/superpowers/specs/2026-07-30-login-bookkeeping-error-fix.md`, and this plan's spec `docs/superpowers/specs/2026-11-25-skills-builder-jobs-design.md` plus this plan). Leave the first two untracked and never `git add` them. If `git switch main` refuses because of local changes to tracked files, stop and ask. `npm ci` finishes without errors.

- [ ] **Step 2: Record the baseline**

```bash
cd "/Users/tharunkumarl/Full Stack/lms/apps/web"
npx prisma migrate status
npx vitest run
npx tsc --noEmit
npx eslint src/
```
Expected: migrations up to date through `20261125090000_prompt_bot_core_seven`; the suite, the type check and lint pass. If anything fails on the untouched branch, stop and report it before changing code.

- [ ] **Step 3: Commit the spec and plan**

```bash
cd "/Users/tharunkumarl/Full Stack/lms"
git add docs/superpowers/specs/2026-11-25-skills-builder-jobs-design.md docs/superpowers/plans/2026-11-25-skills-builder-jobs.md
git commit -m "docs(skills-builder): add the jobs redesign spec and plan"
```

---

### Task 1: Job limits, the `skill_analyze` feature and a bounded byte reader

**Files:**
- Modify: `apps/web/src/lib/skills/limits.ts` (append after line 30)
- Modify: `apps/web/src/lib/ai/usage.ts:3-5`
- Modify: `apps/web/src/lib/ai/usage.test.ts` (add one test)
- Modify: `apps/web/src/lib/api/body.ts` (whole file)
- Test: `apps/web/src/lib/skills/limits.test.ts` (create), `apps/web/src/lib/api/body.test.ts` (create; `readJsonWithin` had no direct test)

**Interfaces:**
- Consumes: `SKILL_LIMITS` from `src/lib/skills/limits.ts`.
- Produces:
  - `JOB_LIMITS` (exact values in the Interface Contract), `ANALYSIS_TIMEOUT_MS = 90_000`, `ANALYSIS_STALE_MS = 5 * 60_000`, `SUGGEST_TIMEOUT_MS = 100_000`
  - `type AiFeature = "score" | "enhance" | "skill_split" | "skill_generate" | "skill_analyze"`, `DEFAULT_LIMITS.skill_analyze = 40`
  - `type BoundedBytes = { ok: true; bytes: Uint8Array } | { ok: false; reason: "too_large" | "aborted" }`
  - `readBytesWithin(req: Request, maxBytes: number): Promise<BoundedBytes>`
  - `readJsonWithin(req: Request, maxBytes: number): Promise<BoundedJson>` (unchanged contract)

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/src/lib/skills/limits.test.ts
import { describe, expect, it } from "vitest";
import { ANALYSIS_STALE_MS, ANALYSIS_TIMEOUT_MS, JOB_LIMITS, SKILL_LIMITS, SUGGEST_TIMEOUT_MS } from "./limits";

describe("job limits", () => {
  it("carries the spec's values", () => {
    expect(JOB_LIMITS.fileBytes).toBe(20 * 1024 * 1024);
    expect(JOB_LIMITS.filesPerJob).toBe(10);
    expect(JOB_LIMITS.assetBytes).toBe(10 * 1024 * 1024);
    expect(JOB_LIMITS.skillAssetBytes).toBe(25 * 1024 * 1024);
    expect(JOB_LIMITS.skillsPerJob).toBe(5);
    expect(JOB_LIMITS.analysisChars).toBe(12_000);
    expect(JOB_LIMITS.factsBytes).toBe(64 * 1024);
    expect(JOB_LIMITS.versionsKept).toBe(20);
    expect(JOB_LIMITS.packZipBytes).toBe(100 * 1024 * 1024);
  });

  it("fits a 20 MB upload under Claude's 32 MB request cap after base64", () => {
    expect(Math.ceil((JOB_LIMITS.fileBytes * 4) / 3)).toBeLessThan(32 * 1024 * 1024);
  });

  it("keeps every analysis of a full job inside one style-guide file", () => {
    expect(JOB_LIMITS.analysisChars * JOB_LIMITS.filesPerJob).toBeLessThan(SKILL_LIMITS.fileBytes);
  });

  it("keeps request-bound calls under App Runner's 120 s and stale windows above two attempts", () => {
    expect(SUGGEST_TIMEOUT_MS).toBeLessThan(120_000);
    expect(ANALYSIS_STALE_MS).toBeGreaterThan(2 * ANALYSIS_TIMEOUT_MS);
  });
});
```

```ts
// apps/web/src/lib/api/body.test.ts
import { describe, expect, it, vi } from "vitest";
import { readBytesWithin, readJsonWithin } from "./body";

const streamOf = (chunks: Uint8Array[], failAfter?: number) => {
  let i = 0;
  const cancel = vi.fn();
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (failAfter !== undefined && i === failAfter) return controller.error(new Error("connection reset"));
      if (i < chunks.length) controller.enqueue(chunks[i++]);
      else controller.close();
    },
    cancel,
  });
  return { stream, cancel };
};
const post = (body: BodyInit | ReadableStream<Uint8Array> | null, headers: Record<string, string> = {}) =>
  new Request("http://localhost/x", { method: "POST", body, headers, duplex: "half" } as RequestInit);
const bytes = (n: number, fill = 1) => new Uint8Array(n).fill(fill);

describe("readBytesWithin", () => {
  it("refuses a declared content-length over the cap without reading the body", async () => {
    const { stream } = streamOf([bytes(10)]);
    const req = post(stream, { "content-length": "11" });
    const read = vi.spyOn(req.body!, "getReader");
    expect(await readBytesWithin(req, 10)).toEqual({ ok: false, reason: "too_large" });
    expect(read).not.toHaveBeenCalled();
  });

  it("cancels a streamed body as soon as it goes over the cap", async () => {
    const { stream, cancel } = streamOf([bytes(6), bytes(6), bytes(6)]);
    expect(await readBytesWithin(post(stream), 10)).toEqual({ ok: false, reason: "too_large" });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("returns exactly the bytes sent when they fit the cap", async () => {
    const { stream } = streamOf([bytes(4, 7), bytes(6, 9)]);
    const result = await readBytesWithin(post(stream), 10);
    expect(result.ok).toBe(true);
    if (result.ok) expect([...result.bytes]).toEqual([7, 7, 7, 7, 9, 9, 9, 9, 9, 9]);
  });

  it("reports a body that breaks off part-way as aborted (nothing may be stored)", async () => {
    const { stream } = streamOf([bytes(4), bytes(4)], 1);
    expect(await readBytesWithin(post(stream), 100)).toEqual({ ok: false, reason: "aborted" });
  });

  it("reads a missing body as zero bytes", async () => {
    const result = await readBytesWithin(new Request("http://localhost/x", { method: "POST" }), 10);
    expect(result).toEqual({ ok: true, bytes: new Uint8Array(0) });
  });
});

describe("readJsonWithin", () => {
  it("parses JSON within the cap", async () => {
    expect(await readJsonWithin(post(JSON.stringify({ a: 1 })), 100)).toEqual({ ok: true, value: { a: 1 } });
  });

  it("refuses JSON over the cap", async () => {
    expect(await readJsonWithin(post(JSON.stringify({ a: "x".repeat(200) })), 100)).toEqual({ ok: false, reason: "too_large" });
  });

  it("reads invalid or broken-off JSON as an empty object", async () => {
    expect(await readJsonWithin(post("{not json"), 100)).toEqual({ ok: true, value: {} });
    const { stream } = streamOf([new TextEncoder().encode('{"a":')], 1);
    expect(await readJsonWithin(post(stream), 100)).toEqual({ ok: true, value: {} });
  });
});
```

In `apps/web/src/lib/ai/usage.test.ts`, add this test directly above `it("merges stored limits over defaults and rejects junk", …)`:

```ts
  it("meters file analysis with its own daily default", () => {
    expect(DEFAULT_LIMITS.skill_analyze).toBe(40);
    expect(normalizeLimits({ skill_analyze: 5 }).skill_analyze).toBe(5);
  });
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/lib/skills/limits.test.ts src/lib/api/body.test.ts src/lib/ai/usage.test.ts`
Expected: FAIL — `limits.test.ts`: "Cannot read properties of undefined (reading 'fileBytes')"; `body.test.ts`: "readBytesWithin is not a function"; `usage.test.ts`: "expected undefined to be 40".

- [ ] **Step 3: Implement**

Append to `apps/web/src/lib/skills/limits.ts`:

```ts
/** Jobs redesign (spec 2026-11-25, Limits). Pure constants: safe for client components. */
export const JOB_LIMITS = {
  titleChars: 120,
  descriptionChars: 20_000,
  filesPerJob: 10,
  fileBytes: 20 * 1024 * 1024,
  assetBytes: 10 * 1024 * 1024,
  skillAssetBytes: 25 * 1024 * 1024,
  skillsPerJob: 5,
  fileIdsPerSkill: 10,
  analysisChars: 12_000,
  analysisExcerptChars: 1_500,
  scoringBaseChars: 12_000,
  factsBytes: 64 * 1024,
  ooxmlPartBytes: 16 * 1024 * 1024,
  ooxmlTotalBytes: 64 * 1024 * 1024,
  ooxmlPartsParsed: 300,
  slidesDetailed: 60,
  pdfPagesForAnalysis: 100,
  imageEdgePx: 1568,
  versionsKept: 20,
  packZipBytes: 100 * 1024 * 1024,
} as const;

/** One file analysis call (run in after()); the SDK retries it once. */
export const ANALYSIS_TIMEOUT_MS = 90_000;
/** A PENDING analysis older than this was interrupted and may be started again: 2 x 90 s plus writes fit inside it. */
export const ANALYSIS_STALE_MS = 5 * 60_000;
/** Suggest runs inside the request (App Runner cuts requests at 120 s): one attempt. */
export const SUGGEST_TIMEOUT_MS = 100_000;
```

In `apps/web/src/lib/ai/usage.ts`, replace lines 3–5 with:

```ts
export type AiFeature = "score" | "enhance" | "skill_split" | "skill_generate" | "skill_analyze";
export const AI_FEATURES: AiFeature[] = ["score", "enhance", "skill_split", "skill_generate", "skill_analyze"];
export const DEFAULT_LIMITS: Record<AiFeature, number> = { score: 300, enhance: 30, skill_split: 10, skill_generate: 20, skill_analyze: 40 };
```

(No migration: `normalizeLimits` falls back to the default for a key the stored `ai_settings.limits` lacks, and the admin `PATCH /api/v1/prompt-bot/settings` accepts the new key because it iterates `AI_FEATURES`.)

Replace the whole of `apps/web/src/lib/api/body.ts` with:

```ts
/** Request bodies read with a byte cap, so an oversized request is refused before it is buffered and parsed. */
export type BoundedBytes = { ok: true; bytes: Uint8Array } | { ok: false; reason: "too_large" | "aborted" };
export type BoundedJson = { ok: true; value: unknown } | { ok: false; reason: "too_large" };

/**
 * Rejects a declared content-length over `maxBytes` without reading, otherwise streams at most `maxBytes`
 * and cancels the stream as soon as it goes over. A stream that errors part-way (the client went away)
 * is "aborted": the caller must not store anything from it.
 */
export async function readBytesWithin(req: Request, maxBytes: number): Promise<BoundedBytes> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, reason: "too_large" };
  if (!req.body) return { ok: true, bytes: new Uint8Array(0) };
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: "too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: "aborted" };
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, bytes };
}

/**
 * A JSON body within `maxBytes`. A body that is not JSON, or that broke off part-way, reads as `{}`,
 * like `req.json().catch(() => ({}))`, so schema validation reports it.
 */
export async function readJsonWithin(req: Request, maxBytes: number): Promise<BoundedJson> {
  const body = await readBytesWithin(req, maxBytes);
  if (!body.ok) return body.reason === "too_large" ? { ok: false, reason: "too_large" } : { ok: true, value: {} };
  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(body.bytes)) };
  } catch {
    return { ok: true, value: {} };
  }
}
```

- [ ] **Step 4: Run the tests and the existing callers**

Run: `npx vitest run src/lib/skills/limits.test.ts src/lib/api/body.test.ts src/lib/ai/usage.test.ts src/app/api/v1/prompt-bot`
Expected: PASS (the legacy files route still uses `readJsonWithin` with its old behaviour).

- [ ] **Step 5: Commit**

```bash
git add src/lib/skills/limits.ts src/lib/skills/limits.test.ts src/lib/ai/usage.ts src/lib/ai/usage.test.ts src/lib/api/body.ts src/lib/api/body.test.ts
git commit -m "feat(skills-builder): add job limits, the skill_analyze feature and a bounded byte reader"
```

---

### Task 2: Schema and additive migration

**Files:**
- Modify: `apps/web/prisma/schema.prisma` (User relations at line 120; `PromptMatrixQuestion` at line 718; `SkillPackItem.catalogEntryId` at line 822; `SkillCatalogEntry` at line 854; new section after the `SkillCatalogEntry` model, before the "11. Workshop registration" banner)
- Create: `apps/web/prisma/migrations/20261125120000_add_skill_jobs/migration.sql`
- Test: `apps/web/src/lib/skills/jobs/migration.test.ts`

**Interfaces:**
- Consumes: the existing `User`, `PromptMatrixQuestion` and `SkillItemStatus` (reused for skill status).
- Produces: Prisma models `SkillJob`, `SkillJobAnswer`, `SkillJobFile`, `SkillJobSkill`, `SkillVersion`; enums `SkillJobFileKind`, `SkillAnalysisStatus`; relations `User.skillJobs`, `PromptMatrixQuestion.skillJobAnswers`; compound unique keys used by later tasks: `jobId_questionId`, `jobId_assetName`, `jobId_name`, `skillId_version`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/skills/jobs/migration.test.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const WEB = path.join(__dirname, "../../../..");
const SQL = readFileSync(path.join(WEB, "prisma/migrations/20261125120000_add_skill_jobs/migration.sql"), "utf8");
const SCHEMA = readFileSync(path.join(WEB, "prisma/schema.prisma"), "utf8");
const NEW_TABLES = ["skill_jobs", "skill_job_answers", "skill_job_files", "skill_job_skills", "skill_versions"];

describe("skill jobs migration", () => {
  it("creates the five job tables and both enums", () => {
    for (const table of NEW_TABLES) expect(SQL).toContain(`CREATE TABLE "${table}"`);
    expect(SQL).toContain(`CREATE TYPE "SkillJobFileKind" AS ENUM ('PPTX', 'DOCX', 'XLSX', 'PDF', 'PNG', 'JPEG');`);
    expect(SQL).toContain(`CREATE TYPE "SkillAnalysisStatus" AS ENUM ('PENDING', 'READY', 'FAILED');`);
  });

  it("stores upload bytes and reuses the skill status enum", () => {
    expect(SQL).toContain('"data" BYTEA NOT NULL');
    expect(SQL).toContain(`"status" "SkillItemStatus" NOT NULL DEFAULT 'DRAFT'`);
  });

  it("enforces unique skill names, asset names, versions and answers", () => {
    for (const index of [
      'CREATE UNIQUE INDEX "skill_job_skills_job_id_name_key" ON "skill_job_skills"("job_id", "name");',
      'CREATE UNIQUE INDEX "skill_job_files_job_id_asset_name_key" ON "skill_job_files"("job_id", "asset_name");',
      'CREATE UNIQUE INDEX "skill_versions_skill_id_version_key" ON "skill_versions"("skill_id", "version");',
      'CREATE UNIQUE INDEX "skill_job_answers_job_id_question_id_key" ON "skill_job_answers"("job_id", "question_id");',
    ]) {
      expect(SQL).toContain(index);
    }
  });

  it("cascades every new foreign key, so deleting a user or job leaves nothing behind", () => {
    const keys = SQL.match(/ADD CONSTRAINT "[a-z_]+_fkey" FOREIGN KEY[^;]+;/g) ?? [];
    expect(keys).toHaveLength(6);
    for (const key of keys) expect(key).toContain("ON DELETE CASCADE");
  });

  it("only adds: nothing is dropped and only the new tables are altered", () => {
    expect(SQL).not.toMatch(/\bDROP\b/i);
    expect(SQL).not.toMatch(/ALTER COLUMN|RENAME/i);
    for (const [, table] of SQL.matchAll(/ALTER TABLE "([a-z_]+)"/g)) expect(NEW_TABLES).toContain(table);
  });

  it("keeps the catalog in the schema, marked deprecated, so no later diff drops it", () => {
    expect(SCHEMA).toMatch(/\/\/\/ Deprecated 2026-11-25[^\n]*\nmodel SkillCatalogEntry \{/);
    expect(SCHEMA).toMatch(/\/\/\/ Deprecated 2026-11-25[^\n]*\n\s+catalogEntryId\s+String\?/);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/skills/jobs/migration.test.ts`
Expected: FAIL with "ENOENT: no such file or directory, open '…/prisma/migrations/20261125120000_add_skill_jobs/migration.sql'".

- [ ] **Step 3: Edit the schema by hand**

Make exactly these edits (do **not** run `prisma format`: it realigns unrelated models and bloats the diff).

In `model User`, after the line `  skillCatalogEntries SkillCatalogEntry[] @relation("SkillCatalogCreator")`, add:

```prisma
  skillJobs          SkillJob[]          @relation("SkillJobOwner")
```

In `model PromptMatrixQuestion`, after `  skillAnswers SkillItemAnswer[]`, add:

```prisma
  skillJobAnswers SkillJobAnswer[]
```

In `model SkillPackItem`, directly above `  catalogEntryId      String?            @map("catalog_entry_id")`, add:

```prisma
  /// Deprecated 2026-11-25: unused since the Jobs redesign; kept so no data is dropped.
```

Directly above `model SkillCatalogEntry {`, add:

```prisma
/// Deprecated 2026-11-25: unused since the Jobs redesign; kept so no data is dropped.
```

After the closing `}` of `model SkillCatalogEntry` (before the `// 11. Workshop registration` banner), add:

```prisma
// ============================================================================
// Prompt Bot — Skills Builder jobs (2026-11-25 redesign)
// ============================================================================

enum SkillJobFileKind {
  PPTX
  DOCX
  XLSX
  PDF
  PNG
  JPEG
}

enum SkillAnalysisStatus {
  PENDING
  READY
  FAILED
}

model SkillJob {
  id            String           @id @default(cuid())
  userId        String           @map("user_id")
  title         String           @default("Untitled job")
  description   String           @default("")
  scoreRevision Int              @default(0) @map("score_revision")
  suggestedAt   DateTime?        @map("suggested_at")
  createdAt     DateTime         @default(now()) @map("created_at")
  updatedAt     DateTime         @updatedAt @map("updated_at")
  user          User             @relation("SkillJobOwner", fields: [userId], references: [id], onDelete: Cascade)
  answers       SkillJobAnswer[]
  files         SkillJobFile[]
  skills        SkillJobSkill[]

  @@index([userId, updatedAt])
  @@map("skill_jobs")
}

model SkillJobAnswer {
  id          String               @id @default(cuid())
  jobId       String               @map("job_id")
  questionId  String               @map("question_id")
  answer      String               @default("")
  score       Int                  @default(0)
  reason      String?
  notRelevant Boolean              @default(false) @map("not_relevant")
  scoredAt    DateTime?            @map("scored_at")
  job         SkillJob             @relation(fields: [jobId], references: [id], onDelete: Cascade)
  question    PromptMatrixQuestion @relation(fields: [questionId], references: [id], onDelete: Cascade)

  @@unique([jobId, questionId])
  @@map("skill_job_answers")
}

model SkillJobFile {
  id                String              @id @default(cuid())
  jobId             String              @map("job_id")
  /// As uploaded, for display only.
  fileName          String              @map("file_name")
  /// Server-made safe name: the file's name under assets/.
  assetName         String              @map("asset_name")
  kind              SkillJobFileKind
  /// Canonical for the kind, never the browser's claim.
  mimeType          String              @map("mime_type")
  size              Int
  sha256            String
  data              Bytes
  /// Deterministic extraction (FileFacts).
  facts             Json?
  /// Readable style guide: the AI's, or the user's edit.
  analysis          String?
  analysisStatus    SkillAnalysisStatus @default(PENDING) @map("analysis_status")
  analysisStartedAt DateTime?           @map("analysis_started_at")
  analysisEdited    Boolean             @default(false) @map("analysis_edited")
  analysisError     String?             @map("analysis_error")
  /// Removed from the job but kept while an older version bundles it.
  deletedAt         DateTime?           @map("deleted_at")
  createdAt         DateTime            @default(now()) @map("created_at")
  updatedAt         DateTime            @updatedAt @map("updated_at")
  job               SkillJob            @relation(fields: [jobId], references: [id], onDelete: Cascade)

  @@unique([jobId, assetName])
  @@index([jobId, createdAt])
  @@map("skill_job_files")
}

model SkillJobSkill {
  id                  String          @id @default(cuid())
  jobId               String          @map("job_id")
  order               Int
  /// Kebab-case; owns the folder of the next version.
  name                String
  purpose             String
  fileIds             String[]        @default([]) @map("file_ids")
  status              SkillItemStatus @default(DRAFT)
  validationErrors    String[]        @default([]) @map("validation_errors")
  generationStartedAt DateTime?       @map("generation_started_at")
  latestVersion       Int             @default(0) @map("latest_version")
  createdAt           DateTime        @default(now()) @map("created_at")
  updatedAt           DateTime        @updatedAt @map("updated_at")
  job                 SkillJob        @relation(fields: [jobId], references: [id], onDelete: Cascade)
  versions            SkillVersion[]

  @@unique([jobId, name])
  @@index([jobId, order])
  @@map("skill_job_skills")
}

/// Immutable: nothing updates a version row.
model SkillVersion {
  id           String        @id @default(cuid())
  skillId      String        @map("skill_id")
  version      Int
  /// The folder and SKILL.md name of this version.
  name         String
  description  String
  /// Text files: [{ path, content }].
  files        Json
  /// Bundled originals: [{ fileId, path, fileName, bytes }].
  assets       Json
  /// The same ids as `assets`, for indexed lookups.
  assetFileIds String[]      @default([]) @map("asset_file_ids")
  createdAt    DateTime      @default(now()) @map("created_at")
  skill        SkillJobSkill @relation(fields: [skillId], references: [id], onDelete: Cascade)

  @@unique([skillId, version])
  @@map("skill_versions")
}
```

- [ ] **Step 4: Generate the migration from the schema at `HEAD`**

```bash
cd "/Users/tharunkumarl/Full Stack/lms/apps/web"
mkdir -p prisma/migrations/20261125120000_add_skill_jobs
git show HEAD:apps/web/prisma/schema.prisma > "$TMPDIR/schema-head.prisma"
npx prisma migrate diff \
  --from-schema-datamodel "$TMPDIR/schema-head.prisma" \
  --to-schema-datamodel prisma/schema.prisma \
  --script > prisma/migrations/20261125120000_add_skill_jobs/migration.sql
```

Expected `migration.sql` (verified against `prisma migrate diff` at planning time; the file must match this exactly — if it contains anything else, such as a `DROP` or an `ALTER` of an existing table, the schema edit is wrong: fix the schema and regenerate):

```sql
-- CreateEnum
CREATE TYPE "SkillJobFileKind" AS ENUM ('PPTX', 'DOCX', 'XLSX', 'PDF', 'PNG', 'JPEG');

-- CreateEnum
CREATE TYPE "SkillAnalysisStatus" AS ENUM ('PENDING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "skill_jobs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Untitled job',
    "description" TEXT NOT NULL DEFAULT '',
    "score_revision" INTEGER NOT NULL DEFAULT 0,
    "suggested_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skill_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_job_answers" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "answer" TEXT NOT NULL DEFAULT '',
    "score" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT,
    "not_relevant" BOOLEAN NOT NULL DEFAULT false,
    "scored_at" TIMESTAMP(3),

    CONSTRAINT "skill_job_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_job_files" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "asset_name" TEXT NOT NULL,
    "kind" "SkillJobFileKind" NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "facts" JSONB,
    "analysis" TEXT,
    "analysis_status" "SkillAnalysisStatus" NOT NULL DEFAULT 'PENDING',
    "analysis_started_at" TIMESTAMP(3),
    "analysis_edited" BOOLEAN NOT NULL DEFAULT false,
    "analysis_error" TEXT,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skill_job_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_job_skills" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "file_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "SkillItemStatus" NOT NULL DEFAULT 'DRAFT',
    "validation_errors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "generation_started_at" TIMESTAMP(3),
    "latest_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skill_job_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_versions" (
    "id" TEXT NOT NULL,
    "skill_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "files" JSONB NOT NULL,
    "assets" JSONB NOT NULL,
    "asset_file_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "skill_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "skill_jobs_user_id_updated_at_idx" ON "skill_jobs"("user_id", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "skill_job_answers_job_id_question_id_key" ON "skill_job_answers"("job_id", "question_id");

-- CreateIndex
CREATE INDEX "skill_job_files_job_id_created_at_idx" ON "skill_job_files"("job_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "skill_job_files_job_id_asset_name_key" ON "skill_job_files"("job_id", "asset_name");

-- CreateIndex
CREATE INDEX "skill_job_skills_job_id_order_idx" ON "skill_job_skills"("job_id", "order");

-- CreateIndex
CREATE UNIQUE INDEX "skill_job_skills_job_id_name_key" ON "skill_job_skills"("job_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "skill_versions_skill_id_version_key" ON "skill_versions"("skill_id", "version");

-- AddForeignKey
ALTER TABLE "skill_jobs" ADD CONSTRAINT "skill_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_job_answers" ADD CONSTRAINT "skill_job_answers_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "skill_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_job_answers" ADD CONSTRAINT "skill_job_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "prompt_matrix_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_job_files" ADD CONSTRAINT "skill_job_files_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "skill_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_job_skills" ADD CONSTRAINT "skill_job_skills_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "skill_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_versions" ADD CONSTRAINT "skill_versions_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skill_job_skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 5: Generate the client, apply, and run the test**

```bash
npx prisma generate
npx prisma migrate deploy
npx prisma migrate status
npx vitest run src/lib/skills/jobs/migration.test.ts
npx tsc --noEmit
```
Expected: `migrate deploy` applies `20261125120000_add_skill_jobs`; status "Database schema is up to date"; the test passes; no type errors.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20261125120000_add_skill_jobs/migration.sql src/lib/skills/jobs/migration.test.ts
git commit -m "feat(skills-builder): add the skill jobs schema and additive migration"
```

---

### Task 3: File types, XML scanner, OOXML reader, sniffing and fixtures

**Files:**
- Create: `apps/web/src/lib/skills/files/types.ts`, `xml.ts`, `ooxml.ts`, `pdf.ts` (encryption check only; Task 7 extends it), `sniff.ts`, `fixtures.ts`
- Test: `apps/web/src/lib/skills/files/xml.test.ts`, `ooxml.test.ts`, `sniff.test.ts`

**Interfaces:**
- Consumes: `JOB_LIMITS.ooxmlPartBytes`, `JOB_LIMITS.ooxmlTotalBytes` (Task 1).
- Produces (exact, from the Interface Contract):
  - everything in `src/lib/skills/files/types.ts` (verbatim from the contract): `SkillFileKind`, `THEME_SLOTS`, `ThemeSlot`, `ThemeFacts`, `ColorUse`, `SlideFacts`, `PptxFacts`, `DocxStyle`, `DocxFacts`, `SheetFacts`, `XlsxFacts`, `PdfFacts`, `ImageFacts`, `FileFacts`, `KIND_MIME`, `KIND_EXTENSION`, `KIND_LABEL`, `FileReadErrorCode`, `FILE_READ_MESSAGES`, `FileReadError` (`.code`, `.status: 415 | 422`)
  - `xml.ts`: `XmlElement`, `decodeXml`, `elements`, `first`, `attr` (exact name first, then any prefix), `textOf`, `collapse`
  - `ooxml.ts`: `EMU_PER_INCH`, `OoxmlPackage`, `openOoxml`, `relTargets`, `relsPathFor`, `partNumber`, `toHex`, `colorOf`, `readTheme`, `topColors`
  - `pdf.ts`: `isEncryptedPdf(bytes: Uint8Array): boolean`
  - `sniff.ts`: `Sniffed`, `sniffFile(bytes: Uint8Array): Sniffed`
  - `fixtures.ts` (test-only): `zip`, `themeXml`, `buildPptx`, `buildDocx`, `DEFAULT_DOCX_STYLES`, `buildXlsx`, `tinyPdf`, `tinyPng`, `tinyJpeg`, `oleHeader`, `sha256Hex`, and the `FixtureTheme`, `FixtureSlide`, `FixtureStyle`, `FixtureCell` types. Two additive options beyond the contract: `FixtureSlide.layout: 0` writes a slide with no rels part, and `buildXlsx({ reverseFiles: true })` stores sheet *i* as `sheet(n − i).xml` so tests can prove rels are followed; `themeXml` and `DEFAULT_DOCX_STYLES` are exported for tests.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/src/lib/skills/files/xml.test.ts
import { describe, expect, it } from "vitest";
import { attr, collapse, decodeXml, elements, first, textOf } from "./xml";

describe("xml scanner", () => {
  it("matches elements by local name whatever their prefix, open or self-closing", () => {
    const xml = '<p:sp><a:t>One</a:t></p:sp><t>Two</t><a:t/><a:tbl><a:tblPr/></a:tbl>';
    expect(elements(xml, "t").map((e) => [e.name, e.inner])).toEqual([
      ["a:t", "One"],
      ["t", "Two"],
      ["a:t", ""],
    ]);
    expect(elements(xml, "tbl")).toHaveLength(1);
    expect(elements(xml, "tblPr")).toHaveLength(1);
  });

  it("parses attributes with either quote and decodes entities in them", () => {
    const el = first(`<w:style w:type="paragraph" w:styleId='Q&amp;A' name="&quot;x&quot; &#65;&#x42;"/>`, "style");
    expect(el?.attrs).toEqual({ "w:type": "paragraph", "w:styleId": "Q&A", name: '"x" AB' });
    expect(attr(el, "styleId")).toBe("Q&A");
    expect(attr(el, "w:type")).toBe("paragraph");
    expect(attr(el, "missing")).toBeNull();
    expect(attr(null, "x")).toBeNull();
  });

  it("prefers the exact attribute name, so r:id and id stay distinct", () => {
    const el = first('<p:sldId id="256" r:id="rId2"/>', "sldId");
    expect(attr(el, "id")).toBe("256");
    expect(attr(el, "r:id")).toBe("rId2");
  });

  it("keeps the inner XML of nested different tags", () => {
    const el = first('<p:sp><p:nvSpPr><p:ph type="title"/></p:nvSpPr><p:txBody><a:p><a:t>Hi</a:t></a:p></p:txBody></p:sp>', "sp");
    expect(attr(first(el!.inner, "ph"), "type")).toBe("title");
    expect(textOf(el!.inner)).toBe("Hi");
  });

  it("decodes the predefined and numeric entities only", () => {
    expect(decodeXml("a &lt;b&gt; &amp; &apos;c&apos; &#233; &#x1F600; &unknown;")).toBe("a <b> & 'c' é 😀 &unknown;");
  });

  it("joins text runs and collapses whitespace", () => {
    expect(textOf("<w:r><w:t>Hel</w:t></w:r><w:r><w:t>lo &amp; bye</w:t></w:r>")).toBe("Hello & bye");
    expect(collapse("  a \n\t b  ", 3)).toBe("a b");
  });
});
```

```ts
// apps/web/src/lib/skills/files/ooxml.test.ts
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { buildPptx, themeXml, zip } from "./fixtures";
import { colorOf, openOoxml, partNumber, readTheme, relsPathFor, relTargets, toHex, topColors } from "./ooxml";
import { FileReadError } from "./types";
import { first } from "./xml";

describe("openOoxml", () => {
  it("reads XML and rels parts, lists every entry, and never inflates media", () => {
    const pkg = openOoxml(buildPptx({ padBytes: 1024 }));
    expect(pkg.names).toContain("ppt/media/pad.bin");
    expect(pkg.parts.has("ppt/media/pad.bin")).toBe(false);
    expect(pkg.parts.get("ppt/presentation.xml")).toContain("<p:sldSz");
    expect(pkg.parts.has("ppt/_rels/presentation.xml.rels")).toBe(true);
    expect(pkg.truncated).toBe(false);
  });

  it("skips a part whose declared size is over 16 MB and marks the package truncated", () => {
    const bytes = zipSync({
      "ppt/presentation.xml": strToU8("<p:presentation/>"),
      "ppt/slides/slide1.xml": new Uint8Array(17 * 1024 * 1024),
    });
    const pkg = openOoxml(bytes);
    expect(pkg.names).toContain("ppt/slides/slide1.xml");
    expect(pkg.parts.has("ppt/slides/slide1.xml")).toBe(false);
    expect(pkg.parts.has("ppt/presentation.xml")).toBe(true);
    expect(pkg.truncated).toBe(true);
  });

  it("refuses bytes that are not a readable zip", () => {
    const corrupt = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...new Array(60).fill(7)]);
    const error = (() => {
      try {
        openOoxml(corrupt);
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(FileReadError);
    expect((error as FileReadError).code).toBe("FILE_UNREADABLE");
    expect((error as FileReadError).status).toBe(422);
  });

  it("skips customXml parts", () => {
    const pkg = openOoxml(zip({ "customXml/item1.xml": "<x/>", "word/document.xml": "<w:document/>" }));
    expect([...pkg.parts.keys()]).toEqual(["word/document.xml"]);
  });
});

describe("relationships", () => {
  const xml =
    '<Relationships><Relationship Id="rId1" Target="../slideLayouts/slideLayout2.xml"/><Relationship Id="rId2" Target="/ppt/media/a.png"/><Relationship Id="rId3" Target="https://x.test" TargetMode="External"/><Relationship Id="rId4" Target="./notes/n1.xml"/></Relationships>';

  it("resolves relative, ../ and absolute targets against the owning part, and drops external ones", () => {
    const map = relTargets(xml, "ppt/slides/slide1.xml");
    expect(map.get("rId1")).toBe("ppt/slideLayouts/slideLayout2.xml");
    expect(map.get("rId2")).toBe("ppt/media/a.png");
    expect(map.has("rId3")).toBe(false);
    expect(map.get("rId4")).toBe("ppt/slides/notes/n1.xml");
    expect(relTargets(undefined, "x.xml").size).toBe(0);
  });

  it("finds a part's rels path and number", () => {
    expect(relsPathFor("ppt/slides/slide12.xml")).toBe("ppt/slides/_rels/slide12.xml.rels");
    expect(partNumber("ppt/slides/slide12.xml")).toBe(12);
    expect(partNumber("ppt/presentation.xml")).toBe(0);
  });
});

describe("colours and themes", () => {
  it("normalises hex and reads srgbClr or sysClr lastClr", () => {
    expect(toHex("1f4e79")).toBe("#1F4E79");
    expect(toHex("auto")).toBeNull();
    expect(toHex(null)).toBeNull();
    expect(colorOf(first('<a:dk1><a:srgbClr val="112233"/></a:dk1>', "dk1"))).toBe("#112233");
    expect(colorOf(first('<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>', "dk1"))).toBe("#000000");
    expect(colorOf(null)).toBeNull();
  });

  it("reads all twelve slots, the name and the major and minor fonts", () => {
    const theme = readTheme(themeXml({ name: "Acme", colors: { accent1: "1F4E79" }, sysDk1: true, majorFont: "Georgia", minorFont: "Inter" }));
    expect(theme?.name).toBe("Acme");
    expect(theme?.colors.map((c) => c.slot)).toEqual(["dk1", "lt1", "dk2", "lt2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6", "hlink", "folHlink"]);
    expect(theme?.colors.find((c) => c.slot === "accent1")?.hex).toBe("#1F4E79");
    expect(theme?.colors.find((c) => c.slot === "dk1")?.hex).toBe("#000000");
    expect(theme?.majorFont).toBe("Georgia");
    expect(theme?.minorFont).toBe("Inter");
    expect(readTheme(undefined)).toBeNull();
  });

  it("counts explicit colours, most used first", () => {
    const used = topColors(['<a:srgbClr val="ff0000"/><a:srgbClr val="00FF00"/>', '<a:srgbClr val="FF0000"/><a:srgbClr val="zz"/>'], 1);
    expect(used).toEqual([{ hex: "#FF0000", count: 2 }]);
  });
});
```

```ts
// apps/web/src/lib/skills/files/sniff.test.ts
import { describe, expect, it } from "vitest";
import { buildDocx, buildPptx, buildXlsx, oleHeader, tinyJpeg, tinyPdf, tinyPng, zip } from "./fixtures";
import { sniffFile } from "./sniff";
import { FILE_READ_MESSAGES, FileReadError } from "./types";

const failure = (bytes: Uint8Array) => {
  try {
    sniffFile(bytes);
  } catch (error) {
    if (error instanceof FileReadError) return { code: error.code, status: error.status, message: error.message };
    throw error;
  }
  throw new Error("expected a FileReadError");
};

describe("sniffFile", () => {
  it("tells each supported kind from its bytes", async () => {
    expect(sniffFile(buildPptx()).kind).toBe("PPTX");
    expect(sniffFile(buildDocx()).kind).toBe("DOCX");
    expect(sniffFile(buildXlsx()).kind).toBe("XLSX");
    expect(sniffFile(tinyPdf())).toEqual({ kind: "PDF", pkg: null });
    expect(sniffFile(await tinyPng())).toEqual({ kind: "PNG", pkg: null });
    expect(sniffFile(await tinyJpeg())).toEqual({ kind: "JPEG", pkg: null });
  });

  it("hands the opened package to the OOXML extractors", () => {
    const sniffed = sniffFile(buildDocx());
    expect(sniffed.pkg?.parts.has("word/styles.xml")).toBe(true);
  });

  it("refuses OLE files (encrypted Office or the old formats) as encrypted", () => {
    expect(failure(oleHeader())).toEqual({ code: "FILE_ENCRYPTED", status: 422, message: FILE_READ_MESSAGES.ole });
  });

  it("refuses a password-protected PDF", () => {
    expect(failure(tinyPdf({ encrypted: true }))).toEqual({ code: "FILE_ENCRYPTED", status: 422, message: FILE_READ_MESSAGES.encryptedPdf });
  });

  it("refuses macro-enabled packages", () => {
    expect(failure(buildPptx({ macro: true }))).toEqual({ code: "UNSUPPORTED_FILE", status: 415, message: FILE_READ_MESSAGES.macro });
  });

  it("refuses empty, random and non-Office zip bytes as unsupported", () => {
    const unsupported = { code: "UNSUPPORTED_FILE", status: 415, message: FILE_READ_MESSAGES.unsupported };
    expect(failure(new Uint8Array(0))).toEqual(unsupported);
    expect(failure(new TextEncoder().encode("just some text, not a file we read"))).toEqual(unsupported);
    expect(failure(zip({ "notes.txt": "hello", "data.xml": "<x/>" }))).toEqual(unsupported);
  });

  it("refuses a damaged zip as unreadable", () => {
    expect(failure(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5, 6, 7, 8])).code).toBe("FILE_UNREADABLE");
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/lib/skills/files`
Expected: FAIL — `Failed to resolve import "./xml"`, `"./fixtures"` and `"./sniff"`.

- [ ] **Step 3: Write the types (verbatim from the Interface Contract)**

```ts
// apps/web/src/lib/skills/files/types.ts
/** Deterministic facts read from an uploaded file (spec: File Analysis Pipeline, stage 2). No server imports: client-safe. */
export type SkillFileKind = "PPTX" | "DOCX" | "XLSX" | "PDF" | "PNG" | "JPEG";

export const THEME_SLOTS = ["dk1", "lt1", "dk2", "lt2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6", "hlink", "folHlink"] as const;
export type ThemeSlot = (typeof THEME_SLOTS)[number];
export type ThemeFacts = { name: string | null; colors: { slot: ThemeSlot; hex: string }[]; majorFont: string | null; minorFont: string | null };
export type ColorUse = { hex: string; count: number };

export type SlideFacts = {
  index: number; // 1-based, presentation order
  layout: string | null;
  title: string | null;
  placeholders: string[];
  text: string; // <= 300 chars
  tables: number;
  charts: number;
  images: number;
};
export type PptxFacts = {
  kind: "PPTX";
  slideSize: { widthIn: number; heightIn: number; aspect: "16:9" | "4:3" | "16:10" | "A4" | "custom" } | null;
  theme: ThemeFacts | null;
  themes: string[]; // names of every theme part, in part-number order
  masters: string[];
  layouts: string[];
  slideCount: number;
  slides: SlideFacts[]; // first JOB_LIMITS.slidesDetailed
  colorsUsed: ColorUse[]; // top 12
  fontsUsed: string[]; // up to 12
  truncated: boolean;
};

export type DocxStyle = {
  id: string;
  name: string;
  type: "paragraph" | "character" | "table" | "numbering";
  basedOn: string | null;
  font: string | null;
  sizePt: number | null;
  color: string | null;
  bold: boolean;
};
export type DocxFacts = {
  kind: "DOCX";
  theme: ThemeFacts | null;
  defaults: { font: string | null; sizePt: number | null };
  styles: DocxStyle[]; // <= 40
  headings: { level: number; text: string }[]; // <= 100; Title = level 0
  paragraphs: number;
  tables: number;
  images: number;
  page: { widthIn: number; heightIn: number; orientation: "portrait" | "landscape" } | null;
  textSample: string; // <= 4000 chars
  truncated: boolean;
};

export type SheetFacts = { name: string; dimension: string | null; rows: number; headerRow: string[]; formulas: number; formulaSamples: string[] };
export type XlsxFacts = {
  kind: "XLSX";
  theme: ThemeFacts | null;
  sheets: SheetFacts[]; // <= 20
  numberFormats: string[]; // <= 20
  charts: number;
  definedNames: string[]; // <= 30
  truncated: boolean;
};

export type PdfFacts = { kind: "PDF"; version: string | null; pages: number | null; title: string | null };
export type ImageFacts = { kind: "PNG" | "JPEG"; width: number; height: number };
export type FileFacts = PptxFacts | DocxFacts | XlsxFacts | PdfFacts | ImageFacts;

export const KIND_MIME: Record<SkillFileKind, string> = {
  PPTX: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  DOCX: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  XLSX: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  PDF: "application/pdf",
  PNG: "image/png",
  JPEG: "image/jpeg",
};
export const KIND_EXTENSION: Record<SkillFileKind, string> = { PPTX: "pptx", DOCX: "docx", XLSX: "xlsx", PDF: "pdf", PNG: "png", JPEG: "jpg" };
export const KIND_LABEL: Record<SkillFileKind, string> = { PPTX: "PowerPoint", DOCX: "Word", XLSX: "Excel", PDF: "PDF", PNG: "PNG image", JPEG: "JPG image" };

export type FileReadErrorCode = "UNSUPPORTED_FILE" | "FILE_ENCRYPTED" | "FILE_UNREADABLE";
export const FILE_READ_MESSAGES = {
  unsupported: "Upload a PowerPoint, Word, Excel, PDF, PNG or JPG file.",
  macro: "Macro-enabled files aren't supported. Save it as .pptx, .docx or .xlsx without macros.",
  ole: "This file is password-protected or in an old Office format. Remove the password or save it as .pptx, .docx or .xlsx, then upload it again.",
  encryptedPdf: "This PDF is password-protected. Remove the password, then upload it again.",
  unreadable: "We couldn't read this file. It may be damaged. Open and save it again, then upload it.",
} as const;

export class FileReadError extends Error {
  constructor(
    readonly code: FileReadErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "FileReadError";
  }
  get status(): 415 | 422 {
    return this.code === "UNSUPPORTED_FILE" ? 415 : 422;
  }
}
```

- [ ] **Step 4: Write the XML scanner**

```ts
// apps/web/src/lib/skills/files/xml.ts
/**
 * A small, tolerant scanner for the OOXML parts the extractors read. It never expands entities beyond the five
 * predefined ones and numeric references, never reads a DTD, and matches tags by local name whatever their prefix.
 * Same-name nesting is not supported (OOXML parts the extractors read do not nest the elements they look for).
 */
export type XmlElement = { name: string; attrs: Record<string, string>; inner: string };

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

export function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/g, (match, entity: string) => {
    if (entity[0] !== "#") return NAMED[entity];
    const code = entity[1] === "x" ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
  });
}

const ATTRIBUTE = /([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of raw.matchAll(ATTRIBUTE)) attrs[m[1]] = decodeXml(m[2] ?? m[3] ?? "");
  return attrs;
}

export function elements(xml: string, localName: string): XmlElement[] {
  const open = new RegExp(`<((?:[A-Za-z_][\\w.-]*:)?${escapeRegExp(localName)})(?=[\\s/>])([^>]*?)(/?)>`, "g");
  const found: XmlElement[] = [];
  for (let m = open.exec(xml); m; m = open.exec(xml)) {
    const [, name, rawAttrs, selfClosing] = m;
    const attrs = parseAttrs(rawAttrs);
    if (selfClosing) {
      found.push({ name, attrs, inner: "" });
      continue;
    }
    const close = `</${name}>`;
    const end = xml.indexOf(close, open.lastIndex);
    if (end === -1) {
      found.push({ name, attrs, inner: "" });
      continue;
    }
    found.push({ name, attrs, inner: xml.slice(open.lastIndex, end) });
    open.lastIndex = end + close.length;
  }
  return found;
}

export function first(xml: string, localName: string): XmlElement | null {
  return elements(xml, localName)[0] ?? null;
}

/** Exact attribute name first ("r:id"), then any prefix (local "val" matches "w:val"). */
export function attr(el: XmlElement | null | undefined, localName: string): string | null {
  if (!el) return null;
  if (localName in el.attrs) return el.attrs[localName];
  const suffix = `:${localName}`;
  for (const [key, value] of Object.entries(el.attrs)) if (key.endsWith(suffix)) return value;
  return null;
}

export function textOf(xml: string, localName = "t"): string {
  return elements(xml, localName)
    .map((el) => decodeXml(el.inner.replace(/<[^>]*>/g, "")))
    .join("");
}

export const collapse = (text: string, max = Number.POSITIVE_INFINITY): string => text.replace(/\s+/g, " ").trim().slice(0, max);
```

- [ ] **Step 5: Write the OOXML reader**

```ts
// apps/web/src/lib/skills/files/ooxml.ts
import { strFromU8, unzipSync, type Unzipped } from "fflate";
import { JOB_LIMITS } from "../limits";
import { FILE_READ_MESSAGES, FileReadError, THEME_SLOTS, type ColorUse, type ThemeFacts } from "./types";
import { attr, collapse, elements, first, type XmlElement } from "./xml";

export const EMU_PER_INCH = 914_400;

export type OoxmlPackage = { names: string[]; parts: Map<string, string>; truncated: boolean };

const wantedPart = (name: string) => /\.(xml|rels)$/i.test(name) && !name.startsWith("customXml/");

/**
 * Opens an OOXML package without inflating anything it doesn't need: only XML and rels parts are read, each at most
 * ooxmlPartBytes (declared size) and ooxmlTotalBytes together; anything over is skipped and marks the package truncated.
 * Media, embedded files and binary parts are never inflated. Every entry name is listed, read or not.
 */
export function openOoxml(bytes: Uint8Array): OoxmlPackage {
  const names: string[] = [];
  let total = 0;
  let truncated = false;
  let files: Unzipped;
  try {
    files = unzipSync(bytes, {
      filter: (file) => {
        names.push(file.name);
        if (!wantedPart(file.name)) return false;
        if (file.compression !== 0 && file.compression !== 8) return false;
        if (file.originalSize > JOB_LIMITS.ooxmlPartBytes || total + file.originalSize > JOB_LIMITS.ooxmlTotalBytes) {
          truncated = true;
          return false;
        }
        total += file.originalSize;
        return true;
      },
    });
  } catch {
    throw new FileReadError("FILE_UNREADABLE", FILE_READ_MESSAGES.unreadable);
  }
  const parts = new Map<string, string>();
  for (const [name, data] of Object.entries(files)) parts.set(name, strFromU8(data).replace(/^﻿/, ""));
  return { names, parts, truncated };
}

function resolvePart(fromPart: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const segments = fromPart.split("/").slice(0, -1);
  for (const segment of target.split("/")) {
    if (segment === "..") segments.pop();
    else if (segment && segment !== ".") segments.push(segment);
  }
  return segments.join("/");
}

export function relTargets(relsXml: string | undefined, fromPart: string): Map<string, string> {
  const targets = new Map<string, string>();
  if (!relsXml) return targets;
  for (const rel of elements(relsXml, "Relationship")) {
    const id = attr(rel, "Id");
    const target = attr(rel, "Target");
    if (!id || !target || attr(rel, "TargetMode") === "External") continue;
    targets.set(id, resolvePart(fromPart, target));
  }
  return targets;
}

export function relsPathFor(part: string): string {
  const slash = part.lastIndexOf("/");
  return `${part.slice(0, slash + 1)}_rels/${part.slice(slash + 1)}.rels`;
}

export function partNumber(name: string): number {
  const match = /(\d+)\.xml$/.exec(name);
  return match ? Number(match[1]) : 0;
}

export function toHex(value: string | null): string | null {
  return value && /^[0-9a-fA-F]{6}$/.test(value) ? `#${value.toUpperCase()}` : null;
}

export function colorOf(el: XmlElement | null): string | null {
  if (!el) return null;
  const rgb = first(el.inner, "srgbClr");
  if (rgb) return toHex(attr(rgb, "val"));
  const sys = first(el.inner, "sysClr");
  return sys ? toHex(attr(sys, "lastClr")) : null;
}

const typeface = (xml: string | undefined, fontKind: "majorFont" | "minorFont") => {
  const font = xml ? first(xml, fontKind) : null;
  const face = attr(font ? first(font.inner, "latin") : null, "typeface");
  return face ? collapse(face, 100) : null;
};

export function readTheme(xml: string | undefined): ThemeFacts | null {
  if (!xml) return null;
  const theme = first(xml, "theme");
  const scheme = first(xml, "clrScheme");
  const colors = scheme
    ? THEME_SLOTS.flatMap((slot) => {
        const hex = colorOf(first(scheme.inner, slot));
        return hex ? [{ slot, hex }] : [];
      })
    : [];
  const name = attr(theme, "name");
  return { name: name ? collapse(name, 100) : null, colors, majorFont: typeface(xml, "majorFont"), minorFont: typeface(xml, "minorFont") };
}

export function topColors(xmls: string[], limit = 12): ColorUse[] {
  const counts = new Map<string, number>();
  for (const xml of xmls) {
    for (const el of elements(xml, "srgbClr")) {
      const hex = toHex(attr(el, "val"));
      if (hex) counts.set(hex, (counts.get(hex) ?? 0) + 1);
    }
  }
  return [...counts]
    .map(([hex, count]) => ({ hex, count }))
    .sort((a, b) => b.count - a.count || a.hex.localeCompare(b.hex))
    .slice(0, limit);
}
```

- [ ] **Step 6: Write the PDF encryption check and the sniffer**

```ts
// apps/web/src/lib/skills/files/pdf.ts
/** PDFs are read as Latin-1 text: only the header and uncompressed dictionary keys are looked at. */
const latin1 = (bytes: Uint8Array) => Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("latin1");

/** A PDF with an /Encrypt dictionary needs a password (or restricts reading); Claude can't read it. */
export function isEncryptedPdf(bytes: Uint8Array): boolean {
  return /\/Encrypt\b/.test(latin1(bytes));
}
```

```ts
// apps/web/src/lib/skills/files/sniff.ts
import { openOoxml, type OoxmlPackage } from "./ooxml";
import { isEncryptedPdf } from "./pdf";
import { FILE_READ_MESSAGES, FileReadError } from "./types";

export type Sniffed = { kind: "PPTX" | "DOCX" | "XLSX"; pkg: OoxmlPackage } | { kind: "PDF" | "PNG" | "JPEG"; pkg: null };

const ZIP = [0x50, 0x4b, 0x03, 0x04];
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];

const startsWith = (bytes: Uint8Array, magic: number[]) => bytes.length >= magic.length && magic.every((b, i) => bytes[i] === b);
const unsupported = (message: string = FILE_READ_MESSAGES.unsupported) => new FileReadError("UNSUPPORTED_FILE", message);

/** The kind comes from the bytes, never from the browser's MIME type or the file extension (spec, stage 1). */
export function sniffFile(bytes: Uint8Array): Sniffed {
  if (startsWith(bytes, ZIP)) {
    const pkg = openOoxml(bytes);
    if (pkg.names.some((name) => /(^|\/)vbaProject\.bin$/i.test(name))) throw unsupported(FILE_READ_MESSAGES.macro);
    const has = (name: string) => pkg.names.includes(name);
    if (has("ppt/presentation.xml")) return { kind: "PPTX", pkg };
    if (has("word/document.xml")) return { kind: "DOCX", pkg };
    if (has("xl/workbook.xml")) return { kind: "XLSX", pkg };
    throw unsupported();
  }
  // Encrypted .pptx/.docx/.xlsx and the old .ppt/.doc/.xls formats are all OLE compound files.
  if (startsWith(bytes, OLE)) throw new FileReadError("FILE_ENCRYPTED", FILE_READ_MESSAGES.ole);
  if (startsWith(bytes, PDF)) {
    if (isEncryptedPdf(bytes)) throw new FileReadError("FILE_ENCRYPTED", FILE_READ_MESSAGES.encryptedPdf);
    return { kind: "PDF", pkg: null };
  }
  if (startsWith(bytes, PNG)) return { kind: "PNG", pkg: null };
  if (startsWith(bytes, JPEG)) return { kind: "JPEG", pkg: null };
  throw unsupported();
}
```

- [ ] **Step 7: Write the fixtures (complete; Tasks 4–7 only consume them)**

```ts
// apps/web/src/lib/skills/files/fixtures.ts
/**
 * Test-only builders for real, minimal Office packages, PDFs and images (spec, Testing: fixtures are generated,
 * never committed). Imported by unit tests and scripts/make-skill-fixtures.ts; never by product code.
 */
import { createHash, randomBytes } from "node:crypto";
import { strToU8, zipSync, type Zippable } from "fflate";
import sharp from "sharp";
import { THEME_SLOTS, type ThemeSlot } from "./types";

export type FixtureTheme = { name?: string; colors?: Partial<Record<ThemeSlot, string>>; sysDk1?: boolean; majorFont?: string; minorFont?: string };
/** `layout` is the 1-based layout used; 0 writes the slide with no rels part at all. Layout 1 uses a ctrTitle placeholder. */
export type FixtureSlide = { title?: string; body?: string[]; layout?: number; table?: boolean; chart?: boolean; picture?: boolean; colors?: string[]; fonts?: string[] };
export type FixtureStyle = { id: string; name: string; type?: "paragraph" | "character" | "table"; font?: string; sizePt?: number; color?: string; bold?: boolean; basedOn?: string };
export type FixtureCell = string | number | { formula: string; value?: number };

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS = {
  a: "http://schemas.openxmlformats.org/drawingml/2006/main",
  p: "http://schemas.openxmlformats.org/presentationml/2006/main",
  r: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
  w: "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
  s: "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
  rel: "http://schemas.openxmlformats.org/package/2006/relationships",
  ct: "http://schemas.openxmlformats.org/package/2006/content-types",
  odr: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
};
const esc = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function zip(entries: Record<string, string | Uint8Array>, level: 0 | 6 = 6): Uint8Array {
  const zippable: Zippable = {};
  for (const [name, value] of Object.entries(entries)) zippable[name] = [typeof value === "string" ? strToU8(value) : value, { level }];
  return zipSync(zippable);
}

type Rel = { id: string; type: string; target: string };
const rels = (list: Rel[]) =>
  `${XML}<Relationships xmlns="${NS.rel}">${list.map((r) => `<Relationship Id="${r.id}" Type="${NS.odr}/${r.type}" Target="${esc(r.target)}"/>`).join("")}</Relationships>`;
const contentTypes = (overrides: [string, string][]) =>
  `${XML}<Types xmlns="${NS.ct}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${overrides
    .map(([part, type]) => `<Override PartName="/${part}" ContentType="${type}"/>`)
    .join("")}</Types>`;

const DEFAULT_COLORS: Record<ThemeSlot, string> = {
  dk1: "000000", lt1: "FFFFFF", dk2: "1F497D", lt2: "EEECE1", accent1: "4F81BD", accent2: "C0504D",
  accent3: "9BBB59", accent4: "8064A2", accent5: "4BACC6", accent6: "F79646", hlink: "0000FF", folHlink: "800080",
};

/** Colours are hex without '#'. */
export function themeXml(theme: FixtureTheme = {}): string {
  const colors = { ...DEFAULT_COLORS, ...theme.colors };
  const slot = (s: ThemeSlot) =>
    s === "dk1" && theme.sysDk1
      ? `<a:dk1><a:sysClr val="windowText" lastClr="${colors.dk1}"/></a:dk1>`
      : `<a:${s}><a:srgbClr val="${colors[s]}"/></a:${s}>`;
  return `${XML}<a:theme xmlns:a="${NS.a}" name="${esc(theme.name ?? "Office Theme")}"><a:themeElements><a:clrScheme name="Office">${THEME_SLOTS.map(slot).join(
    "",
  )}</a:clrScheme><a:fontScheme name="Office"><a:majorFont><a:latin typeface="${esc(theme.majorFont ?? "Calibri Light")}"/><a:ea typeface=""/></a:majorFont><a:minorFont><a:latin typeface="${esc(
    theme.minorFont ?? "Calibri",
  )}"/><a:ea typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"/></a:themeElements></a:theme>`;
}

function run(text: string, color?: string, font?: string) {
  const fill = color ? `<a:solidFill><a:srgbClr val="${color}"/></a:solidFill>` : "";
  const latin = font ? `<a:latin typeface="${esc(font)}"/>` : "";
  return `<a:r><a:rPr lang="en-US" dirty="0">${fill}${latin}</a:rPr><a:t>${esc(text)}</a:t></a:r>`;
}

function slideXml(slide: FixtureSlide, n: number): string {
  const colors = slide.colors ?? [];
  const fonts = slide.fonts ?? [];
  const shapes: string[] = [];
  if (slide.title !== undefined) {
    const type = slide.layout === 1 ? "ctrTitle" : "title";
    shapes.push(
      `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:cNvSpPr/><p:nvPr><p:ph type="${type}"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:p>${run(slide.title, colors[0], fonts[0])}</a:p></p:txBody></p:sp>`,
    );
  }
  if (slide.body?.length) {
    shapes.push(
      `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Content 2"/><p:cNvSpPr/><p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/>${slide.body
        .map((line, i) => `<a:p>${run(line, colors[i + 1], fonts[i + 1])}</a:p>`)
        .join("")}</p:txBody></p:sp>`,
    );
  }
  const frame = (uri: string, inner: string) =>
    `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${n + 10}" name="Frame"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm/><a:graphic><a:graphicData uri="${uri}">${inner}</a:graphicData></a:graphic></p:graphicFrame>`;
  if (slide.table) shapes.push(frame(`${NS.a.replace("/main", "/table")}`, `<a:tbl><a:tblPr/><a:tr h="370840"><a:tc><a:txBody><a:bodyPr/><a:p>${run("Cell")}</a:p></a:txBody></a:tc></a:tr></a:tbl>`));
  if (slide.chart) shapes.push(frame("http://schemas.openxmlformats.org/drawingml/2006/chart", `<c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rId9"/>`));
  if (slide.picture) shapes.push(`<p:pic><p:nvPicPr><p:cNvPr id="${n + 20}" name="Picture"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId8"/></p:blipFill><p:spPr/></p:pic>`);
  return `${XML}<p:sld xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${shapes.join(
    "",
  )}</p:spTree></p:cSld></p:sld>`;
}

const cSld = (name: string | null) => (name === null ? "<p:cSld>" : `<p:cSld name="${esc(name)}">`);

/**
 * A real PowerPoint package. `order` lists slide part numbers in presentation order (default 1..n), so tests can make
 * sldIdLst disagree with file numbers. `padBytes` adds an incompressible ppt/media/pad.bin (stored) to reach a size.
 */
export function buildPptx(
  opts: {
    slides?: FixtureSlide[];
    theme?: FixtureTheme;
    slideSize?: { cx: number; cy: number };
    layouts?: (string | null)[];
    masters?: (string | null)[];
    order?: number[];
    macro?: boolean;
    padBytes?: number;
  } = {},
): Uint8Array {
  const slides = opts.slides ?? [{ title: "Quarterly board update", body: ["Revenue grew 12%"], layout: 2 }];
  const layouts = opts.layouts ?? ["Title Slide", "Title and Content"];
  const masters = opts.masters ?? ["Office Theme"];
  const size = opts.slideSize ?? { cx: 12_192_000, cy: 6_858_000 };
  const order = opts.order ?? slides.map((_, i) => i + 1);
  const entries: Zippable = {};
  const put = (name: string, value: string) => (entries[name] = strToU8(value));
  const P = "application/vnd.openxmlformats-officedocument.presentationml";
  const overrides: [string, string][] = [
    ["ppt/presentation.xml", `${P}.presentation.main+xml`],
    ["ppt/theme/theme1.xml", "application/vnd.openxmlformats-officedocument.theme+xml"],
  ];
  put("_rels/.rels", rels([{ id: "rId1", type: "officeDocument", target: "ppt/presentation.xml" }]));

  const presRels: Rel[] = [{ id: "rId1", type: "theme", target: "theme/theme1.xml" }];
  masters.forEach((_, i) => presRels.push({ id: `rIdM${i + 1}`, type: "slideMaster", target: `slideMasters/slideMaster${i + 1}.xml` }));
  slides.forEach((_, i) => presRels.push({ id: `rIdS${i + 1}`, type: "slide", target: `slides/slide${i + 1}.xml` }));
  put("ppt/_rels/presentation.xml.rels", rels(presRels));
  put(
    "ppt/presentation.xml",
    `${XML}<p:presentation xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}"><p:sldMasterIdLst>${masters
      .map((_, i) => `<p:sldMasterId id="${2147483648 + i}" r:id="rIdM${i + 1}"/>`)
      .join("")}</p:sldMasterIdLst><p:sldIdLst>${order.map((n, i) => `<p:sldId id="${256 + i}" r:id="rIdS${n}"/>`).join("")}</p:sldIdLst><p:sldSz cx="${size.cx}" cy="${size.cy}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`,
  );
  put("ppt/theme/theme1.xml", themeXml(opts.theme));

  masters.forEach((name, i) => {
    const part = `ppt/slideMasters/slideMaster${i + 1}.xml`;
    overrides.push([part, `${P}.slideMaster+xml`]);
    put(part, `${XML}<p:sldMaster xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}">${cSld(name)}<p:spTree/></p:cSld><p:sldLayoutIdLst>${layouts
      .map((_, j) => `<p:sldLayoutId id="${2147483649 + j}" r:id="rIdL${j + 1}"/>`)
      .join("")}</p:sldLayoutIdLst></p:sldMaster>`);
    put(
      `ppt/slideMasters/_rels/slideMaster${i + 1}.xml.rels`,
      rels([...layouts.map((_, j) => ({ id: `rIdL${j + 1}`, type: "slideLayout", target: `../slideLayouts/slideLayout${j + 1}.xml` })), { id: "rIdT", type: "theme", target: "../theme/theme1.xml" }]),
    );
  });
  layouts.forEach((name, j) => {
    const part = `ppt/slideLayouts/slideLayout${j + 1}.xml`;
    overrides.push([part, `${P}.slideLayout+xml`]);
    put(part, `${XML}<p:sldLayout xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}">${cSld(name)}<p:spTree/></p:cSld></p:sldLayout>`);
    put(`ppt/slideLayouts/_rels/slideLayout${j + 1}.xml.rels`, rels([{ id: "rId1", type: "slideMaster", target: "../slideMasters/slideMaster1.xml" }]));
  });
  slides.forEach((slide, i) => {
    const part = `ppt/slides/slide${i + 1}.xml`;
    overrides.push([part, `${P}.slide+xml`]);
    put(part, slideXml(slide, i + 1));
    const layout = slide.layout ?? Math.min(2, layouts.length);
    if (layout > 0) put(`ppt/slides/_rels/slide${i + 1}.xml.rels`, rels([{ id: "rId1", type: "slideLayout", target: `../slideLayouts/slideLayout${layout}.xml` }]));
  });
  if (opts.macro) entries["ppt/vbaProject.bin"] = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]);
  if (opts.padBytes) entries["ppt/media/pad.bin"] = [new Uint8Array(randomBytes(opts.padBytes)), { level: 0 }];
  put("[Content_Types].xml", contentTypes(overrides));
  return zipSync(entries);
}

const wRun = (text: string) => `<w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;

function styleXml(style: FixtureStyle): string {
  const rPr = [
    style.font ? `<w:rFonts w:ascii="${esc(style.font)}" w:hAnsi="${esc(style.font)}"/>` : "",
    style.bold ? "<w:b/><w:bCs/>" : "",
    style.color ? `<w:color w:val="${style.color}"/>` : "",
    style.sizePt ? `<w:sz w:val="${style.sizePt * 2}"/><w:szCs w:val="${style.sizePt * 2}"/>` : "",
  ].join("");
  return `<w:style w:type="${style.type ?? "paragraph"}" w:styleId="${esc(style.id)}"><w:name w:val="${esc(style.name)}"/>${
    style.basedOn ? `<w:basedOn w:val="${esc(style.basedOn)}"/>` : ""
  }<w:qFormat/>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ""}</w:style>`;
}

export const DEFAULT_DOCX_STYLES: FixtureStyle[] = [
  { id: "Normal", name: "Normal" },
  { id: "Title", name: "Title", basedOn: "Normal", font: "Georgia", sizePt: 28, color: "1F4E79" },
  { id: "Heading1", name: "heading 1", basedOn: "Normal", font: "Georgia", sizePt: 16, color: "2F5496", bold: true },
  { id: "Heading2", name: "heading 2", basedOn: "Normal", font: "Georgia", sizePt: 13, color: "2F5496" },
  { id: "Quote", name: "Quote", basedOn: "Normal", color: "auto" },
];

/** A real Word package: paragraphs, then `tables` one-cell tables and `images` drawings, then the section properties. */
export function buildDocx(
  opts: {
    paragraphs?: { text: string; style?: string }[];
    styles?: FixtureStyle[];
    defaults?: { font?: string; sizePt?: number };
    theme?: FixtureTheme;
    page?: { widthIn: number; heightIn: number; orientation?: "portrait" | "landscape" };
    tables?: number;
    images?: number;
  } = {},
): Uint8Array {
  const paragraphs = opts.paragraphs ?? [
    { text: "Monthly board update", style: "Title" },
    { text: "Summary", style: "Heading1" },
    { text: "Revenue grew 12% against plan." },
  ];
  const defaults = { font: "Calibri", sizePt: 11, ...opts.defaults };
  const page = opts.page ?? { widthIn: 8.5, heightIn: 11 };
  const body = [
    ...paragraphs.map((p) => `<w:p>${p.style ? `<w:pPr><w:pStyle w:val="${esc(p.style)}"/></w:pPr>` : ""}${wRun(p.text)}</w:p>`),
    ...Array.from({ length: opts.tables ?? 0 }, () => `<w:tbl><w:tblPr/><w:tr><w:tc><w:p>${wRun("Cell")}</w:p></w:tc></w:tr></w:tbl>`),
    ...Array.from({ length: opts.images ?? 0 }, (_, i) => `<w:p><w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:docPr id="${i + 1}" name="Picture"/></wp:inline></w:drawing></w:r></w:p>`),
  ].join("");
  const orient = page.orientation === "landscape" ? ' w:orient="landscape"' : "";
  const W = "application/vnd.openxmlformats-officedocument.wordprocessingml";
  return zip({
    "[Content_Types].xml": contentTypes([
      ["word/document.xml", `${W}.document.main+xml`],
      ["word/styles.xml", `${W}.styles+xml`],
      ["word/theme/theme1.xml", "application/vnd.openxmlformats-officedocument.theme+xml"],
    ]),
    "_rels/.rels": rels([{ id: "rId1", type: "officeDocument", target: "word/document.xml" }]),
    "word/_rels/document.xml.rels": rels([
      { id: "rId1", type: "styles", target: "styles.xml" },
      { id: "rId2", type: "theme", target: "theme/theme1.xml" },
    ]),
    "word/document.xml": `${XML}<w:document xmlns:w="${NS.w}" xmlns:r="${NS.r}"><w:body>${body}<w:sectPr><w:pgSz w:w="${Math.round(page.widthIn * 1440)}" w:h="${Math.round(
      page.heightIn * 1440,
    )}"${orient}/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`,
    "word/styles.xml": `${XML}<w:styles xmlns:w="${NS.w}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${esc(defaults.font)}" w:hAnsi="${esc(
      defaults.font,
    )}"/><w:sz w:val="${defaults.sizePt * 2}"/></w:rPr></w:rPrDefault></w:docDefaults>${(opts.styles ?? DEFAULT_DOCX_STYLES).map(styleXml).join("")}</w:styles>`,
    "word/theme/theme1.xml": themeXml(opts.theme),
  });
}

const column = (index: number) => {
  let n = index + 1;
  let name = "";
  while (n > 0) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
};

/**
 * A real Excel package. Strings go to the shared-string table unless the sheet sets `inlineStrings`.
 * `reverseFiles` stores sheet i as sheet(n - i).xml, so tests can prove the extractor follows workbook rels.
 */
export function buildXlsx(
  opts: {
    sheets?: { name: string; rows: FixtureCell[][]; inlineStrings?: boolean }[];
    numFmts?: string[];
    definedNames?: string[];
    charts?: number;
    theme?: FixtureTheme;
    reverseFiles?: boolean;
  } = {},
): Uint8Array {
  const sheets = opts.sheets ?? [
    {
      name: "Revenue",
      rows: [
        ["Month", "Plan", "Actual", "Variance"],
        ["Jan", 100, 112, { formula: "C2-B2", value: 12 }],
      ],
    },
  ];
  const shared: string[] = [];
  const sharedIndex = (text: string) => {
    const at = shared.indexOf(text);
    if (at !== -1) return at;
    shared.push(text);
    return shared.length - 1;
  };
  const S = "application/vnd.openxmlformats-officedocument.spreadsheetml";
  const entries: Record<string, string> = {};
  const fileOf = (i: number) => (opts.reverseFiles ? sheets.length - i : i + 1);
  sheets.forEach((sheet, i) => {
    const rowsXml = sheet.rows
      .map((cells, r) => {
        const cellsXml = cells
          .map((cell, c) => {
            const ref = `${column(c)}${r + 1}`;
            if (typeof cell === "number") return `<c r="${ref}"><v>${cell}</v></c>`;
            if (typeof cell === "object") return `<c r="${ref}"><f>${esc(cell.formula)}</f><v>${cell.value ?? 0}</v></c>`;
            if (sheet.inlineStrings) return `<c r="${ref}" t="inlineStr"><is><t>${esc(cell)}</t></is></c>`;
            return `<c r="${ref}" t="s"><v>${sharedIndex(cell)}</v></c>`;
          })
          .join("");
        return `<row r="${r + 1}">${cellsXml}</row>`;
      })
      .join("");
    const width = Math.max(1, ...sheet.rows.map((row) => row.length));
    entries[`xl/worksheets/sheet${fileOf(i)}.xml`] = `${XML}<worksheet xmlns="${NS.s}" xmlns:r="${NS.r}"><dimension ref="A1:${column(width - 1)}${Math.max(1, sheet.rows.length)}"/><sheetData>${rowsXml}</sheetData></worksheet>`;
  });
  const numFmts = opts.numFmts ?? ['"$"#,##0'];
  entries["xl/styles.xml"] = `${XML}<styleSheet xmlns="${NS.s}"><numFmts count="${numFmts.length}">${numFmts
    .map((code, i) => `<numFmt numFmtId="${164 + i}" formatCode="${esc(code)}"/>`)
    .join("")}</numFmts><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellXfs></styleSheet>`;
  entries["xl/sharedStrings.xml"] = `${XML}<sst xmlns="${NS.s}" count="${shared.length}" uniqueCount="${shared.length}">${shared.map((t) => `<si><t>${esc(t)}</t></si>`).join("")}</sst>`;
  entries["xl/theme/theme1.xml"] = themeXml(opts.theme);
  for (let i = 1; i <= (opts.charts ?? 0); i += 1) entries[`xl/charts/chart${i}.xml`] = `${XML}<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"/>`;
  const definedNames = opts.definedNames ?? [];
  entries["xl/workbook.xml"] = `${XML}<workbook xmlns="${NS.s}" xmlns:r="${NS.r}"><sheets>${sheets
    .map((sheet, i) => `<sheet name="${esc(sheet.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join("")}</sheets>${definedNames.length ? `<definedNames>${definedNames.map((n) => `<definedName name="${esc(n)}">Sheet1!$A$1</definedName>`).join("")}</definedNames>` : ""}</workbook>`;
  entries["xl/_rels/workbook.xml.rels"] = rels([
    ...sheets.map((_, i) => ({ id: `rId${i + 1}`, type: "worksheet", target: `worksheets/sheet${fileOf(i)}.xml` })),
    { id: "rIdS", type: "styles", target: "styles.xml" },
    { id: "rIdSS", type: "sharedStrings", target: "sharedStrings.xml" },
    { id: "rIdT", type: "theme", target: "theme/theme1.xml" },
  ]);
  entries["_rels/.rels"] = rels([{ id: "rId1", type: "officeDocument", target: "xl/workbook.xml" }]);
  entries["[Content_Types].xml"] = contentTypes([
    ["xl/workbook.xml", `${S}.sheet.main+xml`],
    ...sheets.map((_, i): [string, string] => [`xl/worksheets/sheet${fileOf(i)}.xml`, `${S}.worksheet+xml`]),
  ]);
  return zip(entries);
}

/** A valid minimal PDF (catalog, page tree, pages, info, xref, trailer) written as text. */
export function tinyPdf(opts: { pages?: number; title?: string; encrypted?: boolean } = {}): Uint8Array {
  const pages = opts.pages ?? 1;
  const objects: string[] = [];
  const pageIds = Array.from({ length: pages }, (_, i) => i + 4);
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages} >>`;
  objects[3] = opts.title === undefined ? "<< /Producer (LMS tests) >>" : `<< /Title (${opts.title.replace(/([\\()])/g, "\\$1")}) /Producer (LMS tests) >>`;
  for (const id of pageIds) objects[id] = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>";
  const encryptId = pages + 4;
  if (opts.encrypted) objects[encryptId] = "<< /Filter /Standard /V 1 /R 2 /O (x) /U (x) /P -4 >>";
  let out = "%PDF-1.7\n%\xE2\xE3\xCF\xD3\n";
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = out.length;
    out += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n${offsets.slice(1).map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R /Info 3 0 R${opts.encrypted ? ` /Encrypt ${encryptId} 0 R` : ""} >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(out, "latin1"));
}

const solid = (width: number, height: number) => sharp({ create: { width, height, channels: 3, background: { r: 31, g: 78, b: 121 } } });
export async function tinyPng(width = 4, height = 3): Promise<Uint8Array> {
  return new Uint8Array(await solid(width, height).png().toBuffer());
}
export async function tinyJpeg(width = 4, height = 3): Promise<Uint8Array> {
  return new Uint8Array(await solid(width, height).jpeg().toBuffer());
}

/** The OLE compound-file signature: encrypted Office files and .ppt/.doc/.xls start with it. */
export function oleHeader(): Uint8Array {
  const bytes = new Uint8Array(512);
  bytes.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  return bytes;
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
```

- [ ] **Step 8: Run the tests**

Run: `npx vitest run src/lib/skills/files && npx tsc --noEmit`
Expected: PASS (22 tests). The 17 MB oversized-part test takes about 0.3 s.

- [ ] **Step 9: Commit**

```bash
git add src/lib/skills/files/types.ts src/lib/skills/files/xml.ts src/lib/skills/files/ooxml.ts src/lib/skills/files/pdf.ts src/lib/skills/files/sniff.ts src/lib/skills/files/fixtures.ts src/lib/skills/files/xml.test.ts src/lib/skills/files/ooxml.test.ts src/lib/skills/files/sniff.test.ts
git commit -m "feat(skills-builder): sniff uploads and read OOXML packages within bounds"
```

---

### Task 4: PowerPoint facts

**Files:**
- Create: `apps/web/src/lib/skills/files/pptx.ts`
- Test: `apps/web/src/lib/skills/files/pptx.test.ts`

**Interfaces:**
- Consumes: `OoxmlPackage`, `openOoxml`, `relTargets`, `relsPathFor`, `partNumber`, `readTheme`, `topColors`, `EMU_PER_INCH` (Task 3); `elements`, `first`, `attr`, `textOf`, `collapse` (Task 3); `buildPptx`, `FixtureSlide` (Task 3, tests); `JOB_LIMITS.ooxmlPartsParsed`, `JOB_LIMITS.slidesDetailed` (Task 1).
- Produces: `extractPptx(pkg: OoxmlPackage): PptxFacts`.

Rules this task pins (spec, stage 2, PPTX): slide order comes from `p:sldIdLst` through `ppt/_rels/presentation.xml.rels`, falling back to part numbers only when the list is absent; masters/layouts without `p:cSld@name` read "Master N"/"Layout N" (N = part number); a slide without a rels part has `layout: null`; at most 300 slides are parsed and the first 60 detailed; `slideCount` counts every `sldId`; aspect is the nearest of 16:9, 4:3, 16:10 and PowerPoint's "A4 Paper" preset (10.83 × 7.5 in) within ±2 %, otherwise `custom`; fonts exclude theme references (`+mj-lt`, `+mn-lt`). Missing parts give empty facts, never an exception.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/skills/files/pptx.test.ts
import { describe, expect, it } from "vitest";
import { buildPptx, type FixtureSlide } from "./fixtures";
import { openOoxml } from "./ooxml";
import { extractPptx } from "./pptx";

const facts = (opts: Parameters<typeof buildPptx>[0] = {}) => extractPptx(openOoxml(buildPptx(opts)));

describe("extractPptx", () => {
  it("reads the slide size, theme, masters and layouts", () => {
    const f = facts({ theme: { name: "Acme", colors: { accent1: "1F4E79" }, majorFont: "Georgia", minorFont: "Inter" } });
    expect(f.kind).toBe("PPTX");
    expect(f.slideSize).toEqual({ widthIn: 13.33, heightIn: 7.5, aspect: "16:9" });
    expect(f.theme?.colors.find((c) => c.slot === "accent1")?.hex).toBe("#1F4E79");
    expect(f.theme?.majorFont).toBe("Georgia");
    expect(f.themes).toEqual(["Acme"]);
    expect(f.masters).toEqual(["Office Theme"]);
    expect(f.layouts).toEqual(["Title Slide", "Title and Content"]);
    expect(f.truncated).toBe(false);
  });

  it("names the aspect ratio: 4:3, PowerPoint's A4 and custom", () => {
    expect(facts({ slideSize: { cx: 9_144_000, cy: 6_858_000 } }).slideSize?.aspect).toBe("4:3");
    expect(facts({ slideSize: { cx: 9_906_000, cy: 6_858_000 } }).slideSize?.aspect).toBe("A4");
    expect(facts({ slideSize: { cx: 9_144_000, cy: 9_144_000 } }).slideSize).toEqual({ widthIn: 10, heightIn: 10, aspect: "custom" });
  });

  it("describes each slide: title from title or ctrTitle, placeholders, layout, text, tables, charts, pictures", () => {
    const f = facts({
      slides: [
        { title: "Board update", layout: 1 },
        { title: "Numbers", body: ["Revenue up", "Costs flat"], layout: 2, table: true, chart: true, picture: true },
      ],
    });
    expect(f.slideCount).toBe(2);
    expect(f.slides[0]).toEqual({ index: 1, layout: "Title Slide", title: "Board update", placeholders: ["ctrTitle"], text: "Board update", tables: 0, charts: 0, images: 0 });
    expect(f.slides[1]).toMatchObject({
      index: 2,
      layout: "Title and Content",
      title: "Numbers",
      placeholders: ["title", "body"],
      tables: 1,
      charts: 1,
      images: 1,
    });
    expect(f.slides[1].text).toBe("NumbersRevenue upCosts flatCell");
  });

  it("collects explicit colours and fonts, never the theme references", () => {
    const f = facts({
      slides: [
        { title: "A", body: ["b", "c"], colors: ["1F4E79", "1F4E79", "C00000"], fonts: ["Georgia", "+mn-lt", "Inter"] },
        { title: "D", colors: ["C00000"], fonts: ["+mj-lt"] },
      ],
    });
    expect(f.colorsUsed).toEqual([
      { hex: "#1F4E79", count: 2 },
      { hex: "#C00000", count: 2 },
    ]);
    expect(f.fontsUsed).toEqual(["Georgia", "Inter"]);
  });

  describe("real-world quirks (Review Focus 5)", () => {
    it("follows sldIdLst order, not the slide file numbers", () => {
      const slides: FixtureSlide[] = [{ title: "Stored first" }, { title: "Stored second" }, { title: "Stored third" }];
      const f = facts({ slides, order: [3, 1, 2] });
      expect(f.slides.map((s) => s.title)).toEqual(["Stored third", "Stored first", "Stored second"]);
      expect(f.slides.map((s) => s.index)).toEqual([1, 2, 3]);
    });

    it("reads a theme whose dark colour is a system colour", () => {
      expect(facts({ theme: { sysDk1: true, colors: { dk1: "0A0A0A" } } }).theme?.colors[0]).toEqual({ slot: "dk1", hex: "#0A0A0A" });
    });

    it("falls back to numbered names for masters and layouts without one (Google Slides exports)", () => {
      const f = facts({ masters: [null], layouts: [null, "Section"] });
      expect(f.masters).toEqual(["Master 1"]);
      expect(f.layouts).toEqual(["Layout 1", "Section"]);
    });

    it("keeps a slide that has no rels part, with no layout", () => {
      const f = facts({ slides: [{ title: "Loose", layout: 0 }] });
      expect(f.slides[0]).toMatchObject({ title: "Loose", layout: null });
    });

    it("falls back to slide part numbers when sldIdLst is missing", () => {
      const pkg = openOoxml(buildPptx({ slides: [{ title: "One" }, { title: "Two" }] }));
      pkg.parts.set("ppt/presentation.xml", '<p:presentation><p:sldSz cx="12192000" cy="6858000"/></p:presentation>');
      const f = extractPptx(pkg);
      expect(f.slideCount).toBe(2);
      expect(f.slides.map((s) => s.title)).toEqual(["One", "Two"]);
    });

    it("returns empty facts instead of throwing when the main parts are missing", () => {
      const f = extractPptx({ names: [], parts: new Map(), truncated: false });
      expect(f).toMatchObject({ slideSize: null, theme: null, slideCount: 0, slides: [], masters: [], layouts: [] });
    });
  });

  it("details the first 60 slides, counts them all and marks the facts truncated", () => {
    const slides = Array.from({ length: 61 }, (_, i) => ({ title: `Slide ${i + 1}` }));
    const f = facts({ slides });
    expect(f.slideCount).toBe(61);
    expect(f.slides).toHaveLength(60);
    expect(f.slides[59].title).toBe("Slide 60");
    expect(f.truncated).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/skills/files/pptx.test.ts`
Expected: FAIL with `Failed to resolve import "./pptx"`.

- [ ] **Step 3: Implement**

```ts
// apps/web/src/lib/skills/files/pptx.ts
import { JOB_LIMITS } from "../limits";
import { EMU_PER_INCH, partNumber, readTheme, relsPathFor, relTargets, topColors, type OoxmlPackage } from "./ooxml";
import type { PptxFacts, SlideFacts } from "./types";
import { attr, collapse, elements, first, textOf } from "./xml";

const round2 = (value: number) => Math.round(value * 100) / 100;
const byNumber = (a: string, b: string) => partNumber(a) - partNumber(b);

/** PowerPoint's presets; "A4" is its "A4 Paper" slide (10.83 x 7.5 in), not the ISO page ratio. */
type Aspect = NonNullable<PptxFacts["slideSize"]>["aspect"];
const ASPECTS: [Aspect, number][] = [
  ["16:9", 16 / 9],
  ["4:3", 4 / 3],
  ["16:10", 16 / 10],
  ["A4", 10.83 / 7.5],
];

function aspectOf(cx: number, cy: number): Aspect {
  const ratio = Math.max(cx, cy) / Math.min(cx, cy);
  return ASPECTS.find(([, target]) => Math.abs(ratio / target - 1) <= 0.02)?.[0] ?? "custom";
}

const cSldName = (xml: string | undefined) => {
  const name = attr(xml ? first(xml, "cSld") : null, "name");
  return name ? collapse(name, 100) : null;
};

function slideFacts(xml: string, index: number, layout: string | null): SlideFacts {
  let title: string | null = null;
  const placeholders: string[] = [];
  for (const shape of elements(xml, "sp")) {
    const ph = first(shape.inner, "ph");
    if (!ph) continue;
    const type = attr(ph, "type") ?? "body";
    if (!placeholders.includes(type)) placeholders.push(type);
    if (title === null && (type === "title" || type === "ctrTitle")) title = collapse(textOf(shape.inner), 200) || null;
  }
  return {
    index,
    layout,
    title,
    placeholders,
    text: collapse(textOf(xml), 300),
    tables: elements(xml, "tbl").length,
    charts: elements(xml, "graphicData").filter((g) => (attr(g, "uri") ?? "").endsWith("/chart")).length,
    images: elements(xml, "pic").length,
  };
}

/** Facts from a PowerPoint package (spec, stage 2, PPTX). Missing parts give empty facts, never an exception. */
export function extractPptx(pkg: OoxmlPackage): PptxFacts {
  const part = (name: string | undefined) => (name ? pkg.parts.get(name) : undefined);
  let truncated = pkg.truncated;
  const presentation = part("ppt/presentation.xml") ?? "";

  const size = first(presentation, "sldSz");
  const cx = Number(attr(size, "cx"));
  const cy = Number(attr(size, "cy"));
  const slideSize = cx > 0 && cy > 0 ? { widthIn: round2(cx / EMU_PER_INCH), heightIn: round2(cy / EMU_PER_INCH), aspect: aspectOf(cx, cy) } : null;

  const themeParts = pkg.names.filter((n) => /^ppt\/theme\/theme\d+\.xml$/.test(n)).sort(byNumber);
  const themes = themeParts.flatMap((n) => {
    const name = attr(first(part(n) ?? "", "theme"), "name");
    return name ? [collapse(name, 100)] : [];
  });

  const masters = pkg.names
    .filter((n) => /^ppt\/slideMasters\/slideMaster\d+\.xml$/.test(n))
    .sort(byNumber)
    .map((n) => cSldName(part(n)) ?? `Master ${partNumber(n)}`);
  const layoutNames = new Map<string, string>();
  for (const n of pkg.names.filter((name) => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(name)).sort(byNumber)) {
    layoutNames.set(n, cSldName(part(n)) ?? `Layout ${partNumber(n)}`);
  }

  const presentationRels = relTargets(part("ppt/_rels/presentation.xml.rels"), "ppt/presentation.xml");
  const listed = elements(first(presentation, "sldIdLst")?.inner ?? "", "sldId");
  const fromList = listed.flatMap((el) => {
    const target = presentationRels.get(attr(el, "r:id") ?? "");
    return target ? [target] : [];
  });
  const slideParts = fromList.length > 0 ? fromList : pkg.names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort(byNumber);
  const slideCount = listed.length || slideParts.length;

  const parsed = slideParts.slice(0, JOB_LIMITS.ooxmlPartsParsed);
  if (slideParts.length > parsed.length || parsed.length > JOB_LIMITS.slidesDetailed) truncated = true;
  const xmls: string[] = [];
  const slides: SlideFacts[] = [];
  parsed.forEach((slidePart, i) => {
    const xml = part(slidePart);
    if (xml === undefined) {
      truncated = true;
      return;
    }
    xmls.push(xml);
    if (i >= JOB_LIMITS.slidesDetailed) return;
    const layoutPart = [...relTargets(part(relsPathFor(slidePart)), slidePart).values()].find((t) => /slideLayouts\/slideLayout\d+\.xml$/.test(t));
    slides.push(slideFacts(xml, i + 1, layoutPart ? (layoutNames.get(layoutPart) ?? null) : null));
  });

  const fontsUsed: string[] = [];
  for (const xml of xmls) {
    for (const latin of elements(xml, "latin")) {
      const face = attr(latin, "typeface");
      if (!face || face.startsWith("+") || fontsUsed.includes(face) || fontsUsed.length >= 12) continue;
      fontsUsed.push(collapse(face, 100));
    }
  }

  return {
    kind: "PPTX",
    slideSize,
    theme: readTheme(part(themeParts[0])),
    themes,
    masters,
    layouts: [...layoutNames.values()],
    slideCount,
    slides,
    colorsUsed: topColors(xmls, 12),
    fontsUsed,
    truncated,
  };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/lib/skills/files/pptx.test.ts && npx tsc --noEmit`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/skills/files/pptx.ts src/lib/skills/files/pptx.test.ts
git commit -m "feat(skills-builder): extract slide size, theme, layouts and slide structure from PowerPoint files"
```

---

### Task 5: Word facts

**Files:**
- Create: `apps/web/src/lib/skills/files/docx.ts`
- Test: `apps/web/src/lib/skills/files/docx.test.ts`

**Interfaces:**
- Consumes: `OoxmlPackage`, `openOoxml`, `readTheme`, `toHex` (Task 3); `elements`, `first`, `attr`, `textOf`, `collapse`, `XmlElement` (Task 3); `buildDocx`, `DEFAULT_DOCX_STYLES` (Task 3, tests).
- Produces: `extractDocx(pkg: OoxmlPackage): DocxFacts`.

Rules this task pins (spec, stage 2, DOCX): defaults from `w:docDefaults` (`w:rFonts@w:ascii`, else `@w:hAnsi`; `w:sz` half-points ÷ 2); styles keep those the document references (`w:pStyle`, `w:rStyle`, `w:tblStyle`) plus `Normal`, `Title`, `Heading1`–`Heading6`, at most 40 (more sets `truncated`); `w:color@w:val="auto"` is `null`; bold is `w:b` unless `w:val` is `0`/`false`; headings are paragraphs styled `Title` (level 0), `HeadingN`, or a style whose name is `heading N`, at most 100, each ≤ 200 chars; paragraph count includes paragraphs in tables; `images` counts `w:drawing`; the page comes from the last `w:sectPr/w:pgSz` (twips ÷ 1440), landscape when `w:orient="landscape"` or wider than tall; the text sample is non-empty paragraphs joined by newlines, cut at 4 000 chars (cutting sets `truncated`).

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/skills/files/docx.test.ts
import { describe, expect, it } from "vitest";
import { extractDocx } from "./docx";
import { buildDocx, DEFAULT_DOCX_STYLES } from "./fixtures";
import { openOoxml } from "./ooxml";

const facts = (opts: Parameters<typeof buildDocx>[0] = {}) => extractDocx(openOoxml(buildDocx(opts)));

describe("extractDocx", () => {
  it("reads the document defaults and theme", () => {
    const f = facts({ defaults: { font: "Inter", sizePt: 10.5 }, theme: { colors: { accent1: "1F4E79" }, majorFont: "Georgia" } });
    expect(f.kind).toBe("DOCX");
    expect(f.defaults).toEqual({ font: "Inter", sizePt: 10.5 });
    expect(f.theme?.majorFont).toBe("Georgia");
    expect(f.theme?.colors.find((c) => c.slot === "accent1")?.hex).toBe("#1F4E79");
  });

  it("reads each style's font, size, colour, weight and parent; 'auto' colour is no colour", () => {
    const f = facts({ paragraphs: [{ text: "A quote", style: "Quote" }] });
    expect(f.styles.find((s) => s.id === "Heading1")).toEqual({
      id: "Heading1",
      name: "heading 1",
      type: "paragraph",
      basedOn: "Normal",
      font: "Georgia",
      sizePt: 16,
      color: "#2F5496",
      bold: true,
    });
    expect(f.styles.find((s) => s.id === "Quote")).toMatchObject({ color: null, bold: false, font: null, sizePt: null });
  });

  it("keeps styles the document uses plus Normal, Title and Heading1-6, at most 40", () => {
    const extra = Array.from({ length: 50 }, (_, i) => ({ id: `Custom${i}`, name: `Custom ${i}` }));
    const f = facts({
      styles: [...DEFAULT_DOCX_STYLES, ...extra],
      paragraphs: [{ text: "Uses one custom style", style: "Custom3" }],
    });
    expect(f.styles.map((s) => s.id)).toEqual(["Normal", "Title", "Heading1", "Heading2", "Custom3"]);

    const many = facts({ styles: extra, paragraphs: extra.map((s) => ({ text: s.name, style: s.id })) });
    expect(many.styles).toHaveLength(40);
    expect(many.truncated).toBe(true);
  });

  it("lists headings with levels, Title as 0, and matches custom styles named 'heading N'", () => {
    const f = facts({
      styles: [...DEFAULT_DOCX_STYLES, { id: "MyHeading", name: "heading 2" }],
      paragraphs: [
        { text: "Board update", style: "Title" },
        { text: "Summary", style: "Heading1" },
        { text: "Revenue", style: "MyHeading" },
        { text: "Plain text" },
      ],
    });
    expect(f.headings).toEqual([
      { level: 0, text: "Board update" },
      { level: 1, text: "Summary" },
      { level: 2, text: "Revenue" },
    ]);
  });

  it("counts paragraphs, tables and images and reads the page from the last section", () => {
    const f = facts({ paragraphs: [{ text: "One" }, { text: "Two" }], tables: 2, images: 1, page: { widthIn: 11.69, heightIn: 8.27, orientation: "landscape" } });
    expect(f.paragraphs).toBe(5);
    expect(f.tables).toBe(2);
    expect(f.images).toBe(1);
    expect(f.page).toEqual({ widthIn: 11.69, heightIn: 8.27, orientation: "landscape" });
    expect(facts().page).toEqual({ widthIn: 8.5, heightIn: 11, orientation: "portrait" });
  });

  it("keeps a text sample of at most 4000 characters", () => {
    const f = facts({ paragraphs: Array.from({ length: 200 }, (_, i) => ({ text: `Paragraph ${i} ${"word ".repeat(10)}` })) });
    expect(f.textSample.length).toBe(4000);
    expect(f.textSample.startsWith("Paragraph 0 word")).toBe(true);
    expect(f.truncated).toBe(true);
    expect(facts().textSample).toBe("Monthly board update\nSummary\nRevenue grew 12% against plan.");
  });

  it("returns empty facts instead of throwing when the parts are missing", () => {
    expect(extractDocx({ names: [], parts: new Map(), truncated: false })).toMatchObject({ styles: [], headings: [], paragraphs: 0, page: null, textSample: "" });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/skills/files/docx.test.ts`
Expected: FAIL with `Failed to resolve import "./docx"`.

- [ ] **Step 3: Implement**

```ts
// apps/web/src/lib/skills/files/docx.ts
import { readTheme, toHex, type OoxmlPackage } from "./ooxml";
import type { DocxFacts, DocxStyle } from "./types";
import { attr, collapse, elements, first, textOf, type XmlElement } from "./xml";

const STYLE_TYPES = new Set<DocxStyle["type"]>(["paragraph", "character", "table", "numbering"]);
const ALWAYS_KEPT = new Set(["Normal", "Title", "Heading1", "Heading2", "Heading3", "Heading4", "Heading5", "Heading6"]);
const MAX_STYLES = 40;
const MAX_HEADINGS = 100;
const TEXT_SAMPLE_CHARS = 4000;
const TWIPS_PER_INCH = 1440;
const round2 = (value: number) => Math.round(value * 100) / 100;

function fontOf(rPr: string | undefined): string | null {
  const fonts = rPr ? first(rPr, "rFonts") : null;
  const face = attr(fonts, "ascii") ?? attr(fonts, "hAnsi");
  return face ? collapse(face, 100) : null;
}
function sizeOf(rPr: string | undefined): number | null {
  const halfPoints = Number(attr(rPr ? first(rPr, "sz") : null, "val"));
  return halfPoints > 0 ? halfPoints / 2 : null;
}
function colorOf(rPr: string | undefined): string | null {
  return toHex(attr(rPr ? first(rPr, "color") : null, "val"));
}
function boldOf(rPr: string | undefined): boolean {
  const b = rPr ? first(rPr, "b") : null;
  return b !== null && !["0", "false"].includes(attr(b, "val") ?? "");
}

function readStyle(el: XmlElement): DocxStyle {
  const id = attr(el, "styleId") ?? "";
  const type = (attr(el, "type") ?? "paragraph") as DocxStyle["type"];
  const rPr = first(el.inner, "rPr")?.inner;
  return {
    id,
    name: collapse(attr(first(el.inner, "name"), "val") ?? id, 100),
    type: STYLE_TYPES.has(type) ? type : "paragraph",
    basedOn: attr(first(el.inner, "basedOn"), "val"),
    font: fontOf(rPr),
    sizePt: sizeOf(rPr),
    color: colorOf(rPr),
    bold: boldOf(rPr),
  };
}

/** Title is level 0; HeadingN (by id) or "heading N" (by name) is level N. */
function headingLevel(styleId: string | null, byId: Map<string, DocxStyle>): number | null {
  if (!styleId) return null;
  const name = byId.get(styleId)?.name ?? "";
  if (styleId === "Title" || /^title$/i.test(name)) return 0;
  const match = /^heading\s?([1-6])$/i.exec(styleId) ?? /^heading ([1-6])$/i.exec(name);
  return match ? Number(match[1]) : null;
}

/** Facts from a Word package (spec, stage 2, DOCX). Missing parts give empty facts, never an exception. */
export function extractDocx(pkg: OoxmlPackage): DocxFacts {
  let truncated = pkg.truncated;
  const document = pkg.parts.get("word/document.xml") ?? "";
  const stylesXml = pkg.parts.get("word/styles.xml") ?? "";

  const defaultRPr = first(first(stylesXml, "docDefaults")?.inner ?? "", "rPr")?.inner;
  const allStyles = elements(stylesXml, "style").map(readStyle);
  const byId = new Map(allStyles.map((s) => [s.id, s]));

  const body = first(document, "body")?.inner ?? document;
  const used = new Set<string>();
  for (const ref of [...elements(body, "pStyle"), ...elements(body, "rStyle"), ...elements(body, "tblStyle")]) {
    const id = attr(ref, "val");
    if (id) used.add(id);
  }

  const headings: DocxFacts["headings"] = [];
  const paragraphs = elements(body, "p");
  let sample = "";
  for (const paragraph of paragraphs) {
    const text = collapse(textOf(paragraph.inner));
    if (!text) continue;
    const level = headingLevel(attr(first(first(paragraph.inner, "pPr")?.inner ?? "", "pStyle"), "val"), byId);
    if (level !== null) {
      if (headings.length < MAX_HEADINGS) headings.push({ level, text: text.slice(0, 200) });
      else truncated = true;
    }
    if (sample.length < TEXT_SAMPLE_CHARS) sample = sample ? `${sample}\n${text}` : text;
  }
  if (sample.length > TEXT_SAMPLE_CHARS) {
    sample = sample.slice(0, TEXT_SAMPLE_CHARS);
    truncated = true;
  }

  const kept = allStyles.filter((s) => used.has(s.id) || ALWAYS_KEPT.has(s.id));
  if (kept.length > MAX_STYLES) truncated = true;

  const pgSz = first(elements(document, "sectPr").at(-1)?.inner ?? "", "pgSz");
  const width = Number(attr(pgSz, "w"));
  const height = Number(attr(pgSz, "h"));
  const page =
    width > 0 && height > 0
      ? {
          widthIn: round2(width / TWIPS_PER_INCH),
          heightIn: round2(height / TWIPS_PER_INCH),
          orientation: attr(pgSz, "orient") === "landscape" || width > height ? ("landscape" as const) : ("portrait" as const),
        }
      : null;

  return {
    kind: "DOCX",
    theme: readTheme(pkg.parts.get("word/theme/theme1.xml")),
    defaults: { font: fontOf(defaultRPr), sizePt: sizeOf(defaultRPr) },
    styles: kept.slice(0, MAX_STYLES),
    headings,
    paragraphs: paragraphs.length,
    tables: elements(body, "tbl").length,
    images: elements(body, "drawing").length,
    page,
    textSample: sample,
    truncated,
  };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/lib/skills/files/docx.test.ts && npx tsc --noEmit`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/skills/files/docx.ts src/lib/skills/files/docx.test.ts
git commit -m "feat(skills-builder): extract styles, headings and page setup from Word files"
```

---

### Task 6: Excel facts

**Files:**
- Create: `apps/web/src/lib/skills/files/xlsx.ts`
- Test: `apps/web/src/lib/skills/files/xlsx.test.ts`

**Interfaces:**
- Consumes: `OoxmlPackage`, `openOoxml`, `readTheme`, `relTargets` (Task 3); `elements`, `first`, `attr`, `textOf`, `decodeXml`, `collapse`, `XmlElement` (Task 3); `buildXlsx` (Task 3, tests).
- Produces: `extractXlsx(pkg: OoxmlPackage): XlsxFacts`.

Rules this task pins (spec, stage 2, XLSX): sheets in `xl/workbook.xml` order resolved through `xl/_rels/workbook.xml.rels` (never by part number), at most 20 (more sets `truncated`); a sheet whose part is missing or skipped is listed with zero facts and sets `truncated`; the header row is the first `row`'s cells (≤ 30, each ≤ 80 chars) from shared strings (`t="s"`), inline strings (`t="inlineStr"`) or `v`; `rows` counts `row` elements; `formulas` counts every `f` (shared-formula children included) and `formulaSamples` keeps the first 10 distinct non-empty texts (≤ 120 chars); `numberFormats` are `numFmt@formatCode` (≤ 20); `charts` counts `xl/charts/chartN.xml` parts; `definedNames` ≤ 30.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/skills/files/xlsx.test.ts
import { describe, expect, it } from "vitest";
import { buildXlsx } from "./fixtures";
import { openOoxml } from "./ooxml";
import { extractXlsx } from "./xlsx";

const facts = (opts: Parameters<typeof buildXlsx>[0] = {}) => extractXlsx(openOoxml(buildXlsx(opts)));

describe("extractXlsx", () => {
  it("reads sheets in workbook order through the workbook rels, not the part numbers", () => {
    const f = facts({
      reverseFiles: true,
      sheets: [
        { name: "Summary", rows: [["Total"]] },
        { name: "Detail", rows: [["Line"], ["a"], ["b"]] },
      ],
    });
    expect(f.sheets.map((s) => [s.name, s.headerRow, s.rows])).toEqual([
      ["Summary", ["Total"], 1],
      ["Detail", ["Line"], 3],
    ]);
  });

  it("reads the header row from shared strings, inline strings and numbers", () => {
    const f = facts({
      sheets: [
        { name: "Shared", rows: [["Month", "Plan & Actual", 2026]] },
        { name: "Inline", rows: [["Region", "Owner"]], inlineStrings: true },
      ],
    });
    expect(f.sheets[0].headerRow).toEqual(["Month", "Plan & Actual", "2026"]);
    expect(f.sheets[1].headerRow).toEqual(["Region", "Owner"]);
    expect(f.sheets[0].dimension).toBe("A1:C1");
  });

  it("counts formulas and keeps the first ten distinct ones", () => {
    const rows = [["A", "B"], ...Array.from({ length: 14 }, (_, i) => [i, { formula: i % 2 === 0 ? `SUM(A1:A${i + 1})` : "A2*2" }])];
    const f = facts({ sheets: [{ name: "Calc", rows }] });
    expect(f.sheets[0].formulas).toBe(14);
    expect(f.sheets[0].formulaSamples).toHaveLength(8);
    expect(f.sheets[0].formulaSamples[0]).toBe("SUM(A1:A1)");
    expect(f.sheets[0].formulaSamples).toContain("A2*2");
    const many = facts({ sheets: [{ name: "Many", rows: Array.from({ length: 12 }, (_, i) => [{ formula: `B${i}+1` }]) }] });
    expect(many.sheets[0].formulaSamples).toHaveLength(10);
  });

  it("reads custom number formats, charts, defined names and the theme", () => {
    const f = facts({ numFmts: ['"$"#,##0', "0.0%"], charts: 2, definedNames: ["Total", "Plan"], theme: { colors: { accent1: "00B050" } } });
    expect(f.numberFormats).toEqual(['"$"#,##0', "0.0%"]);
    expect(f.charts).toBe(2);
    expect(f.definedNames).toEqual(["Total", "Plan"]);
    expect(f.theme?.colors.find((c) => c.slot === "accent1")?.hex).toBe("#00B050");
    expect(f.truncated).toBe(false);
  });

  it("describes at most 20 sheets and marks the facts truncated", () => {
    const f = facts({ sheets: Array.from({ length: 22 }, (_, i) => ({ name: `S${i + 1}`, rows: [["x"]] })) });
    expect(f.sheets).toHaveLength(20);
    expect(f.sheets[19].name).toBe("S20");
    expect(f.truncated).toBe(true);
  });

  it("returns empty facts instead of throwing when the parts are missing", () => {
    expect(extractXlsx({ names: [], parts: new Map(), truncated: false })).toMatchObject({ sheets: [], numberFormats: [], charts: 0, definedNames: [] });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/skills/files/xlsx.test.ts`
Expected: FAIL with `Failed to resolve import "./xlsx"`.

- [ ] **Step 3: Implement**

```ts
// apps/web/src/lib/skills/files/xlsx.ts
import { readTheme, relTargets, type OoxmlPackage } from "./ooxml";
import type { SheetFacts, XlsxFacts } from "./types";
import { attr, collapse, decodeXml, elements, first, textOf, type XmlElement } from "./xml";

const MAX_SHEETS = 20;
const MAX_HEADER_CELLS = 30;
const MAX_FORMULA_SAMPLES = 10;
const MAX_NUMBER_FORMATS = 20;
const MAX_DEFINED_NAMES = 30;
const ROW = /<(?:[A-Za-z_][\w.-]*:)?row(?=[\s/>])/g;

/** Facts from an Excel package (spec, stage 2, XLSX). Missing parts give empty facts, never an exception. */
export function extractXlsx(pkg: OoxmlPackage): XlsxFacts {
  let truncated = pkg.truncated;
  const workbook = pkg.parts.get("xl/workbook.xml") ?? "";
  const rels = relTargets(pkg.parts.get("xl/_rels/workbook.xml.rels"), "xl/workbook.xml");
  const shared = elements(pkg.parts.get("xl/sharedStrings.xml") ?? "", "si");

  const cellText = (cell: XmlElement): string => {
    const type = attr(cell, "t");
    if (type === "s") return collapse(textOf(shared[Number(textOf(cell.inner, "v"))]?.inner ?? ""), 80);
    if (type === "inlineStr") return collapse(textOf(first(cell.inner, "is")?.inner ?? ""), 80);
    return collapse(decodeXml(first(cell.inner, "v")?.inner ?? ""), 80);
  };

  const sheetElements = elements(first(workbook, "sheets")?.inner ?? "", "sheet");
  if (sheetElements.length > MAX_SHEETS) truncated = true;
  const sheets: SheetFacts[] = sheetElements.slice(0, MAX_SHEETS).map((sheet) => {
    const name = collapse(attr(sheet, "name") ?? "", 100);
    const path = rels.get(attr(sheet, "r:id") ?? "");
    const xml = path ? pkg.parts.get(path) : undefined;
    if (xml === undefined) {
      truncated = true;
      return { name, dimension: null, rows: 0, headerRow: [], formulas: 0, formulaSamples: [] };
    }
    const firstRow = first(xml, "row");
    const formulas = elements(xml, "f");
    const samples: string[] = [];
    for (const f of formulas) {
      const text = collapse(decodeXml(f.inner), 120);
      if (text && !samples.includes(text) && samples.length < MAX_FORMULA_SAMPLES) samples.push(text);
    }
    return {
      name,
      dimension: attr(first(xml, "dimension"), "ref"),
      rows: xml.match(ROW)?.length ?? 0,
      headerRow: firstRow ? elements(firstRow.inner, "c").slice(0, MAX_HEADER_CELLS).map(cellText) : [],
      formulas: formulas.length,
      formulaSamples: samples,
    };
  });

  const numberFormats = elements(pkg.parts.get("xl/styles.xml") ?? "", "numFmt").flatMap((fmt) => {
    const code = attr(fmt, "formatCode");
    return code ? [collapse(code, 100)] : [];
  });
  const definedNames = elements(first(workbook, "definedNames")?.inner ?? "", "definedName").flatMap((el) => {
    const name = attr(el, "name");
    return name ? [collapse(name, 100)] : [];
  });
  if (numberFormats.length > MAX_NUMBER_FORMATS || definedNames.length > MAX_DEFINED_NAMES) truncated = true;

  return {
    kind: "XLSX",
    theme: readTheme(pkg.parts.get("xl/theme/theme1.xml")),
    sheets,
    numberFormats: numberFormats.slice(0, MAX_NUMBER_FORMATS),
    charts: pkg.names.filter((n) => /^xl\/charts\/chart\d+\.xml$/.test(n)).length,
    definedNames: definedNames.slice(0, MAX_DEFINED_NAMES),
    truncated,
  };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/lib/skills/files/xlsx.test.ts && npx tsc --noEmit`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/skills/files/xlsx.ts src/lib/skills/files/xlsx.test.ts
git commit -m "feat(skills-builder): extract sheets, header rows, formulas and formats from Excel files"
```

---

### Task 7: PDF and image facts, asset names, and `readUpload`

**Files:**
- Modify: `apps/web/src/lib/skills/files/pdf.ts` (whole file; adds `extractPdf`)
- Create: `apps/web/src/lib/skills/files/image.ts`, `safe-name.ts`, `extract.ts`
- Test: `apps/web/src/lib/skills/files/pdf.test.ts`, `image.test.ts`, `safe-name.test.ts`, `extract.test.ts`

**Interfaces:**
- Consumes: `sniffFile` (Task 3), `extractPptx` (Task 4), `extractDocx` (Task 5), `extractXlsx` (Task 6), `KIND_MIME`, `KIND_EXTENSION`, `FileReadError`, `FILE_READ_MESSAGES` (Task 3), `JOB_LIMITS.factsBytes`, `JOB_LIMITS.imageEdgePx` (Task 1), `checkSkillPath` from `src/lib/skills/format.ts` (existing, tests), fixtures (Task 3).
- Produces:
  - `isEncryptedPdf(bytes: Uint8Array): boolean`, `extractPdf(bytes: Uint8Array): PdfFacts`
  - `extractImage(bytes: Uint8Array, kind: "PNG" | "JPEG"): Promise<ImageFacts>` (throws `FileReadError("FILE_UNREADABLE")`)
  - `imageForClaude(bytes: Uint8Array, kind: "PNG" | "JPEG"): Promise<{ mediaType: "image/png" | "image/jpeg"; base64: string }>`
  - `assetFileName(original: string, kind: SkillFileKind, taken: Iterable<string>): string`
  - `type ReadUpload = { kind: SkillFileKind; mimeType: string; facts: FileFacts; sha256: string }`, `readUpload(bytes: Uint8Array): Promise<ReadUpload>`, `boundFacts(facts: FileFacts, maxBytes?: number): FileFacts`

`assetFileName`, exactly: take the part after the last `/` or `\`; drop its last extension if it is 1–5 ASCII letters or digits; NFKD-normalise and strip combining marks; lower-case; replace every run of characters other than `a-z0-9` (dots included) with one `-`; trim leading/trailing `-`; cut to 80 characters (then trim a trailing `-`); empty becomes `file`; append `.` + `KIND_EXTENSION[kind]`; if the result is taken (case-insensitively), use `<base>-2.<ext>`, `<base>-3.<ext>`, …. So `deck.PPTX.exe` sniffed as PPTX is `deck-pptx.pptx`, and every result passes `checkSkillPath("assets/<name>")` and is at most 100 characters.

`boundFacts` trims arrays from the end in this order until the JSON is within the bound — PPTX: `slides`, `colorsUsed`, `fontsUsed`, `layouts`, `masters`, `themes`; DOCX: `headings`, `styles`, then halves `textSample`; XLSX: `sheets`, `definedNames`, `numberFormats` — sets `truncated`, and never mutates its input. Counts such as `slideCount` are kept.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/src/lib/skills/files/pdf.test.ts
import { describe, expect, it } from "vitest";
import { tinyPdf } from "./fixtures";
import { extractPdf, isEncryptedPdf } from "./pdf";

describe("PDF facts", () => {
  it("reads the version, the page count and the title", () => {
    expect(extractPdf(tinyPdf({ pages: 3, title: "Brand (2026) book" }))).toEqual({ kind: "PDF", version: "1.7", pages: 3, title: "Brand (2026) book" });
  });

  it("reports pages it cannot see as unknown, and no title as null", () => {
    const hidden = new TextEncoder().encode("%PDF-1.5\n1 0 obj << /Type /ObjStm /N 3 >> stream\nxx\nendstream endobj\n%%EOF");
    expect(extractPdf(hidden)).toEqual({ kind: "PDF", version: "1.5", pages: null, title: null });
  });

  it("does not count the page tree as a page", () => {
    expect(extractPdf(tinyPdf({ pages: 1 })).pages).toBe(1);
  });

  it("detects an /Encrypt dictionary", () => {
    expect(isEncryptedPdf(tinyPdf({ encrypted: true }))).toBe(true);
    expect(isEncryptedPdf(tinyPdf())).toBe(false);
  });
});
```

```ts
// apps/web/src/lib/skills/files/image.test.ts
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { tinyJpeg, tinyPng } from "./fixtures";
import { extractImage, imageForClaude } from "./image";
import { FileReadError } from "./types";

const code = (promise: Promise<unknown>) => promise.then(() => "resolved", (e: unknown) => (e instanceof FileReadError ? e.code : "other"));

describe("images", () => {
  it("reads PNG and JPEG dimensions", async () => {
    expect(await extractImage(await tinyPng(40, 30), "PNG")).toEqual({ kind: "PNG", width: 40, height: 30 });
    expect(await extractImage(await tinyJpeg(20, 10), "JPEG")).toEqual({ kind: "JPEG", width: 20, height: 10 });
  });

  it("refuses bytes that are not a decodable image of the sniffed kind", async () => {
    expect(await code(extractImage(await tinyPng(), "JPEG"))).toBe("FILE_UNREADABLE");
    const broken = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(32).fill(0)]);
    expect(await code(extractImage(broken, "PNG"))).toBe("FILE_UNREADABLE");
  });

  it("sends Claude a copy fitted inside 1568 px, same format, never enlarged", async () => {
    const big = await imageForClaude(await tinyPng(3000, 1000), "PNG");
    expect(big.mediaType).toBe("image/png");
    const meta = await sharp(Buffer.from(big.base64, "base64")).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["png", 1568, 523]);

    const small = await imageForClaude(await tinyJpeg(30, 20), "JPEG");
    const smallMeta = await sharp(Buffer.from(small.base64, "base64")).metadata();
    expect([small.mediaType, smallMeta.format, smallMeta.width, smallMeta.height]).toEqual(["image/jpeg", "jpeg", 30, 20]);
  });
});
```

```ts
// apps/web/src/lib/skills/files/safe-name.test.ts
import { describe, expect, it } from "vitest";
import { checkSkillPath } from "../format";
import { assetFileName } from "./safe-name";

describe("assetFileName", () => {
  it("makes a lower-case, hyphenated name with the sniffed kind's extension", () => {
    expect(assetFileName("Q3 Board Deck (final).pptx", "PPTX", [])).toBe("q3-board-deck-final.pptx");
    expect(assetFileName("deck.PPTX.exe", "PPTX", [])).toBe("deck-pptx.pptx");
    expect(assetFileName("photo.jpeg", "JPEG", [])).toBe("photo.jpg");
    expect(assetFileName("scan.png", "PDF", [])).toBe("scan.pdf");
  });

  it("drops leading dots, path parts, accents, emoji and quotes (Review Focus 5)", () => {
    expect(assetFileName(".hidden.docx", "DOCX", [])).toBe("hidden.docx");
    expect(assetFileName("C:\\Users\\me\\..\\Brand.xlsx", "XLSX", [])).toBe("brand.xlsx");
    expect(assetFileName("../../etc/passwd", "PDF", [])).toBe("passwd.pdf");
    expect(assetFileName("📊 Café “Board” deck.pptx", "PPTX", [])).toBe("cafe-board-deck.pptx");
    expect(assetFileName("会議資料.pptx", "PPTX", [])).toBe("file.pptx");
    expect(assetFileName("", "PNG", [])).toBe("file.png");
  });

  it("keeps names at most 100 characters", () => {
    const name = assetFileName(`${"a".repeat(300)}.pptx`, "PPTX", Array.from({ length: 50 }, (_, i) => (i === 0 ? `${"a".repeat(80)}.pptx` : `${"a".repeat(80)}-${i + 1}.pptx`)));
    expect(name).toBe(`${"a".repeat(80)}-51.pptx`);
    expect(name.length).toBeLessThanOrEqual(100);
  });

  it("makes names unique case-insensitively", () => {
    expect(assetFileName("Deck.pptx", "PPTX", ["DECK.PPTX"])).toBe("deck-2.pptx");
    expect(assetFileName("Deck.pptx", "PPTX", ["deck.pptx", "deck-2.pptx"])).toBe("deck-3.pptx");
  });

  it("always produces a path the skill validator accepts", () => {
    for (const original of ["a.pptx", ".x", "--.pdf", "  spaced  out .docx", "émoji 🎉.png", "x".repeat(500), "con.xlsx", "SKILL.md"]) {
      const check = checkSkillPath(`assets/${assetFileName(original, "PDF", [])}`);
      expect(check.ok, original).toBe(true);
    }
  });
});
```

```ts
// apps/web/src/lib/skills/files/extract.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ explode: false }));
vi.mock("./pptx", async (orig) => {
  const real = await orig<typeof import("./pptx")>();
  return {
    extractPptx: (...args: Parameters<typeof real.extractPptx>) => {
      if (mocks.explode) throw new TypeError("boom");
      return real.extractPptx(...args);
    },
  };
});

import { boundFacts, readUpload } from "./extract";
import { buildPptx, sha256Hex, tinyPdf, tinyPng } from "./fixtures";
import { FileReadError, KIND_MIME, type PptxFacts } from "./types";

beforeEach(() => {
  mocks.explode = false;
});

describe("readUpload", () => {
  it("returns the sniffed kind, the canonical MIME type, the facts and the SHA-256", async () => {
    const bytes = buildPptx();
    const read = await readUpload(bytes);
    expect(read.kind).toBe("PPTX");
    expect(read.mimeType).toBe(KIND_MIME.PPTX);
    expect(read.sha256).toBe(sha256Hex(bytes));
    expect(read.facts.kind).toBe("PPTX");
  });

  it("goes by the bytes, so a PNG is a PNG whatever it was called", async () => {
    const read = await readUpload(await tinyPng(8, 6));
    expect(read).toMatchObject({ kind: "PNG", mimeType: "image/png", facts: { kind: "PNG", width: 8, height: 6 } });
    expect((await readUpload(tinyPdf({ pages: 2 }))).facts).toMatchObject({ kind: "PDF", pages: 2 });
  });

  it("reports an extractor crash as an unreadable file, not a server error", async () => {
    mocks.explode = true;
    const error = await readUpload(buildPptx()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FileReadError);
    expect((error as FileReadError).code).toBe("FILE_UNREADABLE");
  });

  it("passes sniffing refusals through unchanged", async () => {
    const error = await readUpload(new Uint8Array([1, 2, 3])).catch((e: unknown) => e);
    expect((error as FileReadError).code).toBe("UNSUPPORTED_FILE");
  });
});

describe("boundFacts", () => {
  const huge = (): PptxFacts => ({
    kind: "PPTX",
    slideSize: null,
    theme: null,
    themes: [],
    masters: [],
    layouts: [],
    slideCount: 400,
    slides: Array.from({ length: 400 }, (_, i) => ({ index: i + 1, layout: null, title: `Slide ${i}`, placeholders: ["title"], text: "x".repeat(300), tables: 0, charts: 0, images: 0 })),
    colorsUsed: [],
    fontsUsed: [],
    truncated: false,
  });

  it("leaves facts that fit alone", () => {
    const small = { kind: "PDF" as const, version: "1.7", pages: 1, title: null };
    expect(boundFacts(small)).toBe(small);
  });

  it("trims oversized facts under 64 KB and marks them truncated", () => {
    const input = huge();
    const bounded = boundFacts(input) as PptxFacts;
    expect(Buffer.byteLength(JSON.stringify(bounded))).toBeLessThanOrEqual(64 * 1024);
    expect(bounded.truncated).toBe(true);
    expect(bounded.slides.length).toBeGreaterThan(100);
    expect(bounded.slides.length).toBeLessThan(400);
    expect(bounded.slideCount).toBe(400);
    expect(input.slides).toHaveLength(400);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/lib/skills/files/pdf.test.ts src/lib/skills/files/image.test.ts src/lib/skills/files/safe-name.test.ts src/lib/skills/files/extract.test.ts`
Expected: FAIL — `pdf.test.ts`: "extractPdf is not a function"; the others: `Failed to resolve import "./image"`, `"./safe-name"`, `"./extract"`.

- [ ] **Step 3: Implement**

Replace the whole of `apps/web/src/lib/skills/files/pdf.ts` with:

```ts
import type { PdfFacts } from "./types";

/** PDFs are read as Latin-1 text: only the header and uncompressed dictionary keys are looked at. */
const latin1 = (bytes: Uint8Array) => Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("latin1");

/** A PDF with an /Encrypt dictionary needs a password (or restricts reading); Claude can't read it. */
export function isEncryptedPdf(bytes: Uint8Array): boolean {
  return /\/Encrypt\b/.test(latin1(bytes));
}

const unescapeLiteral = (value: string) => value.replace(/\\([\\()])/g, "$1").replace(/\\[nrtbf]/g, " ");

/**
 * Header facts only (spec, stage 2, PDF): Claude reads the document itself. Page objects inside compressed
 * object streams are invisible here, so a count of 0 is reported as unknown (null), never as "no pages".
 */
export function extractPdf(bytes: Uint8Array): PdfFacts {
  const text = latin1(bytes);
  const pages = text.match(/\/Type\s*\/Page(?![A-Za-z])/g)?.length ?? 0;
  const title = /\/Title\s*\(((?:\\.|[^\\)])*)\)/.exec(text)?.[1];
  return {
    kind: "PDF",
    version: /^%PDF-(\d\.\d)/.exec(text)?.[1] ?? null,
    pages: pages > 0 ? pages : null,
    title: title ? unescapeLiteral(title).replace(/\s+/g, " ").trim().slice(0, 200) || null : null,
  };
}
```

```ts
// apps/web/src/lib/skills/files/image.ts
import sharp from "sharp";
import { JOB_LIMITS } from "../limits";
import { FILE_READ_MESSAGES, FileReadError, type ImageFacts } from "./types";

const FORMAT = { PNG: "png", JPEG: "jpeg" } as const;

/** Dimensions from the image header; bytes that are not a decodable image of the sniffed kind are unreadable. */
export async function extractImage(bytes: Uint8Array, kind: "PNG" | "JPEG"): Promise<ImageFacts> {
  try {
    const meta = await sharp(bytes, { failOn: "error" }).metadata();
    if (meta.format !== FORMAT[kind] || !meta.width || !meta.height) throw new Error("not the sniffed format");
    return { kind, width: meta.width, height: meta.height };
  } catch {
    throw new FileReadError("FILE_UNREADABLE", FILE_READ_MESSAGES.unreadable);
  }
}

/**
 * The copy Claude sees: rotated upright, fitted inside imageEdgePx x imageEdgePx (never enlarged), same format.
 * Always far under the API's per-image size limit; the original bytes are what the skill bundles.
 */
export async function imageForClaude(bytes: Uint8Array, kind: "PNG" | "JPEG"): Promise<{ mediaType: "image/png" | "image/jpeg"; base64: string }> {
  const edge = JOB_LIMITS.imageEdgePx;
  const resized = sharp(bytes, { failOn: "error" }).rotate().resize(edge, edge, { fit: "inside", withoutEnlargement: true });
  const out = kind === "PNG" ? await resized.png().toBuffer() : await resized.jpeg({ quality: 85 }).toBuffer();
  return { mediaType: kind === "PNG" ? "image/png" : "image/jpeg", base64: out.toString("base64") };
}
```

```ts
// apps/web/src/lib/skills/files/safe-name.ts
import { KIND_EXTENSION, type SkillFileKind } from "./types";

const BASE_MAX = 80;

/**
 * The file's name under assets/: lower-case ASCII letters, digits and single hyphens, then the extension of the
 * sniffed kind (never the uploaded one, so "deck.PPTX.exe" sniffed as PPTX is "deck-pptx.pptx"). The upload's
 * last extension (1-5 letters or digits) is dropped first; any other dots become hyphens, so a name never starts
 * with a dot and has exactly one. Unique case-insensitively against `taken` with -2, -3, … At most 100 characters.
 */
export function assetFileName(original: string, kind: SkillFileKind, taken: Iterable<string>): string {
  const leaf = original.split(/[\\/]/).pop() ?? "";
  const base =
    leaf
      .replace(/\.[A-Za-z0-9]{1,5}$/, "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, BASE_MAX)
      .replace(/-+$/g, "") || "file";
  const extension = KIND_EXTENSION[kind];
  const used = new Set([...taken].map((name) => name.toLowerCase()));
  let candidate = `${base}.${extension}`;
  for (let n = 2; used.has(candidate); n += 1) candidate = `${base}-${n}.${extension}`;
  return candidate;
}
```

```ts
// apps/web/src/lib/skills/files/extract.ts
import { createHash } from "node:crypto";
import { JOB_LIMITS } from "../limits";
import { extractDocx } from "./docx";
import { extractImage } from "./image";
import { extractPdf } from "./pdf";
import { extractPptx } from "./pptx";
import { sniffFile } from "./sniff";
import { FILE_READ_MESSAGES, FileReadError, KIND_MIME, type FileFacts, type SkillFileKind } from "./types";
import { extractXlsx } from "./xlsx";

export type ReadUpload = { kind: SkillFileKind; mimeType: string; facts: FileFacts; sha256: string };

const jsonBytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), "utf8");

/** Arrays trimmed from the end, in this order, until the facts fit. */
const TRIMMABLE: Record<FileFacts["kind"], string[]> = {
  PPTX: ["slides", "colorsUsed", "fontsUsed", "layouts", "masters", "themes"],
  DOCX: ["headings", "styles"],
  XLSX: ["sheets", "definedNames", "numberFormats"],
  PDF: [],
  PNG: [],
  JPEG: [],
};

/** Keeps stored facts within maxBytes of JSON (spec, Limits): trims arrays, then the DOCX text sample, and sets truncated. */
export function boundFacts(facts: FileFacts, maxBytes: number = JOB_LIMITS.factsBytes): FileFacts {
  if (jsonBytes(facts) <= maxBytes) return facts;
  const copy = structuredClone(facts) as FileFacts & Record<string, unknown>;
  if ("truncated" in copy) copy.truncated = true;
  for (const key of TRIMMABLE[copy.kind]) {
    const list = copy[key] as unknown[];
    while (list.length > 0 && jsonBytes(copy) > maxBytes) list.pop();
    if (jsonBytes(copy) <= maxBytes) return copy;
  }
  if (copy.kind === "DOCX") {
    while (copy.textSample.length > 0 && jsonBytes(copy) > maxBytes) copy.textSample = copy.textSample.slice(0, Math.floor(copy.textSample.length / 2));
  }
  return copy;
}

/** Stage 1 and 2 of the pipeline: sniff, extract, bound. Any extractor failure is the user-facing "unreadable". */
export async function readUpload(bytes: Uint8Array): Promise<ReadUpload> {
  const sniffed = sniffFile(bytes);
  let facts: FileFacts;
  try {
    switch (sniffed.kind) {
      case "PPTX":
        facts = extractPptx(sniffed.pkg);
        break;
      case "DOCX":
        facts = extractDocx(sniffed.pkg);
        break;
      case "XLSX":
        facts = extractXlsx(sniffed.pkg);
        break;
      case "PDF":
        facts = extractPdf(bytes);
        break;
      default:
        facts = await extractImage(bytes, sniffed.kind);
    }
  } catch (error) {
    if (error instanceof FileReadError) throw error;
    throw new FileReadError("FILE_UNREADABLE", FILE_READ_MESSAGES.unreadable);
  }
  return {
    kind: sniffed.kind,
    mimeType: KIND_MIME[sniffed.kind],
    facts: boundFacts(facts),
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/skills/files && npx tsc --noEmit`
Expected: PASS (64 tests across the ten `files/` test files).

- [ ] **Step 5: Commit**

```bash
git add src/lib/skills/files/pdf.ts src/lib/skills/files/image.ts src/lib/skills/files/safe-name.ts src/lib/skills/files/extract.ts src/lib/skills/files/pdf.test.ts src/lib/skills/files/image.test.ts src/lib/skills/files/safe-name.test.ts src/lib/skills/files/extract.test.ts
git commit -m "feat(skills-builder): read PDF and image facts, name assets safely and bound stored facts"
```

- [ ] **Step 6: Batch 1 gate**

```bash
cd "/Users/tharunkumarl/Full Stack/lms/apps/web"
npx vitest run && npx tsc --noEmit && npx eslint src/ && npx prisma migrate status
```
Expected: the whole suite passes (enhancer and legacy Skills Builder tests unchanged), no type or lint errors, and "Database schema is up to date". Do not start Batch 2 until this is green.

---

---

## Batch 2 — AI and routes (Tasks 8–15)

Batch 2 consumes Batch 1 exactly as the Interface Contract states: `JOB_LIMITS`, `ANALYSIS_TIMEOUT_MS`, `ANALYSIS_STALE_MS`, `SUGGEST_TIMEOUT_MS` (`src/lib/skills/limits.ts`), `readBytesWithin` (`src/lib/api/body.ts`), the `skill_analyze` feature, the five Prisma models, `src/lib/skills/files/types.ts`, `readUpload`, `imageForClaude` and `assetFileName`.

---

### Task 8: Job types, instructions and the three Claude calls

**Files:**
- Create: `apps/web/src/lib/skills/jobs/types.ts`
- Create: `apps/web/src/lib/skills/jobs/instructions.ts`
- Modify: `apps/web/src/lib/ai/claude.ts` (add imports at the top; append three calls at the end; `splitWork` and `generateSkillDraft` stay until Task 15)
- Test: `apps/web/src/lib/skills/jobs/instructions.test.ts`, `apps/web/src/lib/ai/claude.test.ts` (append one `describe`)

**Interfaces:**
- Consumes: `FileFacts`, `SkillFileKind` (`src/lib/skills/files/types.ts`); `JOB_LIMITS`, `ANALYSIS_TIMEOUT_MS`, `SUGGEST_TIMEOUT_MS`, `GENERATION_TIMEOUT_MS` (`src/lib/skills/limits.ts`); `PromptQuestionContext` (`src/lib/prompt-bot/instructions.ts`); `SkillFile`, `SkillItemStatus`, `SkillMatrixView` (`src/lib/skills/types.ts`); `AnswerView` (`src/lib/prompt-bot/sessions.ts`); the existing private `structured`, `object`, `STRING`, `getClient` in `claude.ts`.
- Produces:
  - `src/lib/skills/jobs/types.ts` exactly as in the Interface Contract (`AnalysisStatus`, `JobFileView`, `JobFileDetail`, `VersionSummary`, `JobSkillView`, `JobView`, `VersionAsset`, `VersionDetail`, `RawSuggestions`, `JobSkillDraft`).
  - `ANALYSE_SYSTEM: string` (contains "style guide"), `SUGGEST_SYSTEM: string`, `GENERATE_JOB_SYSTEM: string`
  - `buildAnalysisText(input: { fileName: string; kind: SkillFileKind; facts: FileFacts | null }): string`
  - `type PromptFile = { id: string; fileName: string; kind: SkillFileKind; size: number; analysis: string | null }`
  - `type ShippedFile = PromptFile & ({ shipping: "bundled"; path: string } | { shipping: "analysis-only"; reason: "too-large" | "over-budget" })`
  - `buildSuggestMessage(input: { title: string; description: string; questions: PromptQuestionContext[]; files: PromptFile[]; built: { name: string; purpose: string }[] }): string`
  - `buildJobGenerateMessage(input: { title: string; description: string; questions: PromptQuestionContext[]; skill: { name: string; purpose: string }; files: ShippedFile[] }): string`
  - `buildJobRetryMessage(original: string, draft: JobSkillDraft, errors: string[]): string`
  - `type AnalysisContent = { text: string; document?: { base64: string; title: string }; image?: { base64: string; mediaType: "image/png" | "image/jpeg" } }`
  - `analyseFile(content: AnalysisContent): Promise<string>`, `suggestJobSkills(message: string): Promise<RawSuggestions>`, `generateJobSkillDraft(message: string): Promise<JobSkillDraft>`

- [ ] **Step 1: Create the view types (no behaviour, so no test of their own)**

```ts
// apps/web/src/lib/skills/jobs/types.ts
import type { AnswerView } from "@/lib/prompt-bot/sessions";
import type { FileFacts, SkillFileKind } from "../files/types";
import type { SkillFile, SkillItemStatus, SkillMatrixView } from "../types";

export type AnalysisStatus = "PENDING" | "READY" | "FAILED";

export type JobFileView = {
  id: string;
  fileName: string;
  assetName: string;
  kind: SkillFileKind;
  size: number;
  createdAt: string;
  analysisStatus: AnalysisStatus;
  analysis: string | null;
  analysisEdited: boolean;
  analysisError: string | null;
  /** size <= JOB_LIMITS.assetBytes: can be bundled under assets/. */
  bundlable: boolean;
};
export type JobFileDetail = JobFileView & { facts: FileFacts | null };

export type VersionSummary = { version: number; name: string; createdAt: string; assets: number };

export type JobSkillView = {
  id: string;
  order: number;
  name: string;
  purpose: string;
  fileIds: string[];
  status: SkillItemStatus;
  validationErrors: string[];
  latestVersion: number;
  /** Newest first. */
  versions: VersionSummary[];
};

export type JobView = {
  id: string;
  title: string;
  description: string;
  scoreRevision: number;
  updatedAt: string;
  suggestedAt: string | null;
  matrix: SkillMatrixView;
  answers: AnswerView[];
  files: JobFileView[];
  skills: JobSkillView[];
};

export type VersionAsset = { fileId: string; path: string; fileName: string; bytes: number };
export type VersionDetail = {
  skillId: string;
  version: number;
  name: string;
  description: string;
  createdAt: string;
  files: SkillFile[];
  assets: VersionAsset[];
};

/** Suggest's structured reply before clean-up. */
export type RawSuggestions = { skills: { name: string; purpose: string; fileIds: string[] }[] };
/** Generation's structured reply. The server writes SKILL.md, the style guide and assets/. */
export type JobSkillDraft = {
  description: string;
  compatibility: string;
  body: string;
  references: { path: string; content: string }[];
  scripts: { path: string; content: string; purpose: string }[];
};
```

- [ ] **Step 2: Write the failing instructions test**

```ts
// apps/web/src/lib/skills/jobs/instructions.test.ts
import { describe, expect, it } from "vitest";
import type { PromptQuestionContext } from "@/lib/prompt-bot/instructions";
import {
  ANALYSE_SYSTEM,
  buildAnalysisText,
  buildJobGenerateMessage,
  buildJobRetryMessage,
  buildSuggestMessage,
  GENERATE_JOB_SYSTEM,
  SUGGEST_SYSTEM,
  type PromptFile,
  type ShippedFile,
} from "./instructions";

const questions: PromptQuestionContext[] = [
  { id: "q1", text: "When should this skill be used?", guidance: "Triggers", answer: "Every month before the board meeting.", score: 3, notRelevant: false },
  { id: "q2", text: "What inputs will it receive?", guidance: "Files and notes", answer: "", score: 1, notRelevant: false },
  { id: "q3", text: "What should it avoid?", guidance: "Mistakes", answer: "Ignored", score: 0, notRelevant: true },
];
const deck: PromptFile = { id: "f1", fileName: "Q3 board deck.pptx", kind: "PPTX", size: 2 * 1024 * 1024, analysis: "## Colours\n- #1F4E79 headings" };
const brand: PromptFile = { id: "f2", fileName: "Brand book.pdf", kind: "PDF", size: 14.2 * 1024 * 1024, analysis: null };

describe("system prompts", () => {
  it("name the job each call does", () => {
    expect(ANALYSE_SYSTEM).toContain("style guide");
    for (const heading of ["## Colours", "## Fonts", "## Layout", "## Structure", "## Tone and content", "## Reusing this file"]) {
      expect(ANALYSE_SYSTEM).toContain(heading);
    }
    expect(ANALYSE_SYSTEM).toContain("(approximate)");
    expect(SUGGEST_SYSTEM).toMatch(/usually exactly one/i);
    expect(SUGGEST_SYSTEM).toMatch(/already built/i);
    expect(GENERATE_JOB_SYSTEM).toContain("references/style-guide.md");
    expect(GENERATE_JOB_SYSTEM).toMatch(/never write references\/style-guide\.md/i);
    expect(GENERATE_JOB_SYSTEM).toMatch(/network/i);
  });
});

describe("buildAnalysisText", () => {
  it("wraps the facts in a file tag and never lets the name break the tag", () => {
    const text = buildAnalysisText({ fileName: 'Deck "final" <v2>.pptx', kind: "PPTX", facts: { kind: "PDF", version: "1.7", pages: 3, title: null } });
    expect(text).toContain('<file name="Deck final v2.pptx" kind="PPTX">');
    expect(text).toContain('"pages": 3');
    expect(text).toContain("</facts>");
  });

  it("says when no facts were extracted", () => {
    expect(buildAnalysisText({ fileName: "a.png", kind: "PNG", facts: null })).toContain("(none");
  });
});

describe("buildSuggestMessage", () => {
  const message = buildSuggestMessage({
    title: "Monthly board update",
    description: "I turn the numbers into a board deck.",
    questions,
    files: [deck, brand],
    built: [{ name: "board-deck", purpose: "Builds the deck." }],
  });

  it("lists answers, relevant gaps, files with ids and the skills already built", () => {
    expect(message).toContain("Monthly board update");
    expect(message).toContain("Q: When should this skill be used?\nA: Every month before the board meeting.");
    expect(message).toContain("- What inputs will it receive? (Files and notes)");
    expect(message).not.toContain("What should it avoid?");
    expect(message).toContain("id: f1");
    expect(message).toContain("name: Q3 board deck.pptx");
    expect(message).toContain("size: 2.0 MB");
    expect(message).toContain("#1F4E79 headings");
    expect(message).toContain("(no analysis yet)");
    expect(message).toContain("- board-deck: Builds the deck.");
  });

  it("cuts long analyses to the excerpt length", () => {
    const long = buildSuggestMessage({ title: "t", description: "d", questions: [], files: [{ ...deck, analysis: "x".repeat(5000) }], built: [] });
    expect(long).toContain("x".repeat(1500));
    expect(long).not.toContain("x".repeat(1501));
    expect(long).toContain("<already_built>\n(none)\n</already_built>");
  });
});

describe("buildJobGenerateMessage", () => {
  const files: ShippedFile[] = [
    { ...deck, shipping: "bundled", path: "assets/q3-board-deck.pptx" },
    { ...brand, shipping: "analysis-only", reason: "too-large" },
    { ...deck, id: "f3", fileName: "Old deck.pptx", shipping: "analysis-only", reason: "over-budget" },
  ];
  const message = buildJobGenerateMessage({ title: "Board update", description: "I write it.", questions, skill: { name: "board-deck", purpose: "Builds the deck." }, files });

  it("says how each file ships and includes its whole analysis", () => {
    expect(message).toContain("<skill>\nname: board-deck\npurpose: Builds the deck.\n</skill>");
    expect(message).toContain('shipping="bundled at assets/q3-board-deck.pptx"');
    expect(message).toContain('shipping="analysis only (too large to bundle)"');
    expect(message).toContain('shipping="analysis only (over the 25 MB bundle budget)"');
    expect(message).toContain("## Colours\n- #1F4E79 headings");
    expect(message).toContain("No analysis available.");
    expect(message).toContain("<gaps>\n- What inputs will it receive? (Files and notes)\n</gaps>");
  });

  it("says when the skill uses no files", () => {
    expect(buildJobGenerateMessage({ title: "t", description: "d", questions: [], skill: { name: "a", purpose: "b" }, files: [] })).toContain("<files>\n(none)\n</files>");
  });
});

describe("buildJobRetryMessage", () => {
  it("appends the previous attempt and every error", () => {
    const draft = { description: "d", compatibility: "", body: "b", references: [], scripts: [] };
    const retry = buildJobRetryMessage("ORIGINAL", draft, ["SKILL.md: description cannot contain < or >", "\"x\": duplicate path"]);
    expect(retry.startsWith("ORIGINAL")).toBe(true);
    expect(retry).toContain(`<previous_attempt>\n${JSON.stringify(draft)}\n</previous_attempt>`);
    expect(retry).toContain("- SKILL.md: description cannot contain < or >\n- \"x\": duplicate path");
    expect(retry).toMatch(/fixed/);
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `cd apps/web && npx vitest run src/lib/skills/jobs/instructions.test.ts`
Expected: FAIL, "Failed to resolve import ./instructions".

- [ ] **Step 4: Write the instructions**

```ts
// apps/web/src/lib/skills/jobs/instructions.ts
/** The Jobs flow's instructions to Claude (spec: File Analysis Pipeline stage 3, Suggest Skills, Generate). */
import type { PromptQuestionContext } from "@/lib/prompt-bot/instructions";
import type { FileFacts, SkillFileKind } from "../files/types";
import { JOB_LIMITS } from "../limits";
import type { JobSkillDraft } from "./types";

export type PromptFile = { id: string; fileName: string; kind: SkillFileKind; size: number; analysis: string | null };
export type ShippedFile = PromptFile & ({ shipping: "bundled"; path: string } | { shipping: "analysis-only"; reason: "too-large" | "over-budget" });

export const ANALYSE_SYSTEM = `You write a style guide that another AI assistant will follow to produce new work that looks and reads exactly like the file you are given. The reader is that AI, not a person.

Write Markdown with these sections, in this order:
## Colours — every colour with its hex value and its role (headings, body text, accents, backgrounds, charts).
## Fonts — heading and body fonts, sizes and weights.
## Layout — slide size or page setup, masters and layouts or the page grid, margins and spacing.
## Structure — the order of slides, sections or sheets, recurring elements, tables and charts.
## Tone and content — voice, sentence length, terminology, how numbers are presented.
## Reusing this file — how to start from the original file instead of recreating it.

The facts were read from the file by a parser and are ground truth: use their hex values, font names and sizes exactly. Anything you only see in a PDF or an image and that is not in the facts must be marked "(approximate)". Never invent colours, fonts, numbers or names. Leave out a detail you cannot support rather than guess. Keep it to about 600 words. Output only the style guide.`;

export const SUGGEST_SYSTEM = `You help a senior leader turn one recurring job into their own Agent Skills: folders of instructions and files that an AI assistant loads whenever the job comes up, so it is done their way every time.

From the job description, their answers, and the files they uploaded, propose the skills that capture this job:
- Usually exactly one skill. Propose more only when the job has clearly separate parts with different inputs, outputs or audiences.
- Never split one job into its steps, and never propose a skill for a one-off task.
- Never repeat a skill listed under already built; propose only genuinely different parts, or none.
- name: short kebab-case, for example board-update-deck.
- purpose: one sentence saying what the skill produces and when it is used.
- fileIds: the ids of the uploaded files this skill should reuse (templates it produces from, references it follows). Use only ids from the files list.

Use only what the person wrote and what the files show. Never invent facts about them, their company or their numbers.`;

export const GENERATE_JOB_SYSTEM = `You write one Agent Skill: a folder that AI assistants such as Claude, Cursor and Codex load when a task matches. It captures a recurring job exactly as this person does it today. Return the skill as structured fields; the server writes the files.

- description: what the skill does and when to use it, in one paragraph of at most 1000 characters, phrased so the assistant reliably picks it up. Name the situations, requests and phrases that should trigger it. Never use the characters < or >.
- body: the SKILL.md instructions in Markdown, in the imperative, ideally under 500 lines. Write the job's steps as the person does them today, with the inputs they start from and the output they hand over. Explain why each instruction matters rather than writing rigid ALWAYS or NEVER rules.
- Look and voice: tell the assistant to follow references/style-guide.md for colours, fonts, layouts, structure and tone whenever the skill uses files. Never write references/style-guide.md yourself: the server writes it from the file analyses.
- Templates: when a file is bundled at assets/<name> and is a template (a deck, document or workbook), tell the assistant to start from that file and reuse its masters, layouts, styles and theme rather than recreating the design. A file marked analysis only is not in the skill; rely on the style guide for it.
- Never reference a file that is not listed in the files section.
- references: other stable context (background about the person, team or domain, worked examples) as Markdown files under references/, loaded only when needed.
- scripts: include a script only when a deterministic, repeatable helper is clearly useful. Scripts must not make network calls and must not read credentials, keys, tokens or environment secrets. Give each script a one-line purpose.
- compatibility: tools or runtimes the skill needs, or an empty string.
- Paths are relative to the skill folder, for example references/board-context.md, using letters, digits, dots, dashes and underscores only.

Never invent facts about the person, their company or their numbers. Where context is missing (the gaps list), write clearly marked placeholders such as [Add the board's preferred metrics here] in a references/ file, and tell the reader in the body to fill them in.`;

/** Strips the characters that would end the attribute or the tag. */
const attrSafe = (value: string) => value.replace(/["<>&]/g, "").replace(/\s+/g, " ").trim();
const megabytes = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
const excerpt = (analysis: string | null) => (analysis?.trim() ? analysis.trim().slice(0, JOB_LIMITS.analysisExcerptChars) : null);

function answeredAndGaps(questions: PromptQuestionContext[]) {
  const relevant = questions.filter((q) => !q.notRelevant);
  const answered = relevant
    .filter((q) => q.answer.trim())
    .map((q) => `Q: ${q.text}\nA: ${q.answer.trim()}`)
    .join("\n\n");
  const gaps = relevant
    .filter((q) => q.score < 3)
    .map((q) => `- ${q.text} (${q.guidance})`)
    .join("\n");
  return { answered: answered || "(none)", gaps: gaps || "(none)" };
}

const jobSection = (title: string, description: string) => `<job>\ntitle: ${title.trim() || "(untitled)"}\n\n${description.trim()}\n</job>`;

export function buildAnalysisText(input: { fileName: string; kind: SkillFileKind; facts: FileFacts | null }): string {
  const facts = input.facts ? JSON.stringify(input.facts, null, 1) : "(none: read the file itself)";
  return [
    `<file name="${attrSafe(input.fileName)}" kind="${input.kind}">`,
    `<facts>\n${facts}\n</facts>`,
    "</file>",
    "Write the style guide for this file.",
  ].join("\n");
}

export function buildSuggestMessage(input: {
  title: string;
  description: string;
  questions: PromptQuestionContext[];
  files: PromptFile[];
  built: { name: string; purpose: string }[];
}): string {
  const { answered, gaps } = answeredAndGaps(input.questions);
  const files = input.files
    .map((f) => {
      const analysis = excerpt(f.analysis);
      return `- id: ${f.id}\n  name: ${f.fileName}\n  kind: ${f.kind}\n  size: ${megabytes(f.size)}\n  <analysis>\n${analysis ?? "(no analysis yet)"}\n  </analysis>`;
    })
    .join("\n\n");
  const built = input.built.map((b) => `- ${b.name}: ${b.purpose}`).join("\n");
  return [
    jobSection(input.title, input.description),
    `<answers>\n${answered}\n</answers>`,
    `<gaps>\n${gaps}\n</gaps>`,
    `<files>\n${files || "(none)"}\n</files>`,
    `<already_built>\n${built || "(none)"}\n</already_built>`,
  ].join("\n\n");
}

function shippingText(file: ShippedFile): string {
  if (file.shipping === "bundled") return `bundled at ${file.path}`;
  return file.reason === "too-large" ? "analysis only (too large to bundle)" : "analysis only (over the 25 MB bundle budget)";
}

export function buildJobGenerateMessage(input: {
  title: string;
  description: string;
  questions: PromptQuestionContext[];
  skill: { name: string; purpose: string };
  files: ShippedFile[];
}): string {
  const { answered, gaps } = answeredAndGaps(input.questions);
  const files = input.files
    .map(
      (f) =>
        `<file name="${attrSafe(f.fileName)}" kind="${f.kind}" shipping="${shippingText(f)}">\n${f.analysis?.trim() || "No analysis available."}\n</file>`,
    )
    .join("\n\n");
  return [
    jobSection(input.title, input.description),
    `<answers>\n${answered}\n</answers>`,
    `<gaps>\n${gaps}\n</gaps>`,
    `<skill>\nname: ${input.skill.name}\npurpose: ${input.skill.purpose.trim()}\n</skill>`,
    `<files>\n${files || "(none)"}\n</files>`,
  ].join("\n\n");
}

export function buildJobRetryMessage(original: string, draft: JobSkillDraft, errors: string[]): string {
  return [
    original,
    `<previous_attempt>\n${JSON.stringify(draft)}\n</previous_attempt>`,
    `<validation_errors>\n${errors.map((e) => `- ${e}`).join("\n")}\n</validation_errors>`,
    "Your previous attempt failed the checks above. Return the complete skill again with every error fixed.",
  ].join("\n\n");
}
```

- [ ] **Step 5: Run it and watch it pass**

Run: `cd apps/web && npx vitest run src/lib/skills/jobs/instructions.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 6: Write the failing Claude-call tests**

Change the import line of `apps/web/src/lib/ai/claude.test.ts` from `import { generateSkillDraft, scoreQuestions, splitWork } from "./claude";` to:

```ts
import { analyseFile, generateJobSkillDraft, generateSkillDraft, scoreQuestions, splitWork, suggestJobSkills } from "./claude";
```

Append to the end of `apps/web/src/lib/ai/claude.test.ts`:

```ts
describe("skills builder job calls", () => {
  const text = (value: string, stop = "end_turn") => ({ content: [{ type: "text", text: value }], stop_reason: stop });

  it("analyses a PDF with Haiku: document block first, then the text, with the analysis timeout and one retry", async () => {
    mocks.create.mockResolvedValue(text("  ## Colours\n- #1F4E79  "));
    const result = await analyseFile({ text: "<file/>", document: { base64: "JVBERi0=", title: "brand.pdf" } });
    expect(result).toBe("## Colours\n- #1F4E79");
    const [args, options] = mocks.create.mock.calls[0];
    expect(args.model).toBe("claude-haiku-4-5");
    expect(args.max_tokens).toBe(3000);
    expect(args.system).toContain("style guide");
    expect(args.output_config).toBeUndefined();
    expect(args.messages).toEqual([
      {
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: "JVBERi0=" }, title: "brand.pdf" },
          { type: "text", text: "<file/>" },
        ],
      },
    ]);
    expect(options).toEqual({ timeout: 90_000, maxRetries: 1 });
    expect(mocks.betaCreate).not.toHaveBeenCalled();
  });

  it("sends an image block before the text for images, and only text for Office files", async () => {
    mocks.create.mockResolvedValue(text("guide"));
    await analyseFile({ text: "t", image: { base64: "iVBO", mediaType: "image/png" } });
    expect(mocks.create.mock.calls[0][0].messages[0].content).toEqual([
      { type: "image", source: { type: "base64", media_type: "image/png", data: "iVBO" } },
      { type: "text", text: "t" },
    ]);
    await analyseFile({ text: "facts only" });
    expect(mocks.create.mock.calls[1][0].messages[0].content).toEqual([{ type: "text", text: "facts only" }]);
  });

  it("keeps at most 12 000 characters of the analysis", async () => {
    mocks.create.mockResolvedValue(text("y".repeat(13_000)));
    expect(await analyseFile({ text: "t" })).toHaveLength(12_000);
  });

  it("reports a stopped, empty or text-less analysis as an AiResponseError", async () => {
    mocks.create.mockResolvedValueOnce(text("partial", "max_tokens"));
    await expect(analyseFile({ text: "t" })).rejects.toBeInstanceOf(AiResponseError);
    mocks.create.mockResolvedValueOnce(text("no", "refusal"));
    await expect(analyseFile({ text: "t" })).rejects.toBeInstanceOf(AiResponseError);
    mocks.create.mockResolvedValueOnce(text("   "));
    await expect(analyseFile({ text: "t" })).rejects.toBeInstanceOf(AiResponseError);
    mocks.create.mockResolvedValueOnce({ content: [], stop_reason: "end_turn" });
    await expect(analyseFile({ text: "t" })).rejects.toBeInstanceOf(AiResponseError);
  });

  it("refuses to analyse without a key", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(analyseFile({ text: "t" })).rejects.toBeInstanceOf(AiNotConfiguredError);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("suggests with Opus 5.5, the fallback, a skills schema with file ids, and a request-scoped timeout", async () => {
    const skills = { skills: [{ name: "board-deck", purpose: "Builds the deck.", fileIds: ["f1"] }] };
    mocks.betaCreate.mockResolvedValue(reply(skills));
    await expect(suggestJobSkills("message")).resolves.toEqual(skills);
    const [args, options] = mocks.betaCreate.mock.calls[0];
    expect(args.model).toBe("claude-opus-5-5");
    expect(args.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(args.fallbacks).toBe("default");
    expect(args.max_tokens).toBe(4000);
    const item = args.output_config.format.schema.properties.skills.items;
    expect(item.required).toEqual(["name", "purpose", "fileIds"]);
    expect(item.properties.fileIds).toEqual({ type: "array", items: { type: "string" } });
    expect(options).toEqual({ timeout: 100_000, maxRetries: 0 });
  });

  it("rejects a suggestion that does not match the schema", async () => {
    mocks.betaCreate.mockResolvedValue(reply({ skills: [{ name: "a", purpose: "b" }] }));
    await expect(suggestJobSkills("m")).rejects.toBeInstanceOf(AiResponseError);
  });

  it("generates a job draft without name or assets fields, with the long non-retrying request", async () => {
    const draft = { description: "d", compatibility: "", body: "b", references: [{ path: "references/x.md", content: "x" }], scripts: [] };
    mocks.betaCreate.mockResolvedValueOnce(reply(draft));
    await expect(generateJobSkillDraft("message")).resolves.toEqual(draft);
    const [args, options] = mocks.betaCreate.mock.calls[0];
    expect(Object.keys(args.output_config.format.schema.properties)).toEqual(["description", "compatibility", "body", "references", "scripts"]);
    expect(args.max_tokens).toBe(16000);
    expect(args.fallbacks).toBe("default");
    expect(options).toEqual({ timeout: 240_000, maxRetries: 0 });
    mocks.betaCreate.mockResolvedValueOnce({ content: [{ type: "text", text: "{" }], stop_reason: "max_tokens" });
    await expect(generateJobSkillDraft("m")).rejects.toThrow("max_tokens");
  });
});
```

- [ ] **Step 7: Run them and watch them fail**

Run: `cd apps/web && npx vitest run src/lib/ai/claude.test.ts`
Expected: FAIL, "analyseFile is not a function" (and the same for `suggestJobSkills`, `generateJobSkillDraft`); the existing tests still pass.

- [ ] **Step 8: Add the calls**

In `apps/web/src/lib/ai/claude.ts`, replace the import line `import { GENERATION_TIMEOUT_MS } from "@/lib/skills/limits";` with:

```ts
import { ANALYSIS_TIMEOUT_MS, GENERATION_TIMEOUT_MS, JOB_LIMITS, SUGGEST_TIMEOUT_MS } from "@/lib/skills/limits";
import { ANALYSE_SYSTEM, GENERATE_JOB_SYSTEM, SUGGEST_SYSTEM } from "@/lib/skills/jobs/instructions";
import type { JobSkillDraft, RawSuggestions } from "@/lib/skills/jobs/types";
```

Append to the end of `apps/web/src/lib/ai/claude.ts`:

```ts
// ---------------------------------------------------------------------------
// Skills Builder jobs (spec 2026-11-25)
// ---------------------------------------------------------------------------

/** What one file analysis sends: the facts text, plus the PDF or (resized) image itself when there is one. */
export type AnalysisContent = {
  text: string;
  document?: { base64: string; title: string };
  image?: { base64: string; mediaType: "image/png" | "image/jpeg" };
};

/** Analysis runs in after(): one 90 s attempt plus one SDK retry, inside the 5-minute stale window. */
const ANALYSE_REQUEST = { timeout: ANALYSIS_TIMEOUT_MS, maxRetries: 1 };
/** Suggest runs inside a request (120 s cap): one attempt. */
const SUGGEST_REQUEST = { timeout: SUGGEST_TIMEOUT_MS, maxRetries: 0 };
/** Job generation runs in after(); two attempts stay inside the generation stale window. */
const JOB_GENERATE_REQUEST = { timeout: GENERATION_TIMEOUT_MS, maxRetries: 0 };

/** Writes the readable style guide for one uploaded file (plain Markdown, Haiku). Document/image blocks go before the text. */
export async function analyseFile(content: AnalysisContent): Promise<string> {
  const blocks: Anthropic.ContentBlockParam[] = [];
  if (content.document) {
    blocks.push({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: content.document.base64 },
      title: content.document.title,
    });
  }
  if (content.image) {
    blocks.push({ type: "image", source: { type: "base64", media_type: content.image.mediaType, data: content.image.base64 } });
  }
  blocks.push({ type: "text", text: content.text });
  const response = await getClient().messages.create(
    { model: FAST_MODEL, max_tokens: 3000, system: ANALYSE_SYSTEM, messages: [{ role: "user", content: blocks }] },
    ANALYSE_REQUEST,
  );
  if (response.stop_reason === "max_tokens" || response.stop_reason === "refusal") {
    throw new AiResponseError(`Claude stopped with ${response.stop_reason}`);
  }
  const text = (response.content as ReadonlyArray<{ type: string; text?: string }>)
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("")
    .trim();
  if (!text) throw new AiResponseError("Claude returned no analysis");
  return text.slice(0, JOB_LIMITS.analysisChars);
}

const SuggestReply = z.object({
  skills: z.array(z.object({ name: z.string(), purpose: z.string(), fileIds: z.array(z.string()) })),
});

/** Proposes the skills for one job (spec, Suggest Skills). The caller applies cleanSuggestions. */
export async function suggestJobSkills(message: string): Promise<RawSuggestions> {
  return structured({
    model: BEST_MODEL,
    fallback: true,
    requestOptions: SUGGEST_REQUEST,
    system: SUGGEST_SYSTEM,
    user: message,
    schema: object({
      skills: { type: "array", items: object({ name: STRING, purpose: STRING, fileIds: { type: "array", items: STRING } }) },
    }),
    parse: SuggestReply,
    maxTokens: 4000,
  });
}

const JobFile = z.object({ path: z.string(), content: z.string() });
const JobDraftReply = z.object({
  description: z.string(),
  compatibility: z.string(),
  body: z.string(),
  references: z.array(JobFile),
  scripts: z.array(JobFile.extend({ purpose: z.string() })),
});

/** Writes one job skill as structured fields. No name (the skill row owns it) and no assets (the uploaded originals are). */
export async function generateJobSkillDraft(message: string): Promise<JobSkillDraft> {
  const file = object({ path: STRING, content: STRING });
  return structured({
    model: BEST_MODEL,
    fallback: true,
    requestOptions: JOB_GENERATE_REQUEST,
    system: GENERATE_JOB_SYSTEM,
    user: message,
    schema: object({
      description: STRING,
      compatibility: STRING,
      body: STRING,
      references: { type: "array", items: file },
      scripts: { type: "array", items: object({ path: STRING, content: STRING, purpose: STRING }) },
    }),
    parse: JobDraftReply,
    maxTokens: 16000,
  });
}
```

- [ ] **Step 9: Run them and watch them pass, then type-check**

Run: `cd apps/web && npx vitest run src/lib/ai/claude.test.ts src/lib/skills/jobs/instructions.test.ts && npx tsc --noEmit`
Expected: PASS; no type errors.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/lib/skills/jobs/types.ts apps/web/src/lib/skills/jobs/instructions.ts apps/web/src/lib/skills/jobs/instructions.test.ts apps/web/src/lib/ai/claude.ts apps/web/src/lib/ai/claude.test.ts
git commit -m "feat(skills-builder): add job instructions and the analyse, suggest and generate calls"
```

---

### Task 9: Job data layer, error mapping and job routes

**Files:**
- Create: `apps/web/src/lib/skills/matrix.ts`
- Modify: `apps/web/src/lib/skills/packs.ts` (remove the `loadSkillMatrix` function body and the `SKILL_MATRIX_SLUG` import; import and re-export it from `./matrix`)
- Create: `apps/web/src/lib/skills/jobs/staleness.ts`, `apps/web/src/lib/skills/jobs/errors.ts`, `apps/web/src/lib/skills/jobs/http.ts`, `apps/web/src/lib/skills/jobs/jobs.ts`
- Create: `apps/web/src/app/api/v1/prompt-bot/skill-jobs/route.ts`, `apps/web/src/app/api/v1/prompt-bot/skill-jobs/[id]/route.ts`, `apps/web/src/app/api/v1/prompt-bot/skill-jobs/[id]/answers/[questionId]/route.ts`, `apps/web/src/app/api/v1/prompt-bot/skill-jobs/[id]/score/route.ts`
- Test: `apps/web/src/lib/skills/matrix.test.ts`, `apps/web/src/lib/skills/jobs/staleness.test.ts`, `apps/web/src/lib/skills/jobs/http.test.ts`, `apps/web/src/lib/skills/jobs/jobs.test.ts`, `apps/web/src/app/api/v1/prompt-bot/skill-jobs/job-routes.test.ts`

**Interfaces:**
- Consumes: `JOB_LIMITS`, `ANALYSIS_STALE_MS`, `GENERATION_STALE_MS`; `scoreAndApply`, `toAnswerView`, `buildQuestionContext` (`src/lib/prompt-bot/score-run.ts`); `titleFrom` (`src/lib/prompt-bot/sessions.ts`); `AnswerBody`, `ScoreBody`, `answerFields` (`src/lib/prompt-bot/answer-input.ts`); `aiErrorResponse`; `FileReadError` (`src/lib/skills/files/types.ts`); `DuplicateSkillNameError` (`src/lib/skills/zip.ts`, existing); `SKILL_MATRIX_SLUG`; Task 8 view types.
- Produces (contract, plus the additive exports marked ✚):
  - `loadSkillMatrix(): Promise<SkillMatrixView>` (`src/lib/skills/matrix.ts`; `packs.ts` re-exports it)
  - staleness: `GENERATION_INTERRUPTED_MESSAGE`, `ANALYSIS_INTERRUPTED_MESSAGE`, `generationCutoff(now?)`, `analysisCutoff(now?)`, `isGenerating(status, startedAt, now?)`, `isAnalysing(status, startedAt, now?)`
  - errors: `JobNotFoundError`, `FileNotFoundError`, `SkillNotFoundError`, `VersionNotFoundError`, `AlreadyAnalysingError`, `AlreadyGeneratingError`, `FilesAnalysingError`, `TooManyFilesError`, `TooManySkillsError`, `EmptyDescriptionError`, `NothingToDownloadError`, `AssetMissingError`, `DuplicateNameError(skillName)`, ✚ `PackTooLargeError` (lives here; Task 14's `zip.ts` imports it from `@/lib/skills/jobs/errors` and re-exports it)
  - `jobErrorResponse(error: unknown): Response | null`, `unauthorized(): Response`, ✚ `notFound(what: "Job" | "File" | "Skill" | "Version" | "Question"): Response`
  - jobs: `fileViewOmit`, ✚ `skillInclude`, ✚ `type FileViewRow`, ✚ `type SkillViewRow`, `toFileView(row, now?)`, `toSkillView(row, now?)`, `loadJobView(jobId, userId, now?)`, `findOwnedJob(jobId, userId)`, `createJob(userId, input)`, `updateJob(jobId, userId, patch)`, `deleteJob(jobId, userId)`, `jobScoringBase(job, files)`, `runJobScoring(jobId, userId, revision)`, `saveJobAnswer(jobId, userId, questionId, fields): Promise<"saved" | "no-question">`, `activeFiles(jobId)`, `jobQuestionContext(jobId)`, ✚ `ensureJobAnswerRows(jobId, questionIds)`
  - Routes: `POST /api/v1/prompt-bot/skill-jobs`, `GET|PATCH|DELETE /skill-jobs/[id]`, `PUT /skill-jobs/[id]/answers/[questionId]`, `POST /skill-jobs/[id]/score`

- [ ] **Step 1: Write the failing tests for the matrix move, staleness and the error mapper**

```ts
// apps/web/src/lib/skills/matrix.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findFirst: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { promptMatrix: { findFirst: mocks.findFirst } } }));

import { loadSkillMatrix } from "./matrix";
import { loadSkillMatrix as fromPacks } from "./packs";

beforeEach(() => vi.clearAllMocks());

describe("loadSkillMatrix", () => {
  it("reads the active skill-definition questions in order", async () => {
    mocks.findFirst.mockResolvedValue({
      id: "pbm_skill_definition",
      name: "Skill definition",
      questions: [{ id: "pbq_skill_1", text: "When?", guidance: "Triggers", order: 0, element: null, isActive: true, matrixId: "m" }],
    });
    expect(await loadSkillMatrix()).toEqual({
      id: "pbm_skill_definition",
      name: "Skill definition",
      questions: [{ id: "pbq_skill_1", text: "When?", guidance: "Triggers", order: 0 }],
    });
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { slug: "skill-definition", kind: "SKILL", isActive: true },
      include: { questions: { where: { isActive: true }, orderBy: { order: "asc" } } },
    });
  });

  it("returns an empty matrix when it is not seeded, and packs.ts still exposes the same function", async () => {
    mocks.findFirst.mockResolvedValue(null);
    expect(await loadSkillMatrix()).toEqual({ id: "", name: "Skill definition", questions: [] });
    expect(fromPacks).toBe(loadSkillMatrix);
  });
});
```

```ts
// apps/web/src/lib/skills/jobs/staleness.test.ts
import { describe, expect, it } from "vitest";
import { analysisCutoff, generationCutoff, isAnalysing, isGenerating } from "./staleness";

const NOW = new Date("2026-11-25T12:00:00Z");
const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60_000);

describe("staleness", () => {
  it("treats analysis older than 5 minutes as interrupted", () => {
    expect(analysisCutoff(NOW)).toEqual(minutesAgo(5));
    expect(isAnalysing("PENDING", minutesAgo(4), NOW)).toBe(true);
    expect(isAnalysing("PENDING", minutesAgo(6), NOW)).toBe(false);
    expect(isAnalysing("PENDING", null, NOW)).toBe(false);
    expect(isAnalysing("READY", minutesAgo(1), NOW)).toBe(false);
  });

  it("treats generation older than 10 minutes as interrupted", () => {
    expect(generationCutoff(NOW)).toEqual(minutesAgo(10));
    expect(isGenerating("GENERATING", minutesAgo(9), NOW)).toBe(true);
    expect(isGenerating("GENERATING", minutesAgo(11), NOW)).toBe(false);
    expect(isGenerating("READY", minutesAgo(1), NOW)).toBe(false);
  });
});
```

```ts
// apps/web/src/lib/skills/jobs/http.test.ts
import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { AiNotConfiguredError } from "@/lib/ai/config";
import { AiResponseError } from "@/lib/ai/errors";
import { LimitReachedError } from "@/lib/ai/usage";
import { FileReadError, FILE_READ_MESSAGES } from "../files/types";
import { DuplicateSkillNameError } from "../zip";
import * as E from "./errors";
import { jobErrorResponse, notFound, unauthorized } from "./http";

async function body(res: Response | null) {
  expect(res).not.toBeNull();
  return { status: res!.status, ...(await res!.json()).error };
}

describe("jobErrorResponse", () => {
  it.each([
    [new E.JobNotFoundError(), 404, "NOT_FOUND", "Job not found"],
    [new E.FileNotFoundError(), 404, "NOT_FOUND", "File not found"],
    [new E.SkillNotFoundError(), 404, "NOT_FOUND", "Skill not found"],
    [new E.VersionNotFoundError(), 404, "NOT_FOUND", "Version not found"],
    [new E.AlreadyAnalysingError(), 409, "ALREADY_ANALYSING", "This file is still being analysed. Wait for it to finish."],
    [new E.AlreadyGeneratingError(), 409, "ALREADY_GENERATING", "A skill in this job is being written. Wait for it to finish."],
    [new E.FilesAnalysingError(), 409, "FILES_ANALYSING", "Wait until your files have been analysed."],
    [new E.TooManyFilesError(), 409, "TOO_MANY_FILES", "A job can have at most 10 files. Remove one to add another."],
    [new E.TooManySkillsError(), 409, "TOO_MANY_SKILLS", "A job can have at most 5 skills. Remove one to add another."],
    [new E.DuplicateNameError("board-deck"), 409, "DUPLICATE_NAME", 'A skill named "board-deck" is already in this job. Choose another name.'],
    [new E.EmptyDescriptionError(), 400, "VALIDATION_ERROR", "Describe the job first."],
    [new E.NothingToDownloadError(), 409, "NOTHING_TO_DOWNLOAD", "Generate at least one skill before downloading."],
    [new E.AssetMissingError(), 409, "ASSET_MISSING", "A file this version uses is no longer available. Generate the skill again."],
    [new E.PackTooLargeError(), 409, "PACK_TOO_LARGE", "This pack is over 100 MB. Download each skill on its own."],
    [new DuplicateSkillNameError("board-deck"), 409, "DUPLICATE_NAME", 'Two skills are named "board-deck". Rename one and generate it again.'],
  ])("maps %o", async (error, status, code, message) => {
    expect(await body(jobErrorResponse(error))).toEqual({ status, code, message });
  });

  it("uses a FileReadError's own code, status and message", async () => {
    expect(await body(jobErrorResponse(new FileReadError("UNSUPPORTED_FILE", FILE_READ_MESSAGES.macro)))).toEqual({
      status: 415,
      code: "UNSUPPORTED_FILE",
      message: FILE_READ_MESSAGES.macro,
    });
    expect((await body(jobErrorResponse(new FileReadError("FILE_ENCRYPTED", FILE_READ_MESSAGES.ole)))).status).toBe(422);
  });

  it("maps AI-layer errors with the enhancer's mapper", async () => {
    expect((await body(jobErrorResponse(new AiNotConfiguredError()))).code).toBe("AI_NOT_CONFIGURED");
    expect((await body(jobErrorResponse(new LimitReachedError("skill_analyze", new Date("2026-11-26T00:00:00Z"))))).status).toBe(429);
    expect((await body(jobErrorResponse(new AiResponseError("bad")))).code).toBe("AI_FAILED");
    expect((await body(jobErrorResponse(new Anthropic.APIConnectionError({ message: "down" })))).status).toBe(502);
  });

  it("returns null for anything that is not ours, so routes rethrow it", () => {
    expect(jobErrorResponse(new Error("database is down"))).toBeNull();
    expect(jobErrorResponse("x")).toBeNull();
  });

  it("builds the 401 and 404 responses", async () => {
    expect(await body(unauthorized())).toEqual({ status: 401, code: "UNAUTHORIZED", message: "Authentication required" });
    expect(await body(notFound("Question"))).toEqual({ status: 404, code: "NOT_FOUND", message: "Question not found" });
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd apps/web && npx vitest run src/lib/skills/matrix.test.ts src/lib/skills/jobs/staleness.test.ts src/lib/skills/jobs/http.test.ts`
Expected: FAIL, "Failed to resolve import ./matrix", "./staleness", "./http".

- [ ] **Step 3: Move the matrix loader, add staleness, errors and the mapper**

```ts
// apps/web/src/lib/skills/matrix.ts
import { prisma } from "@/lib/db/prisma";
import { SKILL_MATRIX_SLUG } from "./builtin-skill-matrix";
import type { SkillMatrixView } from "./types";

/** The active skill-definition questions, shared by jobs and legacy packs. */
export async function loadSkillMatrix(): Promise<SkillMatrixView> {
  const matrix = await prisma.promptMatrix.findFirst({
    where: { slug: SKILL_MATRIX_SLUG, kind: "SKILL", isActive: true },
    include: { questions: { where: { isActive: true }, orderBy: { order: "asc" } } },
  });
  return {
    id: matrix?.id ?? "",
    name: matrix?.name ?? "Skill definition",
    questions: matrix?.questions.map((q) => ({ id: q.id, text: q.text, guidance: q.guidance, order: q.order })) ?? [],
  };
}
```

In `apps/web/src/lib/skills/packs.ts`: delete the line `import { SKILL_MATRIX_SLUG } from "./builtin-skill-matrix";`, delete the whole `export async function loadSkillMatrix(): Promise<SkillMatrixView> { … }` function, and add after the imports:

```ts
import { loadSkillMatrix } from "./matrix";

export { loadSkillMatrix };
```

```ts
// apps/web/src/lib/skills/jobs/staleness.ts
import { ANALYSIS_STALE_MS, GENERATION_STALE_MS } from "../limits";

export const GENERATION_INTERRUPTED_MESSAGE = "Writing this skill was interrupted. Generate it again.";
export const ANALYSIS_INTERRUPTED_MESSAGE = "Analysing this file was interrupted. Analyse it again.";

export const generationCutoff = (now = new Date()) => new Date(now.getTime() - GENERATION_STALE_MS);
export const analysisCutoff = (now = new Date()) => new Date(now.getTime() - ANALYSIS_STALE_MS);

/** A fresh claim. An older GENERATING row was interrupted (a deploy, a crash) and may be claimed again. */
export function isGenerating(status: string, startedAt: Date | null, now = new Date()): boolean {
  return status === "GENERATING" && startedAt !== null && startedAt > generationCutoff(now);
}

/** A fresh analysis. An older PENDING row was interrupted and may be analysed again. */
export function isAnalysing(status: string, startedAt: Date | null, now = new Date()): boolean {
  return status === "PENDING" && startedAt !== null && startedAt > analysisCutoff(now);
}
```

```ts
// apps/web/src/lib/skills/jobs/errors.ts
/** Expected failures of the Jobs data layer. Routes turn them into responses with jobErrorResponse. */
class NamedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class JobNotFoundError extends NamedError {
  constructor() {
    super("Job not found");
  }
}
export class FileNotFoundError extends NamedError {
  constructor() {
    super("File not found");
  }
}
export class SkillNotFoundError extends NamedError {
  constructor() {
    super("Skill not found");
  }
}
export class VersionNotFoundError extends NamedError {
  constructor() {
    super("Version not found");
  }
}
export class AlreadyAnalysingError extends NamedError {
  constructor() {
    super("This file is still being analysed");
  }
}
export class AlreadyGeneratingError extends NamedError {
  constructor() {
    super("A skill is being written");
  }
}
export class FilesAnalysingError extends NamedError {
  constructor() {
    super("Files are still being analysed");
  }
}
export class TooManyFilesError extends NamedError {
  constructor() {
    super("Too many files");
  }
}
export class TooManySkillsError extends NamedError {
  constructor() {
    super("Too many skills");
  }
}
export class EmptyDescriptionError extends NamedError {
  constructor() {
    super("The job has no description");
  }
}
export class NothingToDownloadError extends NamedError {
  constructor() {
    super("Nothing to download");
  }
}
export class AssetMissingError extends NamedError {
  constructor() {
    super("A bundled file is missing");
  }
}
/** The pack zip would exceed JOB_LIMITS.packZipBytes. zip.ts (Task 14) imports and re-exports this class. */
export class PackTooLargeError extends NamedError {
  constructor() {
    super("The pack is too large");
  }
}
export class DuplicateNameError extends NamedError {
  constructor(readonly skillName: string) {
    super(`A skill named "${skillName}" already exists`);
  }
}
```

```ts
// apps/web/src/lib/skills/jobs/http.ts
import { errorResponse } from "@/lib/api/response";
import { AiNotConfiguredError } from "@/lib/ai/config";
import { isAiCallError } from "@/lib/ai/errors";
import { LimitReachedError } from "@/lib/ai/usage";
import { aiErrorResponse } from "@/lib/prompt-bot/http";
import { FileReadError } from "../files/types";
import { JOB_LIMITS } from "../limits";
import { DuplicateSkillNameError } from "../zip";
import * as E from "./errors";

export const unauthorized = (): Response => errorResponse("Authentication required", "UNAUTHORIZED", 401);
export const notFound = (what: "Job" | "File" | "Skill" | "Version" | "Question"): Response =>
  errorResponse(`${what} not found`, "NOT_FOUND", 404);

const conflict = (code: string, message: string) => errorResponse(message, code, 409);

/** The one mapper for every skill-jobs route: domain errors, FileReadError, zip errors and AI-layer errors. Null = not ours, rethrow. */
export function jobErrorResponse(error: unknown): Response | null {
  if (error instanceof E.JobNotFoundError) return notFound("Job");
  if (error instanceof E.FileNotFoundError) return notFound("File");
  if (error instanceof E.SkillNotFoundError) return notFound("Skill");
  if (error instanceof E.VersionNotFoundError) return notFound("Version");
  if (error instanceof E.AlreadyAnalysingError) return conflict("ALREADY_ANALYSING", "This file is still being analysed. Wait for it to finish.");
  if (error instanceof E.AlreadyGeneratingError) return conflict("ALREADY_GENERATING", "A skill in this job is being written. Wait for it to finish.");
  if (error instanceof E.FilesAnalysingError) return conflict("FILES_ANALYSING", "Wait until your files have been analysed.");
  if (error instanceof E.TooManyFilesError) {
    return conflict("TOO_MANY_FILES", `A job can have at most ${JOB_LIMITS.filesPerJob} files. Remove one to add another.`);
  }
  if (error instanceof E.TooManySkillsError) {
    return conflict("TOO_MANY_SKILLS", `A job can have at most ${JOB_LIMITS.skillsPerJob} skills. Remove one to add another.`);
  }
  if (error instanceof E.DuplicateNameError) {
    return conflict("DUPLICATE_NAME", `A skill named "${error.skillName}" is already in this job. Choose another name.`);
  }
  if (error instanceof E.EmptyDescriptionError) return errorResponse("Describe the job first.", "VALIDATION_ERROR", 400);
  if (error instanceof E.NothingToDownloadError) return conflict("NOTHING_TO_DOWNLOAD", "Generate at least one skill before downloading.");
  if (error instanceof E.AssetMissingError) {
    return conflict("ASSET_MISSING", "A file this version uses is no longer available. Generate the skill again.");
  }
  if (error instanceof E.PackTooLargeError) {
    return conflict("PACK_TOO_LARGE", `This pack is over ${JOB_LIMITS.packZipBytes / (1024 * 1024)} MB. Download each skill on its own.`);
  }
  if (error instanceof DuplicateSkillNameError) {
    return conflict("DUPLICATE_NAME", `Two skills are named "${error.skillName}". Rename one and generate it again.`);
  }
  if (error instanceof FileReadError) return errorResponse(error.message, error.code, error.status);
  if (error instanceof LimitReachedError || error instanceof AiNotConfiguredError || isAiCallError(error)) return aiErrorResponse(error);
  return null;
}
```

- [ ] **Step 4: Run them and watch them pass**

Run: `cd apps/web && npx vitest run src/lib/skills/matrix.test.ts src/lib/skills/jobs/staleness.test.ts src/lib/skills/jobs/http.test.ts src/lib/skills/packs.test.ts`
Expected: PASS (the existing `packs.test.ts` still passes: its `promptMatrix.findFirst` mock now serves `matrix.ts`).

- [ ] **Step 5: Write the failing data-layer test**

```ts
// apps/web/src/lib/skills/jobs/jobs.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  jobFindFirst: vi.fn(),
  jobCreate: vi.fn(),
  jobUpdate: vi.fn(),
  jobDelete: vi.fn(),
  answerCreateMany: vi.fn(),
  answerUpdate: vi.fn(),
  answerUpsert: vi.fn(),
  answerFindMany: vi.fn(),
  fileFindMany: vi.fn(),
  matrixFindFirst: vi.fn(),
  transaction: vi.fn(),
  scoreQuestions: vi.fn(),
  consumeAiUsage: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    skillJob: { findFirst: mocks.jobFindFirst, create: mocks.jobCreate, update: mocks.jobUpdate, delete: mocks.jobDelete },
    skillJobAnswer: { createMany: mocks.answerCreateMany, update: mocks.answerUpdate, upsert: mocks.answerUpsert, findMany: mocks.answerFindMany },
    skillJobFile: { findMany: mocks.fileFindMany },
    promptMatrix: { findFirst: mocks.matrixFindFirst },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/ai/claude", () => ({ scoreQuestions: mocks.scoreQuestions }));
vi.mock("@/lib/ai/usage", () => ({ consumeAiUsage: mocks.consumeAiUsage }));

import { JobNotFoundError } from "./errors";
import {
  activeFiles,
  createJob,
  deleteJob,
  jobQuestionContext,
  jobScoringBase,
  loadJobView,
  runJobScoring,
  saveJobAnswer,
  toFileView,
  toSkillView,
  updateJob,
} from "./jobs";
import { ANALYSIS_INTERRUPTED_MESSAGE, GENERATION_INTERRUPTED_MESSAGE } from "./staleness";

const NOW = new Date("2026-11-25T12:00:00Z");
const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60_000);
const MATRIX = {
  id: "pbm_skill_definition",
  name: "Skill definition",
  questions: [
    { id: "pbq_skill_1", text: "When should this skill be used?", guidance: "Triggers", order: 0 },
    { id: "pbq_skill_2", text: "What inputs will it receive?", guidance: "Inputs", order: 1 },
  ],
};
const fileRow = (over: Record<string, unknown> = {}) => ({
  id: "f1",
  jobId: "j1",
  fileName: "Q3 deck.pptx",
  assetName: "q3-deck.pptx",
  kind: "PPTX",
  mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  size: 2_000_000,
  sha256: "abc",
  analysis: "## Colours\n- #1F4E79",
  analysisStatus: "READY",
  analysisStartedAt: minutesAgo(30),
  analysisEdited: false,
  analysisError: null,
  deletedAt: null,
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
}) as never;
const skillRow = (over: Record<string, unknown> = {}) => ({
  id: "s1",
  jobId: "j1",
  order: 0,
  name: "board-deck",
  purpose: "Builds the deck.",
  fileIds: ["f1"],
  status: "READY",
  validationErrors: [],
  generationStartedAt: null,
  latestVersion: 2,
  createdAt: NOW,
  updatedAt: NOW,
  versions: [
    { version: 2, name: "board-deck", createdAt: NOW, assetFileIds: ["f1"] },
    { version: 1, name: "old-name", createdAt: minutesAgo(60), assetFileIds: [] },
  ],
  ...over,
}) as never;
const answerRow = (questionId: string, over: Record<string, unknown> = {}) => ({
  id: `a-${questionId}`,
  jobId: "j1",
  questionId,
  answer: "",
  score: 0,
  reason: null,
  notRelevant: false,
  scoredAt: null,
  ...over,
});
const jobRow = (over: Record<string, unknown> = {}) => ({
  id: "j1",
  userId: "u1",
  title: "Board update",
  description: "Every month I turn the numbers into a deck.",
  scoreRevision: 3,
  suggestedAt: null,
  createdAt: NOW,
  updatedAt: NOW,
  answers: [answerRow("pbq_skill_1", { answer: "Monthly", score: 3, reason: "Clear" }), answerRow("pbq_old")],
  files: [fileRow()],
  skills: [skillRow()],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.matrixFindFirst.mockResolvedValue(MATRIX);
  mocks.transaction.mockImplementation(async (ops: unknown[]) => ops);
});

describe("toFileView", () => {
  it("shows a fresh analysis as pending and an old one as interrupted (Review Focus 1)", () => {
    expect(toFileView(fileRow({ analysisStatus: "PENDING", analysisStartedAt: minutesAgo(1), analysis: null }), NOW)).toMatchObject({
      analysisStatus: "PENDING",
      analysisError: null,
    });
    expect(toFileView(fileRow({ analysisStatus: "PENDING", analysisStartedAt: minutesAgo(6), analysis: null }), NOW)).toMatchObject({
      analysisStatus: "FAILED",
      analysisError: ANALYSIS_INTERRUPTED_MESSAGE,
    });
  });

  it("marks files over 10 MB as not bundlable and serialises dates", () => {
    expect(toFileView(fileRow(), NOW)).toEqual({
      id: "f1",
      fileName: "Q3 deck.pptx",
      assetName: "q3-deck.pptx",
      kind: "PPTX",
      size: 2_000_000,
      createdAt: NOW.toISOString(),
      analysisStatus: "READY",
      analysis: "## Colours\n- #1F4E79",
      analysisEdited: false,
      analysisError: null,
      bundlable: true,
    });
    expect(toFileView(fileRow({ size: 10 * 1024 * 1024 + 1 }), NOW).bundlable).toBe(false);
    expect(toFileView(fileRow({ size: 10 * 1024 * 1024 }), NOW).bundlable).toBe(true);
  });
});

describe("toSkillView", () => {
  it("lists versions newest first with their asset counts", () => {
    expect(toSkillView(skillRow(), NOW)).toEqual({
      id: "s1",
      order: 0,
      name: "board-deck",
      purpose: "Builds the deck.",
      fileIds: ["f1"],
      status: "READY",
      validationErrors: [],
      latestVersion: 2,
      versions: [
        { version: 2, name: "board-deck", createdAt: NOW.toISOString(), assets: 1 },
        { version: 1, name: "old-name", createdAt: minutesAgo(60).toISOString(), assets: 0 },
      ],
    });
  });

  it("shows an interrupted generation as failed and retryable", () => {
    expect(toSkillView(skillRow({ status: "GENERATING", generationStartedAt: minutesAgo(11) }), NOW)).toMatchObject({
      status: "FAILED",
      validationErrors: [GENERATION_INTERRUPTED_MESSAGE],
    });
    expect(toSkillView(skillRow({ status: "GENERATING", generationStartedAt: minutesAgo(2) }), NOW).status).toBe("GENERATING");
  });
});

describe("loadJobView", () => {
  it("returns null when the job is not the caller's", async () => {
    mocks.jobFindFirst.mockResolvedValue(null);
    expect(await loadJobView("j1", "u2", NOW)).toBeNull();
    expect(mocks.jobFindFirst.mock.calls[0][0].where).toEqual({ id: "j1", userId: "u2" });
  });

  it("never reads bytes or facts, skips removed files, and keeps only active answers", async () => {
    mocks.jobFindFirst.mockResolvedValue(jobRow());
    const view = await loadJobView("j1", "u1", NOW);
    const include = mocks.jobFindFirst.mock.calls[0][0].include;
    expect(include.files).toEqual({ where: { deletedAt: null }, omit: { data: true, facts: true }, orderBy: { createdAt: "asc" } });
    expect(include.skills.orderBy).toEqual({ order: "asc" });
    expect(include.skills.include.versions).toEqual({
      select: { version: true, name: true, createdAt: true, assetFileIds: true },
      orderBy: { version: "desc" },
    });
    expect(view).toMatchObject({
      id: "j1",
      title: "Board update",
      scoreRevision: 3,
      updatedAt: NOW.toISOString(),
      suggestedAt: null,
      matrix: MATRIX,
      answers: [{ questionId: "pbq_skill_1", answer: "Monthly", score: 3, reason: "Clear", notRelevant: false }],
    });
    expect(view?.files).toHaveLength(1);
    expect(view?.skills[0].versions).toHaveLength(2);
  });
});

describe("create, update and delete", () => {
  it("creates a job titled from the description's first line when no title is given", async () => {
    mocks.jobCreate.mockResolvedValue({ id: "j9" });
    expect(await createJob("u1", { description: "  Monthly board update\nwith numbers" })).toBe("j9");
    expect(mocks.jobCreate).toHaveBeenCalledWith({
      data: { userId: "u1", title: "Monthly board update", description: "Monthly board update\nwith numbers" },
      select: { id: true },
    });
    await createJob("u1", {});
    expect(mocks.jobCreate.mock.calls[1][0].data).toEqual({ userId: "u1", title: "Untitled job", description: "" });
    await createJob("u1", { title: " My job ", description: "x" });
    expect(mocks.jobCreate.mock.calls[2][0].data.title).toBe("My job");
  });

  it("updates only the owner's job and returns the view", async () => {
    mocks.jobFindFirst.mockResolvedValueOnce({ id: "j1", title: "t", description: "d" }).mockResolvedValueOnce(jobRow({ title: "New" }));
    const view = await updateJob("j1", "u1", { title: "New" });
    expect(mocks.jobUpdate).toHaveBeenCalledWith({ where: { id: "j1" }, data: { title: "New" } });
    expect(view.title).toBe("New");
    mocks.jobFindFirst.mockResolvedValueOnce(null);
    await expect(updateJob("j1", "u2", { title: "x" })).rejects.toBeInstanceOf(JobNotFoundError);
  });

  it("deletes only the owner's job", async () => {
    mocks.jobFindFirst.mockResolvedValueOnce({ id: "j1", title: "t", description: "d" });
    await deleteJob("j1", "u1");
    expect(mocks.jobDelete).toHaveBeenCalledWith({ where: { id: "j1" } });
    mocks.jobFindFirst.mockResolvedValueOnce(null);
    await expect(deleteJob("j1", "u2")).rejects.toBeInstanceOf(JobNotFoundError);
  });
});

describe("jobScoringBase", () => {
  it("reads the title, description and the start of each ready analysis", () => {
    const base = jobScoringBase({ title: "Board update", description: "I make the deck." }, [
      { fileName: "deck.pptx", analysis: "a".repeat(2000), analysisStatus: "READY" },
      { fileName: "broken.pdf", analysis: "should not appear", analysisStatus: "FAILED" },
      { fileName: "pending.png", analysis: null, analysisStatus: "PENDING" },
    ]);
    expect(base.startsWith("Job: Board update\nI make the deck.")).toBe(true);
    expect(base).toContain(`File: deck.pptx\n${"a".repeat(1500)}`);
    expect(base).not.toContain("a".repeat(1501));
    expect(base).not.toContain("broken.pdf");
    expect(base).not.toContain("pending.png");
  });

  it("caps the whole base at 12 000 characters", () => {
    const files = Array.from({ length: 10 }, (_, i) => ({ fileName: `f${i}`, analysis: "b".repeat(1500), analysisStatus: "READY" }));
    expect(jobScoringBase({ title: "t", description: "c".repeat(5000) }, files)).toHaveLength(12_000);
  });
});

describe("runJobScoring", () => {
  it("scores the job with its files and applies the result when the revision is current", async () => {
    mocks.jobFindFirst
      .mockResolvedValueOnce(jobRow({ files: [{ fileName: "deck.pptx", analysis: "#1F4E79 headings", analysisStatus: "READY" }] }))
      .mockResolvedValueOnce({ scoreRevision: 3 })
      .mockResolvedValueOnce(jobRow());
    mocks.scoreQuestions.mockResolvedValue([{ questionId: "pbq_skill_2", score: 2, reason: "Partly" }]);
    const result = await runJobScoring("j1", "u1", 3);
    expect(mocks.answerCreateMany).toHaveBeenCalledWith({
      data: [
        { jobId: "j1", questionId: "pbq_skill_1" },
        { jobId: "j1", questionId: "pbq_skill_2" },
      ],
      skipDuplicates: true,
    });
    expect(mocks.consumeAiUsage).toHaveBeenCalledWith("u1", "score");
    expect(mocks.scoreQuestions.mock.calls[0][0]).toContain("#1F4E79 headings");
    expect(mocks.answerUpdate).toHaveBeenCalledWith({
      where: { jobId_questionId: { jobId: "j1", questionId: "pbq_skill_2" } },
      data: { score: 2, reason: "Partly", scoredAt: expect.any(Date) },
    });
    expect(mocks.jobUpdate).toHaveBeenCalledWith({ where: { id: "j1" }, data: { scoreRevision: 3 } });
    expect(result.applied).toBe(true);
  });

  it("does not apply a stale revision", async () => {
    mocks.jobFindFirst.mockResolvedValueOnce(jobRow()).mockResolvedValueOnce({ scoreRevision: 7 });
    mocks.scoreQuestions.mockResolvedValue([]);
    expect(await runJobScoring("j1", "u1", 3)).toMatchObject({ applied: false, revision: 7 });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("refuses someone else's job before spending a unit", async () => {
    mocks.jobFindFirst.mockResolvedValueOnce(null);
    await expect(runJobScoring("j1", "u2", 0)).rejects.toBeInstanceOf(JobNotFoundError);
    expect(mocks.consumeAiUsage).not.toHaveBeenCalled();
  });
});

describe("answers and context", () => {
  it("saves only the fields sent, and only for an active question", async () => {
    mocks.jobFindFirst.mockResolvedValue({ id: "j1", title: "t", description: "d" });
    expect(await saveJobAnswer("j1", "u1", "pbq_skill_1", { notRelevant: true })).toBe("saved");
    expect(mocks.answerUpsert).toHaveBeenCalledWith({
      where: { jobId_questionId: { jobId: "j1", questionId: "pbq_skill_1" } },
      create: { jobId: "j1", questionId: "pbq_skill_1", notRelevant: true },
      update: { notRelevant: true },
    });
    expect(await saveJobAnswer("j1", "u1", "pbq_core_1", { answer: "x" })).toBe("no-question");
    mocks.jobFindFirst.mockResolvedValue(null);
    await expect(saveJobAnswer("j1", "u2", "pbq_skill_1", { answer: "x" })).rejects.toBeInstanceOf(JobNotFoundError);
  });

  it("lists active files without bytes and builds the question context", async () => {
    mocks.fileFindMany.mockResolvedValue([fileRow()]);
    await activeFiles("j1");
    expect(mocks.fileFindMany).toHaveBeenCalledWith({ where: { jobId: "j1", deletedAt: null }, omit: { data: true, facts: true }, orderBy: { createdAt: "asc" } });
    mocks.answerFindMany.mockResolvedValue([answerRow("pbq_skill_1", { answer: "Monthly", score: 3 })]);
    expect(await jobQuestionContext("j1")).toEqual([
      { id: "pbq_skill_1", text: "When should this skill be used?", guidance: "Triggers", answer: "Monthly", score: 3, notRelevant: false },
      { id: "pbq_skill_2", text: "What inputs will it receive?", guidance: "Inputs", answer: "", score: 0, notRelevant: false },
    ]);
  });
});
```

- [ ] **Step 6: Run it and watch it fail**

Run: `cd apps/web && npx vitest run src/lib/skills/jobs/jobs.test.ts`
Expected: FAIL, "Failed to resolve import ./jobs".

- [ ] **Step 7: Write the data layer**

```ts
// apps/web/src/lib/skills/jobs/jobs.ts
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { PromptQuestionContext } from "@/lib/prompt-bot/instructions";
import { buildQuestionContext, scoreAndApply, toAnswerView, type AnswerView } from "@/lib/prompt-bot/score-run";
import { titleFrom } from "@/lib/prompt-bot/sessions";
import { JOB_LIMITS } from "../limits";
import { loadSkillMatrix } from "../matrix";
import type { SkillItemStatus } from "../types";
import { JobNotFoundError } from "./errors";
import { ANALYSIS_INTERRUPTED_MESSAGE, GENERATION_INTERRUPTED_MESSAGE, isAnalysing, isGenerating } from "./staleness";
import type { AnalysisStatus, JobFileView, JobSkillView, JobView } from "./types";

/** Lists and views never read a file's bytes or its facts. */
export const fileViewOmit = { data: true, facts: true } as const satisfies Prisma.SkillJobFileOmit;
export const skillInclude = {
  versions: { select: { version: true, name: true, createdAt: true, assetFileIds: true }, orderBy: { version: "desc" } },
} as const satisfies Prisma.SkillJobSkillInclude;

export type FileViewRow = Prisma.SkillJobFileGetPayload<{ omit: typeof fileViewOmit }>;
export type SkillViewRow = Prisma.SkillJobSkillGetPayload<{ include: typeof skillInclude }>;

export function toFileView(row: FileViewRow, now = new Date()): JobFileView {
  let analysisStatus = row.analysisStatus as AnalysisStatus;
  let analysisError = row.analysisError;
  if (analysisStatus === "PENDING" && !isAnalysing(analysisStatus, row.analysisStartedAt, now)) {
    analysisStatus = "FAILED";
    analysisError = ANALYSIS_INTERRUPTED_MESSAGE;
  }
  return {
    id: row.id,
    fileName: row.fileName,
    assetName: row.assetName,
    kind: row.kind,
    size: row.size,
    createdAt: row.createdAt.toISOString(),
    analysisStatus,
    analysis: row.analysis,
    analysisEdited: row.analysisEdited,
    analysisError,
    bundlable: row.size <= JOB_LIMITS.assetBytes,
  };
}

export function toSkillView(row: SkillViewRow, now = new Date()): JobSkillView {
  let status = row.status as SkillItemStatus;
  let validationErrors = row.validationErrors;
  if (status === "GENERATING" && !isGenerating(status, row.generationStartedAt, now)) {
    status = "FAILED";
    validationErrors = [GENERATION_INTERRUPTED_MESSAGE];
  }
  return {
    id: row.id,
    order: row.order,
    name: row.name,
    purpose: row.purpose,
    fileIds: row.fileIds,
    status,
    validationErrors,
    latestVersion: row.latestVersion,
    versions: row.versions.map((v) => ({ version: v.version, name: v.name, createdAt: v.createdAt.toISOString(), assets: v.assetFileIds.length })),
  };
}

export async function loadJobView(jobId: string, userId: string, now = new Date()): Promise<JobView | null> {
  const job = await prisma.skillJob.findFirst({
    where: { id: jobId, userId },
    include: {
      answers: true,
      files: { where: { deletedAt: null }, omit: fileViewOmit, orderBy: { createdAt: "asc" } },
      skills: { include: skillInclude, orderBy: { order: "asc" } },
    },
  });
  if (!job) return null;
  const matrix = await loadSkillMatrix();
  const active = new Set(matrix.questions.map((q) => q.id));
  return {
    id: job.id,
    title: job.title,
    description: job.description,
    scoreRevision: job.scoreRevision,
    updatedAt: job.updatedAt.toISOString(),
    suggestedAt: job.suggestedAt?.toISOString() ?? null,
    matrix,
    answers: job.answers.filter((a) => active.has(a.questionId)).map(toAnswerView),
    files: job.files.map((f) => toFileView(f, now)),
    skills: job.skills.map((s) => toSkillView(s, now)),
  };
}

export function findOwnedJob(jobId: string, userId: string) {
  return prisma.skillJob.findFirst({ where: { id: jobId, userId }, select: { id: true, title: true, description: true } });
}

export async function createJob(userId: string, input: { title?: string; description?: string }): Promise<string> {
  const description = (input.description ?? "").trim();
  const title = input.title?.trim() || titleFrom(description, "Untitled job");
  const job = await prisma.skillJob.create({ data: { userId, title, description }, select: { id: true } });
  return job.id;
}

export async function updateJob(jobId: string, userId: string, patch: { title?: string; description?: string }): Promise<JobView> {
  if (!(await findOwnedJob(jobId, userId))) throw new JobNotFoundError();
  const data: Prisma.SkillJobUpdateInput = {};
  if (patch.title !== undefined) data.title = patch.title.trim();
  if (patch.description !== undefined) data.description = patch.description;
  await prisma.skillJob.update({ where: { id: jobId }, data });
  const view = await loadJobView(jobId, userId);
  if (!view) throw new JobNotFoundError();
  return view;
}

/** Answers, files (with bytes), skills and versions go with it (onDelete: Cascade). */
export async function deleteJob(jobId: string, userId: string): Promise<void> {
  if (!(await findOwnedJob(jobId, userId))) throw new JobNotFoundError();
  await prisma.skillJob.delete({ where: { id: jobId } });
}

/** What the scorer reads as the "prompt": the job plus the start of each ready analysis (spec, Questions and Scoring). */
export function jobScoringBase(
  job: { title: string; description: string },
  files: { fileName: string; analysis: string | null; analysisStatus: string }[],
): string {
  const parts = [`Job: ${job.title.trim()}\n${job.description.trim()}`];
  for (const file of files) {
    const analysis = file.analysis?.trim();
    if (file.analysisStatus === "READY" && analysis) parts.push(`File: ${file.fileName}\n${analysis.slice(0, JOB_LIMITS.analysisExcerptChars)}`);
  }
  return parts.join("\n\n").slice(0, JOB_LIMITS.scoringBaseChars);
}

export async function ensureJobAnswerRows(jobId: string, questionIds: string[]): Promise<void> {
  if (questionIds.length === 0) return;
  await prisma.skillJobAnswer.createMany({ data: questionIds.map((questionId) => ({ jobId, questionId })), skipDuplicates: true });
}

/** The enhancer's scoring flow for one job, applied only if `revision` is not stale. */
export async function runJobScoring(jobId: string, userId: string, revision: number): Promise<{ applied: boolean; revision: number; answers: AnswerView[] }> {
  const job = await prisma.skillJob.findFirst({
    where: { id: jobId, userId },
    include: {
      answers: true,
      files: { where: { deletedAt: null }, select: { fileName: true, analysis: true, analysisStatus: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!job) throw new JobNotFoundError();
  const matrix = await loadSkillMatrix();
  const active = new Set(matrix.questions.map((q) => q.id));
  return scoreAndApply({
    userId,
    revision,
    scoringBase: jobScoringBase(job, job.files),
    questions: matrix.questions,
    answers: job.answers.filter((a) => active.has(a.questionId)).map(toAnswerView),
    ensureRows: () => ensureJobAnswerRows(jobId, matrix.questions.map((q) => q.id)),
    readRevision: async () => (await prisma.skillJob.findFirst({ where: { id: jobId, userId }, select: { scoreRevision: true } }))?.scoreRevision ?? null,
    applyOps: (results, scoredAt, next) => [
      ...results.map((r) =>
        prisma.skillJobAnswer.update({
          where: { jobId_questionId: { jobId, questionId: r.questionId } },
          data: { score: r.score, reason: r.reason, scoredAt },
        }),
      ),
      prisma.skillJob.update({ where: { id: jobId }, data: { scoreRevision: next } }),
    ],
    transaction: (ops) => prisma.$transaction(ops),
    reload: async () => (await loadJobView(jobId, userId))?.answers ?? [],
  });
}

export async function saveJobAnswer(
  jobId: string,
  userId: string,
  questionId: string,
  fields: { answer?: string; notRelevant?: boolean },
): Promise<"saved" | "no-question"> {
  if (!(await findOwnedJob(jobId, userId))) throw new JobNotFoundError();
  const matrix = await loadSkillMatrix();
  if (!matrix.questions.some((q) => q.id === questionId)) return "no-question";
  await prisma.skillJobAnswer.upsert({
    where: { jobId_questionId: { jobId, questionId } },
    create: { jobId, questionId, ...fields },
    update: fields,
  });
  return "saved";
}

/** The job's files that are not removed, oldest first, without bytes or facts. */
export function activeFiles(jobId: string): Promise<FileViewRow[]> {
  return prisma.skillJobFile.findMany({ where: { jobId, deletedAt: null }, omit: fileViewOmit, orderBy: { createdAt: "asc" } });
}

/** Every active question with the job's stored answer, for the suggest and generate messages. */
export async function jobQuestionContext(jobId: string): Promise<PromptQuestionContext[]> {
  const [matrix, answers] = await Promise.all([loadSkillMatrix(), prisma.skillJobAnswer.findMany({ where: { jobId } })]);
  return buildQuestionContext(matrix.questions, answers.map(toAnswerView));
}
```

- [ ] **Step 8: Run it and watch it pass**

Run: `cd apps/web && npx vitest run src/lib/skills/jobs/jobs.test.ts`
Expected: PASS (16 tests).

- [ ] **Step 9: Write the failing route test**

```ts
// apps/web/src/app/api/v1/prompt-bot/skill-jobs/job-routes.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  isAiConfigured: vi.fn(),
  createJob: vi.fn(),
  loadJobView: vi.fn(),
  updateJob: vi.fn(),
  deleteJob: vi.fn(),
  saveJobAnswer: vi.fn(),
  runJobScoring: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/ai/config", async (orig) => ({ ...(await orig<typeof import("@/lib/ai/config")>()), isAiConfigured: mocks.isAiConfigured }));
vi.mock("@/lib/ai/claude", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/skills/jobs/jobs", () => ({
  createJob: mocks.createJob,
  loadJobView: mocks.loadJobView,
  updateJob: mocks.updateJob,
  deleteJob: mocks.deleteJob,
  saveJobAnswer: mocks.saveJobAnswer,
  runJobScoring: mocks.runJobScoring,
}));

import { AiResponseError } from "@/lib/ai/errors";
import { LimitReachedError } from "@/lib/ai/usage";
import { JobNotFoundError } from "@/lib/skills/jobs/errors";
import * as answer from "./[id]/answers/[questionId]/route";
import * as job from "./[id]/route";
import * as score from "./[id]/score/route";
import * as jobs from "./route";

const req = (method: string, body?: unknown) =>
  new NextRequest("http://localhost/x", { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = { params: Promise.resolve({ id: "j1" }) };
const answerCtx = { params: Promise.resolve({ id: "j1", questionId: "pbq_skill_1" }) };
const VIEW = { id: "j1", title: "Board update" };
const code = async (res: Response) => (await res.json()).error.code;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "u1", role: "MENTEE" });
  mocks.isAiConfigured.mockReturnValue(true);
  mocks.loadJobView.mockResolvedValue(VIEW);
});

describe("POST /skill-jobs", () => {
  it("creates a job without the AI and answers 201 with its view", async () => {
    mocks.isAiConfigured.mockReturnValue(false);
    mocks.createJob.mockResolvedValue("j1");
    const res = await jobs.POST(req("POST", { title: "Board update", description: "I make the deck." }));
    expect(res.status).toBe(201);
    expect((await res.json()).data).toEqual(VIEW);
    expect(mocks.createJob).toHaveBeenCalledWith("u1", { title: "Board update", description: "I make the deck." });
    expect(mocks.loadJobView).toHaveBeenCalledWith("j1", "u1");
  });

  it("validates the body and requires a session", async () => {
    expect((await jobs.POST(req("POST", { title: "" }))).status).toBe(400);
    expect((await jobs.POST(req("POST", { description: "x".repeat(20_001) }))).status).toBe(400);
    expect((await jobs.POST(req("POST", { title: "t".repeat(121) }))).status).toBe(400);
    mocks.getCurrentUser.mockResolvedValue(null);
    expect((await jobs.POST(req("POST", {}))).status).toBe(401);
    expect(mocks.createJob).not.toHaveBeenCalled();
  });
});

describe("/skill-jobs/[id]", () => {
  it("returns the owner's view and 404 for anyone else", async () => {
    const res = await job.GET(req("GET"), ctx);
    expect(res.status).toBe(200);
    expect(mocks.loadJobView).toHaveBeenCalledWith("j1", "u1");
    mocks.loadJobView.mockResolvedValue(null);
    const missing = await job.GET(req("GET"), ctx);
    expect(missing.status).toBe(404);
    expect(await code(missing)).toBe("NOT_FOUND");
  });

  it("patches the title or description and maps ownership to 404", async () => {
    mocks.updateJob.mockResolvedValue({ ...VIEW, title: "New" });
    const res = await job.PATCH(req("PATCH", { title: "New" }), ctx);
    expect(res.status).toBe(200);
    expect(mocks.updateJob).toHaveBeenCalledWith("j1", "u1", { title: "New" });
    expect((await job.PATCH(req("PATCH", {}), ctx)).status).toBe(400);
    expect((await job.PATCH(req("PATCH", { description: "x".repeat(20_001) }), ctx)).status).toBe(400);
    mocks.updateJob.mockRejectedValue(new JobNotFoundError());
    expect((await job.PATCH(req("PATCH", { description: "d" }), ctx)).status).toBe(404);
  });

  it("deletes the owner's job", async () => {
    const res = await job.DELETE(req("DELETE"), ctx);
    expect((await res.json()).data).toEqual({ deleted: true });
    expect(mocks.deleteJob).toHaveBeenCalledWith("j1", "u1");
    mocks.deleteJob.mockRejectedValue(new JobNotFoundError());
    expect((await job.DELETE(req("DELETE"), ctx)).status).toBe(404);
  });

  it("rethrows errors that are not ours", async () => {
    mocks.deleteJob.mockRejectedValue(new Error("db down"));
    await expect(job.DELETE(req("DELETE"), ctx)).rejects.toThrow("db down");
  });
});

describe("PUT /skill-jobs/[id]/answers/[questionId]", () => {
  it("saves an answer, 404s an unknown question or job, and validates the body", async () => {
    mocks.saveJobAnswer.mockResolvedValue("saved");
    const res = await answer.PUT(req("PUT", { answer: "Monthly" }), answerCtx);
    expect((await res.json()).data).toEqual({ saved: true });
    expect(mocks.saveJobAnswer).toHaveBeenCalledWith("j1", "u1", "pbq_skill_1", { answer: "Monthly" });
    mocks.saveJobAnswer.mockResolvedValue("no-question");
    const unknown = await answer.PUT(req("PUT", { answer: "x" }), answerCtx);
    expect(unknown.status).toBe(404);
    expect((await unknown.json()).error.message).toBe("Question not found");
    mocks.saveJobAnswer.mockRejectedValue(new JobNotFoundError());
    expect((await answer.PUT(req("PUT", { answer: "x" }), answerCtx)).status).toBe(404);
    expect((await answer.PUT(req("PUT", {}), answerCtx)).status).toBe(400);
  });
});

describe("POST /skill-jobs/[id]/score", () => {
  it("scores and returns the reply", async () => {
    mocks.runJobScoring.mockResolvedValue({ applied: true, revision: 2, answers: [] });
    const res = await score.POST(req("POST", { revision: 2 }), ctx);
    expect((await res.json()).data).toEqual({ applied: true, revision: 2, answers: [] });
    expect(mocks.runJobScoring).toHaveBeenCalledWith("j1", "u1", 2);
  });

  it("maps 503 up front, then 400, 404, 429 and 502", async () => {
    mocks.isAiConfigured.mockReturnValue(false);
    expect((await score.POST(req("POST", { revision: 1 }), ctx)).status).toBe(503);
    expect(mocks.runJobScoring).not.toHaveBeenCalled();
    mocks.isAiConfigured.mockReturnValue(true);
    expect((await score.POST(req("POST", { revision: -1 }), ctx)).status).toBe(400);
    mocks.runJobScoring.mockRejectedValueOnce(new JobNotFoundError());
    expect((await score.POST(req("POST", { revision: 1 }), ctx)).status).toBe(404);
    mocks.runJobScoring.mockRejectedValueOnce(new LimitReachedError("score", new Date("2026-11-26T00:00:00Z")));
    expect((await score.POST(req("POST", { revision: 1 }), ctx)).status).toBe(429);
    mocks.runJobScoring.mockRejectedValueOnce(new AiResponseError("bad"));
    expect((await score.POST(req("POST", { revision: 1 }), ctx)).status).toBe(502);
  });
});
```

- [ ] **Step 10: Run it and watch it fail**

Run: `cd apps/web && npx vitest run src/app/api/v1/prompt-bot/skill-jobs/job-routes.test.ts`
Expected: FAIL, "Failed to resolve import ./route".

- [ ] **Step 11: Write the job routes**

```ts
// apps/web/src/app/api/v1/prompt-bot/skill-jobs/route.ts
import { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { successResponse, validationErrorResponse } from "@/lib/api/response";
import { unauthorized } from "@/lib/skills/jobs/http";
import { createJob, loadJobView } from "@/lib/skills/jobs/jobs";
import { JOB_LIMITS } from "@/lib/skills/limits";

const CreateBody = z.object({
  title: z.string().trim().min(1).max(JOB_LIMITS.titleChars).optional(),
  description: z.string().max(JOB_LIMITS.descriptionChars).optional(),
});

/** Starts a job. Needs no AI: the page shows NotConfigured for the AI steps when the key is missing. */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const parsed = CreateBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return validationErrorResponse(parsed.error);
  const id = await createJob(user.id, parsed.data);
  return successResponse(await loadJobView(id, user.id), undefined, 201);
}
```

```ts
// apps/web/src/app/api/v1/prompt-bot/skill-jobs/[id]/route.ts
import { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { successResponse, validationErrorResponse } from "@/lib/api/response";
import { jobErrorResponse, notFound, unauthorized } from "@/lib/skills/jobs/http";
import { deleteJob, loadJobView, updateJob } from "@/lib/skills/jobs/jobs";
import { JOB_LIMITS } from "@/lib/skills/limits";

type Ctx = { params: Promise<{ id: string }> };
const PatchBody = z
  .object({
    title: z.string().trim().min(1).max(JOB_LIMITS.titleChars).optional(),
    description: z.string().max(JOB_LIMITS.descriptionChars).optional(),
  })
  .refine((v) => v.title !== undefined || v.description !== undefined, "Nothing to update");

export async function GET(_req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const view = await loadJobView(id, user.id);
  return view ? successResponse(view) : notFound("Job");
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const parsed = PatchBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return validationErrorResponse(parsed.error);
  try {
    return successResponse(await updateJob(id, user.id, parsed.data));
  } catch (error) {
    const res = jobErrorResponse(error);
    if (res) return res;
    throw error;
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id } = await params;
  try {
    await deleteJob(id, user.id);
    return successResponse({ deleted: true });
  } catch (error) {
    const res = jobErrorResponse(error);
    if (res) return res;
    throw error;
  }
}
```

```ts
// apps/web/src/app/api/v1/prompt-bot/skill-jobs/[id]/answers/[questionId]/route.ts
import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { successResponse, validationErrorResponse } from "@/lib/api/response";
import { AnswerBody, answerFields } from "@/lib/prompt-bot/answer-input";
import { jobErrorResponse, notFound, unauthorized } from "@/lib/skills/jobs/http";
import { saveJobAnswer } from "@/lib/skills/jobs/jobs";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; questionId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id, questionId } = await params;
  const parsed = AnswerBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return validationErrorResponse(parsed.error);
  try {
    const result = await saveJobAnswer(id, user.id, questionId, answerFields(parsed.data));
    return result === "saved" ? successResponse({ saved: true }) : notFound("Question");
  } catch (error) {
    const res = jobErrorResponse(error);
    if (res) return res;
    throw error;
  }
}
```

```ts
// apps/web/src/app/api/v1/prompt-bot/skill-jobs/[id]/score/route.ts
import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { successResponse, validationErrorResponse } from "@/lib/api/response";
import { AiNotConfiguredError, isAiConfigured } from "@/lib/ai/config";
import { ScoreBody } from "@/lib/prompt-bot/answer-input";
import { aiErrorResponse } from "@/lib/prompt-bot/http";
import { jobErrorResponse, unauthorized } from "@/lib/skills/jobs/http";
import { runJobScoring } from "@/lib/skills/jobs/jobs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  // Refuse before anything is counted: scoreAndApply spends the unit before the AI call.
  if (!isAiConfigured()) return aiErrorResponse(new AiNotConfiguredError());
  const { id } = await params;
  const parsed = ScoreBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return validationErrorResponse(parsed.error);
  try {
    return successResponse(await runJobScoring(id, user.id, parsed.data.revision));
  } catch (error) {
    const res = jobErrorResponse(error);
    if (res) return res;
    throw error;
  }
}
```

- [ ] **Step 12: Run the task's tests and type-check**

Run: `cd apps/web && npx vitest run src/lib/skills src/app/api/v1/prompt-bot/skill-jobs && npx tsc --noEmit`
Expected: PASS; no type errors.

- [ ] **Step 13: Commit**

```bash
git add apps/web/src/lib/skills/matrix.ts apps/web/src/lib/skills/matrix.test.ts apps/web/src/lib/skills/packs.ts \
  apps/web/src/lib/skills/jobs/staleness.ts apps/web/src/lib/skills/jobs/staleness.test.ts \
  apps/web/src/lib/skills/jobs/errors.ts apps/web/src/lib/skills/jobs/http.ts apps/web/src/lib/skills/jobs/http.test.ts \
  apps/web/src/lib/skills/jobs/jobs.ts apps/web/src/lib/skills/jobs/jobs.test.ts \
  apps/web/src/app/api/v1/prompt-bot/skill-jobs/route.ts "apps/web/src/app/api/v1/prompt-bot/skill-jobs/[id]/route.ts" \
  "apps/web/src/app/api/v1/prompt-bot/skill-jobs/[id]/answers/[questionId]/route.ts" "apps/web/src/app/api/v1/prompt-bot/skill-jobs/[id]/score/route.ts" \
  apps/web/src/app/api/v1/prompt-bot/skill-jobs/job-routes.test.ts
git commit -m "feat(skills-builder): add the job data layer, error mapping and job routes"
```

---

### Task 10: File uploads, analysis runs and file routes

**Files:**
- Create: `apps/web/src/lib/skills/jobs/files.ts`
- Create: `apps/web/src/app/api/v1/prompt-bot/skill-jobs/[id]/files/route.ts`, `apps/web/src/app/api/v1/prompt-bot/skill-jobs/[id]/files/[fileId]/route.ts`, `apps/web/src/app/api/v1/prompt-bot/skill-jobs/[id]/files/[fileId]/analyse/route.ts`
- Test: `apps/web/src/lib/skills/jobs/files.test.ts`, `apps/web/src/app/api/v1/prompt-bot/skill-jobs/file-routes.test.ts`

**Interfaces:**
- Consumes: `readUpload(bytes): Promise<ReadUpload>` (`src/lib/skills/files/extract.ts`); `imageForClaude(bytes, kind)` (`src/lib/skills/files/image.ts`); `assetFileName(original, kind, taken)` (`src/lib/skills/files/safe-name.ts`); `FileFacts`, `FileReadError`, `SkillFileKind`; `readBytesWithin(req, maxBytes): Promise<BoundedBytes>` (`src/lib/api/body.ts`); `analyseFile`, `AnalysisContent` (Task 8); `buildAnalysisText` (Task 8); `consumeAiUsage(userId, "skill_analyze", now?)`; Task 9's `fileViewOmit`, `toFileView`, `findOwnedJob`, errors, staleness, `jobErrorResponse`, `notFound`, `unauthorized`.
- Produces (contract): `ANALYSIS_FAILED_MESSAGE`, `PDF_TOO_LONG_MESSAGE`, `countActiveFiles(jobId)`, `storeJobFile(input, now?)`, `runFileAnalysis(jobId, fileId, userId)`, `startReanalysis(jobId, fileId, userId, now?)`, `saveAnalysisEdit(jobId, fileId, userId, analysis, now?)`, `deleteJobFile(jobId, fileId, userId, now?): Promise<"soft" | "hard">`, `purgeUnreferencedFiles(jobId): Promise<number>`, `loadFileDetail(jobId, fileId, userId)`; routes `POST /skill-jobs/[id]/files?name=…`, `GET|PATCH|DELETE /skill-jobs/[id]/files/[fileId]`, `POST /skill-jobs/[id]/files/[fileId]/analyse`.

- [ ] **Step 1: Write the failing data-layer test**

```ts
// apps/web/src/lib/skills/jobs/files.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  jobFindFirst: vi.fn(),
  fileCount: vi.fn(),
  fileFindMany: vi.fn(),
  fileFindFirst: vi.fn(),
  fileCreate: vi.fn(),
  fileUpdate: vi.fn(),
  fileUpdateMany: vi.fn(),
  fileDeleteMany: vi.fn(),
  skillFindFirst: vi.fn(),
  versionFindFirst: vi.fn(),
  executeRaw: vi.fn(),
  transaction: vi.fn(),
  consumeAiUsage: vi.fn(),
  analyseFile: vi.fn(),
  readUpload: vi.fn(),
  imageForClaude: vi.fn(),
  assetFileName: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    skillJob: { findFirst: mocks.jobFindFirst },
    skillJobFile: {
      count: mocks.fileCount,
      findMany: mocks.fileFindMany,
      findFirst: mocks.fileFindFirst,
      create: mocks.fileCreate,
      update: mocks.fileUpdate,
      updateMany: mocks.fileUpdateMany,
      deleteMany: mocks.fileDeleteMany,
    },
    skillJobSkill: { findFirst: mocks.skillFindFirst },
    skillVersion: { findFirst: mocks.versionFindFirst },
    $executeRaw: mocks.executeRaw,
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/ai/usage", async (orig) => ({ ...(await orig<typeof import("@/lib/ai/usage")>()), consumeAiUsage: mocks.consumeAiUsage }));
vi.mock("@/lib/ai/claude", () => ({ analyseFile: mocks.analyseFile }));
vi.mock("../files/extract", () => ({ readUpload: mocks.readUpload }));
vi.mock("../files/image", () => ({ imageForClaude: mocks.imageForClaude }));
vi.mock("../files/safe-name", () => ({ assetFileName: mocks.assetFileName }));

import { AiResponseError } from "@/lib/ai/errors";
import { LimitReachedError } from "@/lib/ai/usage";
import { FileReadError, FILE_READ_MESSAGES } from "../files/types";
import { AlreadyAnalysingError, AlreadyGeneratingError, FileNotFoundError, JobNotFoundError, TooManyFilesError } from "./errors";
import {
  ANALYSIS_FAILED_MESSAGE,
  countActiveFiles,
  deleteJobFile,
  loadFileDetail,
  PDF_TOO_LONG_MESSAGE,
  purgeUnreferencedFiles,
  runFileAnalysis,
  saveAnalysisEdit,
  startReanalysis,
  storeJobFile,
} from "./files";

const NOW = new Date("2026-11-25T12:00:00Z");
const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60_000);
const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const fileRow = (over: Record<string, unknown> = {}) => ({
  id: "f1",
  jobId: "j1",
  fileName: "Q3 deck.pptx",
  assetName: "q3-deck.pptx",
  kind: "PPTX",
  mimeType: PPTX_MIME,
  size: 4,
  sha256: "abc",
  analysis: null,
  analysisStatus: "PENDING",
  analysisStartedAt: NOW,
  analysisEdited: false,
  analysisError: null,
  deletedAt: null,
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});
const BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
const FACTS = { kind: "PPTX", slideCount: 3 };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.jobFindFirst.mockResolvedValue({ id: "j1", title: "t", description: "d" });
  mocks.fileCount.mockResolvedValue(0);
  mocks.fileFindMany.mockResolvedValue([{ assetName: "logo.png" }]);
  mocks.readUpload.mockResolvedValue({ kind: "PPTX", mimeType: PPTX_MIME, facts: FACTS, sha256: "abc" });
  mocks.assetFileName.mockReturnValue("q3-deck.pptx");
  mocks.fileCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => fileRow({ ...data, id: "f1" }));
  mocks.fileUpdateMany.mockResolvedValue({ count: 1 });
  mocks.transaction.mockImplementation(async (ops: unknown[]) => ops);
});

describe("storeJobFile", () => {
  it("reads the upload, spends one skill_analyze unit, names the asset and stores it as pending", async () => {
    const view = await storeJobFile({ jobId: "j1", userId: "u1", fileName: "Q3 deck.pptx", bytes: BYTES }, NOW);
    expect(mocks.readUpload).toHaveBeenCalledWith(BYTES);
    expect(mocks.consumeAiUsage).toHaveBeenCalledWith("u1", "skill_analyze", NOW);
    expect(mocks.assetFileName).toHaveBeenCalledWith("Q3 deck.pptx", "PPTX", ["logo.png"]);
    expect(mocks.fileFindMany).toHaveBeenCalledWith({ where: { jobId: "j1" }, select: { assetName: true } });
    const create = mocks.fileCreate.mock.calls[0][0];
    expect(create.omit).toEqual({ data: true, facts: true });
    expect(create.data).toMatchObject({
      jobId: "j1",
      fileName: "Q3 deck.pptx",
      assetName: "q3-deck.pptx",
      kind: "PPTX",
      mimeType: PPTX_MIME,
      size: 4,
      sha256: "abc",
      facts: FACTS,
      analysisStatus: "PENDING",
      analysisStartedAt: NOW,
    });
    expect(Buffer.from(create.data.data).equals(Buffer.from(BYTES))).toBe(true);
    expect(view).toMatchObject({ id: "f1", analysisStatus: "PENDING", bundlable: true });
  });

  it("refuses an unreadable file before spending anything or storing it", async () => {
    mocks.readUpload.mockRejectedValue(new FileReadError("FILE_ENCRYPTED", FILE_READ_MESSAGES.ole));
    await expect(storeJobFile({ jobId: "j1", userId: "u1", fileName: "x.pptx", bytes: BYTES }, NOW)).rejects.toBeInstanceOf(FileReadError);
    expect(mocks.consumeAiUsage).not.toHaveBeenCalled();
    expect(mocks.fileCreate).not.toHaveBeenCalled();
  });

  it("re-checks the file count and the owner, and stores nothing when the daily limit is reached", async () => {
    mocks.fileCount.mockResolvedValue(10);
    await expect(storeJobFile({ jobId: "j1", userId: "u1", fileName: "x.pptx", bytes: BYTES }, NOW)).rejects.toBeInstanceOf(TooManyFilesError);
    expect(mocks.consumeAiUsage).not.toHaveBeenCalled();
    mocks.fileCount.mockResolvedValue(0);
    mocks.consumeAiUsage.mockRejectedValueOnce(new LimitReachedError("skill_analyze", NOW));
    await expect(storeJobFile({ jobId: "j1", userId: "u1", fileName: "x.pptx", bytes: BYTES }, NOW)).rejects.toBeInstanceOf(LimitReachedError);
    expect(mocks.fileCreate).not.toHaveBeenCalled();
    mocks.jobFindFirst.mockResolvedValue(null);
    await expect(storeJobFile({ jobId: "j1", userId: "u2", fileName: "x.pptx", bytes: BYTES }, NOW)).rejects.toBeInstanceOf(JobNotFoundError);
  });

  it("counts only files that are not removed", async () => {
    mocks.fileCount.mockResolvedValue(3);
    expect(await countActiveFiles("j1")).toBe(3);
    expect(mocks.fileCount).toHaveBeenCalledWith({ where: { jobId: "j1", deletedAt: null } });
  });
});

describe("runFileAnalysis", () => {
  const withData = (over: Record<string, unknown> = {}) => fileRow({ data: Buffer.from("PDFBYTES"), facts: FACTS, ...over });
  const finished = () => mocks.fileUpdateMany.mock.calls.at(-1)![0];

  it("writes the analysis for an Office file from its facts, only if the claim is still ours", async () => {
    mocks.fileFindFirst.mockResolvedValue(withData());
    mocks.analyseFile.mockResolvedValue("## Colours\n- #1F4E79");
    await runFileAnalysis("j1", "f1", "u1");
    expect(mocks.fileFindFirst).toHaveBeenCalledWith({ where: { id: "f1", jobId: "j1", deletedAt: null, job: { userId: "u1" } } });
    const content = mocks.analyseFile.mock.calls[0][0];
    expect(content.document).toBeUndefined();
    expect(content.image).toBeUndefined();
    expect(content.text).toContain('<file name="Q3 deck.pptx" kind="PPTX">');
    expect(finished()).toEqual({
      where: { id: "f1", analysisStatus: "PENDING", analysisStartedAt: NOW },
      data: { analysisStatus: "READY", analysis: "## Colours\n- #1F4E79", analysisEdited: false, analysisError: null },
    });
  });

  it("sends a PDF as a document block titled with its asset name", async () => {
    mocks.fileFindFirst.mockResolvedValue(withData({ kind: "PDF", assetName: "brand.pdf", facts: { kind: "PDF", version: "1.7", pages: 12, title: null } }));
    mocks.analyseFile.mockResolvedValue("guide");
    await runFileAnalysis("j1", "f1", "u1");
    expect(mocks.analyseFile.mock.calls[0][0].document).toEqual({ base64: Buffer.from("PDFBYTES").toString("base64"), title: "brand.pdf" });
  });

  it("skips the AI for a PDF over 100 pages and says why", async () => {
    mocks.fileFindFirst.mockResolvedValue(withData({ kind: "PDF", facts: { kind: "PDF", version: "1.7", pages: 101, title: null } }));
    await runFileAnalysis("j1", "f1", "u1");
    expect(mocks.analyseFile).not.toHaveBeenCalled();
    expect(finished().data).toEqual({ analysisStatus: "FAILED", analysisError: PDF_TOO_LONG_MESSAGE });
  });

  it("sends images through the resized copy", async () => {
    mocks.fileFindFirst.mockResolvedValue(withData({ kind: "PNG", facts: { kind: "PNG", width: 4000, height: 3000 } }));
    mocks.imageForClaude.mockResolvedValue({ mediaType: "image/png", base64: "c21hbGw=" });
    mocks.analyseFile.mockResolvedValue("guide");
    await runFileAnalysis("j1", "f1", "u1");
    expect(mocks.imageForClaude).toHaveBeenCalledWith(expect.any(Uint8Array), "PNG");
    expect(mocks.analyseFile.mock.calls[0][0].image).toEqual({ base64: "c21hbGw=", mediaType: "image/png" });
  });

  it("records a failure without throwing or logging content", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.fileFindFirst.mockResolvedValue(withData());
    mocks.analyseFile.mockRejectedValue(new AiResponseError("Claude stopped with refusal"));
    await expect(runFileAnalysis("j1", "f1", "u1")).resolves.toBeUndefined();
    expect(finished()).toEqual({
      where: { id: "f1", analysisStatus: "PENDING", analysisStartedAt: NOW },
      data: { analysisStatus: "FAILED", analysisError: ANALYSIS_FAILED_MESSAGE },
    });
    expect(log).toHaveBeenCalledWith("[skills-builder] file analysis failed:", "AiResponseError");
    expect(JSON.stringify(log.mock.calls)).not.toContain("Q3 deck");
    log.mockRestore();
  });

  it("does nothing for a removed, foreign or already finished file", async () => {
    mocks.fileFindFirst.mockResolvedValue(null);
    await runFileAnalysis("j1", "f1", "u1");
    mocks.fileFindFirst.mockResolvedValue(withData({ analysisStatus: "READY" }));
    await runFileAnalysis("j1", "f1", "u1");
    expect(mocks.analyseFile).not.toHaveBeenCalled();
    expect(mocks.fileUpdateMany).not.toHaveBeenCalled();
  });
});

describe("startReanalysis", () => {
  it("claims a ready file, spends one unit and returns it as pending", async () => {
    mocks.fileFindFirst.mockResolvedValue(fileRow({ analysisStatus: "READY", analysis: "old", analysisStartedAt: minutesAgo(30) }));
    const view = await startReanalysis("j1", "f1", "u1", NOW);
    const claim = mocks.fileUpdateMany.mock.calls[0][0];
    expect(claim.where.id).toBe("f1");
    expect(claim.where.OR).toEqual([{ analysisStatus: { not: "PENDING" } }, { analysisStartedAt: null }, { analysisStartedAt: { lt: minutesAgo(5) } }]);
    expect(claim.data).toEqual({ analysisStatus: "PENDING", analysisStartedAt: NOW, analysisError: null });
    expect(mocks.consumeAiUsage).toHaveBeenCalledWith("u1", "skill_analyze", NOW);
    expect(view.analysisStatus).toBe("PENDING");
  });

  it("re-claims an interrupted analysis but refuses a fresh one (Review Focus 1)", async () => {
    mocks.fileFindFirst.mockResolvedValue(fileRow({ analysisStatus: "PENDING", analysisStartedAt: minutesAgo(6) }));
    await expect(startReanalysis("j1", "f1", "u1", NOW)).resolves.toMatchObject({ analysisStatus: "PENDING" });
    mocks.fileFindFirst.mockResolvedValue(fileRow({ analysisStatus: "PENDING", analysisStartedAt: minutesAgo(1) }));
    await expect(startReanalysis("j1", "f1", "u1", NOW)).rejects.toBeInstanceOf(AlreadyAnalysingError);
    mocks.fileFindFirst.mockResolvedValue(fileRow({ analysisStatus: "READY" }));
    mocks.fileUpdateMany.mockResolvedValueOnce({ count: 0 });
    await expect(startReanalysis("j1", "f1", "u1", NOW)).rejects.toBeInstanceOf(AlreadyAnalysingError);
  });

  it("hands the claim back when the daily limit is reached", async () => {
    mocks.fileFindFirst.mockResolvedValue(fileRow({ analysisStatus: "FAILED", analysisError: "x", analysisStartedAt: minutesAgo(30) }));
    mocks.consumeAiUsage.mockRejectedValueOnce(new LimitReachedError("skill_analyze", NOW));
    await expect(startReanalysis("j1", "f1", "u1", NOW)).rejects.toBeInstanceOf(LimitReachedError);
    expect(mocks.fileUpdateMany.mock.calls[1][0]).toEqual({
      where: { id: "f1", analysisStatus: "PENDING", analysisStartedAt: NOW },
      data: { analysisStatus: "FAILED", analysisStartedAt: minutesAgo(30), analysisError: "x" },
    });
  });

  it("404s a missing file", async () => {
    mocks.fileFindFirst.mockResolvedValue(null);
    await expect(startReanalysis("j1", "f1", "u2", NOW)).rejects.toBeInstanceOf(FileNotFoundError);
  });
});

describe("saveAnalysisEdit", () => {
  it("stores the user's text as an edited, ready analysis", async () => {
    mocks.fileFindFirst.mockResolvedValue(fileRow({ analysisStatus: "FAILED" }));
    mocks.fileUpdate.mockResolvedValue(fileRow({ analysisStatus: "READY", analysis: "Mine", analysisEdited: true }));
    const view = await saveAnalysisEdit("j1", "f1", "u1", "  Mine  ", NOW);
    expect(mocks.fileUpdate).toHaveBeenCalledWith({
      where: { id: "f1" },
      data: { analysis: "Mine", analysisEdited: true, analysisStatus: "READY", analysisError: null },
      omit: { data: true, facts: true },
    });
    expect(view).toMatchObject({ analysis: "Mine", analysisEdited: true });
  });

  it("refuses while an analysis is running", async () => {
    mocks.fileFindFirst.mockResolvedValue(fileRow({ analysisStatus: "PENDING", analysisStartedAt: minutesAgo(1) }));
    await expect(saveAnalysisEdit("j1", "f1", "u1", "x", NOW)).rejects.toBeInstanceOf(AlreadyAnalysingError);
  });
});

describe("deleteJobFile and purge (Review Focus 3)", () => {
  beforeEach(() => {
    mocks.fileFindFirst.mockResolvedValue({ id: "f1" });
    mocks.skillFindFirst.mockResolvedValue(null);
  });

  it("soft-deletes a file a version bundles and removes it from every skill", async () => {
    mocks.versionFindFirst.mockResolvedValue({ id: "v1" });
    expect(await deleteJobFile("j1", "f1", "u1", NOW)).toBe("soft");
    expect(mocks.versionFindFirst).toHaveBeenCalledWith({ where: { skill: { jobId: "j1" }, assetFileIds: { has: "f1" } }, select: { id: true } });
    expect(mocks.fileUpdateMany).toHaveBeenCalledWith({ where: { id: "f1" }, data: { deletedAt: NOW } });
    expect(mocks.fileDeleteMany).not.toHaveBeenCalled();
    const sql = (mocks.executeRaw.mock.calls[0][0] as TemplateStringsArray).join("?");
    expect(sql).toContain('UPDATE "skill_job_skills" SET "file_ids" = array_remove("file_ids", ?) WHERE "job_id" = ?');
    expect(mocks.executeRaw.mock.calls[0].slice(1)).toEqual(["f1", "j1"]);
  });

  it("hard-deletes a file no version needs", async () => {
    mocks.versionFindFirst.mockResolvedValue(null);
    expect(await deleteJobFile("j1", "f1", "u1", NOW)).toBe("hard");
    expect(mocks.fileDeleteMany).toHaveBeenCalledWith({ where: { id: "f1" } });
  });

  it("refuses while a skill of the job is being written, and 404s a foreign file", async () => {
    mocks.skillFindFirst.mockResolvedValue({ id: "s1" });
    await expect(deleteJobFile("j1", "f1", "u1", NOW)).rejects.toBeInstanceOf(AlreadyGeneratingError);
    expect(mocks.skillFindFirst).toHaveBeenCalledWith({
      where: { jobId: "j1", status: "GENERATING", generationStartedAt: { gt: minutesAgo(10) } },
      select: { id: true },
    });
    mocks.fileFindFirst.mockResolvedValue(null);
    await expect(deleteJobFile("j1", "f1", "u2", NOW)).rejects.toBeInstanceOf(FileNotFoundError);
  });

  it("purges removed files that no version references", async () => {
    mocks.executeRaw.mockResolvedValue(2);
    expect(await purgeUnreferencedFiles("j1")).toBe(2);
    const sql = (mocks.executeRaw.mock.calls[0][0] as TemplateStringsArray).join("?");
    expect(sql).toContain('DELETE FROM "skill_job_files"');
    expect(sql).toContain('"deleted_at" IS NOT NULL');
    expect(sql).toContain('= ANY(v."asset_file_ids")');
    expect(mocks.executeRaw.mock.calls[0].slice(1)).toEqual(["j1", "j1"]);
  });
});

describe("loadFileDetail", () => {
  it("returns the view plus the facts, never the bytes", async () => {
    mocks.fileFindFirst.mockResolvedValue(fileRow({ analysisStatus: "READY", facts: FACTS }));
    expect(await loadFileDetail("j1", "f1", "u1")).toMatchObject({ id: "f1", facts: FACTS });
    expect(mocks.fileFindFirst).toHaveBeenCalledWith({ where: { id: "f1", jobId: "j1", deletedAt: null, job: { userId: "u1" } }, omit: { data: true } });
    mocks.fileFindFirst.mockResolvedValue(null);
    expect(await loadFileDetail("j1", "f1", "u2")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd apps/web && npx vitest run src/lib/skills/jobs/files.test.ts`
Expected: FAIL, "Failed to resolve import ./files".

- [ ] **Step 3: Write the file pipeline**

```ts
// apps/web/src/lib/skills/jobs/files.ts
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { analyseFile, type AnalysisContent } from "@/lib/ai/claude";
import { consumeAiUsage } from "@/lib/ai/usage";
import { readUpload } from "../files/extract";
import { imageForClaude } from "../files/image";
import { assetFileName } from "../files/safe-name";
import type { FileFacts, SkillFileKind } from "../files/types";
import { JOB_LIMITS } from "../limits";
import { AlreadyAnalysingError, AlreadyGeneratingError, FileNotFoundError, JobNotFoundError, TooManyFilesError } from "./errors";
import { buildAnalysisText } from "./instructions";
import { fileViewOmit, findOwnedJob, toFileView } from "./jobs";
import { analysisCutoff, generationCutoff, isAnalysing } from "./staleness";
import type { JobFileDetail, JobFileView } from "./types";

export const ANALYSIS_FAILED_MESSAGE = "We couldn't analyse this file. Try again, or write the style guide yourself.";
export const PDF_TOO_LONG_MESSAGE =
  "This PDF has more than 100 pages, so it can't be analysed. Upload the pages that show the style, or write the style guide yourself.";

const ownedFile = (jobId: string, fileId: string, userId: string) => ({ id: fileId, jobId, deletedAt: null, job: { userId } });

export function countActiveFiles(jobId: string): Promise<number> {
  return prisma.skillJobFile.count({ where: { jobId, deletedAt: null } });
}

/**
 * Checks the bytes first (a refused file spends nothing), then the count, then one skill_analyze unit,
 * and stores the file as PENDING. The route runs runFileAnalysis in after().
 */
export async function storeJobFile(input: { jobId: string; userId: string; fileName: string; bytes: Uint8Array }, now = new Date()): Promise<JobFileView> {
  if (!(await findOwnedJob(input.jobId, input.userId))) throw new JobNotFoundError();
  const read = await readUpload(input.bytes);
  if ((await countActiveFiles(input.jobId)) >= JOB_LIMITS.filesPerJob) throw new TooManyFilesError();
  await consumeAiUsage(input.userId, "skill_analyze", now);
  // Removed-but-kept files keep their names, so a version's assets/<name> never changes meaning.
  const taken = (await prisma.skillJobFile.findMany({ where: { jobId: input.jobId }, select: { assetName: true } })).map((r) => r.assetName);
  const row = await prisma.skillJobFile.create({
    data: {
      jobId: input.jobId,
      fileName: input.fileName,
      assetName: assetFileName(input.fileName, read.kind, taken),
      kind: read.kind,
      mimeType: read.mimeType,
      size: input.bytes.byteLength,
      sha256: read.sha256,
      data: Buffer.from(input.bytes),
      facts: read.facts as unknown as Prisma.InputJsonValue,
      analysisStatus: "PENDING",
      analysisStartedAt: now,
    },
    omit: fileViewOmit,
  });
  return toFileView(row, now);
}

async function analysisContent(row: { kind: SkillFileKind; fileName: string; assetName: string; data: Uint8Array; facts: FileFacts | null }): Promise<AnalysisContent> {
  const text = buildAnalysisText({ fileName: row.fileName, kind: row.kind, facts: row.facts });
  if (row.kind === "PDF") return { text, document: { base64: Buffer.from(row.data).toString("base64"), title: row.assetName } };
  if (row.kind === "PNG" || row.kind === "JPEG") {
    const image = await imageForClaude(row.data, row.kind);
    return { text, image: { base64: image.base64, mediaType: image.mediaType } };
  }
  return { text };
}

/**
 * One analysis, run after the response. Writes READY or FAILED only while the claim (analysisStartedAt) is
 * still this run's, so a newer Analyse again is never overwritten. Never throws; logs the error class only.
 */
export async function runFileAnalysis(jobId: string, fileId: string, userId: string): Promise<void> {
  let claim: Date | null | undefined;
  const finish = (data: Prisma.SkillJobFileUpdateManyMutationInput) =>
    prisma.skillJobFile.updateMany({ where: { id: fileId, analysisStatus: "PENDING", analysisStartedAt: claim ?? null }, data });
  try {
    const row = await prisma.skillJobFile.findFirst({ where: ownedFile(jobId, fileId, userId) });
    if (!row || row.analysisStatus !== "PENDING") return;
    claim = row.analysisStartedAt;
    const facts = row.facts as unknown as FileFacts | null;
    if (facts?.kind === "PDF" && facts.pages !== null && facts.pages > JOB_LIMITS.pdfPagesForAnalysis) {
      await finish({ analysisStatus: "FAILED", analysisError: PDF_TOO_LONG_MESSAGE });
      return;
    }
    const analysis = await analyseFile(await analysisContent({ ...row, facts }));
    await finish({ analysisStatus: "READY", analysis, analysisEdited: false, analysisError: null });
  } catch (error) {
    console.error("[skills-builder] file analysis failed:", error instanceof Error ? error.name : "unknown");
    // Without a known claim (the row never loaded) the file stays PENDING and reads as interrupted after 5 minutes.
    if (claim === undefined) return;
    await finish({ analysisStatus: "FAILED", analysisError: ANALYSIS_FAILED_MESSAGE }).catch((writeError: unknown) => {
      console.error("[skills-builder] could not record the analysis failure:", writeError instanceof Error ? writeError.name : "unknown");
    });
  }
}

/** Claims the file (a fresh analysis refuses; an interrupted one may be re-claimed), then spends one unit. */
export async function startReanalysis(jobId: string, fileId: string, userId: string, now = new Date()): Promise<JobFileView> {
  const row = await prisma.skillJobFile.findFirst({ where: ownedFile(jobId, fileId, userId), omit: fileViewOmit });
  if (!row) throw new FileNotFoundError();
  if (isAnalysing(row.analysisStatus, row.analysisStartedAt, now)) throw new AlreadyAnalysingError();
  const claimed = await prisma.skillJobFile.updateMany({
    where: {
      id: fileId,
      OR: [{ analysisStatus: { not: "PENDING" } }, { analysisStartedAt: null }, { analysisStartedAt: { lt: analysisCutoff(now) } }],
    },
    data: { analysisStatus: "PENDING", analysisStartedAt: now, analysisError: null },
  });
  if (claimed.count === 0) throw new AlreadyAnalysingError();
  try {
    await consumeAiUsage(userId, "skill_analyze", now);
  } catch (error) {
    // No unit was spent, so nothing will run: hand the file back as it was (only if the claim is still ours).
    await prisma.skillJobFile.updateMany({
      where: { id: fileId, analysisStatus: "PENDING", analysisStartedAt: now },
      data: { analysisStatus: row.analysisStatus, analysisStartedAt: row.analysisStartedAt, analysisError: row.analysisError },
    });
    throw error;
  }
  return toFileView({ ...row, analysisStatus: "PENDING" as const, analysisStartedAt: now, analysisError: null }, now);
}

/** The user's style guide wins: generation uses it exactly as written. */
export async function saveAnalysisEdit(jobId: string, fileId: string, userId: string, analysis: string, now = new Date()): Promise<JobFileView> {
  const row = await prisma.skillJobFile.findFirst({ where: ownedFile(jobId, fileId, userId), omit: fileViewOmit });
  if (!row) throw new FileNotFoundError();
  if (isAnalysing(row.analysisStatus, row.analysisStartedAt, now)) throw new AlreadyAnalysingError();
  const updated = await prisma.skillJobFile.update({
    where: { id: fileId },
    data: { analysis: analysis.trim().slice(0, JOB_LIMITS.analysisChars), analysisEdited: true, analysisStatus: "READY", analysisError: null },
    omit: fileViewOmit,
  });
  return toFileView(updated, now);
}

/**
 * Removes a file from the job. A version that bundled it keeps its bytes (soft delete); otherwise the row goes.
 * updateMany/deleteMany, not update/delete: those would read the bytes back.
 */
export async function deleteJobFile(jobId: string, fileId: string, userId: string, now = new Date()): Promise<"soft" | "hard"> {
  const row = await prisma.skillJobFile.findFirst({ where: ownedFile(jobId, fileId, userId), select: { id: true } });
  if (!row) throw new FileNotFoundError();
  const generating = await prisma.skillJobSkill.findFirst({
    where: { jobId, status: "GENERATING", generationStartedAt: { gt: generationCutoff(now) } },
    select: { id: true },
  });
  if (generating) throw new AlreadyGeneratingError();
  const referenced = await prisma.skillVersion.findFirst({ where: { skill: { jobId }, assetFileIds: { has: fileId } }, select: { id: true } });
  await prisma.$transaction([
    referenced
      ? prisma.skillJobFile.updateMany({ where: { id: fileId }, data: { deletedAt: now } })
      : prisma.skillJobFile.deleteMany({ where: { id: fileId } }),
    prisma.$executeRaw`UPDATE "skill_job_skills" SET "file_ids" = array_remove("file_ids", ${fileId}) WHERE "job_id" = ${jobId}`,
  ]);
  return referenced ? "soft" : "hard";
}

/** Hard-deletes the job's removed files that no remaining version bundles. Returns how many went. */
export function purgeUnreferencedFiles(jobId: string): Promise<number> {
  return prisma.$executeRaw`DELETE FROM "skill_job_files" f WHERE f."job_id" = ${jobId} AND f."deleted_at" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "skill_versions" v JOIN "skill_job_skills" s ON s."id" = v."skill_id" WHERE s."job_id" = ${jobId} AND f."id" = ANY(v."asset_file_ids"))`;
}

export async function loadFileDetail(jobId: string, fileId: string, userId: string): Promise<JobFileDetail | null> {
  const row = await prisma.skillJobFile.findFirst({ where: ownedFile(jobId, fileId, userId), omit: { data: true } });
  if (!row) return null;
  return { ...toFileView(row), facts: row.facts as unknown as FileFacts | null };
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `cd apps/web && npx vitest run src/lib/skills/jobs/files.test.ts`
Expected: PASS (19 tests).

- [ ] **Step 5: Write the failing route test**

```ts
// apps/web/src/app/api/v1/prompt-bot/skill-jobs/file-routes.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  isAiConfigured: vi.fn(),
  after: vi.fn(),
  findOwnedJob: vi.fn(),
  countActiveFiles: vi.fn(),
  storeJobFile: vi.fn(),
  runFileAnalysis: vi.fn(),
  startReanalysis: vi.fn(),
  saveAnalysisEdit: vi.fn(),
  deleteJobFile: vi.fn(),
  loadFileDetail: vi.fn(),
}));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: mocks.after }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/ai/config", async (orig) => ({ ...(await orig<typeof import("@/lib/ai/config")>()), isAiConfigured: mocks.isAiConfigured }));
vi.mock("@/lib/ai/claude", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/skills/jobs/jobs", () => ({ findOwnedJob: mocks.findOwnedJob }));
vi.mock("@/lib/skills/jobs/files", () => ({
  countActiveFiles: mocks.countActiveFiles,
  storeJobFile: mocks.storeJobFile,
  runFileAnalysis: mocks.runFileAnalysis,
  startReanalysis: mocks.startReanalysis,
  saveAnalysisEdit: mocks.saveAnalysisEdit,
  deleteJobFile: mocks.deleteJobFile,
  loadFileDetail: mocks.loadFileDetail,
}));

import { LimitReachedError } from "@/lib/ai/usage";
import { FileReadError, FILE_READ_MESSAGES } from "@/lib/skills/files/types";
import { AlreadyAnalysingError, AlreadyGeneratingError, FileNotFoundError, TooManyFilesError } from "@/lib/skills/jobs/errors";
import * as analyse from "./[id]/files/[fileId]/analyse/route";
import * as file from "./[id]/files/[fileId]/route";
import * as upload from "./[id]/files/route";

type Init = ConstructorParameters<typeof NextRequest>[1];
const ctx = { params: Promise.resolve({ id: "j1" }) };
const fileCtx = { params: Promise.resolve({ id: "j1", fileId: "f1" }) };
const VIEW = { id: "f1", analysisStatus: "PENDING" };
const uploadReq = (body: BodyInit | ReadableStream<Uint8Array> | undefined, name: string | null = "Q3 deck.pptx") =>
  new NextRequest(`http://localhost/x${name === null ? "" : `?name=${encodeURIComponent(name)}`}`, {
    method: "POST",
    body,
    duplex: "half",
  } as Init);
const jsonReq = (method: string, body?: unknown) =>
  new NextRequest("http://localhost/x", { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const error = async (res: Response) => ({ status: res.status, ...(await res.json()).error });

/** A body that sends 10 bytes and then fails, like a dropped mobile connection. */
const droppedStream = () =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(10));
      controller.error(new Error("connection reset"));
    },
  });
/** 21 chunks of 1 MB without allocating 21 MB. */
const oversizedStream = () => {
  const chunk = new Uint8Array(1024 * 1024);
  let sent = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent++ < 21) controller.enqueue(chunk);
      else controller.close();
    },
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "u1", role: "MENTEE" });
  mocks.isAiConfigured.mockReturnValue(true);
  mocks.findOwnedJob.mockResolvedValue({ id: "j1", title: "t", description: "d" });
  mocks.countActiveFiles.mockResolvedValue(0);
  mocks.storeJobFile.mockResolvedValue(VIEW);
});

describe("POST /skill-jobs/[id]/files", () => {
  it("stores the bytes, answers 201 and analyses after the response", async () => {
    const res = await upload.POST(uploadReq(new Uint8Array([1, 2, 3])), ctx);
    expect(res.status).toBe(201);
    expect((await res.json()).data).toEqual(VIEW);
    const input = mocks.storeJobFile.mock.calls[0][0];
    expect(input).toMatchObject({ jobId: "j1", userId: "u1", fileName: "Q3 deck.pptx" });
    expect([...input.bytes]).toEqual([1, 2, 3]);
    expect(mocks.runFileAnalysis).not.toHaveBeenCalled();
    await mocks.after.mock.calls[0][0]();
    expect(mocks.runFileAnalysis).toHaveBeenCalledWith("j1", "f1", "u1");
  });

  it("keeps only the base name and strips control characters from the file name", async () => {
    await upload.POST(uploadReq(new Uint8Array([1]), "C:\\Users\\me\\Q3\u0007 deck.pptx"), ctx);
    expect(mocks.storeJobFile.mock.calls[0][0].fileName).toBe("Q3 deck.pptx");
  });

  it("refuses without a session, without the AI, and without a usable name", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce(null);
    expect((await upload.POST(uploadReq(new Uint8Array([1])), ctx)).status).toBe(401);
    mocks.isAiConfigured.mockReturnValueOnce(false);
    expect(await error(await upload.POST(uploadReq(new Uint8Array([1])), ctx))).toMatchObject({ status: 503, code: "AI_NOT_CONFIGURED" });
    expect((await upload.POST(uploadReq(new Uint8Array([1]), null), ctx)).status).toBe(400);
    expect((await upload.POST(uploadReq(new Uint8Array([1]), "   "), ctx)).status).toBe(400);
    expect((await upload.POST(uploadReq(new Uint8Array([1]), `${"a".repeat(256)}.pptx`), ctx)).status).toBe(400);
    expect(mocks.storeJobFile).not.toHaveBeenCalled();
  });

  it("404s someone else's job and 409s a full job before reading the body", async () => {
    mocks.findOwnedJob.mockResolvedValueOnce(null);
    expect((await upload.POST(uploadReq(new Uint8Array([1])), ctx)).status).toBe(404);
    mocks.countActiveFiles.mockResolvedValueOnce(10);
    expect(await error(await upload.POST(uploadReq(new Uint8Array([1])), ctx))).toMatchObject({ status: 409, code: "TOO_MANY_FILES" });
    expect(mocks.storeJobFile).not.toHaveBeenCalled();
  });

  it("refuses a body over 20 MB with 413", async () => {
    expect(await error(await upload.POST(uploadReq(oversizedStream()), ctx))).toEqual({
      status: 413,
      code: "FILE_TOO_LARGE",
      message: "Files can be up to 20 MB.",
    });
    expect(mocks.storeJobFile).not.toHaveBeenCalled();
  });

  it("stores nothing and spends nothing when the connection drops mid-upload (Review Focus 2)", async () => {
    expect(await error(await upload.POST(uploadReq(droppedStream()), ctx))).toEqual({
      status: 400,
      code: "UPLOAD_INCOMPLETE",
      message: "The upload didn't finish. Try again.",
    });
    expect(mocks.storeJobFile).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("refuses an empty file", async () => {
    expect(await error(await upload.POST(uploadReq(new Uint8Array(0)), ctx))).toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
  });

  it("maps unreadable, encrypted and unsupported files, the file cap and the daily limit", async () => {
    mocks.storeJobFile.mockRejectedValueOnce(new FileReadError("UNSUPPORTED_FILE", FILE_READ_MESSAGES.unsupported));
    expect(await error(await upload.POST(uploadReq(new Uint8Array([1])), ctx))).toEqual({ status: 415, code: "UNSUPPORTED_FILE", message: FILE_READ_MESSAGES.unsupported });
    mocks.storeJobFile.mockRejectedValueOnce(new FileReadError("FILE_ENCRYPTED", FILE_READ_MESSAGES.ole));
    expect((await upload.POST(uploadReq(new Uint8Array([1])), ctx)).status).toBe(422);
    mocks.storeJobFile.mockRejectedValueOnce(new FileReadError("FILE_UNREADABLE", FILE_READ_MESSAGES.unreadable));
    expect((await upload.POST(uploadReq(new Uint8Array([1])), ctx)).status).toBe(422);
    mocks.storeJobFile.mockRejectedValueOnce(new TooManyFilesError());
    expect((await upload.POST(uploadReq(new Uint8Array([1])), ctx)).status).toBe(409);
    mocks.storeJobFile.mockRejectedValueOnce(new LimitReachedError("skill_analyze", new Date("2026-11-26T00:00:00Z")));
    expect(await error(await upload.POST(uploadReq(new Uint8Array([1])), ctx))).toMatchObject({ status: 429, code: "LIMIT_REACHED" });
    expect(mocks.after).not.toHaveBeenCalled();
  });
});

describe("/skill-jobs/[id]/files/[fileId]", () => {
  it("returns the detail with facts, or 404", async () => {
    mocks.loadFileDetail.mockResolvedValueOnce({ id: "f1", facts: { kind: "PDF" } });
    const res = await file.GET(jsonReq("GET"), fileCtx);
    expect((await res.json()).data.facts).toEqual({ kind: "PDF" });
    expect(mocks.loadFileDetail).toHaveBeenCalledWith("j1", "f1", "u1");
    mocks.loadFileDetail.mockResolvedValueOnce(null);
    expect(await error(await file.GET(jsonReq("GET"), fileCtx))).toMatchObject({ status: 404, message: "File not found" });
  });

  it("saves an edited analysis and refuses empty, oversized or running ones", async () => {
    mocks.saveAnalysisEdit.mockResolvedValueOnce({ id: "f1", analysisEdited: true });
    expect((await file.PATCH(jsonReq("PATCH", { analysis: "Mine" }), fileCtx)).status).toBe(200);
    expect(mocks.saveAnalysisEdit).toHaveBeenCalledWith("j1", "f1", "u1", "Mine");
    expect((await file.PATCH(jsonReq("PATCH", { analysis: "   " }), fileCtx)).status).toBe(400);
    expect((await file.PATCH(jsonReq("PATCH", { analysis: "x".repeat(12_001) }), fileCtx)).status).toBe(400);
    mocks.saveAnalysisEdit.mockRejectedValueOnce(new AlreadyAnalysingError());
    expect(await error(await file.PATCH(jsonReq("PATCH", { analysis: "x" }), fileCtx))).toMatchObject({ status: 409, code: "ALREADY_ANALYSING" });
    mocks.saveAnalysisEdit.mockRejectedValueOnce(new FileNotFoundError());
    expect((await file.PATCH(jsonReq("PATCH", { analysis: "x" }), fileCtx)).status).toBe(404);
  });

  it("removes a file, refusing while a skill is being written", async () => {
    mocks.deleteJobFile.mockResolvedValueOnce("soft");
    expect((await (await file.DELETE(jsonReq("DELETE"), fileCtx)).json()).data).toEqual({ deleted: true });
    mocks.deleteJobFile.mockRejectedValueOnce(new AlreadyGeneratingError());
    expect(await error(await file.DELETE(jsonReq("DELETE"), fileCtx))).toMatchObject({ status: 409, code: "ALREADY_GENERATING" });
    mocks.deleteJobFile.mockRejectedValueOnce(new FileNotFoundError());
    expect((await file.DELETE(jsonReq("DELETE"), fileCtx)).status).toBe(404);
  });
});

describe("POST /skill-jobs/[id]/files/[fileId]/analyse", () => {
  it("claims, answers 202 and analyses after the response", async () => {
    mocks.startReanalysis.mockResolvedValueOnce(VIEW);
    const res = await analyse.POST(jsonReq("POST"), fileCtx);
    expect(res.status).toBe(202);
    expect(mocks.startReanalysis).toHaveBeenCalledWith("j1", "f1", "u1");
    await mocks.after.mock.calls[0][0]();
    expect(mocks.runFileAnalysis).toHaveBeenCalledWith("j1", "f1", "u1");
  });

  it("maps 503, 404, 409 and 429 without scheduling anything", async () => {
    mocks.isAiConfigured.mockReturnValueOnce(false);
    expect((await analyse.POST(jsonReq("POST"), fileCtx)).status).toBe(503);
    mocks.startReanalysis.mockRejectedValueOnce(new FileNotFoundError());
    expect((await analyse.POST(jsonReq("POST"), fileCtx)).status).toBe(404);
    mocks.startReanalysis.mockRejectedValueOnce(new AlreadyAnalysingError());
    expect((await analyse.POST(jsonReq("POST"), fileCtx)).status).toBe(409);
    mocks.startReanalysis.mockRejectedValueOnce(new LimitReachedError("skill_analyze", new Date("2026-11-26T00:00:00Z")));
    expect((await analyse.POST(jsonReq("POST"), fileCtx)).status).toBe(429);
    expect(mocks.after).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run it and watch it fail**

Run: `cd apps/web && npx vitest run src/app/api/v1/prompt-bot/skill-jobs/file-routes.test.ts`
Expected: FAIL, "Failed to resolve import ./[id]/files/route".

- [ ] **Step 7: Write the file routes**

```ts
// apps/web/src/app/api/v1/prompt-bot/skill-jobs/[id]/files/route.ts
import { after, NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readBytesWithin } from "@/lib/api/body";
import { errorResponse, successResponse } from "@/lib/api/response";
import { AiNotConfiguredError, isAiConfigured } from "@/lib/ai/config";
import { aiErrorResponse } from "@/lib/prompt-bot/http";
import { JobNotFoundError, TooManyFilesError } from "@/lib/skills/jobs/errors";
import { countActiveFiles, runFileAnalysis, storeJobFile } from "@/lib/skills/jobs/files";
import { jobErrorResponse, unauthorized } from "@/lib/skills/jobs/http";
import { findOwnedJob } from "@/lib/skills/jobs/jobs";
import { JOB_LIMITS } from "@/lib/skills/limits";

const NAME_MAX = 255;

/** The display name: URLSearchParams has already decoded it; keep the base name, drop control characters. */
function uploadName(raw: string | null): string | null {
  if (raw === null) return null;
  const base = raw.split(/[\\/]/).pop() ?? "";
  // eslint-disable-next-line no-control-regex -- control characters are exactly what is being removed.
  const name = base.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return name && name.length <= NAME_MAX ? name : null;
}

/**
 * Uploads one resource file as the raw request body (`?name=` carries the file name). Every cheap check runs
 * before the body is read and before a unit is spent; the row is inserted only after the whole body arrived.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  if (!isAiConfigured()) return aiErrorResponse(new AiNotConfiguredError());
  const fileName = uploadName(req.nextUrl.searchParams.get("name"));
  if (!fileName) {
    return errorResponse("Add the file's name to the upload (up to 255 characters).", "VALIDATION_ERROR", 400, { name: ["Required"] });
  }
  const { id } = await params;
  try {
    if (!(await findOwnedJob(id, user.id))) throw new JobNotFoundError();
    if ((await countActiveFiles(id)) >= JOB_LIMITS.filesPerJob) throw new TooManyFilesError();
    const body = await readBytesWithin(req, JOB_LIMITS.fileBytes);
    if (!body.ok) {
      return body.reason === "too_large"
        ? errorResponse(`Files can be up to ${JOB_LIMITS.fileBytes / (1024 * 1024)} MB.`, "FILE_TOO_LARGE", 413)
        : errorResponse("The upload didn't finish. Try again.", "UPLOAD_INCOMPLETE", 400);
    }
    if (body.bytes.byteLength === 0) return errorResponse("This file is empty.", "VALIDATION_ERROR", 400);
    const view = await storeJobFile({ jobId: id, userId: user.id, fileName, bytes: body.bytes });
    after(() => runFileAnalysis(id, view.id, user.id));
    return successResponse(view, undefined, 201);
  } catch (error) {
    const res = jobErrorResponse(error);
    if (res) return res;
    throw error;
  }
}
```

```ts
// apps/web/src/app/api/v1/prompt-bot/skill-jobs/[id]/files/[fileId]/route.ts
import { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { successResponse, validationErrorResponse } from "@/lib/api/response";
import { deleteJobFile, loadFileDetail, saveAnalysisEdit } from "@/lib/skills/jobs/files";
import { jobErrorResponse, notFound, unauthorized } from "@/lib/skills/jobs/http";
import { JOB_LIMITS } from "@/lib/skills/limits";

type Ctx = { params: Promise<{ id: string; fileId: string }> };
const PatchBody = z.object({ analysis: z.string().trim().min(1).max(JOB_LIMITS.analysisChars) });

export async function GET(_req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id, fileId } = await params;
  const detail = await loadFileDetail(id, fileId, user.id);
  return detail ? successResponse(detail) : notFound("File");
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id, fileId } = await params;
  const parsed = PatchBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return validationErrorResponse(parsed.error);
  try {
    return successResponse(await saveAnalysisEdit(id, fileId, user.id, parsed.data.analysis));
  } catch (error) {
    const res = jobErrorResponse(error);
    if (res) return res;
    throw error;
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id, fileId } = await params;
  try {
    await deleteJobFile(id, fileId, user.id);
    return successResponse({ deleted: true });
  } catch (error) {
    const res = jobErrorResponse(error);
    if (res) return res;
    throw error;
  }
}
```

```ts
// apps/web/src/app/api/v1/prompt-bot/skill-jobs/[id]/files/[fileId]/analyse/route.ts
import { after, NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { successResponse } from "@/lib/api/response";
import { AiNotConfiguredError, isAiConfigured } from "@/lib/ai/config";
import { aiErrorResponse } from "@/lib/prompt-bot/http";
import { runFileAnalysis, startReanalysis } from "@/lib/skills/jobs/files";
import { jobErrorResponse, unauthorized } from "@/lib/skills/jobs/http";

/** Analyse again: claims the file, answers 202, and analyses after the response (PDFs and images can be slow). */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  if (!isAiConfigured()) return aiErrorResponse(new AiNotConfiguredError());
  const { id, fileId } = await params;
  try {
    const view = await startReanalysis(id, fileId, user.id);
    after(() => runFileAnalysis(id, fileId, user.id));
    return successResponse(view, undefined, 202);
  } catch (error) {
    const res = jobErrorResponse(error);
    if (res) return res;
    throw error;
  }
}
```

- [ ] **Step 8: Run the task's tests and type-check**

Run: `cd apps/web && npx vitest run src/lib/skills/jobs src/app/api/v1/prompt-bot/skill-jobs && npx tsc --noEmit`
Expected: PASS; no type errors.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/lib/skills/jobs/files.ts apps/web/src/lib/skills/jobs/files.test.ts \
  "apps/web/src/app/api/v1/prompt-bot/skill-jobs/[id]/files/route.ts" \
  "apps/web/src/app/api/v1/prompt-bot/skill-jobs/[id]/files/[fileId]/route.ts" \
  "apps/web/src/app/api/v1/prompt-bot/skill-jobs/[id]/files/[fileId]/analyse/route.ts" \
  apps/web/src/app/api/v1/prompt-bot/skill-jobs/file-routes.test.ts
git commit -m "feat(skills-builder): upload job files, analyse them after the response, and keep bundled originals"
```

---

### Task 11: Suggest skills and edit the skill list

**Files:**
- Create: `apps/web/src/lib/skills/jobs/skills.ts`
- Create: `apps/web/src/app/api/v1/prompt-bot/skill-jobs/[id]/suggest/route.ts`, `apps/web/src/app/api/v1/prompt-bot/skill-jobs/[id]/skills/route.ts`, `apps/web/src/app/api/v1/prompt-bot/skill-jobs/[id]/skills/[skillId]/route.ts`
- Test: `apps/web/src/lib/skills/jobs/skills.test.ts`, `apps/web/src/app/api/v1/prompt-bot/skill-jobs/skill-routes.test.ts`

**Interfaces:**
- Consumes: `suggestJobSkills(message)` and `buildSuggestMessage(input)` (Task 8); `consumeAiUsage(userId, "skill_split", now?)`; `normalizeSkillName`, `uniqueSkillName`, `oneLine` (`src/lib/skills/names.ts`); Task 9's `activeFiles`, `jobQuestionContext`, `loadJobView`, `skillInclude`, `toFileView`, `toSkillView`, errors, `isGenerating`, `isAnalysing`, `jobErrorResponse`, `unauthorized`; Task 10's `purgeUnreferencedFiles`.
- Produces (contract, plus ✚): `type CleanSuggestion`, `cleanFileIds(ids, activeFileIds)`, `cleanSuggestions(raw, ctx)`, `fallbackSuggestion(job, activeFileIds, taken)`, `suggestForJob(jobId, userId, now?)`, `loadSkillView(jobId, skillId, userId)`, `addSkill(jobId, userId, input)`, `updateSkill(jobId, skillId, userId, patch)`, `deleteSkill(jobId, skillId, userId)`, ✚ `SKILL_PURPOSE_MAX = 300` (replaces `PURPOSE_MAX` from `split.ts`, which Task 15 deletes); routes `POST /skill-jobs/[id]/suggest`, `POST /skill-jobs/[id]/skills`, `PATCH|DELETE /skill-jobs/[id]/skills/[skillId]`.
- Behaviour decision recorded here: `addSkill` without `fileIds` uses all of the job's active files (a manual skill almost always wants the job's templates); the user unticks chips to narrow it.

- [ ] **Step 1: Write the failing data-layer test**

```ts
// apps/web/src/lib/skills/jobs/skills.test.ts
import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  jobFindFirst: vi.fn(),
  jobUpdate: vi.fn(),
  skillFindFirst: vi.fn(),
  skillCreate: vi.fn(),
  skillCreateMany: vi.fn(),
  skillUpdate: vi.fn(),
  skillDelete: vi.fn(),
  skillDeleteMany: vi.fn(),
  versionUpdate: vi.fn(),
  versionUpdateMany: vi.fn(),
  transaction: vi.fn(),
  consumeAiUsage: vi.fn(),
  suggestJobSkills: vi.fn(),
  activeFiles: vi.fn(),
  jobQuestionContext: vi.fn(),
  loadJobView: vi.fn(),
  purgeUnreferencedFiles: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    skillJob: { findFirst: mocks.jobFindFirst, update: mocks.jobUpdate },
    skillJobSkill: {
      findFirst: mocks.skillFindFirst,
      create: mocks.skillCreate,
      createMany: mocks.skillCreateMany,
      update: mocks.skillUpdate,
      delete: mocks.skillDelete,
      deleteMany: mocks.skillDeleteMany,
    },
    skillVersion: { update: mocks.versionUpdate, updateMany: mocks.versionUpdateMany },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/ai/usage", async (orig) => ({ ...(await orig<typeof import("@/lib/ai/usage")>()), consumeAiUsage: mocks.consumeAiUsage }));
vi.mock("@/lib/ai/claude", () => ({ suggestJobSkills: mocks.suggestJobSkills }));
vi.mock("./jobs", async (orig) => ({
  ...(await orig<typeof import("./jobs")>()),
  activeFiles: mocks.activeFiles,
  jobQuestionContext: mocks.jobQuestionContext,
  loadJobView: mocks.loadJobView,
}));
vi.mock("./files", () => ({ purgeUnreferencedFiles: mocks.purgeUnreferencedFiles }));

import { AiResponseError } from "@/lib/ai/errors";
import {
  AlreadyGeneratingError,
  DuplicateNameError,
  EmptyDescriptionError,
  FilesAnalysingError,
  JobNotFoundError,
  SkillNotFoundError,
  TooManySkillsError,
} from "./errors";
import { addSkill, cleanFileIds, cleanSuggestions, deleteSkill, fallbackSuggestion, suggestForJob, updateSkill } from "./skills";

const NOW = new Date("2026-11-25T12:00:00Z");
const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60_000);
const fileRow = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  jobId: "j1",
  fileName: `${id}.pptx`,
  assetName: `${id}.pptx`,
  kind: "PPTX",
  mimeType: "x",
  size: 1000,
  sha256: "h",
  analysis: `analysis of ${id}`,
  analysisStatus: "READY",
  analysisStartedAt: minutesAgo(30),
  analysisEdited: false,
  analysisError: null,
  deletedAt: null,
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});
const skill = (over: Record<string, unknown> = {}) => ({
  id: "s1",
  name: "board-deck",
  purpose: "Builds the deck.",
  status: "READY",
  generationStartedAt: null,
  latestVersion: 1,
  order: 0,
  ...over,
});
const skillViewRow = (over: Record<string, unknown> = {}) => ({
  id: "s9",
  jobId: "j1",
  order: 1,
  name: "new-skill",
  purpose: "Does it.",
  fileIds: [],
  status: "DRAFT",
  validationErrors: [],
  generationStartedAt: null,
  latestVersion: 0,
  createdAt: NOW,
  updatedAt: NOW,
  versions: [],
  ...over,
});
const JOB = { id: "j1", userId: "u1", title: "Board update", description: "Every month I turn the numbers into a deck. Then I email it." };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.activeFiles.mockResolvedValue([fileRow("f1"), fileRow("f2")]);
  mocks.jobQuestionContext.mockResolvedValue([]);
  mocks.loadJobView.mockResolvedValue({ id: "j1", skills: [] });
  mocks.transaction.mockImplementation(async (ops: unknown[]) => ops);
});

describe("cleanFileIds", () => {
  it("keeps the order, drops unknown and repeated ids, and caps at 10", () => {
    expect(cleanFileIds(["f2", "zz", "f1", "f2"], ["f1", "f2"])).toEqual(["f2", "f1"]);
    const many = Array.from({ length: 12 }, (_, i) => `f${i}`);
    expect(cleanFileIds(many, many)).toHaveLength(10);
  });
});

describe("cleanSuggestions", () => {
  it("normalises names unique against kept skills and each other, one-lines purposes and filters files", () => {
    const cleaned = cleanSuggestions(
      {
        skills: [
          { name: "Board Deck", purpose: "Builds\nthe deck.", fileIds: ["f1", "nope"] },
          { name: "board deck", purpose: "Second one.", fileIds: [] },
          { name: "", purpose: "", fileIds: ["f1"] },
          { name: "", purpose: "Writes the email.", fileIds: ["f2"] },
        ],
      },
      { activeFileIds: ["f1", "f2"], keptNames: ["board-deck"], room: 5 },
    );
    expect(cleaned).toEqual([
      { name: "board-deck-2", purpose: "Builds the deck.", fileIds: ["f1"] },
      { name: "board-deck-3", purpose: "Second one.", fileIds: [] },
      { name: "writes-the-email", purpose: "Writes the email.", fileIds: ["f2"] },
    ]);
  });

  it("stops at the room left in the job and cuts purposes to 300 characters", () => {
    const raw = { skills: Array.from({ length: 4 }, (_, i) => ({ name: `s${i}`, purpose: "p".repeat(400), fileIds: [] })) };
    const cleaned = cleanSuggestions(raw, { activeFileIds: [], keptNames: [], room: 2 });
    expect(cleaned).toHaveLength(2);
    expect(cleaned[0].purpose).toHaveLength(300);
  });
});

describe("fallbackSuggestion", () => {
  it("names the skill from the title, takes the first sentence as purpose and uses every file", () => {
    expect(fallbackSuggestion(JOB, ["f1", "f2"], [])).toEqual({ name: "board-update", purpose: "Every month I turn the numbers into a deck.", fileIds: ["f1", "f2"] });
    expect(fallbackSuggestion({ title: "!!!", description: "" }, [], ["my-skill"]).name).toBe("my-skill-2");
  });
});

describe("suggestForJob", () => {
  it("keeps skills with versions, replaces drafts, and records when it suggested", async () => {
    mocks.jobFindFirst.mockResolvedValue({ ...JOB, skills: [skill(), skill({ id: "s2", name: "old-draft", latestVersion: 0, status: "DRAFT", order: 1 })] });
    mocks.suggestJobSkills.mockResolvedValue({ skills: [{ name: "Board email", purpose: "Writes the email.", fileIds: ["f2"] }] });
    await suggestForJob("j1", "u1", NOW);
    expect(mocks.consumeAiUsage).toHaveBeenCalledWith("u1", "skill_split", NOW);
    const message = mocks.suggestJobSkills.mock.calls[0][0];
    expect(message).toContain("- board-deck: Builds the deck.");
    expect(message).not.toContain("old-draft");
    expect(message).toContain("id: f1");
    expect(mocks.skillDeleteMany).toHaveBeenCalledWith({ where: { jobId: "j1", latestVersion: 0 } });
    expect(mocks.skillCreateMany).toHaveBeenCalledWith({
      data: [{ jobId: "j1", order: 1, name: "board-email", purpose: "Writes the email.", fileIds: ["f2"] }],
    });
    expect(mocks.jobUpdate).toHaveBeenCalledWith({ where: { id: "j1" }, data: { suggestedAt: NOW } });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.loadJobView).toHaveBeenCalledWith("j1", "u1", NOW);
  });

  it("falls back to one skill from the title when the model returns nothing usable and no skill exists", async () => {
    mocks.jobFindFirst.mockResolvedValue({ ...JOB, skills: [] });
    mocks.suggestJobSkills.mockResolvedValue({ skills: [{ name: "", purpose: "", fileIds: [] }] });
    await suggestForJob("j1", "u1", NOW);
    expect(mocks.skillCreateMany.mock.calls[0][0].data).toEqual([
      { jobId: "j1", order: 0, name: "board-update", purpose: "Every month I turn the numbers into a deck.", fileIds: ["f1", "f2"] },
    ]);
  });

  it("checks every precondition before spending a unit", async () => {
    mocks.jobFindFirst.mockResolvedValueOnce(null);
    await expect(suggestForJob("j1", "u2", NOW)).rejects.toBeInstanceOf(JobNotFoundError);
    mocks.jobFindFirst.mockResolvedValueOnce({ ...JOB, description: "   ", skills: [] });
    await expect(suggestForJob("j1", "u1", NOW)).rejects.toBeInstanceOf(EmptyDescriptionError);
    mocks.jobFindFirst.mockResolvedValueOnce({ ...JOB, skills: [skill({ status: "GENERATING", generationStartedAt: minutesAgo(1) })] });
    await expect(suggestForJob("j1", "u1", NOW)).rejects.toBeInstanceOf(AlreadyGeneratingError);
    mocks.jobFindFirst.mockResolvedValueOnce({ ...JOB, skills: [] });
    mocks.activeFiles.mockResolvedValueOnce([fileRow("f1", { analysisStatus: "PENDING", analysisStartedAt: minutesAgo(1) })]);
    await expect(suggestForJob("j1", "u1", NOW)).rejects.toBeInstanceOf(FilesAnalysingError);
    mocks.jobFindFirst.mockResolvedValueOnce({ ...JOB, skills: Array.from({ length: 5 }, (_, i) => skill({ id: `s${i}`, name: `k${i}` })) });
    await expect(suggestForJob("j1", "u1", NOW)).rejects.toBeInstanceOf(TooManySkillsError);
    expect(mocks.consumeAiUsage).not.toHaveBeenCalled();
  });

  it("an interrupted analysis does not block suggesting", async () => {
    mocks.jobFindFirst.mockResolvedValue({ ...JOB, skills: [] });
    mocks.activeFiles.mockResolvedValue([fileRow("f1", { analysisStatus: "PENDING", analysisStartedAt: minutesAgo(6), analysis: null })]);
    mocks.suggestJobSkills.mockResolvedValue({ skills: [{ name: "a", purpose: "b", fileIds: ["f1"] }] });
    await suggestForJob("j1", "u1", NOW);
    expect(mocks.suggestJobSkills.mock.calls[0][0]).toContain("(no analysis yet)");
  });

  it("changes nothing when the AI fails", async () => {
    mocks.jobFindFirst.mockResolvedValue({ ...JOB, skills: [] });
    mocks.suggestJobSkills.mockRejectedValue(new AiResponseError("bad"));
    await expect(suggestForJob("j1", "u1", NOW)).rejects.toBeInstanceOf(AiResponseError);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});

describe("addSkill", () => {
  beforeEach(() => {
    mocks.jobFindFirst.mockResolvedValue({ id: "j1", skills: [{ name: "board-deck", order: 0 }] });
    mocks.skillCreate.mockResolvedValue(skillViewRow());
  });

  it("adds a normalised skill after the others, with all active files by default", async () => {
    const view = await addSkill("j1", "u1", { name: "New Skill", purpose: "Does\nit." });
    expect(mocks.skillCreate).toHaveBeenCalledWith({
      data: { jobId: "j1", order: 1, name: "new-skill", purpose: "Does it.", fileIds: ["f1", "f2"] },
      include: expect.objectContaining({ versions: expect.any(Object) }),
    });
    expect(view.name).toBe("new-skill");
    await addSkill("j1", "u1", { name: "Other", purpose: "p", fileIds: ["f2", "gone"] });
    expect(mocks.skillCreate.mock.calls[1][0].data.fileIds).toEqual(["f2"]);
  });

  it("refuses a duplicate name, a full job and a foreign job", async () => {
    await expect(addSkill("j1", "u1", { name: "Board Deck", purpose: "p" })).rejects.toEqual(new DuplicateNameError("board-deck"));
    mocks.jobFindFirst.mockResolvedValueOnce({ id: "j1", skills: Array.from({ length: 5 }, (_, i) => ({ name: `k${i}`, order: i })) });
    await expect(addSkill("j1", "u1", { name: "x", purpose: "p" })).rejects.toBeInstanceOf(TooManySkillsError);
    mocks.jobFindFirst.mockResolvedValueOnce(null);
    await expect(addSkill("j1", "u2", { name: "x", purpose: "p" })).rejects.toBeInstanceOf(JobNotFoundError);
  });

  it("maps a unique-index race (P2002) to DuplicateNameError", async () => {
    mocks.skillCreate.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "6" }));
    await expect(addSkill("j1", "u1", { name: "Race", purpose: "p" })).rejects.toEqual(new DuplicateNameError("race"));
  });
});

describe("updateSkill", () => {
  beforeEach(() => {
    mocks.skillFindFirst.mockResolvedValueOnce(skill()).mockResolvedValue(skillViewRow({ id: "s1", name: "monthly-deck", latestVersion: 1 }));
  });

  it("renames after v1 by changing only the skill row; versions keep their names (Review Focus 4)", async () => {
    mocks.skillFindFirst.mockReset();
    mocks.skillFindFirst
      .mockResolvedValueOnce(skill())
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(skillViewRow({ id: "s1", name: "monthly-deck", latestVersion: 1, versions: [{ version: 1, name: "board-deck", createdAt: NOW, assetFileIds: [] }] }));
    const view = await updateSkill("j1", "s1", "u1", { name: "Monthly deck" });
    expect(mocks.skillFindFirst.mock.calls[1][0]).toEqual({ where: { jobId: "j1", name: "monthly-deck", id: { not: "s1" } }, select: { id: true } });
    expect(mocks.skillUpdate).toHaveBeenCalledWith({ where: { id: "s1" }, data: { name: "monthly-deck" } });
    expect(mocks.versionUpdate).not.toHaveBeenCalled();
    expect(mocks.versionUpdateMany).not.toHaveBeenCalled();
    expect(view.name).toBe("monthly-deck");
    expect(view.versions[0].name).toBe("board-deck");
  });

  it("updates purpose, order and files (filtered to active files)", async () => {
    await updateSkill("j1", "s1", "u1", { purpose: "New\npurpose", order: 3, fileIds: ["f2", "gone"] });
    expect(mocks.skillUpdate).toHaveBeenCalledWith({ where: { id: "s1" }, data: { purpose: "New purpose", order: 3, fileIds: ["f2"] } });
  });

  it("refuses a rename while generating and a duplicate name, and 404s a foreign skill", async () => {
    mocks.skillFindFirst.mockReset();
    mocks.skillFindFirst.mockResolvedValueOnce(skill({ status: "GENERATING", generationStartedAt: new Date() }));
    await expect(updateSkill("j1", "s1", "u1", { name: "other" })).rejects.toBeInstanceOf(AlreadyGeneratingError);
    mocks.skillFindFirst.mockResolvedValueOnce(skill()).mockResolvedValueOnce({ id: "s2" });
    await expect(updateSkill("j1", "s1", "u1", { name: "taken" })).rejects.toEqual(new DuplicateNameError("taken"));
    mocks.skillFindFirst.mockResolvedValueOnce(null);
    await expect(updateSkill("j1", "s1", "u2", { purpose: "p" })).rejects.toBeInstanceOf(SkillNotFoundError);
    expect(mocks.skillUpdate).not.toHaveBeenCalled();
  });

  it("maps a P2002 rename race to DuplicateNameError", async () => {
    mocks.skillFindFirst.mockReset();
    mocks.skillFindFirst.mockResolvedValueOnce(skill()).mockResolvedValueOnce(null);
    mocks.skillUpdate.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "6" }));
    await expect(updateSkill("j1", "s1", "u1", { name: "Race" })).rejects.toEqual(new DuplicateNameError("race"));
  });
});

describe("deleteSkill", () => {
  it("deletes the skill (its versions cascade) and purges files only old versions needed", async () => {
    mocks.skillFindFirst.mockResolvedValue(skill());
    await deleteSkill("j1", "s1", "u1");
    expect(mocks.skillDelete).toHaveBeenCalledWith({ where: { id: "s1" } });
    expect(mocks.purgeUnreferencedFiles).toHaveBeenCalledWith("j1");
  });

  it("refuses while generating and 404s a foreign skill", async () => {
    mocks.skillFindFirst.mockResolvedValueOnce(skill({ status: "GENERATING", generationStartedAt: new Date() }));
    await expect(deleteSkill("j1", "s1", "u1")).rejects.toBeInstanceOf(AlreadyGeneratingError);
    mocks.skillFindFirst.mockResolvedValueOnce(null);
    await expect(deleteSkill("j1", "s1", "u2")).rejects.toBeInstanceOf(SkillNotFoundError);
    expect(mocks.skillDelete).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd apps/web && npx vitest run src/lib/skills/jobs/skills.test.ts`
Expected: FAIL, "Failed to resolve import ./skills".

- [ ] **Step 3: Write the skills data layer**

```ts
// apps/web/src/lib/skills/jobs/skills.ts
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { suggestJobSkills } from "@/lib/ai/claude";
import { consumeAiUsage } from "@/lib/ai/usage";
import { JOB_LIMITS } from "../limits";
import { normalizeSkillName, oneLine, uniqueSkillName } from "../names";
import {
  AlreadyGeneratingError,
  DuplicateNameError,
  EmptyDescriptionError,
  FilesAnalysingError,
  JobNotFoundError,
  SkillNotFoundError,
  TooManySkillsError,
} from "./errors";
import { purgeUnreferencedFiles } from "./files";
import { buildSuggestMessage } from "./instructions";
import { activeFiles, jobQuestionContext, loadJobView, skillInclude, toFileView, toSkillView } from "./jobs";
import { isAnalysing, isGenerating } from "./staleness";
import type { JobSkillView, JobView, RawSuggestions } from "./types";

export const SKILL_PURPOSE_MAX = 300;

export type CleanSuggestion = { name: string; purpose: string; fileIds: string[] };

/** The job's active files only, in the caller's order, each once, at most JOB_LIMITS.fileIdsPerSkill. */
export function cleanFileIds(ids: readonly string[], activeFileIds: readonly string[]): string[] {
  const allowed = new Set(activeFileIds);
  const out: string[] = [];
  for (const id of ids) {
    if (out.length >= JOB_LIMITS.fileIdsPerSkill) break;
    if (allowed.has(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

/** The spec's clean-up of the model's suggestions: valid unique names, one-line purposes, known files, room left. */
export function cleanSuggestions(raw: RawSuggestions, ctx: { activeFileIds: string[]; keptNames: string[]; room: number }): CleanSuggestion[] {
  const taken = new Set(ctx.keptNames);
  const out: CleanSuggestion[] = [];
  for (const suggestion of raw.skills) {
    if (out.length >= ctx.room) break;
    const label = oneLine(suggestion.name);
    const purpose = oneLine(suggestion.purpose, SKILL_PURPOSE_MAX);
    if (!label && !purpose) continue;
    const name = uniqueSkillName(label || purpose, taken);
    taken.add(name);
    out.push({ name, purpose: purpose || label, fileIds: cleanFileIds(suggestion.fileIds, ctx.activeFileIds) });
  }
  return out;
}

/** One skill named after the job when the model gave nothing usable and the job has no skills. */
export function fallbackSuggestion(job: { title: string; description: string }, activeFileIds: string[], taken: string[]): CleanSuggestion {
  const firstSentence = oneLine(job.description).split(/(?<=[.!?])\s/)[0] ?? "";
  const purpose = oneLine(firstSentence, SKILL_PURPOSE_MAX) || oneLine(job.title, SKILL_PURPOSE_MAX) || "Does this job the way I do it.";
  return { name: uniqueSkillName(normalizeSkillName(job.title, "my-skill"), taken), purpose, fileIds: cleanFileIds(activeFileIds, activeFileIds) };
}

/** A unique-index race (two saves of the same name) reads exactly like the pre-check's refusal. */
function rethrowDuplicate(error: unknown, name: string): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new DuplicateNameError(name);
  throw error;
}

/**
 * Suggest (spec, Suggest Skills): every precondition, then one skill_split unit and one Opus call, then one
 * transaction that replaces never-generated skills with the cleaned suggestions. Skills with versions stay.
 */
export async function suggestForJob(jobId: string, userId: string, now = new Date()): Promise<JobView> {
  const job = await prisma.skillJob.findFirst({
    where: { id: jobId, userId },
    select: {
      id: true,
      title: true,
      description: true,
      skills: { select: { id: true, name: true, purpose: true, status: true, generationStartedAt: true, latestVersion: true, order: true }, orderBy: { order: "asc" } },
    },
  });
  if (!job) throw new JobNotFoundError();
  if (!job.description.trim()) throw new EmptyDescriptionError();
  if (job.skills.some((s) => isGenerating(s.status, s.generationStartedAt, now))) throw new AlreadyGeneratingError();
  const files = await activeFiles(jobId);
  if (files.some((f) => isAnalysing(f.analysisStatus, f.analysisStartedAt, now))) throw new FilesAnalysingError();
  const kept = job.skills.filter((s) => s.latestVersion > 0);
  const room = JOB_LIMITS.skillsPerJob - kept.length;
  if (room <= 0) throw new TooManySkillsError();

  const fileViews = files.map((f) => toFileView(f, now));
  const activeFileIds = fileViews.map((f) => f.id);
  const message = buildSuggestMessage({
    title: job.title,
    description: job.description,
    questions: await jobQuestionContext(jobId),
    files: fileViews.map((f) => ({ id: f.id, fileName: f.fileName, kind: f.kind, size: f.size, analysis: f.analysisStatus === "READY" ? f.analysis : null })),
    built: kept.map((s) => ({ name: s.name, purpose: s.purpose })),
  });
  await consumeAiUsage(userId, "skill_split", now);
  const raw = await suggestJobSkills(message);

  let cleaned = cleanSuggestions(raw, { activeFileIds, keptNames: kept.map((s) => s.name), room });
  if (cleaned.length === 0 && kept.length === 0) cleaned = [fallbackSuggestion(job, activeFileIds, [])];
  const start = Math.max(-1, ...kept.map((s) => s.order)) + 1;
  await prisma.$transaction([
    prisma.skillJobSkill.deleteMany({ where: { jobId, latestVersion: 0 } }),
    ...(cleaned.length > 0
      ? [prisma.skillJobSkill.createMany({ data: cleaned.map((s, i) => ({ jobId, order: start + i, name: s.name, purpose: s.purpose, fileIds: s.fileIds })) })]
      : []),
    prisma.skillJob.update({ where: { id: jobId }, data: { suggestedAt: now } }),
  ]);
  const view = await loadJobView(jobId, userId, now);
  if (!view) throw new JobNotFoundError();
  return view;
}

export async function loadSkillView(jobId: string, skillId: string, userId: string): Promise<JobSkillView | null> {
  const row = await prisma.skillJobSkill.findFirst({ where: { id: skillId, jobId, job: { userId } }, include: skillInclude });
  return row ? toSkillView(row) : null;
}

export async function addSkill(jobId: string, userId: string, input: { name: string; purpose: string; fileIds?: string[] }): Promise<JobSkillView> {
  const job = await prisma.skillJob.findFirst({ where: { id: jobId, userId }, select: { id: true, skills: { select: { name: true, order: true } } } });
  if (!job) throw new JobNotFoundError();
  if (job.skills.length >= JOB_LIMITS.skillsPerJob) throw new TooManySkillsError();
  const name = normalizeSkillName(input.name);
  if (job.skills.some((s) => s.name === name)) throw new DuplicateNameError(name);
  const activeFileIds = (await activeFiles(jobId)).map((f) => f.id);
  try {
    const row = await prisma.skillJobSkill.create({
      data: {
        jobId,
        order: Math.max(-1, ...job.skills.map((s) => s.order)) + 1,
        name,
        purpose: oneLine(input.purpose, SKILL_PURPOSE_MAX),
        fileIds: cleanFileIds(input.fileIds ?? activeFileIds, activeFileIds),
      },
      include: skillInclude,
    });
    return toSkillView(row);
  } catch (error) {
    rethrowDuplicate(error, name);
  }
}

/** Renaming changes the next version's name only; existing versions are immutable (spec, Data Model). */
export async function updateSkill(
  jobId: string,
  skillId: string,
  userId: string,
  patch: { name?: string; purpose?: string; fileIds?: string[]; order?: number },
): Promise<JobSkillView> {
  const skill = await prisma.skillJobSkill.findFirst({
    where: { id: skillId, jobId, job: { userId } },
    select: { id: true, name: true, status: true, generationStartedAt: true },
  });
  if (!skill) throw new SkillNotFoundError();
  const data: Prisma.SkillJobSkillUpdateInput = {};
  if (patch.purpose !== undefined) data.purpose = oneLine(patch.purpose, SKILL_PURPOSE_MAX);
  if (patch.order !== undefined) data.order = patch.order;
  if (patch.fileIds !== undefined) data.fileIds = cleanFileIds(patch.fileIds, (await activeFiles(jobId)).map((f) => f.id));
  const name = patch.name === undefined ? skill.name : normalizeSkillName(patch.name);
  if (name !== skill.name) {
    if (isGenerating(skill.status, skill.generationStartedAt)) throw new AlreadyGeneratingError();
    const clash = await prisma.skillJobSkill.findFirst({ where: { jobId, name, id: { not: skillId } }, select: { id: true } });
    if (clash) throw new DuplicateNameError(name);
    data.name = name;
  }
  if (Object.keys(data).length > 0) {
    try {
      await prisma.skillJobSkill.update({ where: { id: skillId }, data });
    } catch (error) {
      rethrowDuplicate(error, name);
    }
  }
  const view = await loadSkillView(jobId, skillId, userId);
  if (!view) throw new SkillNotFoundError();
  return view;
}

/** Deletes the skill and its versions (cascade), then the removed files only those versions kept. */
export async function deleteSkill(jobId: string, skillId: string, userId: string): Promise<void> {
  const skill = await prisma.skillJobSkill.findFirst({ where: { id: skillId, jobId, job: { userId } }, select: { id: true, status: true, generationStartedAt: true } });
  if (!skill) throw new SkillNotFoundError();
  if (isGenerating(skill.status, skill.generationStartedAt)) throw new AlreadyGeneratingError();
  await prisma.skillJobSkill.delete({ where: { id: skillId } });
  await purgeUnreferencedFiles(jobId);
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `cd apps/web && npx vitest run src/lib/skills/jobs/skills.test.ts`
Expected: PASS (17 tests).

- [ ] **Step 5: Write the failing route test**

```ts
// apps/web/src/app/api/v1/prompt-bot/skill-jobs/skill-routes.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  isAiConfigured: vi.fn(),
  suggestForJob: vi.fn(),
  addSkill: vi.fn(),
  updateSkill: vi.fn(),
  deleteSkill: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/ai/config", async (orig) => ({ ...(await orig<typeof import("@/lib/ai/config")>()), isAiConfigured: mocks.isAiConfigured }));
vi.mock("@/lib/ai/claude", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/skills/jobs/skills", async (orig) => ({
  ...(await orig<typeof import("@/lib/skills/jobs/skills")>()),
  suggestForJob: mocks.suggestForJob,
  addSkill: mocks.addSkill,
  updateSkill: mocks.updateSkill,
  deleteSkill: mocks.deleteSkill,
}));

import { AiResponseError } from "@/lib/ai/errors";
import { LimitReachedError } from "@/lib/ai/usage";
import {
  AlreadyGeneratingError,
  DuplicateNameError,
  EmptyDescriptionError,
  FilesAnalysingError,
  JobNotFoundError,
  SkillNotFoundError,
  TooManySkillsError,
} from "@/lib/skills/jobs/errors";
import * as skill from "./[id]/skills/[skillId]/route";
import * as skills from "./[id]/skills/route";
import * as suggest from "./[id]/suggest/route";

const req = (method: string, body?: unknown) =>
  new NextRequest("http://localhost/x", { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = { params: Promise.resolve({ id: "j1" }) };
const skillCtx = { params: Promise.resolve({ id: "j1", skillId: "s1" }) };
const error = async (res: Response) => ({ status: res.status, ...(await res.json()).error });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "u1", role: "MENTEE" });
  mocks.isAiConfigured.mockReturnValue(true);
});

describe("POST /skill-jobs/[id]/suggest", () => {
  it("returns the job with its suggested skills", async () => {
    mocks.suggestForJob.mockResolvedValue({ id: "j1", skills: [{ name: "board-deck" }] });
    const res = await suggest.POST(req("POST"), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).data.skills).toEqual([{ name: "board-deck" }]);
    expect(mocks.suggestForJob).toHaveBeenCalledWith("j1", "u1");
  });

  it("maps every refusal", async () => {
    mocks.isAiConfigured.mockReturnValueOnce(false);
    expect((await suggest.POST(req("POST"), ctx)).status).toBe(503);
    expect(mocks.suggestForJob).not.toHaveBeenCalled();
    const cases: [Error, number, string][] = [
      [new JobNotFoundError(), 404, "NOT_FOUND"],
      [new EmptyDescriptionError(), 400, "VALIDATION_ERROR"],
      [new FilesAnalysingError(), 409, "FILES_ANALYSING"],
      [new AlreadyGeneratingError(), 409, "ALREADY_GENERATING"],
      [new TooManySkillsError(), 409, "TOO_MANY_SKILLS"],
      [new LimitReachedError("skill_split", new Date("2026-11-26T00:00:00Z")), 429, "LIMIT_REACHED"],
      [new AiResponseError("bad"), 502, "AI_FAILED"],
    ];
    for (const [thrown, status, code] of cases) {
      mocks.suggestForJob.mockRejectedValueOnce(thrown);
      expect(await error(await suggest.POST(req("POST"), ctx))).toMatchObject({ status, code });
    }
  });
});

describe("POST /skill-jobs/[id]/skills", () => {
  it("adds a skill and answers 201", async () => {
    mocks.addSkill.mockResolvedValue({ id: "s9", name: "new-skill" });
    const res = await skills.POST(req("POST", { name: "New skill", purpose: "Does it.", fileIds: ["f1"] }), ctx);
    expect(res.status).toBe(201);
    expect(mocks.addSkill).toHaveBeenCalledWith("j1", "u1", { name: "New skill", purpose: "Does it.", fileIds: ["f1"] });
  });

  it("validates the body and maps duplicates, a full job and ownership", async () => {
    expect((await skills.POST(req("POST", { name: "", purpose: "p" }), ctx)).status).toBe(400);
    expect((await skills.POST(req("POST", { name: "n", purpose: "p".repeat(301) }), ctx)).status).toBe(400);
    expect((await skills.POST(req("POST", { name: "n", purpose: "p", fileIds: Array.from({ length: 11 }, (_, i) => `f${i}`) }), ctx)).status).toBe(400);
    mocks.addSkill.mockRejectedValueOnce(new DuplicateNameError("board-deck"));
    expect(await error(await skills.POST(req("POST", { name: "Board deck", purpose: "p" }), ctx))).toMatchObject({ status: 409, code: "DUPLICATE_NAME" });
    mocks.addSkill.mockRejectedValueOnce(new TooManySkillsError());
    expect((await skills.POST(req("POST", { name: "x", purpose: "p" }), ctx)).status).toBe(409);
    mocks.addSkill.mockRejectedValueOnce(new JobNotFoundError());
    expect((await skills.POST(req("POST", { name: "x", purpose: "p" }), ctx)).status).toBe(404);
    mocks.getCurrentUser.mockResolvedValueOnce(null);
    expect((await skills.POST(req("POST", { name: "x", purpose: "p" }), ctx)).status).toBe(401);
  });
});

describe("/skill-jobs/[id]/skills/[skillId]", () => {
  it("patches a skill", async () => {
    mocks.updateSkill.mockResolvedValue({ id: "s1", name: "monthly-deck" });
    const res = await skill.PATCH(req("PATCH", { name: "Monthly deck", order: 2 }), skillCtx);
    expect((await res.json()).data.name).toBe("monthly-deck");
    expect(mocks.updateSkill).toHaveBeenCalledWith("j1", "s1", "u1", { name: "Monthly deck", order: 2 });
  });

  it("validates and maps the patch refusals", async () => {
    expect((await skill.PATCH(req("PATCH", {}), skillCtx)).status).toBe(400);
    expect((await skill.PATCH(req("PATCH", { order: -1 }), skillCtx)).status).toBe(400);
    mocks.updateSkill.mockRejectedValueOnce(new AlreadyGeneratingError());
    expect(await error(await skill.PATCH(req("PATCH", { name: "x" }), skillCtx))).toMatchObject({ status: 409, code: "ALREADY_GENERATING" });
    mocks.updateSkill.mockRejectedValueOnce(new DuplicateNameError("x"));
    expect(await error(await skill.PATCH(req("PATCH", { name: "x" }), skillCtx))).toMatchObject({ status: 409, code: "DUPLICATE_NAME" });
    mocks.updateSkill.mockRejectedValueOnce(new SkillNotFoundError());
    expect(await error(await skill.PATCH(req("PATCH", { purpose: "p" }), skillCtx))).toMatchObject({ status: 404, message: "Skill not found" });
  });

  it("deletes a skill and maps its refusals", async () => {
    expect((await (await skill.DELETE(req("DELETE"), skillCtx)).json()).data).toEqual({ deleted: true });
    expect(mocks.deleteSkill).toHaveBeenCalledWith("j1", "s1", "u1");
    mocks.deleteSkill.mockRejectedValueOnce(new AlreadyGeneratingError());
    expect((await skill.DELETE(req("DELETE"), skillCtx)).status).toBe(409);
    mocks.deleteSkill.mockRejectedValueOnce(new SkillNotFoundError());
    expect((await skill.DELETE(req("DELETE"), skillCtx)).status).toBe(404);
  });
});
```

- [ ] **Step 6: Run it and watch it fail**

Run: `cd apps/web && npx vitest run src/app/api/v1/prompt-bot/skill-jobs/skill-routes.test.ts`
Expected: FAIL, "Failed to resolve import ./[id]/skills/[skillId]/route".

- [ ] **Step 7: Write the suggest and skill routes**

```ts
// apps/web/src/app/api/v1/prompt-bot/skill-jobs/[id]/suggest/route.ts
import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { successResponse } from "@/lib/api/response";
import { AiNotConfiguredError, isAiConfigured } from "@/lib/ai/config";
import { aiErrorResponse } from "@/lib/prompt-bot/http";
import { jobErrorResponse, unauthorized } from "@/lib/skills/jobs/http";
import { suggestForJob } from "@/lib/skills/jobs/skills";

/** Suggest runs inside the request (one 100 s Opus attempt, under App Runner's 120 s cap). */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  if (!isAiConfigured()) return aiErrorResponse(new AiNotConfiguredError());
  const { id } = await params;
  try {
    return successResponse(await suggestForJob(id, user.id));
  } catch (error) {
    const res = jobErrorResponse(error);
    if (res) return res;
    throw error;
  }
}
```

```ts
// apps/web/src/app/api/v1/prompt-bot/skill-jobs/[id]/skills/route.ts
import { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { successResponse, validationErrorResponse } from "@/lib/api/response";
import { jobErrorResponse, unauthorized } from "@/lib/skills/jobs/http";
import { addSkill, SKILL_PURPOSE_MAX } from "@/lib/skills/jobs/skills";
import { JOB_LIMITS } from "@/lib/skills/limits";

const Body = z.object({
  name: z.string().trim().min(1).max(120),
  purpose: z.string().trim().min(1).max(SKILL_PURPOSE_MAX),
  fileIds: z.array(z.string().min(1).max(64)).max(JOB_LIMITS.fileIdsPerSkill).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return validationErrorResponse(parsed.error);
  try {
    return successResponse(await addSkill(id, user.id, parsed.data), undefined, 201);
  } catch (error) {
    const res = jobErrorResponse(error);
    if (res) return res;
    throw error;
  }
}
```

```ts
// apps/web/src/app/api/v1/prompt-bot/skill-jobs/[id]/skills/[skillId]/route.ts
import { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { successResponse, validationErrorResponse } from "@/lib/api/response";
import { jobErrorResponse, unauthorized } from "@/lib/skills/jobs/http";
import { deleteSkill, SKILL_PURPOSE_MAX, updateSkill } from "@/lib/skills/jobs/skills";
import { JOB_LIMITS } from "@/lib/skills/limits";

type Ctx = { params: Promise<{ id: string; skillId: string }> };
const PatchBody = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    purpose: z.string().trim().min(1).max(SKILL_PURPOSE_MAX).optional(),
    fileIds: z.array(z.string().min(1).max(64)).max(JOB_LIMITS.fileIdsPerSkill).optional(),
    order: z.number().int().min(0).max(1000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id, skillId } = await params;
  const parsed = PatchBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return validationErrorResponse(parsed.error);
  try {
    return successResponse(await updateSkill(id, skillId, user.id, parsed.data));
  } catch (error) {
    const res = jobErrorResponse(error);
    if (res) return res;
    throw error;
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id, skillId } = await params;
  try {
    await deleteSkill(id, skillId, user.id);
    return successResponse({ deleted: true });
  } catch (error) {
    const res = jobErrorResponse(error);
    if (res) return res;
    throw error;
  }
}
```

- [ ] **Step 8: Run the task's tests and type-check**

Run: `cd apps/web && npx vitest run src/lib/skills/jobs src/app/api/v1/prompt-bot/skill-jobs && npx tsc --noEmit`
Expected: PASS; no type errors.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/lib/skills/jobs/skills.ts apps/web/src/lib/skills/jobs/skills.test.ts \
  "apps/web/src/app/api/v1/prompt-bot/skill-jobs/[id]/suggest/route.ts" \
  "apps/web/src/app/api/v1/prompt-bot/skill-jobs/[id]/skills/route.ts" \
  "apps/web/src/app/api/v1/prompt-bot/skill-jobs/[id]/skills/[skillId]/route.ts" \
  apps/web/src/app/api/v1/prompt-bot/skill-jobs/skill-routes.test.ts
git commit -m "feat(skills-builder): suggest skills for a job and let the user rename, add and remove them"
```

---

### Task 12: Job skill assembly (asset plan, files section, style guide, validation)

**Files:**
- Modify: `apps/web/src/lib/skills/assemble.ts` (export `inFolder`; the old `SkillDraft`/`assembleSkillFiles` stay until Task 15, which removes them with their last user)
- Modify: `apps/web/src/lib/skills/assemble.test.ts` (add `inFolder` tests)
- Create: `apps/web/src/lib/skills/jobs/assemble.ts`
- Test: `apps/web/src/lib/skills/jobs/assemble.test.ts`

**Interfaces:**
- Consumes:
  - `buildSkillMd(name: string, description: string, compatibility: string, body: string): string` (`src/lib/skills/assemble.ts`, existing)
  - `checkSkillPath(path: string): PathCheck`, `validateSkillFiles(files: SkillFile[], expectedName: string): string[]` (`src/lib/skills/format.ts`, existing)
  - `SKILL_LIMITS` (existing) and `JOB_LIMITS` (Task 1) from `src/lib/skills/limits.ts`
  - `oneLine(value: string, max?: number): string` (`src/lib/skills/names.ts`)
  - `SkillFileKind` (Task 3, `src/lib/skills/files/types.ts`)
  - `ShippedFile = PromptFile & ({ shipping: "bundled"; path: string } | { shipping: "analysis-only"; reason: "too-large" | "over-budget" })`, `PromptFile = { id; fileName; kind; size; analysis }` (Task 8, `src/lib/skills/jobs/instructions.ts`)
  - `JobSkillDraft`, `VersionAsset` (Task 8, `src/lib/skills/jobs/types.ts`)
- Produces:
  - `inFolder(folder: string, path: string): string` (now exported from `src/lib/skills/assemble.ts`)
  - `src/lib/skills/jobs/assemble.ts`:
    - `export const STYLE_GUIDE_PATH = "references/style-guide.md"`
    - `export const SHORTENED_MARKER = "[Shortened to fit the 200 KB file limit.]"`
    - `export type PlanInputFile = { id: string; fileName: string; assetName: string; kind: SkillFileKind; size: number; analysis: string | null }`
    - `planAssets(files: PlanInputFile[]): ShippedFile[]`
    - `filesSection(plan: ShippedFile[]): string` (`""` when the skill uses no files)
    - `buildStyleGuide(plan: ShippedFile[]): string | null` (`null` when the skill uses no files)
    - `assembleJobSkill(name: string, draft: JobSkillDraft, plan: ShippedFile[]): { files: SkillFile[]; assets: VersionAsset[] }`
    - `validateJobSkill(name: string, files: SkillFile[], assets: VersionAsset[]): string[]`

- [ ] **Step 1: Write the failing tests**

Append to `apps/web/src/lib/skills/assemble.test.ts` (and add `inFolder` to its import from `./assemble`):

```ts
describe("inFolder", () => {
  it.each([
    ["context.md", "references/context.md"],
    ["references/context.md", "references/context.md"],
    ["./references/a.md", "references/a.md"],
    [" ./x.md ", "references/x.md"],
  ])("places %j under references/ once", (input, expected) => {
    expect(inFolder("references", input)).toBe(expected);
  });
});
```

The import line at the top of that file becomes:

```ts
import { assembleSkillFiles, buildSkillMd, inFolder, type SkillDraft } from "./assemble";
```

Create `apps/web/src/lib/skills/jobs/assemble.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { splitFrontmatter } from "../frontmatter";
import { SKILL_LIMITS } from "../limits";
import {
  assembleJobSkill,
  buildStyleGuide,
  filesSection,
  planAssets,
  SHORTENED_MARKER,
  STYLE_GUIDE_PATH,
  validateJobSkill,
  type PlanInputFile,
} from "./assemble";
import type { JobSkillDraft, VersionAsset } from "./types";

const MB = 1024 * 1024;
const file = (over: Partial<PlanInputFile> = {}): PlanInputFile => ({
  id: "f1",
  fileName: "Q3 board deck.pptx",
  assetName: "q3-board-deck.pptx",
  kind: "PPTX",
  size: 2 * MB,
  analysis: "## Colours\n\n- Navy #1F4E79 for titles",
  ...over,
});
const DRAFT: JobSkillDraft = {
  description: 'Writes the monthly board update: "numbers first".\nUse when asked for a board update.',
  compatibility: "",
  body: "# Board update\n\nRead `references/style-guide.md` before writing.",
  references: [{ path: "board-context.md", content: "[Add the board's priorities here]" }],
  scripts: [{ path: "count_words.py", content: "import sys\nprint(len(sys.stdin.read().split()))\n", purpose: "Counts the words in a draft." }],
};

describe("planAssets", () => {
  it("bundles files up to 10 MB at assets/<assetName> and marks larger ones analysis only", () => {
    const plan = planAssets([file(), file({ id: "f2", fileName: "Brand book.pdf", assetName: "brand-book.pdf", kind: "PDF", size: 12 * MB })]);
    expect(plan[0]).toMatchObject({ id: "f1", shipping: "bundled", path: "assets/q3-board-deck.pptx", analysis: file().analysis });
    expect(plan[1]).toMatchObject({ id: "f2", shipping: "analysis-only", reason: "too-large" });
  });

  it("bundles a file of exactly 10 MB", () => {
    expect(planAssets([file({ size: 10 * MB })])[0].shipping).toBe("bundled");
  });

  it("keeps the skill's file order and stops bundling past 25 MB in total, still fitting later small files", () => {
    const plan = planAssets([
      file({ id: "a", assetName: "a.pptx", size: 9 * MB }),
      file({ id: "b", assetName: "b.pptx", size: 9 * MB }),
      file({ id: "c", assetName: "c.pptx", size: 9 * MB }),
      file({ id: "d", assetName: "d.png", kind: "PNG", size: 1 * MB }),
    ]);
    expect(plan.map((p) => p.id)).toEqual(["a", "b", "c", "d"]);
    expect(plan.map((p) => (p.shipping === "bundled" ? "bundled" : p.reason))).toEqual(["bundled", "bundled", "over-budget", "bundled"]);
  });
});

describe("filesSection", () => {
  it("writes the server's section: style guide, bundled originals and analysis-only files", () => {
    const plan = planAssets([
      file(),
      file({ id: "f2", fileName: 'The "Brand" <book>.pdf', assetName: "brand-book.pdf", kind: "PDF", size: Math.round(14.2 * MB) }),
    ]);
    expect(filesSection(plan)).toBe(
      [
        "## Files in this skill",
        "",
        "- `references/style-guide.md`: colours, fonts, layouts and structure taken from the files below. Follow it for anything you produce.",
        '- `assets/q3-board-deck.pptx`: the original "Q3 board deck.pptx". Start from this file and reuse its masters, layouts and theme instead of recreating the design.',
        '- "The Brand book.pdf" (14.2 MB) was too large to include. Its style is described in `references/style-guide.md`.',
      ].join("\n"),
    );
  });

  it("explains a file left out by the 25 MB budget", () => {
    const plan = planAssets([file({ size: 9 * MB }), file({ id: "b", assetName: "b.pptx", size: 9 * MB }), file({ id: "c", fileName: "Old deck.pptx", assetName: "c.pptx", size: 9 * MB })]);
    expect(filesSection(plan)).toContain(
      "- \"Old deck.pptx\" (9.0 MB) didn't fit in this skill's 25 MB of bundled files. Its style is described in `references/style-guide.md`.",
    );
  });

  it("uses wording that fits Word, Excel and image originals", () => {
    const section = filesSection(
      planAssets([
        file({ id: "w", fileName: "Memo.docx", assetName: "memo.docx", kind: "DOCX" }),
        file({ id: "x", fileName: "Model.xlsx", assetName: "model.xlsx", kind: "XLSX" }),
        file({ id: "p", fileName: "Logo.png", assetName: "logo.png", kind: "PNG" }),
      ]),
    );
    expect(section).toContain("reuse its styles and page setup instead of recreating them.");
    expect(section).toContain("reuse its sheets, formulas and number formats instead of rebuilding them.");
    expect(section).toContain('- `assets/logo.png`: the original "Logo.png". Use it as the reference for how the result should look.');
  });

  it("is empty when the skill uses no files", () => {
    expect(filesSection([])).toBe("");
  });
});

describe("buildStyleGuide", () => {
  it("is null when the skill uses no files", () => {
    expect(buildStyleGuide([])).toBeNull();
  });

  it("uses each analysis exactly as stored, with how the file ships, and says when none exists", () => {
    const edited = "## Colours\n\n- Brand red #C00000 (edited by hand)\n";
    const guide = buildStyleGuide(
      planAssets([file({ analysis: edited }), file({ id: "f2", fileName: "Brand book.pdf", assetName: "brand-book.pdf", kind: "PDF", size: 12 * MB, analysis: null })]),
    )!;
    expect(guide).toBe(
      [
        "# Style guide",
        "",
        "Taken from the files uploaded for this job. Analyses edited by hand are used exactly as written.",
        "",
        "## Q3 board deck.pptx",
        "",
        "Bundled as assets/q3-board-deck.pptx.",
        "",
        "## Colours\n\n- Brand red #C00000 (edited by hand)",
        "",
        "## Brand book.pdf",
        "",
        "Not bundled (too large).",
        "",
        "No analysis is available for this file.",
        "",
      ].join("\n"),
    );
  });

  it("shortens every analysis proportionally so the file stays within 200 KB", () => {
    const files = Array.from({ length: 10 }, (_, i) =>
      file({ id: `f${i}`, fileName: `Deck ${i}.pptx`, assetName: `deck-${i}.pptx`, size: 1024, analysis: "é".repeat(12_000) }),
    );
    const guide = buildStyleGuide(planAssets(files))!;
    expect(new TextEncoder().encode(guide).length).toBeLessThanOrEqual(SKILL_LIMITS.fileBytes);
    expect(guide.split(SHORTENED_MARKER)).toHaveLength(11);
    expect(guide).not.toContain("�");
    expect(guide.startsWith("# Style guide\n")).toBe(true);
  });
});

describe("assembleJobSkill", () => {
  const plan = planAssets([file()]);

  it("writes SKILL.md, the server's style guide, model references and scripts, plus the bundled originals", () => {
    const { files, assets } = assembleJobSkill("board-update", DRAFT, plan);
    expect(files.map((f) => f.path)).toEqual(["SKILL.md", STYLE_GUIDE_PATH, "references/board-context.md", "scripts/count_words.py"]);
    expect(assets).toEqual([{ fileId: "f1", path: "assets/q3-board-deck.pptx", fileName: "Q3 board deck.pptx", bytes: 2 * MB }]);
    const parts = splitFrontmatter(files[0].content)!;
    expect(parse(parts.frontmatter, { version: "1.1" })).toEqual({
      name: "board-update",
      description: 'Writes the monthly board update: "numbers first". Use when asked for a board update.',
    });
    expect(parts.body).toContain("## Files in this skill");
    expect(parts.body).toContain("- `assets/q3-board-deck.pptx`:");
    expect(parts.body).toContain("## Scripts\n\nReview each script before running it.\n\n- `scripts/count_words.py`: Counts the words in a draft.");
  });

  it("does not list a script the body already mentions", () => {
    const { files } = assembleJobSkill("board-update", { ...DRAFT, body: "Run `scripts/count_words.py` on the draft." }, plan);
    expect(files[0].content).not.toContain("## Scripts");
  });

  it("drops any style guide the model wrote: the server's, built from the analyses, wins", () => {
    const { files } = assembleJobSkill(
      "board-update",
      {
        ...DRAFT,
        references: [
          { path: "style-guide.md", content: "MODEL VERSION" },
          { path: "./references/Style-Guide.md", content: "MODEL VERSION" },
          { path: "board-context.md", content: "ok" },
        ],
      },
      plan,
    );
    expect(files.filter((f) => f.path.toLowerCase() === STYLE_GUIDE_PATH)).toHaveLength(1);
    expect(files.map((f) => f.content).join("\n")).not.toContain("MODEL VERSION");
  });

  it("writes neither a style guide nor a files section for a skill without files", () => {
    const { files, assets } = assembleJobSkill("board-update", DRAFT, []);
    expect(files.map((f) => f.path)).toEqual(["SKILL.md", "references/board-context.md", "scripts/count_words.py"]);
    expect(files[0].content).not.toContain("## Files in this skill");
    expect(assets).toEqual([]);
  });

  it("produces a skill that passes every check", () => {
    const { files, assets } = assembleJobSkill("board-update", DRAFT, planAssets([file(), file({ id: "f2", fileName: "Big.pdf", assetName: "big.pdf", kind: "PDF", size: 12 * MB })]));
    expect(validateJobSkill("board-update", files, assets)).toEqual([]);
  });
});

describe("validateJobSkill", () => {
  const skill = assembleJobSkill("board-update", DRAFT, []).files;
  const asset = (over: Partial<VersionAsset> = {}): VersionAsset => ({ fileId: "f1", path: "assets/deck.pptx", fileName: "Deck.pptx", bytes: MB, ...over });

  it("keeps every text-file rule of the Agent Skills validator", () => {
    expect(validateJobSkill("other-name", skill, [])).toEqual([expect.stringMatching(/name must be "other-name"/)]);
  });

  it("rejects an unsafe asset path or one outside assets/", () => {
    expect(validateJobSkill("board-update", skill, [asset({ path: "assets/../x.pptx" })])).toEqual([expect.stringMatching(/'\.\.'/)]);
    expect(validateJobSkill("board-update", skill, [asset({ path: "references/deck.pptx" })])).toEqual([expect.stringMatching(/inside assets\//)]);
  });

  it("rejects an asset whose path collides with another file, ignoring case", () => {
    const withText = [...skill, { path: "assets/notes.md", content: "x" }];
    expect(validateJobSkill("board-update", withText, [asset({ path: "assets/Notes.md" })])).toEqual([expect.stringMatching(/duplicate path/)]);
    expect(validateJobSkill("board-update", skill, [asset(), asset({ fileId: "f2" })])).toEqual([expect.stringMatching(/duplicate path/)]);
  });

  it("enforces 10 MB per bundled file and 25 MB in total", () => {
    expect(validateJobSkill("board-update", skill, [asset({ bytes: 10 * MB + 1 })])).toEqual([expect.stringMatching(/10 MB limit for a bundled file/)]);
    const three = [1, 2, 3].map((n) => asset({ fileId: `f${n}`, path: `assets/d${n}.pptx`, bytes: 9 * MB }));
    expect(validateJobSkill("board-update", skill, three)).toEqual([expect.stringMatching(/over the 25 MB limit/)]);
  });

  it("counts assets towards the 100-file limit", () => {
    const many = [...skill, ...Array.from({ length: 97 }, (_, i) => ({ path: `references/n-${i}.md`, content: "x" }))];
    expect(many).toHaveLength(100);
    expect(validateJobSkill("board-update", many, [])).toEqual([]);
    expect(validateJobSkill("board-update", many, [asset()])).toEqual([expect.stringMatching(/at most 100 files \(this one has 101\)/)]);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd apps/web && npx vitest run src/lib/skills/assemble.test.ts src/lib/skills/jobs/assemble.test.ts`
Expected: FAIL — `inFolder` is not exported ("inFolder is not a function" / TS import error) and `Failed to resolve import "./assemble"` in `src/lib/skills/jobs/assemble.test.ts`.

- [ ] **Step 3: Export `inFolder` and write the job assembler**

In `apps/web/src/lib/skills/assemble.ts`, change

```ts
function inFolder(folder: string, path: string): string {
```

to

```ts
/** A model-supplied path placed under `folder` exactly once ("context.md" and "references/context.md" both become references/context.md). */
export function inFolder(folder: string, path: string): string {
```

Create `apps/web/src/lib/skills/jobs/assemble.ts`:

```ts
import { buildSkillMd, inFolder } from "../assemble";
import { checkSkillPath, validateSkillFiles } from "../format";
import type { SkillFileKind } from "../files/types";
import { JOB_LIMITS, SKILL_LIMITS } from "../limits";
import { oneLine } from "../names";
import type { SkillFile } from "../types";
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
const megabytes = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

function renderGuide(plan: ShippedFile[], analyses: string[]): string {
  return `${[GUIDE_HEAD, ...plan.map((f, i) => [`## ${displayName(f.fileName)}`, statusLine(f), analyses[i]].join("\n\n"))].join("\n\n")}\n`;
}

/** UTF-8-safe cut: never leaves half a character (a partial sequence decodes to U+FFFD, which is stripped). */
function cutToBytes(text: string, maxBytes: number): string {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length <= maxBytes) return text;
  return new TextDecoder().decode(bytes.subarray(0, maxBytes)).replace(/�+$/, "");
}

/** references/style-guide.md: every analysis as stored (edits verbatim), shortened proportionally only to fit 200 KB. */
export function buildStyleGuide(plan: ShippedFile[]): string | null {
  if (plan.length === 0) return null;
  const analyses = plan.map((f) => f.analysis?.trim() || NO_ANALYSIS);
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
```

- [ ] **Step 4: Run them and watch them pass**

Run: `cd apps/web && npx vitest run src/lib/skills/assemble.test.ts src/lib/skills/jobs/assemble.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/skills/assemble.ts apps/web/src/lib/skills/assemble.test.ts apps/web/src/lib/skills/jobs/assemble.ts apps/web/src/lib/skills/jobs/assemble.test.ts
git commit -m "feat(skills-builder): assemble job skills with a style guide and bundled originals"
```

---

### Task 13: Generation runs and versions

**Files:**
- Create: `apps/web/src/lib/skills/jobs/generate.ts`
- Create: `apps/web/src/app/api/v1/prompt-bot/skill-jobs/[id]/skills/[skillId]/generate/route.ts`
- Test: `apps/web/src/lib/skills/jobs/generate.test.ts`, `apps/web/src/app/api/v1/prompt-bot/skill-jobs/generate-routes.test.ts`

**Interfaces:**
- Consumes:
  - `generateJobSkillDraft(message: string): Promise<JobSkillDraft>` (Task 8, `src/lib/ai/claude.ts`)
  - `buildJobGenerateMessage(input: { title; description; questions: PromptQuestionContext[]; skill: { name; purpose }; files: ShippedFile[] }): string`, `buildJobRetryMessage(original: string, draft: JobSkillDraft, errors: string[]): string` (Task 8)
  - `consumeAiUsage(userId, "skill_generate")`, `LimitReachedError` (`src/lib/ai/usage.ts`)
  - `isGenerating(status, startedAt, now?)`, `isAnalysing(status, startedAt, now?)`, `generationCutoff(now?)` (Task 9, `src/lib/skills/jobs/staleness.ts`)
  - `SkillNotFoundError`, `AlreadyGeneratingError`, `FilesAnalysingError`, `EmptyDescriptionError` (Task 9, `src/lib/skills/jobs/errors.ts`)
  - `jobErrorResponse(error): Response | null`, `unauthorized(): Response` (Task 9, `src/lib/skills/jobs/http.ts`)
  - `activeFiles(jobId): Promise<FileViewRow[]>` (rows with `id, fileName, assetName, kind, size, analysis, analysisStatus`, no bytes or facts), `jobQuestionContext(jobId): Promise<PromptQuestionContext[]>` (Task 9, `src/lib/skills/jobs/jobs.ts`)
  - `purgeUnreferencedFiles(jobId): Promise<number>` (Task 10, `src/lib/skills/jobs/files.ts`)
  - `loadSkillView(jobId, skillId, userId): Promise<JobSkillView | null>` (Task 11, `src/lib/skills/jobs/skills.ts`)
  - `planAssets`, `assembleJobSkill`, `validateJobSkill` (Task 12)
  - `aiErrorResponse` (`src/lib/prompt-bot/http.ts`), `AiNotConfiguredError`, `isAiConfigured` (`src/lib/ai/config.ts`)
- Produces (`src/lib/skills/jobs/generate.ts`):
  - `export const JOB_GENERATION_FAILED_MESSAGE = "The AI couldn't finish writing this skill. Try again."`
  - `startJobSkillGeneration(jobId: string, skillId: string, userId: string, now?: Date): Promise<JobSkillView>` (throws `SkillNotFoundError`, `AlreadyGeneratingError`, `FilesAnalysingError`, `EmptyDescriptionError`, `LimitReachedError`)
  - `runJobSkillGeneration(jobId: string, skillId: string, userId: string): Promise<void>` (never throws)
  - Route `POST /api/v1/prompt-bot/skill-jobs/:id/skills/:skillId/generate` → 202 `JobSkillView`

- [ ] **Step 1: Write the failing data-layer tests**

Create `apps/web/src/lib/skills/jobs/generate.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  skillFindFirst: vi.fn(),
  skillUpdateMany: vi.fn(),
  skillUpdate: vi.fn(),
  fileFindMany: vi.fn(),
  versionCreate: vi.fn(),
  versionDeleteMany: vi.fn(),
  transaction: vi.fn(),
  consumeAiUsage: vi.fn(),
  generateJobSkillDraft: vi.fn(),
  activeFiles: vi.fn(),
  jobQuestionContext: vi.fn(),
  purgeUnreferencedFiles: vi.fn(),
  loadSkillView: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    skillJobSkill: { findFirst: mocks.skillFindFirst, updateMany: mocks.skillUpdateMany, update: mocks.skillUpdate },
    skillJobFile: { findMany: mocks.fileFindMany },
    skillVersion: { create: mocks.versionCreate, deleteMany: mocks.versionDeleteMany },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/ai/usage", async (orig) => ({ ...(await orig<typeof import("@/lib/ai/usage")>()), consumeAiUsage: mocks.consumeAiUsage }));
vi.mock("@/lib/ai/claude", () => ({ generateJobSkillDraft: mocks.generateJobSkillDraft }));
vi.mock("./jobs", () => ({ activeFiles: mocks.activeFiles, jobQuestionContext: mocks.jobQuestionContext }));
vi.mock("./files", () => ({ purgeUnreferencedFiles: mocks.purgeUnreferencedFiles }));
vi.mock("./skills", () => ({ loadSkillView: mocks.loadSkillView }));

import { LimitReachedError } from "@/lib/ai/usage";
import { AlreadyGeneratingError, EmptyDescriptionError, FilesAnalysingError, SkillNotFoundError } from "./errors";
import { JOB_GENERATION_FAILED_MESSAGE, runJobSkillGeneration, startJobSkillGeneration } from "./generate";
import type { JobSkillDraft } from "./types";

const NOW = new Date("2026-11-25T12:00:00Z");
const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60_000);
const skillRow = (over: Record<string, unknown> = {}) => ({
  id: "s1",
  name: "board-update",
  purpose: "Writes the monthly board update.",
  status: "DRAFT",
  generationStartedAt: null,
  validationErrors: [],
  fileIds: ["f1"],
  latestVersion: 0,
  job: { title: "Monthly board update", description: "Every month I turn my notes into the board update." },
  ...over,
});
const fileRow = (over: Record<string, unknown> = {}) => ({
  id: "f1",
  fileName: "Q3 deck.pptx",
  assetName: "q3-deck.pptx",
  kind: "PPTX",
  size: 2048,
  analysis: "## Colours\n\n- Navy #1F4E79",
  analysisStatus: "READY",
  analysisStartedAt: null,
  ...over,
});
const VALID: JobSkillDraft = {
  description: "Writes the monthly board update from notes.\nUse when asked for a board update.",
  compatibility: "",
  body: "# Board update\n\nFollow `references/style-guide.md`.",
  references: [],
  scripts: [],
};
const INVALID: JobSkillDraft = { ...VALID, description: "Uses <angle> brackets" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.skillFindFirst.mockResolvedValue(skillRow());
  mocks.skillUpdateMany.mockResolvedValue({ count: 1 });
  mocks.skillUpdate.mockResolvedValue({});
  mocks.fileFindMany.mockResolvedValue([]);
  mocks.versionCreate.mockResolvedValue({});
  mocks.versionDeleteMany.mockResolvedValue({ count: 0 });
  mocks.transaction.mockImplementation(async (ops: unknown[]) => ops);
  mocks.consumeAiUsage.mockResolvedValue(undefined);
  mocks.activeFiles.mockResolvedValue([fileRow()]);
  mocks.jobQuestionContext.mockResolvedValue([]);
  mocks.purgeUnreferencedFiles.mockResolvedValue(0);
  mocks.loadSkillView.mockResolvedValue({ id: "s1", status: "GENERATING" });
});

describe("startJobSkillGeneration", () => {
  it("checks ownership first", async () => {
    mocks.skillFindFirst.mockResolvedValue(null);
    await expect(startJobSkillGeneration("j1", "s1", "u2", NOW)).rejects.toBeInstanceOf(SkillNotFoundError);
    expect(mocks.skillFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "s1", jobId: "j1", job: { userId: "u2" } } }));
    expect(mocks.consumeAiUsage).not.toHaveBeenCalled();
  });

  it("refuses while a recent generation runs, but re-claims one interrupted more than 10 minutes ago", async () => {
    mocks.skillFindFirst.mockResolvedValueOnce(skillRow({ status: "GENERATING", generationStartedAt: minutesAgo(5) }));
    await expect(startJobSkillGeneration("j1", "s1", "u1", NOW)).rejects.toBeInstanceOf(AlreadyGeneratingError);
    mocks.skillFindFirst.mockResolvedValueOnce(skillRow({ status: "GENERATING", generationStartedAt: minutesAgo(11) }));
    await startJobSkillGeneration("j1", "s1", "u1", NOW);
    expect(mocks.skillUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "s1",
        jobId: "j1",
        OR: [{ status: { not: "GENERATING" } }, { generationStartedAt: null }, { generationStartedAt: { lt: minutesAgo(10) } }],
      },
      data: { status: "GENERATING", validationErrors: [], generationStartedAt: NOW },
    });
  });

  it("waits for the skill's own files to finish analysing; an interrupted analysis does not block", async () => {
    mocks.fileFindMany.mockResolvedValueOnce([{ analysisStatus: "PENDING", analysisStartedAt: minutesAgo(1) }]);
    await expect(startJobSkillGeneration("j1", "s1", "u1", NOW)).rejects.toBeInstanceOf(FilesAnalysingError);
    expect(mocks.fileFindMany).toHaveBeenCalledWith({
      where: { jobId: "j1", id: { in: ["f1"] }, deletedAt: null },
      select: { analysisStatus: true, analysisStartedAt: true },
    });
    mocks.fileFindMany.mockResolvedValueOnce([{ analysisStatus: "PENDING", analysisStartedAt: minutesAgo(6) }]);
    await expect(startJobSkillGeneration("j1", "s1", "u1", NOW)).resolves.toEqual({ id: "s1", status: "GENERATING" });
  });

  it("needs a job description", async () => {
    mocks.skillFindFirst.mockResolvedValue(skillRow({ job: { title: "t", description: "   " } }));
    await expect(startJobSkillGeneration("j1", "s1", "u1", NOW)).rejects.toBeInstanceOf(EmptyDescriptionError);
    expect(mocks.skillUpdateMany).not.toHaveBeenCalled();
  });

  it("spends one skill_generate unit only after winning the claim", async () => {
    mocks.skillUpdateMany.mockResolvedValueOnce({ count: 0 });
    await expect(startJobSkillGeneration("j1", "s1", "u1", NOW)).rejects.toBeInstanceOf(AlreadyGeneratingError);
    expect(mocks.consumeAiUsage).not.toHaveBeenCalled();
    await startJobSkillGeneration("j1", "s1", "u1", NOW);
    expect(mocks.consumeAiUsage).toHaveBeenCalledWith("u1", "skill_generate");
    expect(mocks.loadSkillView).toHaveBeenCalledWith("j1", "s1", "u1");
  });

  it("hands the claim back when the daily limit is reached", async () => {
    const limit = new LimitReachedError("skill_generate", new Date("2026-11-26T00:00:00Z"));
    mocks.skillFindFirst.mockResolvedValue(skillRow({ status: "FAILED", validationErrors: ["old"] }));
    mocks.consumeAiUsage.mockRejectedValue(limit);
    await expect(startJobSkillGeneration("j1", "s1", "u1", NOW)).rejects.toBe(limit);
    expect(mocks.skillUpdateMany).toHaveBeenLastCalledWith({
      where: { id: "s1", status: "GENERATING", generationStartedAt: NOW },
      data: { status: "FAILED", generationStartedAt: null, validationErrors: ["old"] },
    });
  });
});

describe("runJobSkillGeneration", () => {
  it("writes v1 from a valid draft, with the bundled original, then purges unreferenced files", async () => {
    mocks.generateJobSkillDraft.mockResolvedValue(VALID);
    await runJobSkillGeneration("j1", "s1", "u1");
    expect(mocks.generateJobSkillDraft).toHaveBeenCalledTimes(1);
    const data = mocks.versionCreate.mock.calls[0][0].data;
    expect(data).toMatchObject({
      skillId: "s1",
      version: 1,
      name: "board-update",
      description: "Writes the monthly board update from notes. Use when asked for a board update.",
      assets: [{ fileId: "f1", path: "assets/q3-deck.pptx", fileName: "Q3 deck.pptx", bytes: 2048 }],
      assetFileIds: ["f1"],
    });
    expect(data.files.map((f: { path: string }) => f.path)).toEqual(["SKILL.md", "references/style-guide.md"]);
    expect(data.files[0].content).toContain('name: "board-update"');
    expect(mocks.skillUpdate).toHaveBeenCalledWith({ where: { id: "s1" }, data: { status: "READY", latestVersion: 1, validationErrors: [] } });
    expect(mocks.versionDeleteMany).toHaveBeenCalledWith({ where: { skillId: "s1", version: { lte: -19 } } });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.purgeUnreferencedFiles).toHaveBeenCalledWith("j1");
  });

  it("retries once with the validation errors, then records FAILED and leaves older versions alone", async () => {
    mocks.skillFindFirst.mockResolvedValue(skillRow({ latestVersion: 2 }));
    mocks.generateJobSkillDraft.mockResolvedValue(INVALID);
    await runJobSkillGeneration("j1", "s1", "u1");
    expect(mocks.generateJobSkillDraft).toHaveBeenCalledTimes(2);
    const [first] = mocks.generateJobSkillDraft.mock.calls[0];
    const [retry] = mocks.generateJobSkillDraft.mock.calls[1];
    expect(retry).not.toBe(first);
    expect(retry).toContain("cannot contain < or >");
    expect(mocks.versionCreate).not.toHaveBeenCalled();
    expect(mocks.versionDeleteMany).not.toHaveBeenCalled();
    expect(mocks.skillUpdate).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { status: "FAILED", validationErrors: [expect.stringMatching(/< or >/)] },
    });
  });

  it("numbers a version after the latest one when the retry passes", async () => {
    mocks.skillFindFirst.mockResolvedValue(skillRow({ latestVersion: 3 }));
    mocks.generateJobSkillDraft.mockResolvedValueOnce(INVALID).mockResolvedValueOnce(VALID);
    await runJobSkillGeneration("j1", "s1", "u1");
    expect(mocks.versionCreate.mock.calls[0][0].data.version).toBe(4);
    expect(mocks.skillUpdate).toHaveBeenCalledWith({ where: { id: "s1" }, data: { status: "READY", latestVersion: 4, validationErrors: [] } });
  });

  it("keeps only the last 20 versions", async () => {
    mocks.skillFindFirst.mockResolvedValue(skillRow({ latestVersion: 24 }));
    mocks.generateJobSkillDraft.mockResolvedValue(VALID);
    await runJobSkillGeneration("j1", "s1", "u1");
    expect(mocks.versionDeleteMany).toHaveBeenCalledWith({ where: { skillId: "s1", version: { lte: 5 } } });
  });

  it("uses only active files the skill lists, in the skill's order; a file without a ready analysis is sent as missing", async () => {
    mocks.skillFindFirst.mockResolvedValue(skillRow({ fileIds: ["f2", "gone", "f1"] }));
    mocks.activeFiles.mockResolvedValue([
      fileRow(),
      fileRow({ id: "f2", fileName: "Logo.png", assetName: "logo.png", kind: "PNG", analysis: "stale text", analysisStatus: "FAILED" }),
    ]);
    mocks.generateJobSkillDraft.mockResolvedValue(VALID);
    await runJobSkillGeneration("j1", "s1", "u1");
    const data = mocks.versionCreate.mock.calls[0][0].data;
    expect(data.assetFileIds).toEqual(["f2", "f1"]);
    const guide = data.files.find((f: { path: string }) => f.path === "references/style-guide.md").content;
    expect(guide).toContain("## Logo.png\n\nBundled as assets/logo.png.\n\nNo analysis is available for this file.");
    expect(guide).not.toContain("stale text");
  });

  it("records the generic failure, logs only the error name and never throws", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.generateJobSkillDraft.mockRejectedValue(Object.assign(new Error("secret prompt text"), { name: "APIConnectionError" }));
    await expect(runJobSkillGeneration("j1", "s1", "u1")).resolves.toBeUndefined();
    expect(mocks.skillUpdate).toHaveBeenCalledWith({ where: { id: "s1" }, data: { status: "FAILED", validationErrors: [JOB_GENERATION_FAILED_MESSAGE] } });
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret prompt text");
    expect(JSON.stringify(log.mock.calls)).toContain("APIConnectionError");
    log.mockRestore();
  });

  it("does not mark a written version FAILED when only the purge fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.generateJobSkillDraft.mockResolvedValue(VALID);
    mocks.purgeUnreferencedFiles.mockRejectedValue(new Error("db"));
    await runJobSkillGeneration("j1", "s1", "u1");
    expect(mocks.skillUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.skillUpdate.mock.calls[0][0].data.status).toBe("READY");
    log.mockRestore();
  });

  it("does nothing for a skill that is not the user's", async () => {
    mocks.skillFindFirst.mockResolvedValue(null);
    await runJobSkillGeneration("j1", "s1", "u2");
    expect(mocks.generateJobSkillDraft).not.toHaveBeenCalled();
    expect(mocks.skillUpdate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Write the failing route tests**

Create `apps/web/src/app/api/v1/prompt-bot/skill-jobs/generate-routes.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  isAiConfigured: vi.fn(),
  start: vi.fn(),
  run: vi.fn(),
  after: vi.fn(),
}));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: mocks.after }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/ai/config", async (orig) => ({ ...(await orig<typeof import("@/lib/ai/config")>()), isAiConfigured: mocks.isAiConfigured }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/skills/jobs/generate", () => ({ startJobSkillGeneration: mocks.start, runJobSkillGeneration: mocks.run }));

import { LimitReachedError } from "@/lib/ai/usage";
import { AlreadyGeneratingError, EmptyDescriptionError, FilesAnalysingError, SkillNotFoundError } from "@/lib/skills/jobs/errors";
import * as generate from "./[id]/skills/[skillId]/generate/route";

const post = () => new NextRequest("http://localhost/x", { method: "POST" });
const ctx = { params: Promise.resolve({ id: "j1", skillId: "s1" }) };
const codeOf = async (res: Response) => (await res.json()).error.code;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "u1", role: "MENTEE" });
  mocks.isAiConfigured.mockReturnValue(true);
  mocks.start.mockResolvedValue({ id: "s1", status: "GENERATING" });
});

describe("POST /skill-jobs/:id/skills/:skillId/generate", () => {
  it("claims the skill, answers 202 and writes it after the response", async () => {
    const res = await generate.POST(post(), ctx);
    expect(res.status).toBe(202);
    expect((await res.json()).data.status).toBe("GENERATING");
    expect(mocks.start).toHaveBeenCalledWith("j1", "s1", "u1");
    expect(mocks.run).not.toHaveBeenCalled();
    await mocks.after.mock.calls[0][0]();
    expect(mocks.run).toHaveBeenCalledWith("j1", "s1", "u1");
  });

  it("answers 503 before anything else when the AI is not configured, and 401 without a session", async () => {
    mocks.isAiConfigured.mockReturnValue(false);
    const res = await generate.POST(post(), ctx);
    expect(res.status).toBe(503);
    expect(await codeOf(res)).toBe("AI_NOT_CONFIGURED");
    mocks.getCurrentUser.mockResolvedValue(null);
    expect((await generate.POST(post(), ctx)).status).toBe(401);
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it.each([
    [new SkillNotFoundError(), 404, "NOT_FOUND"],
    [new AlreadyGeneratingError(), 409, "ALREADY_GENERATING"],
    [new FilesAnalysingError(), 409, "FILES_ANALYSING"],
    [new EmptyDescriptionError(), 400, "VALIDATION_ERROR"],
    [new LimitReachedError("skill_generate", new Date("2026-11-26T00:00:00Z")), 429, "LIMIT_REACHED"],
  ])("maps %s", async (error, status, code) => {
    mocks.start.mockRejectedValueOnce(error);
    const res = await generate.POST(post(), ctx);
    expect(res.status).toBe(status);
    expect(await codeOf(res)).toBe(code);
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("lets an unexpected error surface", async () => {
    mocks.start.mockRejectedValueOnce(new Error("database down"));
    await expect(generate.POST(post(), ctx)).rejects.toThrow("database down");
  });
});
```

- [ ] **Step 3: Run them and watch them fail**

Run: `cd apps/web && npx vitest run src/lib/skills/jobs/generate.test.ts src/app/api/v1/prompt-bot/skill-jobs/generate-routes.test.ts`
Expected: FAIL — `Failed to resolve import "./generate"` and `Failed to resolve import "./[id]/skills/[skillId]/generate/route"`.

- [ ] **Step 4: Write the generation module**

Create `apps/web/src/lib/skills/jobs/generate.ts`:

```ts
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { generateJobSkillDraft } from "@/lib/ai/claude";
import { consumeAiUsage } from "@/lib/ai/usage";
import { JOB_LIMITS } from "../limits";
import { oneLine } from "../names";
import { assembleJobSkill, planAssets, validateJobSkill } from "./assemble";
import { AlreadyGeneratingError, EmptyDescriptionError, FilesAnalysingError, SkillNotFoundError } from "./errors";
import { purgeUnreferencedFiles } from "./files";
import { buildJobGenerateMessage, buildJobRetryMessage } from "./instructions";
import { activeFiles, jobQuestionContext } from "./jobs";
import { loadSkillView } from "./skills";
import { generationCutoff, isAnalysing, isGenerating } from "./staleness";
import type { JobSkillView } from "./types";

export const JOB_GENERATION_FAILED_MESSAGE = "The AI couldn't finish writing this skill. Try again.";

function findOwnedSkill(jobId: string, skillId: string, userId: string) {
  return prisma.skillJobSkill.findFirst({
    where: { id: skillId, jobId, job: { userId } },
    select: {
      id: true,
      name: true,
      purpose: true,
      status: true,
      generationStartedAt: true,
      validationErrors: true,
      fileIds: true,
      latestVersion: true,
      job: { select: { title: true, description: true } },
    },
  });
}

const logName = (error: unknown) => (error instanceof Error ? error.name : "unknown");

/** Ownership, the spec's 409/400 checks, an atomic claim, then one skill_generate unit. runJobSkillGeneration does the writing. */
export async function startJobSkillGeneration(jobId: string, skillId: string, userId: string, now = new Date()): Promise<JobSkillView> {
  const skill = await findOwnedSkill(jobId, skillId, userId);
  if (!skill) throw new SkillNotFoundError();
  if (isGenerating(skill.status, skill.generationStartedAt, now)) throw new AlreadyGeneratingError();
  const files = await prisma.skillJobFile.findMany({
    where: { jobId, id: { in: skill.fileIds }, deletedAt: null },
    select: { analysisStatus: true, analysisStartedAt: true },
  });
  if (files.some((f) => isAnalysing(f.analysisStatus, f.analysisStartedAt, now))) throw new FilesAnalysingError();
  if (!skill.job.description.trim()) throw new EmptyDescriptionError();

  // Claim first so a double press or a lost race never spends a unit; generationStartedAt is the staleness clock.
  const claimed = await prisma.skillJobSkill.updateMany({
    where: {
      id: skillId,
      jobId,
      OR: [{ status: { not: "GENERATING" } }, { generationStartedAt: null }, { generationStartedAt: { lt: generationCutoff(now) } }],
    },
    data: { status: "GENERATING", validationErrors: [], generationStartedAt: now },
  });
  if (claimed.count === 0) throw new AlreadyGeneratingError();
  try {
    await consumeAiUsage(userId, "skill_generate");
  } catch (error) {
    // Nothing will run: hand the skill back as it was, if the claim is still ours.
    await prisma.skillJobSkill.updateMany({
      where: { id: skillId, status: "GENERATING", generationStartedAt: now },
      data: { status: skill.status, generationStartedAt: skill.generationStartedAt, validationErrors: skill.validationErrors },
    });
    throw error;
  }
  const view = await loadSkillView(jobId, skillId, userId);
  if (!view) throw new SkillNotFoundError();
  return view;
}

/**
 * One model call, assembly, validation, one retry with the errors, then a new immutable version or FAILED.
 * Runs in after(); never throws. A failure never touches older versions, which stay downloadable.
 */
export async function runJobSkillGeneration(jobId: string, skillId: string, userId: string): Promise<void> {
  try {
    const skill = await findOwnedSkill(jobId, skillId, userId);
    if (!skill) return;
    const byId = new Map((await activeFiles(jobId)).map((f) => [f.id, f]));
    const used = skill.fileIds.flatMap((id) => {
      const f = byId.get(id);
      return f ? [f] : [];
    });
    const plan = planAssets(
      used.map((f) => ({
        id: f.id,
        fileName: f.fileName,
        assetName: f.assetName,
        kind: f.kind,
        size: f.size,
        // Only a finished analysis is used; an interrupted or failed one is reported as missing.
        analysis: f.analysisStatus === "READY" ? f.analysis : null,
      })),
    );
    const message = buildJobGenerateMessage({
      title: skill.job.title,
      description: skill.job.description,
      questions: await jobQuestionContext(jobId),
      skill: { name: skill.name, purpose: skill.purpose },
      files: plan,
    });

    let draft = await generateJobSkillDraft(message);
    let built = assembleJobSkill(skill.name, draft, plan);
    let errors = validateJobSkill(skill.name, built.files, built.assets);
    if (errors.length > 0) {
      draft = await generateJobSkillDraft(buildJobRetryMessage(message, draft, errors));
      built = assembleJobSkill(skill.name, draft, plan);
      errors = validateJobSkill(skill.name, built.files, built.assets);
    }
    if (errors.length > 0) {
      await prisma.skillJobSkill.update({ where: { id: skillId }, data: { status: "FAILED", validationErrors: errors } });
      return;
    }

    const version = skill.latestVersion + 1;
    await prisma.$transaction([
      prisma.skillVersion.create({
        data: {
          skillId,
          version,
          name: skill.name,
          description: oneLine(draft.description),
          files: built.files.map((f) => ({ path: f.path, content: f.content })) as Prisma.InputJsonValue,
          assets: built.assets.map((a) => ({ fileId: a.fileId, path: a.path, fileName: a.fileName, bytes: a.bytes })) as Prisma.InputJsonValue,
          assetFileIds: built.assets.map((a) => a.fileId),
        },
      }),
      prisma.skillJobSkill.update({ where: { id: skillId }, data: { status: "READY", latestVersion: version, validationErrors: [] } }),
      prisma.skillVersion.deleteMany({ where: { skillId, version: { lte: version - JOB_LIMITS.versionsKept } } }),
    ]);
    // The version is written; a purge failure only leaves removed files' bytes for the next purge.
    await purgeUnreferencedFiles(jobId).catch((error: unknown) => {
      console.error("[skills-builder] could not purge unreferenced files:", logName(error));
    });
  } catch (error) {
    console.error("[skills-builder] job skill generation failed:", logName(error));
    await prisma.skillJobSkill
      .update({ where: { id: skillId }, data: { status: "FAILED", validationErrors: [JOB_GENERATION_FAILED_MESSAGE] } })
      .catch((writeError: unknown) => {
        // The skill stays GENERATING and becomes retryable once the 10-minute stale window passes.
        console.error("[skills-builder] could not record the failure:", logName(writeError));
      });
  }
}
```

- [ ] **Step 5: Write the route**

Create `apps/web/src/app/api/v1/prompt-bot/skill-jobs/[id]/skills/[skillId]/generate/route.ts`:

```ts
import { after, NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { successResponse } from "@/lib/api/response";
import { AiNotConfiguredError, isAiConfigured } from "@/lib/ai/config";
import { aiErrorResponse } from "@/lib/prompt-bot/http";
import { runJobSkillGeneration, startJobSkillGeneration } from "@/lib/skills/jobs/generate";
import { jobErrorResponse, unauthorized } from "@/lib/skills/jobs/http";

type Ctx = { params: Promise<{ id: string; skillId: string }> };

/**
 * Claims the skill and answers 202 at once; the writing runs in after() because an Opus skill can take
 * longer than App Runner's 120-second request limit. The workspace polls the job.
 */
export async function POST(_req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  if (!isAiConfigured()) return aiErrorResponse(new AiNotConfiguredError());
  const { id, skillId } = await params;
  try {
    const view = await startJobSkillGeneration(id, skillId, user.id);
    after(() => runJobSkillGeneration(id, skillId, user.id));
    return successResponse(view, undefined, 202);
  } catch (error) {
    const mapped = jobErrorResponse(error);
    if (mapped) return mapped;
    throw error;
  }
}
```

- [ ] **Step 6: Run them and watch them pass**

Run: `cd apps/web && npx vitest run src/lib/skills/jobs/generate.test.ts src/app/api/v1/prompt-bot/skill-jobs/generate-routes.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/skills/jobs/generate.ts apps/web/src/lib/skills/jobs/generate.test.ts "apps/web/src/app/api/v1/prompt-bot/skill-jobs/[id]/skills/[skillId]/generate/route.ts" apps/web/src/app/api/v1/prompt-bot/skill-jobs/generate-routes.test.ts
git commit -m "feat(skills-builder): generate versioned job skills in the background"
```

---

### Task 14: Zips with binary assets, version detail and downloads

**Files:**
- Modify: `apps/web/src/lib/skills/zip.ts`, `apps/web/src/lib/skills/zip.test.ts`
- Modify: `apps/web/src/lib/skills/pack-docs.ts`, `apps/web/src/lib/skills/pack-docs.test.ts`
- Modify: `apps/web/src/app/api/v1/prompt-bot/skill-packs/[id]/download/route.ts`, `apps/web/src/app/api/v1/prompt-bot/skill-packs/download-routes.test.ts` (legacy pack zip without `recommended-skills.md`)
- Create: `apps/web/src/lib/skills/jobs/download.ts`, `apps/web/src/lib/skills/jobs/download.test.ts`
- Create: `apps/web/src/app/api/v1/prompt-bot/skill-jobs/[id]/skills/[skillId]/versions/[version]/route.ts`
- Create: `apps/web/src/app/api/v1/prompt-bot/skill-jobs/[id]/skills/[skillId]/versions/[version]/download/route.ts`
- Create: `apps/web/src/app/api/v1/prompt-bot/skill-jobs/[id]/download/route.ts`
- Test: `apps/web/src/app/api/v1/prompt-bot/skill-jobs/download-routes.test.ts`

**Interfaces:**
- Consumes:
  - `checkSkillPath` (`src/lib/skills/format.ts`), `isValidSkillName`, `normalizeSkillName` (`src/lib/skills/names.ts`), `JOB_LIMITS` (Task 1)
  - `PackTooLargeError`, `JobNotFoundError`, `SkillNotFoundError`, `VersionNotFoundError`, `AssetMissingError`, `NothingToDownloadError` (Task 9, `src/lib/skills/jobs/errors.ts`; `PackTooLargeError` is defined there and re-exported by `zip.ts`)
  - `jobErrorResponse`, `unauthorized` (Task 9, `src/lib/skills/jobs/http.ts`; maps `DuplicateSkillNameError` from `zip.ts` to 409 `DUPLICATE_NAME`)
  - `VersionDetail`, `VersionAsset` (Task 8)
  - `sha256Hex`, `tinyPng` (Task 3/7 fixtures, tests only)
  - `buildSkillMd` (`src/lib/skills/assemble.ts`, tests only)
- Produces:
  - `src/lib/skills/zip.ts`:
    - `export type ZipAsset = { path: string; bytes: Uint8Array }`
    - `export type ZipSkill = { name: string; purpose: string; version?: number; files: SkillFile[]; assets?: ZipAsset[] }`
    - `export class DuplicateSkillNameError extends Error { skillName: string }` (unchanged)
    - `export { PackTooLargeError }` (re-export from `./jobs/errors`)
    - `export type SizedSkill = { files: SkillFile[]; assets?: readonly { bytes: Uint8Array | number }[] }`
    - `packZipSize(skills: SizedSkill[]): number` (a `ZipSkill[]` and a `VersionDetail[]` are both accepted, so sizes are checked before any bytes load)
    - `buildSkillZip(skill: ZipSkill): Uint8Array`
    - `buildPackZip(input: { slug: string; title: string; description: string; role: string | null; skills: ZipSkill[] }): Uint8Array` (throws `PackTooLargeError`, `DuplicateSkillNameError`)
    - `zipResponse(bytes: Uint8Array, filename: string): Response` (unchanged)
  - `src/lib/skills/pack-docs.ts`: `renderReadme(input: { title: string; description: string; role: string | null; skills: { name: string; purpose: string; version?: number }[]; hasAssets: boolean }): string`; `renderRecommended` and `Recommendation` are removed.
  - `src/lib/skills/jobs/download.ts`:
    - `parseVersionParam(raw: string): number | "latest" | null`
    - `loadVersionDetail(jobId: string, skillId: string, version: number | "latest", userId: string): Promise<VersionDetail | null>`
    - `toZipSkill(detail: VersionDetail, purpose: string, jobId: string): Promise<ZipSkill>` (throws `AssetMissingError`)
    - `buildVersionZip(jobId: string, skillId: string, version: number | "latest", userId: string, format: "upload" | "pack"): Promise<{ bytes: Uint8Array; filename: string }>`
    - `buildJobPack(jobId: string, userId: string): Promise<{ bytes: Uint8Array; filename: string }>`
  - Routes: `GET …/skills/:skillId/versions/:version` → `VersionDetail`; `GET …/skills/:skillId/versions/:version/download?format=upload|pack` → zip; `GET /skill-jobs/:id/download` → zip.

- [ ] **Step 1: Write the failing zip and README tests**

Replace the whole of `apps/web/src/lib/skills/zip.test.ts` with:

```ts
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { sha256Hex, tinyPng } from "./files/fixtures";
import { JOB_LIMITS } from "./limits";
import { buildPackZip, buildSkillZip, DuplicateSkillNameError, PackTooLargeError, packZipSize, zipResponse, type ZipSkill } from "./zip";

const SKILL: ZipSkill = {
  name: "board-update",
  purpose: "Writes the board update.",
  files: [
    { path: "SKILL.md", content: '---\nname: board-update\ndescription: "x"\n---\n\nBody\n' },
    { path: "references/context.md", content: "Context" },
  ],
};
/** Compression method per entry: 0 = stored, 8 = deflate. */
function methods(zip: Uint8Array): Record<string, number> {
  const out: Record<string, number> = {};
  unzipSync(zip, {
    filter: (file) => {
      out[file.name] = file.compression;
      return false;
    },
  });
  return out;
}
const packOf = (skills: ZipSkill[]) => buildPackZip({ slug: "my-week", title: "My week", description: "d", role: null, skills });

describe("buildSkillZip", () => {
  it("puts the skill folder at the zip root", () => {
    const entries = unzipSync(buildSkillZip(SKILL));
    expect(Object.keys(entries).sort()).toEqual(["board-update/SKILL.md", "board-update/references/context.md"]);
    expect(strFromU8(entries["board-update/references/context.md"])).toBe("Context");
  });

  it("stores bundled originals byte for byte and uncompressed, text deflated", async () => {
    const png = await tinyPng(16, 16);
    const zip = buildSkillZip({ ...SKILL, assets: [{ path: "assets/logo.png", bytes: png }] });
    expect(sha256Hex(unzipSync(zip)["board-update/assets/logo.png"])).toBe(sha256Hex(png));
    expect(methods(zip)).toEqual({ "board-update/SKILL.md": 8, "board-update/references/context.md": 8, "board-update/assets/logo.png": 0 });
  });

  it("refuses an unsafe path, name or asset location instead of zipping it", () => {
    expect(() => buildSkillZip({ ...SKILL, files: [{ path: "../evil", content: "x" }] })).toThrow(/unsafe/);
    expect(() => buildSkillZip({ ...SKILL, name: "../x" })).toThrow(/unsafe/);
    expect(() => buildSkillZip({ ...SKILL, assets: [{ path: "references/deck.pptx", bytes: new Uint8Array([1]) }] })).toThrow(/unsafe/);
    expect(() => buildSkillZip({ ...SKILL, assets: [{ path: "assets/../x", bytes: new Uint8Array([1]) }] })).toThrow(/unsafe/);
  });

  it("refuses two entries at the same path", () => {
    expect(() => buildSkillZip({ ...SKILL, files: [...SKILL.files, { path: "references/context.md", content: "again" }] })).toThrow(/duplicate/);
  });
});

describe("buildPackZip", () => {
  it("uses the spec's pack layout, with no recommended-skills.md", () => {
    const entries = unzipSync(packOf([SKILL]));
    expect(Object.keys(entries).sort()).toEqual([
      "my-week/README.md",
      "my-week/skills/board-update/SKILL.md",
      "my-week/skills/board-update/references/context.md",
      "my-week/upload-to-claude/board-update.zip",
    ]);
    expect(strFromU8(entries["my-week/README.md"])).not.toContain("## About the files in assets/");
  });

  it("carries the same original bytes in the unpacked copy and in the upload zip, whose root is the skill folder", async () => {
    const png = await tinyPng(16, 16);
    const zip = packOf([{ ...SKILL, version: 2, assets: [{ path: "assets/logo.png", bytes: png }] }]);
    const entries = unzipSync(zip);
    expect(sha256Hex(entries["my-week/skills/board-update/assets/logo.png"])).toBe(sha256Hex(png));
    const inner = unzipSync(entries["my-week/upload-to-claude/board-update.zip"]);
    expect([...new Set(Object.keys(inner).map((k) => k.split("/")[0]))]).toEqual(["board-update"]);
    expect(sha256Hex(inner["board-update/assets/logo.png"])).toBe(sha256Hex(png));
    expect(methods(zip)["my-week/upload-to-claude/board-update.zip"]).toBe(0);
    expect(methods(zip)["my-week/skills/board-update/assets/logo.png"]).toBe(0);
    const readme = strFromU8(entries["my-week/README.md"]);
    expect(readme).toContain("- `board-update` (v2): Writes the board update.");
    expect(readme).toContain("## About the files in assets/");
  });

  it("refuses two skills with the same folder name instead of merging them", () => {
    const build = () => packOf([SKILL, { ...SKILL, purpose: "Other" }]);
    expect(build).toThrow(DuplicateSkillNameError);
    expect(build).toThrow(/board-update/);
  });

  it("refuses a pack over 100 MB before building it", () => {
    const big = new Uint8Array(26 * 1024 * 1024);
    const skills = ["one", "two"].map((name) => ({ ...SKILL, name, assets: [{ path: "assets/big.pptx", bytes: big }] }));
    expect(packZipSize(skills)).toBeGreaterThan(JOB_LIMITS.packZipBytes);
    expect(() => packOf(skills)).toThrow(PackTooLargeError);
  });
});

describe("packZipSize", () => {
  it("counts every text and asset byte twice (unpacked copy and upload zip) plus the README", () => {
    const text = SKILL.files.reduce((n, f) => n + new TextEncoder().encode(f.content).length, 0);
    expect(packZipSize([{ ...SKILL, assets: [{ path: "assets/a.png", bytes: new Uint8Array(100) }] }])).toBe(16 * 1024 + 2 * (text + 100));
    expect(packZipSize([{ files: SKILL.files, assets: [{ bytes: 100 }] }])).toBe(16 * 1024 + 2 * (text + 100));
  });
});

describe("zipResponse", () => {
  it("returns a downloadable zip", async () => {
    const res = zipResponse(buildSkillZip(SKILL), "board-update.zip");
    expect(res.headers.get("content-type")).toBe("application/zip");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="board-update.zip"');
    expect(Object.keys(unzipSync(new Uint8Array(await res.arrayBuffer())))).toHaveLength(2);
  });
});
```

Replace the whole of `apps/web/src/lib/skills/pack-docs.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import { renderReadme } from "./pack-docs";

describe("renderReadme", () => {
  const readme = renderReadme({
    title: "Monthly board update",
    description: "Every month I turn my notes into the board update.",
    role: null,
    skills: [{ name: "board-update", purpose: "Writes the board update.", version: 3 }],
    hasAssets: true,
  });

  it("says what is inside, with each skill's version", () => {
    expect(readme.startsWith("# Monthly board update\n")).toBe(true);
    expect(readme).toContain("## What this job is");
    expect(readme).toContain("Every month I turn my notes into the board update.");
    expect(readme).toContain("- `board-update` (v3): Writes the board update.");
  });

  it("gives the install steps for each tool and never mentions recommendations", () => {
    expect(readme).toContain("### Claude.ai / Claude Desktop");
    expect(readme).toContain("Settings → Capabilities → Skills");
    expect(readme).toContain("`upload-to-claude/`");
    expect(readme).toContain("### Claude Code");
    expect(readme).toContain("`~/.claude/skills/`");
    expect(readme).toContain("`.claude/skills/`");
    expect(readme).toContain("### Other tools that support Agent Skills");
    expect(readme).toContain("Review any files in `scripts/` before running them.");
    expect(readme.toLowerCase()).not.toContain("recommend");
  });

  it("explains the original files only when there are some", () => {
    expect(readme).toContain("## About the files in assets/\n\nThese are your original files, included so the skill can reuse your templates.");
    const legacy = renderReadme({ title: "My week", description: "d", role: "CTO", skills: [{ name: "board-update", purpose: "Writes it." }], hasAssets: false });
    expect(legacy).not.toContain("assets/");
    expect(legacy).toContain("Role: CTO");
    expect(legacy).toContain("- `board-update`: Writes it.");
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd apps/web && npx vitest run src/lib/skills/zip.test.ts src/lib/skills/pack-docs.test.ts`
Expected: FAIL — `PackTooLargeError`/`packZipSize` are not exported from `./zip`, the pack still contains `recommended-skills.md`, and `renderReadme` has no version or assets section.

- [ ] **Step 3: Rewrite the README and zip modules**

Replace the whole of `apps/web/src/lib/skills/pack-docs.ts` with:

```ts
export type ReadmeInput = {
  title: string;
  description: string;
  role: string | null;
  skills: { name: string; purpose: string; version?: number }[];
  /** True when any skill bundles original files under assets/. */
  hasAssets: boolean;
};

/** README.md at the pack root (spec: Versions and Downloads). Used for job packs and legacy packs. */
export function renderReadme(input: ReadmeInput): string {
  return [
    `# ${input.title}`,
    "",
    "Agent Skills built with Prompt Bot's Skills Builder.",
    "",
    "## What this job is",
    "",
    input.description.trim(),
    ...(input.role ? ["", `Role: ${input.role}`] : []),
    "",
    "## Skills in this pack",
    "",
    ...input.skills.map((s) => `- \`${s.name}\`${s.version ? ` (v${s.version})` : ""}: ${s.purpose}`),
    "",
    "## Install",
    "",
    "### Claude.ai / Claude Desktop",
    "",
    "Open Settings → Capabilities → Skills and upload each zip from `upload-to-claude/`. Claude.ai accepts one skill per upload.",
    "",
    "### Claude Code",
    "",
    "Copy `skills/<skill>` into `~/.claude/skills/` (personal) or `.claude/skills/` (one project).",
    "",
    "### Other tools that support Agent Skills",
    "",
    "Copy each `skills/<skill>` folder into that tool's skills folder, as its documentation describes.",
    "",
    "## Before you run anything",
    "",
    "Review any files in `scripts/` before running them.",
    "",
    ...(input.hasAssets
      ? ["## About the files in assets/", "", "These are your original files, included so the skill can reuse your templates.", ""]
      : []),
  ].join("\n");
}
```

Replace the whole of `apps/web/src/lib/skills/zip.ts` with:

```ts
import { strToU8, zipSync, type Zippable, type ZippableFile } from "fflate";
import { checkSkillPath } from "./format";
import { PackTooLargeError } from "./jobs/errors";
import { JOB_LIMITS } from "./limits";
import { isValidSkillName } from "./names";
import { renderReadme } from "./pack-docs";
import type { SkillFile } from "./types";

export { PackTooLargeError };

/** An original file bundled under assets/: raw bytes, never decoded to text. */
export type ZipAsset = { path: string; bytes: Uint8Array };
export type ZipSkill = { name: string; purpose: string; version?: number; files: SkillFile[]; assets?: ZipAsset[] };
/** Anything with text files and asset sizes: a ZipSkill (bytes loaded) or a VersionDetail (sizes recorded). */
export type SizedSkill = { files: SkillFile[]; assets?: readonly { bytes: Uint8Array | number }[] };

/** More than any README renderReadme writes for a pack within the limits. */
const README_ALLOWANCE = 16 * 1024;
const utf8Bytes = (value: string) => new TextEncoder().encode(value).length;

/** Two skills would share one folder (and one upload zip); merging them would silently lose one. */
export class DuplicateSkillNameError extends Error {
  constructor(public skillName: string) {
    super(`Two skills are named "${skillName}"`);
    this.name = "DuplicateSkillNameError";
  }
}

/** Every entry path is built here from a validated name and a re-checked path; nothing raw reaches the archive. */
function skillEntries(prefix: string, skill: ZipSkill): Zippable {
  if (!isValidSkillName(skill.name)) throw new Error("unsafe skill name");
  const entries: Zippable = {};
  const add = (path: string, value: ZippableFile) => {
    const check = checkSkillPath(path);
    if (!check.ok) throw new Error("unsafe skill file path");
    const key = `${prefix}${skill.name}/${check.path}`;
    if (key in entries) throw new Error("duplicate skill file path");
    entries[key] = value;
  };
  for (const file of skill.files) add(file.path, strToU8(file.content));
  for (const asset of skill.assets ?? []) {
    if (!asset.path.startsWith("assets/")) throw new Error("unsafe skill file path");
    // Office files and images are already compressed: store them as they are.
    add(asset.path, [asset.bytes, { level: 0 }]);
  }
  return entries;
}

export function buildSkillZip(skill: ZipSkill): Uint8Array {
  return zipSync(skillEntries("", skill));
}

/** The pack's size before it is built: each skill appears twice (unpacked and as its upload zip). */
export function packZipSize(skills: SizedSkill[]): number {
  let total = README_ALLOWANCE;
  for (const skill of skills) {
    const text = skill.files.reduce((sum, f) => sum + utf8Bytes(f.content), 0);
    const assets = (skill.assets ?? []).reduce((sum, a) => sum + (typeof a.bytes === "number" ? a.bytes : a.bytes.byteLength), 0);
    total += 2 * (text + assets);
  }
  return total;
}

export function buildPackZip(input: { slug: string; title: string; description: string; role: string | null; skills: ZipSkill[] }): Uint8Array {
  if (!isValidSkillName(input.slug)) throw new Error("unsafe pack slug");
  if (packZipSize(input.skills) > JOB_LIMITS.packZipBytes) throw new PackTooLargeError();
  const root = `${input.slug}/`;
  const entries: Zippable = {
    [`${root}README.md`]: strToU8(
      renderReadme({
        title: input.title,
        description: input.description,
        role: input.role,
        skills: input.skills.map((s) => ({ name: s.name, purpose: s.purpose, version: s.version })),
        hasAssets: input.skills.some((s) => (s.assets?.length ?? 0) > 0),
      }),
    ),
  };
  const names = new Set<string>();
  for (const skill of input.skills) {
    if (names.has(skill.name)) throw new DuplicateSkillNameError(skill.name);
    names.add(skill.name);
    entries[`${root}upload-to-claude/${skill.name}.zip`] = [buildSkillZip(skill), { level: 0 }];
    Object.assign(entries, skillEntries(`${root}skills/`, skill));
  }
  return zipSync(entries);
}

export function zipResponse(bytes: Uint8Array, filename: string): Response {
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Response(body, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
```

Replace the whole of `apps/web/src/app/api/v1/prompt-bot/skill-packs/[id]/download/route.ts` with:

```ts
import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse } from "@/lib/api/response";
import { normalizeSkillName } from "@/lib/skills/names";
import { loadPackView, loadReadySkillFiles } from "@/lib/skills/packs";
import { buildPackZip, DuplicateSkillNameError, zipResponse } from "@/lib/skills/zip";

/** Legacy pack download (read-only packs from before the Jobs redesign). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  const { id } = await params;
  const pack = await loadPackView(id, user.id);
  if (!pack) return errorResponse("Skill pack not found", "NOT_FOUND", 404);
  const skills = await loadReadySkillFiles(id, user.id);
  if (skills.length === 0) return errorResponse("This pack has no finished skills to download.", "NOTHING_TO_DOWNLOAD", 409);
  const slug = normalizeSkillName(pack.title, "skill-pack");
  try {
    return zipResponse(buildPackZip({ slug, title: pack.title, description: pack.description, role: pack.role, skills }), `${slug}.zip`);
  } catch (error) {
    if (!(error instanceof DuplicateSkillNameError)) throw error;
    return errorResponse(`Two skills are named "${error.skillName}". Download them one at a time.`, "DUPLICATE_NAME", 409);
  }
}
```

Replace the whole of `apps/web/src/app/api/v1/prompt-bot/skill-packs/download-routes.test.ts` with:

```ts
import { unzipSync } from "fflate";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), loadPackView: vi.fn(), loadItemDetail: vi.fn(), loadReadySkillFiles: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/skills/packs", () => ({ loadPackView: mocks.loadPackView, loadItemDetail: mocks.loadItemDetail, loadReadySkillFiles: mocks.loadReadySkillFiles }));

import * as packDownload from "./[id]/download/route";
import * as itemDownload from "./[id]/items/[itemId]/download/route";

const get = () => new NextRequest("http://localhost/x");
const packCtx = { params: Promise.resolve({ id: "p1" }) };
const itemCtx = { params: Promise.resolve({ id: "p1", itemId: "i1" }) };
const FILES = [{ path: "SKILL.md", content: '---\nname: board-update\ndescription: "x"\n---\n\nBody\n' }];
const item = (over: { id: string; name: string; status: string; kind?: string; files?: null }) => ({
  kind: "CUSTOM",
  purpose: "Writes it.",
  files: FILES as { path: string; content: string }[] | null,
  ...over,
});
const PACK = { id: "p1", title: "My Week!", description: "Weekly work.", role: null, items: [item({ id: "i1", name: "board-update", status: "READY" })] };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "u1", role: "MENTEE" });
  mocks.loadReadySkillFiles.mockResolvedValue([{ name: "board-update", purpose: "Writes it.", files: FILES }]);
});

describe("legacy pack download", () => {
  it("zips the ready custom skills, without recommended-skills.md", async () => {
    mocks.loadPackView.mockResolvedValue(PACK);
    const res = await packDownload.GET(get(), packCtx);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/zip");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="my-week.zip"');
    expect(Object.keys(unzipSync(new Uint8Array(await res.arrayBuffer()))).sort()).toEqual([
      "my-week/README.md",
      "my-week/skills/board-update/SKILL.md",
      "my-week/upload-to-claude/board-update.zip",
    ]);
    expect(mocks.loadReadySkillFiles).toHaveBeenCalledWith("p1", "u1");
  });

  it("returns 409 DUPLICATE_NAME when two ready skills share a folder name", async () => {
    mocks.loadPackView.mockResolvedValue(PACK);
    mocks.loadReadySkillFiles.mockResolvedValue([
      { name: "board-update", purpose: "Writes it.", files: FILES },
      { name: "board-update", purpose: "Also writes it.", files: FILES },
    ]);
    const res = await packDownload.GET(get(), packCtx);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("DUPLICATE_NAME");
    expect(body.error.message).toContain("board-update");
  });

  it("returns 409 NOTHING_TO_DOWNLOAD when no skill is ready, and 404 for someone else's pack", async () => {
    mocks.loadPackView.mockResolvedValue(PACK);
    mocks.loadReadySkillFiles.mockResolvedValue([]);
    const res = await packDownload.GET(get(), packCtx);
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("NOTHING_TO_DOWNLOAD");
    mocks.loadPackView.mockResolvedValue(null);
    expect((await packDownload.GET(get(), packCtx)).status).toBe(404);
  });
});

describe("legacy single skill download", () => {
  it("returns an upload-ready zip with the folder at its root", async () => {
    mocks.loadItemDetail.mockResolvedValue(PACK.items[0]);
    const res = await itemDownload.GET(get(), itemCtx);
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="board-update.zip"');
    expect(Object.keys(unzipSync(new Uint8Array(await res.arrayBuffer())))).toEqual(["board-update/SKILL.md"]);
  });

  it("returns 409 for a skill that is not ready and 404 for a catalog item or someone else's", async () => {
    mocks.loadItemDetail.mockResolvedValueOnce(item({ id: "i3", name: "broken", status: "FAILED" }));
    expect((await itemDownload.GET(get(), itemCtx)).status).toBe(409);
    mocks.loadItemDetail.mockResolvedValueOnce(item({ id: "i4", name: "pptx", status: "DRAFT", kind: "CATALOG", files: null }));
    expect((await itemDownload.GET(get(), itemCtx)).status).toBe(404);
    mocks.loadItemDetail.mockResolvedValueOnce(null);
    expect((await itemDownload.GET(get(), itemCtx)).status).toBe(404);
  });
});
```

- [ ] **Step 4: Run them and watch them pass**

Run: `cd apps/web && npx vitest run src/lib/skills/zip.test.ts src/lib/skills/pack-docs.test.ts src/app/api/v1/prompt-bot/skill-packs/download-routes.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing download tests**

Create `apps/web/src/lib/skills/jobs/download.test.ts`:

```ts
import { strFromU8, unzipSync } from "fflate";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { parse } from "yaml";

const mocks = vi.hoisted(() => ({ jobFindFirst: vi.fn(), skillFindFirst: vi.fn(), versionFindUnique: vi.fn(), fileFindFirst: vi.fn() }));
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
    expect(mocks.fileFindFirst).toHaveBeenCalledWith({ where: { id: "f1", jobId: "j1" }, select: { data: true } });
    expect(sha256Hex(skill.assets![0].bytes)).toBe(sha256Hex(png));
    expect(skill).toMatchObject({ name: "board-update", purpose: "Writes it.", version: 1 });
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
```

Create `apps/web/src/app/api/v1/prompt-bot/skill-jobs/download-routes.test.ts`:

```ts
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
```

- [ ] **Step 6: Run them and watch them fail**

Run: `cd apps/web && npx vitest run src/lib/skills/jobs/download.test.ts src/app/api/v1/prompt-bot/skill-jobs/download-routes.test.ts`
Expected: FAIL — `Failed to resolve import "./download"` and the three route modules do not exist.

- [ ] **Step 7: Write the download module**

Create `apps/web/src/lib/skills/jobs/download.ts`:

```ts
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { JOB_LIMITS } from "../limits";
import { normalizeSkillName } from "../names";
import { buildPackZip, buildSkillZip, DuplicateSkillNameError, packZipSize, PackTooLargeError, type ZipAsset, type ZipSkill } from "../zip";
import { AssetMissingError, JobNotFoundError, NothingToDownloadError, SkillNotFoundError, VersionNotFoundError } from "./errors";
import type { VersionDetail } from "./types";

/** Versions are written only by the server, but stored JSON is still parsed before it reaches a zip. */
const StoredFiles = z.array(z.object({ path: z.string(), content: z.string() }));
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
  const files = StoredFiles.safeParse(row.files);
  const assets = StoredAssets.safeParse(row.assets);
  if (!files.success || !assets.success) return null;
  return {
    skillId,
    version: row.version,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt.toISOString(),
    files: files.data,
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
    const row = await prisma.skillJobFile.findFirst({ where: { id: asset.fileId, jobId }, select: { data: true } });
    if (!row) throw new AssetMissingError();
    assets.push({ path: asset.path, bytes: row.data });
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
```

- [ ] **Step 8: Write the three routes**

Create `apps/web/src/app/api/v1/prompt-bot/skill-jobs/[id]/skills/[skillId]/versions/[version]/route.ts`:

```ts
import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse, successResponse } from "@/lib/api/response";
import { loadVersionDetail, parseVersionParam } from "@/lib/skills/jobs/download";
import { unauthorized } from "@/lib/skills/jobs/http";

type Ctx = { params: Promise<{ id: string; skillId: string; version: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id, skillId, version } = await params;
  const parsed = parseVersionParam(version);
  if (parsed === null) return errorResponse('Use a version number or "latest".', "VALIDATION_ERROR", 400);
  const detail = await loadVersionDetail(id, skillId, parsed, user.id);
  return detail ? successResponse(detail) : errorResponse("Version not found", "NOT_FOUND", 404);
}
```

Create `apps/web/src/app/api/v1/prompt-bot/skill-jobs/[id]/skills/[skillId]/versions/[version]/download/route.ts`:

```ts
import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse } from "@/lib/api/response";
import { buildVersionZip, parseVersionParam } from "@/lib/skills/jobs/download";
import { jobErrorResponse, unauthorized } from "@/lib/skills/jobs/http";
import { zipResponse } from "@/lib/skills/zip";

type Ctx = { params: Promise<{ id: string; skillId: string; version: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id, skillId, version } = await params;
  const parsed = parseVersionParam(version);
  if (parsed === null) return errorResponse('Use a version number or "latest".', "VALIDATION_ERROR", 400);
  const format = req.nextUrl.searchParams.get("format") ?? "upload";
  if (format !== "upload" && format !== "pack") return errorResponse('Use format "upload" or "pack".', "VALIDATION_ERROR", 400);
  try {
    const zip = await buildVersionZip(id, skillId, parsed, user.id, format);
    return zipResponse(zip.bytes, zip.filename);
  } catch (error) {
    const mapped = jobErrorResponse(error);
    if (mapped) return mapped;
    throw error;
  }
}
```

Create `apps/web/src/app/api/v1/prompt-bot/skill-jobs/[id]/download/route.ts`:

```ts
import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { buildJobPack } from "@/lib/skills/jobs/download";
import { jobErrorResponse, unauthorized } from "@/lib/skills/jobs/http";
import { zipResponse } from "@/lib/skills/zip";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id } = await params;
  try {
    const zip = await buildJobPack(id, user.id);
    return zipResponse(zip.bytes, zip.filename);
  } catch (error) {
    const mapped = jobErrorResponse(error);
    if (mapped) return mapped;
    throw error;
  }
}
```

- [ ] **Step 9: Run them and watch them pass**

Run: `cd apps/web && npx vitest run src/lib/skills/zip.test.ts src/lib/skills/pack-docs.test.ts src/lib/skills/jobs/download.test.ts src/app/api/v1/prompt-bot/skill-jobs/download-routes.test.ts src/app/api/v1/prompt-bot/skill-packs/download-routes.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/lib/skills/zip.ts apps/web/src/lib/skills/zip.test.ts apps/web/src/lib/skills/pack-docs.ts apps/web/src/lib/skills/pack-docs.test.ts \
  apps/web/src/lib/skills/jobs/download.ts apps/web/src/lib/skills/jobs/download.test.ts \
  "apps/web/src/app/api/v1/prompt-bot/skill-packs/[id]/download/route.ts" apps/web/src/app/api/v1/prompt-bot/skill-packs/download-routes.test.ts \
  "apps/web/src/app/api/v1/prompt-bot/skill-jobs/[id]/skills/[skillId]/versions/[version]/route.ts" \
  "apps/web/src/app/api/v1/prompt-bot/skill-jobs/[id]/skills/[skillId]/versions/[version]/download/route.ts" \
  "apps/web/src/app/api/v1/prompt-bot/skill-jobs/[id]/download/route.ts" apps/web/src/app/api/v1/prompt-bot/skill-jobs/download-routes.test.ts
git commit -m "feat(skills-builder): download skill versions with their original files"
```

---

### Task 15: Remove the catalog and the old flow; legacy packs become read-only

**Files:**
- Delete (code): `apps/web/src/app/api/v1/prompt-bot/skill-catalog/route.ts`, `apps/web/src/app/api/v1/prompt-bot/skill-catalog/[id]/route.ts`, `apps/web/src/app/(app)/prompt-bot/catalog/page.tsx`, `apps/web/src/app/(app)/prompt-bot/catalog/catalog-editor.tsx`, `apps/web/src/lib/skills/catalog-candidates.ts`, `apps/web/src/lib/skills/catalog-input.ts`, `apps/web/src/lib/skills/catalog-licenses.ts`, `apps/web/src/lib/skills/catalog-seed.ts`, `apps/web/src/lib/skills/license.ts`, `apps/web/src/lib/skills/split.ts`, `apps/web/src/lib/skills/seed-sql.ts`, `apps/web/src/lib/skills/generate.ts`, `apps/web/src/lib/skills/instructions.ts`, `apps/web/src/lib/skills/http.ts`, `apps/web/scripts/verify-catalog-licenses.ts`, `apps/web/scripts/skills-builder-seed-sql.ts`, `apps/web/src/app/api/v1/prompt-bot/skill-packs/route.ts`, `apps/web/src/app/api/v1/prompt-bot/skill-packs/[id]/items/route.ts`, `apps/web/src/app/api/v1/prompt-bot/skill-packs/[id]/items/[itemId]/answers/[questionId]/route.ts`, `apps/web/src/app/api/v1/prompt-bot/skill-packs/[id]/items/[itemId]/score/route.ts`, `apps/web/src/app/api/v1/prompt-bot/skill-packs/[id]/items/[itemId]/generate/route.ts`, `apps/web/src/app/api/v1/prompt-bot/skill-packs/[id]/items/[itemId]/files/route.ts`, `apps/web/src/app/(app)/prompt-bot/skills/[packId]/page.tsx`, `…/[packId]/pack-view.tsx`, `…/[packId]/skill-preview.tsx`, `…/[packId]/skill-refine.tsx`, `…/[packId]/skills-list.tsx`, `apps/web/src/app/(app)/prompt-bot/skills/new-pack-form.tsx`
- Delete (tests): `apps/web/src/app/api/v1/prompt-bot/skill-catalog/catalog-routes.test.ts`, `apps/web/src/app/(app)/prompt-bot/catalog/catalog-page.test.ts`, `apps/web/src/lib/skills/catalog-seed.test.ts`, `apps/web/src/lib/skills/license.test.ts`, `apps/web/src/lib/skills/split.test.ts`, `apps/web/src/lib/skills/generate.test.ts`, `apps/web/src/lib/skills/instructions.test.ts`, `apps/web/src/app/api/v1/prompt-bot/skill-packs/generate-routes.test.ts`, `apps/web/src/app/api/v1/prompt-bot/skill-packs/refine-routes.test.ts`, `apps/web/src/app/(app)/prompt-bot/skills/[packId]/page.test.ts`, `…/[packId]/pack-view.test.ts`, `…/[packId]/skill-preview.test.ts`, `apps/web/src/app/(app)/prompt-bot/skills/new-pack-form.test.ts`
- Modify: `apps/web/src/lib/skills/packs.ts` + test, `apps/web/src/lib/skills/types.ts`, `apps/web/src/lib/skills/client.ts` + test, `apps/web/src/lib/skills/assemble.ts` + test, `apps/web/src/lib/skills/format.ts` + test, `apps/web/src/lib/skills/limits.ts`, `apps/web/src/lib/ai/claude.ts` + test, `apps/web/src/lib/skills/migration-seed.test.ts`, `apps/web/src/app/api/v1/prompt-bot/skill-packs/[id]/route.ts`, `apps/web/src/app/api/v1/prompt-bot/skill-packs/[id]/items/[itemId]/route.ts`, `apps/web/src/app/api/v1/prompt-bot/skill-packs/pack-routes.test.ts`, `apps/web/src/app/(app)/prompt-bot/skills/page.tsx` + `skills-page.test.ts` (interim; Task 17 replaces both), `apps/web/src/components/prompt-bot/prompt-bot-tabs.tsx` + test, `apps/web/prisma/schema.prisma` (only if Task 2 left out the deprecation comments)

**Interfaces:**
- Consumes: `loadSkillMatrix(): Promise<SkillMatrixView>` (Task 9, `src/lib/skills/matrix.ts`); `toAnswerView` (`src/lib/prompt-bot/score-run.ts`); `buildPackZip`, `buildSkillZip` (Task 14).
- Produces (legacy, read-only):
  - `src/lib/skills/types.ts`: `SkillFile`, `SkillFileEntry`, `SkillItemKind`, `SkillItemStatus`, `SkillItemView` (no `catalog` field), `SkillItemDetail`, `SkillMatrixView`, `SkillPackView`. `CatalogCard` and `CatalogEntryView` are gone.
  - `src/lib/skills/packs.ts`: `UNREADABLE_FILES_MESSAGE`, `parseStoredFiles(value: unknown): SkillFile[] | null`, `toItemView(row, fileIndex, activeQuestionIds): SkillItemView`, `toItemDetail(row, activeQuestionIds): SkillItemDetail`, `loadPackView(packId: string, userId: string): Promise<SkillPackView | null>` (custom `READY` items only), `loadItemDetail(packId: string, itemId: string, userId: string): Promise<SkillItemDetail | null>`, `loadReadySkillFiles(packId: string, userId: string): Promise<ZipSkill[]>`.
  - `src/lib/skills/client.ts`: `skillPackUrl(packId)`, `getPack(packId)`, `getItem(packId, itemId)`, `downloadZip(url)`.
  - `src/lib/skills/assemble.ts`: `inFolder`, `buildSkillMd` only.
  - `src/lib/skills/format.ts`: `SKILL_FOLDERS`, `PathCheck`, `checkSkillPath`, `validateSkillMd`, `validateSkillFiles` (no `withSkillName`, no `withinStorageLimits`).
  - Legacy API: only `GET /skill-packs/:id`, `GET /skill-packs/:id/items/:itemId`, `GET /skill-packs/:id/download`, `GET /skill-packs/:id/items/:itemId/download`.
  - `isSkillsPath(pathname)`: `/prompt-bot/skills` and `/prompt-bot/skills/…` only.

- [ ] **Step 1: Write the failing tests**

Replace the whole of `apps/web/src/lib/skills/packs.test.ts` with:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  packFindFirst: vi.fn(),
  itemFindFirst: vi.fn(),
  itemFindMany: vi.fn(),
  queryRaw: vi.fn(),
  loadSkillMatrix: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    skillPack: { findFirst: mocks.packFindFirst },
    skillPackItem: { findFirst: mocks.itemFindFirst, findMany: mocks.itemFindMany },
    $queryRaw: mocks.queryRaw,
  },
}));
vi.mock("./matrix", () => ({ loadSkillMatrix: mocks.loadSkillMatrix }));

import { loadItemDetail, loadPackView, loadReadySkillFiles, toItemView, UNREADABLE_FILES_MESSAGE } from "./packs";

const NOW = new Date("2026-11-25T12:00:00Z");
const MATRIX = {
  id: "pbm_skill_definition",
  name: "Skill definition",
  questions: [
    { id: "pbq_skill_1", text: "When should this skill be used?", guidance: "Triggers", order: 0 },
    { id: "pbq_skill_2", text: "What context does it need to know?", guidance: "Background", order: 1 },
  ],
};
const ACTIVE = new Set(["pbq_skill_1", "pbq_skill_2"]);
const answer = (questionId: string, over: Record<string, unknown> = {}) => ({
  id: `a-${questionId}`,
  itemId: "i1",
  questionId,
  answer: "",
  score: 0,
  reason: null,
  notRelevant: false,
  scoredAt: null,
  ...over,
});
const row = (over: Record<string, unknown> = {}) => ({
  id: "i1",
  packId: "p1",
  order: 0,
  kind: "CUSTOM",
  name: "board-update",
  purpose: "Writes the board update.",
  status: "READY",
  files: null,
  validationErrors: [],
  scoreRevision: 0,
  createdAt: NOW,
  updatedAt: NOW,
  generationStartedAt: null,
  answers: [] as ReturnType<typeof answer>[],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadSkillMatrix.mockResolvedValue(MATRIX);
});

describe("loadPackView (legacy, read-only)", () => {
  it("returns null for a pack the user does not own", async () => {
    mocks.packFindFirst.mockResolvedValue(null);
    expect(await loadPackView("p1", "u2")).toBeNull();
    expect(mocks.packFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "p1", userId: "u2" } }));
  });

  it("shows only finished custom skills, with file paths and sizes but never contents, and no catalog data", async () => {
    const index = [{ path: "SKILL.md", bytes: 1 }];
    mocks.packFindFirst.mockResolvedValue({
      id: "p1",
      title: "My week",
      description: "d",
      role: "CTO",
      items: [row({ files: undefined, answers: [answer("pbq_skill_1", { answer: "Monthly", score: 2 }), answer("retired_question")] })],
    });
    mocks.queryRaw.mockResolvedValue([{ id: "i1", file_index: index }]);
    const view = (await loadPackView("p1", "u1"))!;
    const include = mocks.packFindFirst.mock.calls[0][0].include;
    expect(include.items.where).toEqual({ kind: "CUSTOM", status: "READY" });
    expect(include.items.omit).toEqual({ files: true });
    expect(include.items.include).toEqual({ answers: true });
    expect(view.items[0]).toMatchObject({ status: "READY", files: index, answers: [{ questionId: "pbq_skill_1", answer: "Monthly", score: 2 }] });
    expect(view.items[0].answers).toHaveLength(1);
    expect(view.items[0]).not.toHaveProperty("catalog");
    expect(view.matrix.questions.map((q) => q.id)).toEqual(["pbq_skill_1", "pbq_skill_2"]);
  });
});

describe("loadItemDetail", () => {
  it("returns one owned finished custom skill with its file contents", async () => {
    const files = [{ path: "SKILL.md", content: "x" }];
    mocks.itemFindFirst.mockResolvedValue(row({ files }));
    const detail = (await loadItemDetail("p1", "i1", "u1"))!;
    expect(mocks.itemFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "i1", packId: "p1", kind: "CUSTOM", status: "READY", pack: { userId: "u1" } } }),
    );
    expect(detail).toMatchObject({ id: "i1", status: "READY", files });
  });

  it("returns null for someone else's item", async () => {
    mocks.itemFindFirst.mockResolvedValue(null);
    expect(await loadItemDetail("p1", "i1", "u2")).toBeNull();
  });
});

describe("loadReadySkillFiles", () => {
  it("loads contents only for the owner's ready custom skills, skipping unreadable files", async () => {
    const files = [{ path: "SKILL.md", content: "x" }];
    mocks.itemFindMany.mockResolvedValue([
      { name: "board-update", purpose: "Writes it.", files },
      { name: "broken", purpose: "Broken.", files: { not: "an array" } },
    ]);
    expect(await loadReadySkillFiles("p1", "u1")).toEqual([{ name: "board-update", purpose: "Writes it.", files }]);
    expect(mocks.itemFindMany).toHaveBeenCalledWith({
      where: { packId: "p1", pack: { userId: "u1" }, kind: "CUSTOM", status: "READY" },
      orderBy: { order: "asc" },
      select: { name: true, purpose: true, files: true },
    });
  });
});

describe("toItemView", () => {
  it("reports stored files it cannot read as FAILED (the database reports a non-array as false)", () => {
    for (const index of [false, [{ path: null, bytes: null }]]) {
      expect(toItemView(row() as never, index, ACTIVE)).toMatchObject({ status: "FAILED", files: null, validationErrors: [UNREADABLE_FILES_MESSAGE] });
    }
  });
});
```

Replace the whole of `apps/web/src/app/api/v1/prompt-bot/skill-packs/pack-routes.test.ts` with:

```ts
import { existsSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), loadPackView: vi.fn(), loadItemDetail: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/skills/packs", () => ({ loadPackView: mocks.loadPackView, loadItemDetail: mocks.loadItemDetail }));

import * as pack from "./[id]/route";
import * as item from "./[id]/items/[itemId]/route";

const get = () => new NextRequest("http://localhost/x");
const packCtx = { params: Promise.resolve({ id: "p1" }) };
const itemCtx = { params: Promise.resolve({ id: "p1", itemId: "i1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "u1", role: "MENTEE" });
});

describe("legacy pack routes", () => {
  it("GET returns the owner's pack and 404 for anyone else's", async () => {
    mocks.loadPackView.mockResolvedValueOnce({ id: "p1", title: "My week", items: [] });
    const res = await pack.GET(get(), packCtx);
    expect(res.status).toBe(200);
    expect((await res.json()).data.title).toBe("My week");
    expect(mocks.loadPackView).toHaveBeenCalledWith("p1", "u1");
    mocks.loadPackView.mockResolvedValueOnce(null);
    expect((await pack.GET(get(), packCtx)).status).toBe(404);
  });

  it("GET item returns its files and 404 for anyone else's", async () => {
    mocks.loadItemDetail.mockResolvedValueOnce({ id: "i1", files: [{ path: "SKILL.md", content: "x" }] });
    const res = await item.GET(get(), itemCtx);
    expect((await res.json()).data.files).toEqual([{ path: "SKILL.md", content: "x" }]);
    expect(mocks.loadItemDetail).toHaveBeenCalledWith("p1", "i1", "u1");
    mocks.loadItemDetail.mockResolvedValueOnce(null);
    expect((await item.GET(get(), itemCtx)).status).toBe(404);
  });

  it("requires sign-in", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    expect((await pack.GET(get(), packCtx)).status).toBe(401);
    expect((await item.GET(get(), itemCtx)).status).toBe(401);
  });

  it("is read-only: no write handlers remain", () => {
    expect(Object.keys(pack)).toEqual(["GET"]);
    expect(Object.keys(item)).toEqual(["GET"]);
    for (const removed of [
      "route.ts",
      "[id]/items/route.ts",
      "[id]/items/[itemId]/answers/[questionId]/route.ts",
      "[id]/items/[itemId]/score/route.ts",
      "[id]/items/[itemId]/generate/route.ts",
      "[id]/items/[itemId]/files/route.ts",
    ]) {
      expect(existsSync(path.join(__dirname, removed)), removed).toBe(false);
    }
    expect(existsSync(path.join(__dirname, "../skill-catalog"))).toBe(false);
  });
});
```

Replace the whole of `apps/web/src/lib/skills/client.test.ts` with:

```ts
/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import * as client from "./client";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("legacy skills client", () => {
  it("offers reads and downloads only", () => {
    expect(Object.keys(client).sort()).toEqual(["downloadZip", "getItem", "getPack", "skillPackUrl"]);
  });

  it("reports the server's message when a download is refused", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ success: false, error: { code: "NOTHING_TO_DOWNLOAD", message: "Generate a skill first." } }), { status: 409 })),
    );
    expect(await client.downloadZip("/x")).toEqual({ ok: false, message: "Generate a skill first." });
  });

  it("saves a zip under the server's filename", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Uint8Array([80, 75]), { headers: { "content-disposition": 'attachment; filename="my-week.zip"' } })),
    );
    Object.assign(URL, { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe("my-week.zip");
    });
    expect(await client.downloadZip("/x")).toEqual({ ok: true });
    expect(click).toHaveBeenCalledTimes(1);
  });
});
```

Replace the whole of `apps/web/src/lib/skills/assemble.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import * as assemble from "./assemble";
import { buildSkillMd, inFolder } from "./assemble";
import { splitFrontmatter } from "./frontmatter";
import { validateSkillMd } from "./format";

const frontmatter = (content: string) => parse(splitFrontmatter(content)!.frontmatter, { version: "1.1" });

describe("buildSkillMd", () => {
  it("keeps quotes, colons, # and newlines in the description as valid YAML 1.1", () => {
    const md = buildSkillMd("board-update", 'Writes the "board" update: numbers first.\n# Use when asked for the monthly update', "", "# Board update");
    expect(frontmatter(md)).toEqual({ name: "board-update", description: 'Writes the "board" update: numbers first. # Use when asked for the monthly update' });
    expect(validateSkillMd(md, "board-update")).toEqual([]);
  });

  // YAML 1.1 (PyYAML) reads these unquoted as a bool, int, null or date; each is a valid skill name.
  it.each(["yes", "no", "on", "off", "true", "null", "123", "2024", "2024-01-01", "0x1f", "1e3"])(
    "quotes the name %s so it round-trips through the validator as text",
    (name) => {
      const md = buildSkillMd(name, "Writes it. Use for updates.", "", "Body");
      expect(frontmatter(md).name).toBe(name);
      expect(validateSkillMd(md, name)).toEqual([]);
    },
  );

  it("writes compatibility only when there is one", () => {
    expect(buildSkillMd("x", "d", "", "b")).not.toContain("compatibility");
    expect(buildSkillMd("x", "d", "Needs Python 3", "b")).toContain('compatibility: "Needs Python 3"');
  });
});

describe("inFolder", () => {
  it.each([
    ["context.md", "references/context.md"],
    ["references/context.md", "references/context.md"],
    ["./references/a.md", "references/a.md"],
    [" ./x.md ", "references/x.md"],
  ])("places %j under references/ once", (input, expected) => {
    expect(inFolder("references", input)).toBe(expected);
  });
});

describe("module", () => {
  it("no longer carries the old draft assembler", () => {
    expect(Object.keys(assemble).sort()).toEqual(["buildSkillMd", "inFolder"]);
  });
});
```

Replace the whole of `apps/web/src/lib/skills/migration-seed.test.ts` with:

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { matrixSeedSql } from "@/lib/prompt-bot/seed-sql";
import { SKILL_MATRIX } from "./builtin-skill-matrix";

/** The already-applied Skills Builder migration: kept as-is, so these tests guard that it never changes. */
const SQL = readFileSync(
  path.join(__dirname, "../../../prisma/migrations/20261124160000_add_skills_builder/migration.sql"),
  "utf8",
);

describe("skills builder migration (applied 2026-11-24)", () => {
  it("creates the four Skills Builder tables", () => {
    for (const table of ["skill_packs", "skill_pack_items", "skill_item_answers", "skill_catalog_entries"]) {
      expect(SQL).toContain(`CREATE TABLE "${table}"`);
    }
  });

  it("adds the generation heartbeat column", () => {
    expect(SQL).toContain('"generation_started_at" TIMESTAMP(3)');
  });

  it("seeds the skill-definition matrix exactly as defined", () => {
    for (const line of matrixSeedSql(SKILL_MATRIX)) expect(SQL).toContain(line);
  });

  it("only adds: nothing is dropped and no existing column changes", () => {
    expect(SQL).not.toMatch(/\bDROP\b/i);
    expect(SQL).not.toMatch(/ALTER TABLE "(users|prompt_[a-z_]+|ai_[a-z_]+)" (ADD|ALTER|DROP) COLUMN/i);
  });
});
```

Replace the whole of `apps/web/src/app/(app)/prompt-bot/skills/skills-page.test.ts` with (interim; Task 17 replaces it):

```ts
/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), findMany: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { skillPack: { findMany: mocks.findMany } } }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
afterEach(cleanup);

import SkillsBuilderPage from "./page";

describe("Skills Builder start page (interim)", () => {
  it("lists earlier packs as read-only links and no catalog link", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "c1", role: "MENTOR" });
    mocks.findMany.mockResolvedValue([{ id: "p1", title: "Board pack", updatedAt: new Date("2026-11-24T10:00:00Z") }]);
    render(await SkillsBuilderPage());
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "c1" } }));
    expect(screen.getByRole("heading", { name: "Skills Builder" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Board pack/ }).getAttribute("href")).toBe("/prompt-bot/skills/legacy/p1");
    expect(screen.getByText("Read-only")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /catalog/i })).toBeNull();
  });
});
```

In `apps/web/src/components/prompt-bot/prompt-bot-tabs.test.ts`, replace the `it.each` table with:

```ts
  it.each([
    ["/prompt-bot", "Prompt Bot"],
    ["/prompt-bot/cm123abc", "Prompt Bot"],
    ["/prompt-bot/matrices", "Prompt Bot"],
    ["/prompt-bot/skills", "Skills Builder"],
    ["/prompt-bot/skills/j1", "Skills Builder"],
    ["/prompt-bot/skills/legacy/p1", "Skills Builder"],
    // The catalog is gone: its old path no longer belongs to the Skills Builder.
    ["/prompt-bot/catalog", "Prompt Bot"],
  ])("marks the current area for %s", (pathname, current) => {
```

In `apps/web/src/lib/skills/format.test.ts`: change the import line to

```ts
import { checkSkillPath, validateSkillFiles, validateSkillMd } from "./format";
```

delete the test `it("knows when a draft is too big to store at all (count, per-file or per-skill bytes)", …)` (the six lines starting with that `it(`), delete the whole `describe("withSkillName", …)` block, and append:

```ts
describe("module", () => {
  it("keeps only the validator", async () => {
    expect(Object.keys(await import("./format")).sort()).toEqual(["SKILL_FOLDERS", "checkSkillPath", "validateSkillFiles", "validateSkillMd"]);
  });
});
```

In `apps/web/src/lib/ai/claude.test.ts`: remove `generateSkillDraft` and `splitWork` from the `import { … } from "./claude"` line, and delete the three old Skills Builder tests: `it("splits with Opus 5.5, structured output, the server-side fallback and a request-scoped timeout", …)`, `it("generates a draft with a long, non-retrying request and rejects a reply that does not match the schema", …)` and `it.each(["max_tokens", "refusal"])("throws when a skills reply stopped with %s", …)` (it calls `generateSkillDraft`). Keep every test Task 8 added. If the `describe("skills builder calls", …)` block is then empty, delete it. Append:

```ts
describe("old Skills Builder calls", () => {
  it("are gone", async () => {
    const mod = await import("./claude");
    expect("splitWork" in mod).toBe(false);
    expect("generateSkillDraft" in mod).toBe(false);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd apps/web && npx vitest run src/lib/skills/packs.test.ts src/app/api/v1/prompt-bot/skill-packs/pack-routes.test.ts src/lib/skills/client.test.ts src/lib/skills/assemble.test.ts src/lib/skills/format.test.ts src/lib/skills/migration-seed.test.ts "src/app/(app)/prompt-bot/skills/skills-page.test.ts" src/components/prompt-bot/prompt-bot-tabs.test.ts src/lib/ai/claude.test.ts`
Expected: FAIL — the pack view still includes catalog entries and non-ready items, `[id]/route.ts` still exports `PATCH`, the removed route files still exist, the client and modules still export the old functions, the home page still links to `/prompt-bot/skills/p1` and the catalog, and `/prompt-bot/catalog` is still a Skills path.

- [ ] **Step 3: Delete the catalog, the old flow and their tests**

```bash
cd "/Users/tharunkumarl/Full Stack/lms/apps/web"
git rm -r src/app/api/v1/prompt-bot/skill-catalog "src/app/(app)/prompt-bot/catalog" "src/app/(app)/prompt-bot/skills/[packId]"
git rm src/lib/skills/catalog-candidates.ts src/lib/skills/catalog-input.ts src/lib/skills/catalog-licenses.ts \
  src/lib/skills/catalog-seed.ts src/lib/skills/catalog-seed.test.ts src/lib/skills/license.ts src/lib/skills/license.test.ts \
  src/lib/skills/split.ts src/lib/skills/split.test.ts src/lib/skills/seed-sql.ts \
  src/lib/skills/generate.ts src/lib/skills/generate.test.ts src/lib/skills/instructions.ts src/lib/skills/instructions.test.ts \
  src/lib/skills/http.ts scripts/verify-catalog-licenses.ts scripts/skills-builder-seed-sql.ts \
  src/app/api/v1/prompt-bot/skill-packs/route.ts src/app/api/v1/prompt-bot/skill-packs/generate-routes.test.ts \
  src/app/api/v1/prompt-bot/skill-packs/refine-routes.test.ts \
  "src/app/api/v1/prompt-bot/skill-packs/[id]/items/route.ts" \
  "src/app/api/v1/prompt-bot/skill-packs/[id]/items/[itemId]/answers/[questionId]/route.ts" \
  "src/app/api/v1/prompt-bot/skill-packs/[id]/items/[itemId]/score/route.ts" \
  "src/app/api/v1/prompt-bot/skill-packs/[id]/items/[itemId]/generate/route.ts" \
  "src/app/api/v1/prompt-bot/skill-packs/[id]/items/[itemId]/files/route.ts" \
  "src/app/(app)/prompt-bot/skills/new-pack-form.tsx" "src/app/(app)/prompt-bot/skills/new-pack-form.test.ts"
```

`skills/[packId]` is removed as a whole: it holds `page.tsx`, `page.test.ts`, `pack-view.tsx`, `pack-view.test.ts`, `skill-preview.tsx`, `skill-preview.test.ts`, `skill-refine.tsx` and `skills-list.tsx`. Old `/prompt-bot/skills/<packId>` links 404 until Task 18's `[jobId]` page redirects them to the legacy page, and the home page's legacy links 404 until Task 17 adds it; both are inside this branch only.

- [ ] **Step 4: Make the legacy data layer, types, client and routes read-only**

Replace the whole of `apps/web/src/lib/skills/types.ts` with:

```ts
import type { AnswerView } from "@/lib/prompt-bot/sessions";

export type SkillFile = { path: string; content: string };
/** What a pack view carries per file: never the contents (they load per item). */
export type SkillFileEntry = { path: string; bytes: number };
export type SkillItemKind = "CUSTOM" | "CATALOG";
export type SkillItemStatus = "DRAFT" | "GENERATING" | "READY" | "FAILED";

/** A legacy pack item (packs made before the Jobs redesign; read-only). */
export type SkillItemView = {
  id: string;
  order: number;
  kind: SkillItemKind;
  name: string;
  purpose: string;
  status: SkillItemStatus;
  files: SkillFileEntry[] | null;
  validationErrors: string[];
  scoreRevision: number;
  answers: AnswerView[];
};

/** One item with its file contents (GET /skill-packs/:id/items/:itemId). */
export type SkillItemDetail = Omit<SkillItemView, "files"> & { files: SkillFile[] | null };

export type SkillMatrixView = { id: string; name: string; questions: { id: string; text: string; guidance: string; order: number }[] };

export type SkillPackView = {
  id: string;
  title: string;
  description: string;
  role: string | null;
  matrix: SkillMatrixView;
  items: SkillItemView[];
};
```

Replace the whole of `apps/web/src/lib/skills/packs.ts` with:

```ts
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { toAnswerView } from "@/lib/prompt-bot/score-run";
import { loadSkillMatrix } from "./matrix";
import type { ZipSkill } from "./zip";
import type { SkillFile, SkillFileEntry, SkillItemDetail, SkillItemStatus, SkillItemView, SkillPackView } from "./types";

/**
 * Legacy skill packs, made before the Jobs redesign. They are read-only: only their finished custom skills
 * are shown and downloaded. Catalog items and unfinished drafts stay in the database and are never read.
 */
export const UNREADABLE_FILES_MESSAGE = "The saved files couldn't be read, so this skill can't be shown or downloaded.";

const LEGACY_ITEMS = { kind: "CUSTOM", status: "READY" } as const satisfies Prisma.SkillPackItemWhereInput;

const StoredFiles = z.array(z.object({ path: z.string(), content: z.string() }));
const FileIndex = z.array(z.object({ path: z.string(), bytes: z.number().int().nonnegative() }));

export function parseStoredFiles(value: unknown): SkillFile[] | null {
  if (value === null || value === undefined) return null;
  const parsed = StoredFiles.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * Paths and UTF-8 sizes of each item's stored files, computed in Postgres so file contents never leave the database
 * for the pack view. NULL means no files; a non-array `files` value comes back as `false` (unreadable).
 */
const FILE_INDEX_SQL = Prisma.sql`CASE
  WHEN i.files IS NULL THEN NULL
  WHEN jsonb_typeof(i.files) <> 'array' THEN 'false'::jsonb
  ELSE (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'path', f -> 'path',
      'bytes', CASE WHEN jsonb_typeof(f -> 'content') = 'string' THEN octet_length(f ->> 'content') END
    ) ORDER BY n), '[]'::jsonb)
    FROM jsonb_array_elements(i.files) WITH ORDINALITY AS e(f, n)
  )
END`;

async function fileIndexes(packId: string): Promise<Map<string, unknown>> {
  const rows = await prisma.$queryRaw<{ id: string; file_index: unknown }[]>`SELECT i.id, ${FILE_INDEX_SQL} AS file_index FROM skill_pack_items i WHERE i.pack_id = ${packId}`;
  return new Map(rows.map((r) => [r.id, r.file_index]));
}

const itemInclude = { answers: true } as const satisfies Prisma.SkillPackItemInclude;
type ItemRow = Prisma.SkillPackItemGetPayload<{ include: typeof itemInclude; omit: { files: true } }>;

function viewOf<F>(row: ItemRow, files: F[] | null, unreadable: boolean, activeQuestionIds: ReadonlySet<string>) {
  return {
    id: row.id,
    order: row.order,
    kind: row.kind,
    name: row.name,
    purpose: row.purpose,
    status: (unreadable ? "FAILED" : row.status) as SkillItemStatus,
    files,
    validationErrors: unreadable ? [UNREADABLE_FILES_MESSAGE] : row.validationErrors,
    scoreRevision: row.scoreRevision,
    answers: row.answers.filter((a) => activeQuestionIds.has(a.questionId)).map(toAnswerView),
  };
}

/** The pack-view shape: `fileIndex` is the item's FILE_INDEX_SQL value (paths and sizes, no contents). */
export function toItemView(row: ItemRow, fileIndex: unknown, activeQuestionIds: ReadonlySet<string>): SkillItemView {
  const parsed = fileIndex === null || fileIndex === undefined ? null : FileIndex.safeParse(fileIndex);
  const files: SkillFileEntry[] | null = parsed?.success ? parsed.data : null;
  return viewOf(row, files, parsed !== null && !parsed.success, activeQuestionIds);
}

export function toItemDetail(row: ItemRow & { files: Prisma.JsonValue }, activeQuestionIds: ReadonlySet<string>): SkillItemDetail {
  const files = parseStoredFiles(row.files);
  return viewOf(row, files, row.files !== null && files === null, activeQuestionIds);
}

export async function loadPackView(packId: string, userId: string): Promise<SkillPackView | null> {
  const pack = await prisma.skillPack.findFirst({
    where: { id: packId, userId },
    include: { items: { where: LEGACY_ITEMS, include: itemInclude, omit: { files: true }, orderBy: { order: "asc" } } },
  });
  if (!pack) return null;
  const [matrix, indexes] = await Promise.all([loadSkillMatrix(), fileIndexes(packId)]);
  const active = new Set(matrix.questions.map((q) => q.id));
  return {
    id: pack.id,
    title: pack.title,
    description: pack.description,
    role: pack.role,
    matrix,
    items: pack.items.map((item) => toItemView(item, indexes.get(item.id) ?? null, active)),
  };
}

/** One finished custom skill with its file contents, for the read-only viewer and the single-skill download. */
export async function loadItemDetail(packId: string, itemId: string, userId: string): Promise<SkillItemDetail | null> {
  const row = await prisma.skillPackItem.findFirst({ where: { id: itemId, packId, ...LEGACY_ITEMS, pack: { userId } }, include: itemInclude });
  if (!row) return null;
  const matrix = await loadSkillMatrix();
  return toItemDetail(row, new Set(matrix.questions.map((q) => q.id)));
}

/** The owner's READY custom skills with contents, for the legacy pack zip. */
export async function loadReadySkillFiles(packId: string, userId: string): Promise<ZipSkill[]> {
  const rows = await prisma.skillPackItem.findMany({
    where: { packId, pack: { userId }, kind: "CUSTOM", status: "READY" },
    orderBy: { order: "asc" },
    select: { name: true, purpose: true, files: true },
  });
  return rows.flatMap((r) => {
    const files = parseStoredFiles(r.files);
    return files ? [{ name: r.name, purpose: r.purpose, files }] : [];
  });
}
```

Replace the whole of `apps/web/src/lib/skills/client.ts` with:

```ts
import { call } from "@/lib/prompt-bot/client";
import type { SkillItemDetail, SkillPackView } from "./types";

/** Legacy packs are read-only: view, read one skill's files, download. */
export const skillPackUrl = (packId: string) => `/api/v1/prompt-bot/skill-packs/${packId}`;
export const getPack = (packId: string) => call<SkillPackView>(skillPackUrl(packId));
export const getItem = (packId: string, itemId: string) => call<SkillItemDetail>(`${skillPackUrl(packId)}/items/${itemId}`);

/** Fetches a zip and saves it under the server's filename, so refusals (409, 404) can be shown as messages. */
export async function downloadZip(url: string): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      return { ok: false, message: body?.error?.message ?? "The download failed. Please try again." };
    }
    const blob = await res.blob();
    const filename = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "skills.zip";
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
    return { ok: true };
  } catch {
    return { ok: false, message: "Couldn't reach the server. Check your connection." };
  }
}
```

Replace the whole of `apps/web/src/app/api/v1/prompt-bot/skill-packs/[id]/route.ts` with:

```ts
import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse, successResponse } from "@/lib/api/response";
import { loadPackView } from "@/lib/skills/packs";

/** Legacy pack, read-only. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  const { id } = await params;
  const view = await loadPackView(id, user.id);
  return view ? successResponse(view) : errorResponse("Skill pack not found", "NOT_FOUND", 404);
}
```

Replace the whole of `apps/web/src/app/api/v1/prompt-bot/skill-packs/[id]/items/[itemId]/route.ts` with:

```ts
import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse, successResponse } from "@/lib/api/response";
import { loadItemDetail } from "@/lib/skills/packs";

/** One legacy skill with its files, read-only. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  const { id, itemId } = await params;
  const view = await loadItemDetail(id, itemId, user.id);
  return view ? successResponse(view) : errorResponse("Skill not found", "NOT_FOUND", 404);
}
```

- [ ] **Step 5: Trim the shared skills modules and the AI client**

Replace the whole of `apps/web/src/lib/skills/assemble.ts` with:

```ts
import { oneLine } from "./names";

/**
 * A JSON string literal is a valid YAML double-quoted scalar, so any text is safe here. Every frontmatter
 * value goes through it: unquoted, YAML 1.1 reads names such as `yes`, `null` or `2024` as non-text.
 */
const yamlString = (value: string) => JSON.stringify(value);

/** A model-supplied path placed under `folder` exactly once ("context.md" and "references/context.md" both become references/context.md). */
export function inFolder(folder: string, path: string): string {
  const clean = path.trim().replace(/^(\.\/)+/, "");
  return clean.startsWith(`${folder}/`) ? clean : `${folder}/${clean}`;
}

export function buildSkillMd(name: string, description: string, compatibility: string, body: string): string {
  const lines = ["---", `name: ${yamlString(name)}`, `description: ${yamlString(oneLine(description))}`];
  const compat = oneLine(compatibility);
  if (compat) lines.push(`compatibility: ${yamlString(compat)}`);
  lines.push("---", "", body.trim(), "");
  return lines.join("\n");
}
```

In `apps/web/src/lib/skills/format.ts`:
- change `import { isMap, parse, parseDocument } from "yaml";` to `import { parse } from "yaml";`;
- delete the function `withinStorageLimits` with its doc comment (`/** The size and count limits alone: … */` through its closing `}`);
- delete the function `withSkillName` with its doc comment (`/** Sets the frontmatter \`name\` … */` through its closing `}`).

In `apps/web/src/lib/skills/limits.ts`, delete these lines (they bounded edits of the old flow; nothing reads them now):

```ts
/** Items (custom and catalog) per pack; the split's own caps fit inside it. */
export const PACK_LIMITS = { items: 20 } as const;
export const MAX_CUSTOM_SKILLS = 8;
export const MAX_CATALOG_MATCHES = 6;

/** PATCH /files body: one skill's bytes plus JSON escaping headroom, checked before the body is parsed. */
export const FILES_REQUEST_BYTES = 2 * 1024 * 1024;
```

`SKILL_LIMITS`, `JOB_LIMITS`, `GENERATION_TIMEOUT_MS`, `GENERATION_STALE_MS`, `ANALYSIS_TIMEOUT_MS`, `ANALYSIS_STALE_MS` and `SUGGEST_TIMEOUT_MS` stay.

In `apps/web/src/lib/ai/claude.ts`:
- delete the three imports `import type { SkillDraft } from "@/lib/skills/assemble";`, `import { buildSplitMessage, GENERATE_SYSTEM, SPLIT_SYSTEM } from "@/lib/skills/instructions";` and `import type { RawSplit } from "@/lib/skills/split";`;
- delete `const SplitReply = …;`, the `SPLIT_REQUEST` constant with its comment, `splitWork` with its doc comment, `const DraftReply = …;`, and `generateSkillDraft` with its doc comment;
- then run `npx eslint src/lib/ai/claude.ts`: if it reports `object`, `STRING`, `DraftFile` or `GENERATE_REQUEST` as unused (Task 8's functions may still use them), delete exactly the ones it names.

- [ ] **Step 6: Point any remaining importer at the new owner**

```bash
cd "/Users/tharunkumarl/Full Stack/lms/apps/web"
npx tsc --noEmit
```
Expected: no errors. If a file Tasks 8–14 wrote still imports a removed name, change only that import: `isGenerating`/`generationCutoff` → `@/lib/skills/jobs/staleness`; `loadSkillMatrix` → `@/lib/skills/matrix`; `PURPOSE_MAX` → add `export const PURPOSE_MAX = 300;` to `src/lib/skills/names.ts` and import it from there. Re-run until clean.

- [ ] **Step 7: Interim home page and the tabs**

Replace the whole of `apps/web/src/app/(app)/prompt-bot/skills/page.tsx` with (interim; Task 17 replaces it with the jobs home):

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { Clock3 } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

export default async function SkillsBuilderPage() {
  const user = await getCurrentUser();
  if (!user) return redirect("/login");
  const packs = await prisma.skillPack.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    take: 20,
    select: { id: true, title: true, updatedAt: true },
  });
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Skills Builder</h1>
        <p className="mt-2 text-muted-foreground">Turn a job you do every week into your own Agent Skills, built from your own files and templates.</p>
      </header>
      {packs.length > 0 && (
        <section className="glass rounded-[1.75rem] p-5" aria-labelledby="earlier-packs">
          <h2 id="earlier-packs" className="text-sm font-medium text-muted-foreground">Earlier skill packs</h2>
          <ul className="mt-3 divide-y divide-border/60">
            {packs.map((pack) => (
              <li key={pack.id}>
                <Link
                  href={`/prompt-bot/skills/legacy/${pack.id}`}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-white/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 dark:hover:bg-white/5"
                >
                  <span className="min-w-0 truncate font-medium">{pack.title}</span>
                  <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                    <span className="rounded-full bg-muted px-2 py-0.5 dark:bg-white/10">Read-only</span>
                    <Clock3 className="size-3.5" aria-hidden />
                    {pack.updatedAt.toLocaleDateString()}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
```

In `apps/web/src/components/prompt-bot/prompt-bot-tabs.tsx`, replace `isSkillsPath` with:

```ts
export function isSkillsPath(pathname: string): boolean {
  return pathname === "/prompt-bot/skills" || pathname.startsWith("/prompt-bot/skills/");
}
```

- [ ] **Step 8: Keep the deprecated catalog in the schema, documented**

```bash
cd "/Users/tharunkumarl/Full Stack/lms/apps/web"
grep -c "Deprecated 2026-11-25" prisma/schema.prisma
```
Expected: `2` (Task 2 added one comment above `model SkillCatalogEntry` and one above `SkillPackItem.catalogEntryId`). Only if it prints `0`, add this line directly above `model SkillCatalogEntry {` and directly above the `catalogEntryId` field of `model SkillPackItem`:

```prisma
/// Deprecated 2026-11-25: unused since the Jobs redesign; kept so no data is dropped.
```

then confirm the schema still matches the database with no migration: `npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --exit-code` (exit code 0, "No difference detected").

- [ ] **Step 9: Prove nothing references the catalog or the old flow**

```bash
cd "/Users/tharunkumarl/Full Stack/lms/apps/web"
rg -n "skillCatalogEntry|SkillCatalogEntry|catalogEntry|CatalogCard|catalog-seed|catalog-input|catalog-licenses|catalog-candidates|skill-catalog|prompt-bot/catalog|recommended-skills|renderRecommended|catalogMatches|splitWork|generateSkillDraft|skills/split\"|skills/instructions\"|skills/license\"|skills/generate\"|createPack\b|NewPackForm|\bPackView\b" src scripts --glob '!scripts/fake-anthropic.mjs' --glob '!*.test.ts'
```
Expected: no output. Tests are excluded because several assert these names are gone (tabs, pack routes, claude); any test still importing a removed module fails `tsc` in Step 6. `scripts/fake-anthropic.mjs` still answers the old split shape; Task 22 replaces it.

- [ ] **Step 10: Run the affected tests and watch them pass**

Run: `cd apps/web && npx vitest run src/lib/skills src/app/api/v1/prompt-bot "src/app/(app)/prompt-bot" src/components/prompt-bot src/lib/ai && npx tsc --noEmit && npx eslint src/`
Expected: PASS, no type or lint errors.

- [ ] **Step 11: Commit**

```bash
cd "/Users/tharunkumarl/Full Stack/lms"
git add apps/web/src/lib/skills/packs.ts apps/web/src/lib/skills/packs.test.ts apps/web/src/lib/skills/types.ts \
  apps/web/src/lib/skills/client.ts apps/web/src/lib/skills/client.test.ts apps/web/src/lib/skills/assemble.ts apps/web/src/lib/skills/assemble.test.ts \
  apps/web/src/lib/skills/format.ts apps/web/src/lib/skills/format.test.ts apps/web/src/lib/skills/limits.ts \
  apps/web/src/lib/skills/migration-seed.test.ts apps/web/src/lib/ai/claude.ts apps/web/src/lib/ai/claude.test.ts \
  "apps/web/src/app/api/v1/prompt-bot/skill-packs/[id]/route.ts" "apps/web/src/app/api/v1/prompt-bot/skill-packs/[id]/items/[itemId]/route.ts" \
  apps/web/src/app/api/v1/prompt-bot/skill-packs/pack-routes.test.ts \
  "apps/web/src/app/(app)/prompt-bot/skills/page.tsx" "apps/web/src/app/(app)/prompt-bot/skills/skills-page.test.ts" \
  apps/web/src/components/prompt-bot/prompt-bot-tabs.tsx apps/web/src/components/prompt-bot/prompt-bot-tabs.test.ts
git status --short   # also stages the git rm deletions from Step 3; add apps/web/prisma/schema.prisma and src/lib/skills/names.ts only if Steps 6 or 8 changed them
git commit -m "refactor(skills-builder)!: remove the skill catalog and make old packs read-only

BREAKING CHANGE: the catalog pages and routes and the pack editing routes are removed; legacy packs can only be viewed and downloaded."
```

- [ ] **Step 12: Batch 2 gate**

```bash
cd "/Users/tharunkumarl/Full Stack/lms/apps/web"
npx vitest run && npx tsc --noEmit && npx eslint src/ && npx next build
```
Expected: every test passes, no type or lint errors, and the production build succeeds (it type-checks every route file's exports, so a non-HTTP export left in a route file fails here). Do not start Batch 3 until this is green.

---

## Batch 3 — UI (Tasks 16–21)

Batch 3 builds every screen on top of the Batch 2 routes. All component tests mock the client modules (`@/lib/skills/jobs/client`, `@/lib/skills/client`), so no task here touches the network or the database. Run every command from `apps/web` (`cd "/Users/tharunkumarl/Full Stack/lms/apps/web"`).

Shared UI rules for every task in this batch (from Global Constraints): `"use client"` on interactive components; `Button`/`Input`/`Textarea`/`Badge`/`ConfirmDialog` from `@/components/ui`; `toast` from `sonner`; lucide icons with `aria-hidden`; cards are `glass rounded-[1.75rem] p-5`; focus rings `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60`; touch targets at least 44 px (`min-h-11` on custom buttons; `Button` is 40 px on phones, so use `size="lg"` or `className="min-h-11"` for primary actions on mobile); dark mode via the existing `dark:` classes; no `window.confirm`.

---

### Task 16: Jobs client, generalized file tree and the read-only skill viewer

**Files:**
- Create: `apps/web/src/lib/skills/jobs/client.ts`
- Test: `apps/web/src/lib/skills/jobs/client.test.ts`
- Modify: `apps/web/src/components/prompt-bot/skills/file-tree.tsx` (entries instead of `SkillFile`, asset icon and size, `formatBytes`)
- Modify: `apps/web/src/components/prompt-bot/skills/file-tree.test.ts` (asset entries)
- Create: `apps/web/src/components/prompt-bot/skills/skill-files-view.tsx`
- Test: `apps/web/src/components/prompt-bot/skills/skill-files-view.test.ts`

**Interfaces:**
- Consumes: `call`, `CallResult`, `SaveOptions`, `ScoreReply` from `@/lib/prompt-bot/client`; `JobView`, `JobFileView`, `JobFileDetail`, `JobSkillView`, `VersionDetail` from `@/lib/skills/jobs/types` (Task 8); `SkillFile` from `@/lib/skills/types`; `SkillMarkdown` from `@/components/prompt-bot/skills/skill-markdown`; the routes of Tasks 9–14 (paths in the spec's API Reference).
- Produces:
  - everything listed under `src/lib/skills/jobs/client.ts` in the Interface Contract (`jobUrl`, `createJob`, `getJob`, `patchJob`, `deleteJob`, `saveJobAnswer`, `scoreJob`, `uploadJobFile`, `getJobFile`, `saveAnalysis`, `analyseAgain`, `removeJobFile`, `suggestSkills`, `addJobSkill`, `patchJobSkill`, `removeJobSkill`, `generateJobSkill`, `getVersion`, `versionDownloadUrl`, `jobDownloadUrl`);
  - `export type FileTreeEntry = { path: string; bytes?: number; asset?: boolean }`, `export function groupFiles<T extends FileTreeEntry>(files: T[]): FileGroup<T>[]`, `export function FileTree(props: { files: FileTreeEntry[]; selected: string | null; onSelect(path: string): void })`, `export function formatBytes(bytes: number): string` (all in `file-tree.tsx`);
  - `export function SkillFilesView(props: { files: SkillFile[]; assets?: { path: string; bytes: number; fileName?: string }[] })`.

- [ ] **Step 1: Write the failing client test**

```ts
// apps/web/src/lib/skills/jobs/client.test.ts
/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addJobSkill,
  analyseAgain,
  createJob,
  deleteJob,
  generateJobSkill,
  getJob,
  getJobFile,
  getVersion,
  jobDownloadUrl,
  jobUrl,
  patchJob,
  patchJobSkill,
  removeJobFile,
  removeJobSkill,
  saveAnalysis,
  saveJobAnswer,
  scoreJob,
  suggestSkills,
  uploadJobFile,
  versionDownloadUrl,
} from "./client";

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

const last = () => seen[seen.length - 1];
const json = () => JSON.parse(last().init.body as string);
const header = (name: string) => (last().init.headers as Record<string, string>)[name];

describe("jobs client", () => {
  it("builds the job URLs", () => {
    expect(jobUrl("j1")).toBe("/api/v1/prompt-bot/skill-jobs/j1");
    expect(jobDownloadUrl("j1")).toBe("/api/v1/prompt-bot/skill-jobs/j1/download");
    expect(versionDownloadUrl("j1", "s1", 3, "upload")).toBe("/api/v1/prompt-bot/skill-jobs/j1/skills/s1/versions/3/download?format=upload");
    expect(versionDownloadUrl("j1", "s1", 3, "pack")).toBe("/api/v1/prompt-bot/skill-jobs/j1/skills/s1/versions/3/download?format=pack");
  });

  it("creates, reads, patches and deletes a job", async () => {
    await createJob({ title: "Board update", description: "Every month I…" });
    expect(last().url).toBe("/api/v1/prompt-bot/skill-jobs");
    expect(last().init.method).toBe("POST");
    expect(json()).toEqual({ title: "Board update", description: "Every month I…" });

    await getJob("j1");
    expect(last().url).toBe("/api/v1/prompt-bot/skill-jobs/j1");
    expect(last().init.method).toBeUndefined();

    await patchJob("j1", { description: "New" }, { keepalive: true });
    expect(last().init.method).toBe("PATCH");
    expect(json()).toEqual({ description: "New" });
    expect(last().init.keepalive).toBe(true);

    await deleteJob("j1");
    expect(last().init.method).toBe("DELETE");
  });

  it("saves answers and scores the job", async () => {
    await saveJobAnswer("j1", "pbq_skill_2", { answer: "Board" });
    expect(last().url).toBe("/api/v1/prompt-bot/skill-jobs/j1/answers/pbq_skill_2");
    expect(last().init.method).toBe("PUT");
    expect(json()).toEqual({ answer: "Board" });
    await scoreJob("j1", 4);
    expect(last().url).toBe("/api/v1/prompt-bot/skill-jobs/j1/score");
    expect(json()).toEqual({ revision: 4 });
  });

  it("uploads the file itself as the body, named in the query", async () => {
    const file = new File([new Uint8Array([80, 75, 3, 4])], "Q3 board deck “final”.pptx", { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
    await uploadJobFile("j1", file);
    expect(last().url).toBe(`/api/v1/prompt-bot/skill-jobs/j1/files?name=${encodeURIComponent("Q3 board deck “final”.pptx")}`);
    expect(last().init.method).toBe("POST");
    expect(last().init.body).toBe(file);
    expect(header("content-type")).toBe("application/vnd.openxmlformats-officedocument.presentationml.presentation");
  });

  it("falls back to octet-stream when the browser gives no type", async () => {
    await uploadJobFile("j1", new File([new Uint8Array([1])], "notes"));
    expect(header("content-type")).toBe("application/octet-stream");
  });

  it("reads, edits, re-analyses and removes a file", async () => {
    await getJobFile("j1", "f1");
    expect(last().url).toBe("/api/v1/prompt-bot/skill-jobs/j1/files/f1");
    await saveAnalysis("j1", "f1", "## Colours");
    expect(last().init.method).toBe("PATCH");
    expect(json()).toEqual({ analysis: "## Colours" });
    await analyseAgain("j1", "f1");
    expect(last().url).toBe("/api/v1/prompt-bot/skill-jobs/j1/files/f1/analyse");
    expect(last().init.method).toBe("POST");
    await removeJobFile("j1", "f1");
    expect(last().url).toBe("/api/v1/prompt-bot/skill-jobs/j1/files/f1");
    expect(last().init.method).toBe("DELETE");
  });

  it("suggests, adds, patches, removes and generates skills", async () => {
    await suggestSkills("j1");
    expect(last().url).toBe("/api/v1/prompt-bot/skill-jobs/j1/suggest");
    expect(last().init.method).toBe("POST");
    await addJobSkill("j1", { name: "Board update", purpose: "Writes it.", fileIds: ["f1"] });
    expect(last().url).toBe("/api/v1/prompt-bot/skill-jobs/j1/skills");
    expect(json()).toEqual({ name: "Board update", purpose: "Writes it.", fileIds: ["f1"] });
    await patchJobSkill("j1", "s1", { fileIds: [] });
    expect(last().url).toBe("/api/v1/prompt-bot/skill-jobs/j1/skills/s1");
    expect(last().init.method).toBe("PATCH");
    expect(json()).toEqual({ fileIds: [] });
    await removeJobSkill("j1", "s1");
    expect(last().init.method).toBe("DELETE");
    await generateJobSkill("j1", "s1");
    expect(last().url).toBe("/api/v1/prompt-bot/skill-jobs/j1/skills/s1/generate");
    expect(last().init.method).toBe("POST");
  });

  it("reads a version by number or as latest", async () => {
    await getVersion("j1", "s1", 2);
    expect(last().url).toBe("/api/v1/prompt-bot/skill-jobs/j1/skills/s1/versions/2");
    await getVersion("j1", "s1", "latest");
    expect(last().url).toBe("/api/v1/prompt-bot/skill-jobs/j1/skills/s1/versions/latest");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/skills/jobs/client.test.ts`
Expected: FAIL, "Failed to resolve import "./client"".

- [ ] **Step 3: Write the client**

```ts
// apps/web/src/lib/skills/jobs/client.ts
import { call, type CallResult, type SaveOptions, type ScoreReply } from "@/lib/prompt-bot/client";
import type { JobFileDetail, JobFileView, JobSkillView, JobView, VersionDetail } from "./types";

const BASE = "/api/v1/prompt-bot/skill-jobs";

export const jobUrl = (jobId: string) => `${BASE}/${jobId}`;
const fileUrl = (jobId: string, fileId: string) => `${jobUrl(jobId)}/files/${fileId}`;
const skillUrl = (jobId: string, skillId: string) => `${jobUrl(jobId)}/skills/${skillId}`;

const send = (method: string, body?: unknown, options: SaveOptions = {}): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  ...(options.keepalive ? { keepalive: true } : {}),
});

export const createJob = (input: { title?: string; description?: string }): Promise<CallResult<JobView>> =>
  call<JobView>(BASE, send("POST", input));
export const getJob = (jobId: string): Promise<CallResult<JobView>> => call<JobView>(jobUrl(jobId));
export const patchJob = (jobId: string, patch: { title?: string; description?: string }, options: SaveOptions = {}): Promise<CallResult<JobView>> =>
  call<JobView>(jobUrl(jobId), send("PATCH", patch, options));
export const deleteJob = (jobId: string): Promise<CallResult<{ deleted: true }>> => call<{ deleted: true }>(jobUrl(jobId), send("DELETE"));

export const saveJobAnswer = (
  jobId: string,
  questionId: string,
  patch: { answer?: string; notRelevant?: boolean },
  options: SaveOptions = {},
): Promise<CallResult<{ saved: true }>> => call<{ saved: true }>(`${jobUrl(jobId)}/answers/${questionId}`, send("PUT", patch, options));
export const scoreJob = (jobId: string, revision: number): Promise<CallResult<ScoreReply>> =>
  call<ScoreReply>(`${jobUrl(jobId)}/score`, send("POST", { revision }));

/** The file itself is the body (the route reads it with a byte cap); its name travels in the query. */
export const uploadJobFile = (jobId: string, file: File): Promise<CallResult<JobFileView>> =>
  call<JobFileView>(`${jobUrl(jobId)}/files?name=${encodeURIComponent(file.name)}`, {
    method: "POST",
    body: file,
    headers: { "content-type": file.type || "application/octet-stream" },
  });
export const getJobFile = (jobId: string, fileId: string): Promise<CallResult<JobFileDetail>> => call<JobFileDetail>(fileUrl(jobId, fileId));
export const saveAnalysis = (jobId: string, fileId: string, analysis: string): Promise<CallResult<JobFileView>> =>
  call<JobFileView>(fileUrl(jobId, fileId), send("PATCH", { analysis }));
export const analyseAgain = (jobId: string, fileId: string): Promise<CallResult<JobFileView>> =>
  call<JobFileView>(`${fileUrl(jobId, fileId)}/analyse`, send("POST"));
export const removeJobFile = (jobId: string, fileId: string): Promise<CallResult<{ deleted: true }>> =>
  call<{ deleted: true }>(fileUrl(jobId, fileId), send("DELETE"));

export const suggestSkills = (jobId: string): Promise<CallResult<JobView>> => call<JobView>(`${jobUrl(jobId)}/suggest`, send("POST"));
export const addJobSkill = (jobId: string, input: { name: string; purpose: string; fileIds?: string[] }): Promise<CallResult<JobSkillView>> =>
  call<JobSkillView>(`${jobUrl(jobId)}/skills`, send("POST", input));
export const patchJobSkill = (
  jobId: string,
  skillId: string,
  patch: { name?: string; purpose?: string; fileIds?: string[]; order?: number },
  options: SaveOptions = {},
): Promise<CallResult<JobSkillView>> => call<JobSkillView>(skillUrl(jobId, skillId), send("PATCH", patch, options));
export const removeJobSkill = (jobId: string, skillId: string): Promise<CallResult<{ deleted: true }>> =>
  call<{ deleted: true }>(skillUrl(jobId, skillId), send("DELETE"));
export const generateJobSkill = (jobId: string, skillId: string): Promise<CallResult<JobSkillView>> =>
  call<JobSkillView>(`${skillUrl(jobId, skillId)}/generate`, send("POST"));

export const getVersion = (jobId: string, skillId: string, version: number | "latest"): Promise<CallResult<VersionDetail>> =>
  call<VersionDetail>(`${skillUrl(jobId, skillId)}/versions/${version}`);
export const versionDownloadUrl = (jobId: string, skillId: string, version: number, format: "upload" | "pack") =>
  `${skillUrl(jobId, skillId)}/versions/${version}/download?format=${format}`;
export const jobDownloadUrl = (jobId: string) => `${jobUrl(jobId)}/download`;
```

- [ ] **Step 4: Run the client test and watch it pass**

Run: `npx vitest run src/lib/skills/jobs/client.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Write the failing file-tree and viewer tests**

Replace the whole of `apps/web/src/components/prompt-bot/skills/file-tree.test.ts` with:

```ts
/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FileTree, formatBytes, groupFiles } from "./file-tree";

afterEach(cleanup);

const FILES = [
  { path: "scripts/b.py", content: "" },
  { path: "references/z.md", content: "" },
  { path: "SKILL.md", content: "" },
  { path: "assets/t.md", content: "" },
  { path: "references/a.md", content: "" },
];

describe("groupFiles", () => {
  it("puts SKILL.md first, then references, scripts and assets", () => {
    expect(groupFiles(FILES).map((g) => [g.folder, g.files.map((f) => f.path)])).toEqual([
      [null, ["SKILL.md"]],
      ["references", ["references/a.md", "references/z.md"]],
      ["scripts", ["scripts/b.py"]],
      ["assets", ["assets/t.md"]],
    ]);
  });
});

describe("FileTree", () => {
  it("lists files in order, marks the selected one and reports clicks", () => {
    const onSelect = vi.fn();
    render(createElement(FileTree, { files: FILES, selected: "references/a.md", onSelect }));
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["SKILL.md", "a.md", "z.md", "b.py", "t.md"]);
    expect(screen.getByRole("button", { name: "a.md" }).getAttribute("aria-current")).toBe("true");
    expect(screen.getByRole("button", { name: "z.md" }).getAttribute("aria-current")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "z.md" }));
    expect(onSelect).toHaveBeenCalledWith("references/z.md");
    expect(screen.getByRole("navigation", { name: "Skill files" })).toBeTruthy();
  });

  it("shows an original file's size next to its name", () => {
    render(createElement(FileTree, { files: [{ path: "SKILL.md" }, { path: "assets/deck.pptx", bytes: 4_404_019, asset: true }], selected: null, onSelect: vi.fn() }));
    const asset = screen.getByRole("button", { name: /deck\.pptx/ });
    expect(asset.textContent).toBe("deck.pptx4.2 MB");
    expect(asset.getAttribute("data-asset")).toBe("true");
  });
});

describe("formatBytes", () => {
  it("uses B, KB and one-decimal MB", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1500)).toBe("2 KB");
    expect(formatBytes(4_404_019)).toBe("4.2 MB");
    expect(formatBytes(20 * 1024 * 1024)).toBe("20.0 MB");
  });
});
```

```ts
// apps/web/src/components/prompt-bot/skills/skill-files-view.test.ts
/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { SkillFilesView } from "./skill-files-view";

afterEach(cleanup);

const FILES = [
  { path: "SKILL.md", content: '---\nname: board-update\ndescription: "Writes it."\n---\n\n# Board update\n\nStart from the deck.\n' },
  { path: "references/style-guide.md", content: "# Style guide\n\nNavy #1F4E79." },
  { path: "scripts/count.py", content: "print(1)" },
];
const ASSETS = [{ path: "assets/q3-deck.pptx", bytes: 4_404_019, fileName: "Q3 deck.pptx" }];

describe("SkillFilesView", () => {
  it("opens on SKILL.md rendered as Markdown", () => {
    render(createElement(SkillFilesView, { files: FILES, assets: ASSETS }));
    expect(screen.getByRole("heading", { name: "Board update" })).toBeTruthy();
    expect(screen.getByLabelText("Frontmatter").textContent).toContain("name: board-update");
    expect(screen.getByRole("button", { name: "SKILL.md" }).getAttribute("aria-current")).toBe("true");
  });

  it("shows other text files as-is, with the script notice on scripts", () => {
    render(createElement(SkillFilesView, { files: FILES, assets: ASSETS }));
    fireEvent.click(screen.getByRole("button", { name: "style-guide.md" }));
    expect(screen.getByLabelText("Contents of references/style-guide.md").textContent).toBe("# Style guide\n\nNavy #1F4E79.");
    expect(screen.queryByRole("note")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "count.py" }));
    expect(screen.getByRole("note").textContent).toContain("Review scripts before running them");
  });

  it("describes an original file without trying to show its bytes", () => {
    render(createElement(SkillFilesView, { files: FILES, assets: ASSETS }));
    fireEvent.click(screen.getByRole("button", { name: /q3-deck\.pptx/ }));
    expect(screen.getByText("Q3 deck.pptx")).toBeTruthy();
    expect(screen.getByText("Original file · 4.2 MB")).toBeTruthy();
    expect(screen.queryByLabelText(/Contents of assets/)).toBeNull();
  });

  it("has no editing controls", () => {
    render(createElement(SkillFilesView, { files: FILES, assets: ASSETS }));
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("says so when there are no files", () => {
    render(createElement(SkillFilesView, { files: [] }));
    expect(screen.getByText("This version has no files.")).toBeTruthy();
  });
});
```

- [ ] **Step 6: Run them and watch them fail**

Run: `npx vitest run src/components/prompt-bot/skills/file-tree.test.ts src/components/prompt-bot/skills/skill-files-view.test.ts`
Expected: FAIL: `formatBytes` is not exported, the asset test finds no size, and "Failed to resolve import "./skill-files-view"".

- [ ] **Step 7: Invoke the `impeccable` skill**

Invoke the `impeccable` skill with the Skill tool and apply it on top of the LMS design system (existing `glass` panels, `--primary`, the file-tree look already in `file-tree.tsx`). Keep the tree compact on desktop and full-width above the content on mobile.

- [ ] **Step 8: Generalize the file tree**

Replace the whole of `apps/web/src/components/prompt-bot/skills/file-tree.tsx` with:

```tsx
"use client";
import { FileArchive, FileCode, FileText, Folder } from "lucide-react";
import { cn } from "@/lib/utils";

const FOLDER_ORDER = ["references", "scripts", "assets"];
const rank = (folder: string) => {
  const i = FOLDER_ORDER.indexOf(folder);
  return i === -1 ? FOLDER_ORDER.length : i;
};

/** One row in the tree: a text file (bytes optional) or an original file bundled under assets/. */
export type FileTreeEntry = { path: string; bytes?: number; asset?: boolean };
export type FileGroup<T extends FileTreeEntry = FileTreeEntry> = { folder: string | null; files: T[] };

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function groupFiles<T extends FileTreeEntry>(files: T[]): FileGroup<T>[] {
  const root = files
    .filter((f) => !f.path.includes("/"))
    .sort((a, b) => (a.path === "SKILL.md" ? -1 : b.path === "SKILL.md" ? 1 : a.path.localeCompare(b.path)));
  const byFolder = new Map<string, T[]>();
  for (const file of files) {
    const slash = file.path.indexOf("/");
    if (slash === -1) continue;
    const folder = file.path.slice(0, slash);
    byFolder.set(folder, [...(byFolder.get(folder) ?? []), file]);
  }
  const folders = [...byFolder.keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  return [
    ...(root.length ? [{ folder: null, files: root }] : []),
    ...folders.map((folder) => ({ folder, files: byFolder.get(folder)!.sort((a, b) => a.path.localeCompare(b.path)) })),
  ];
}

export function FileTree({ files, selected, onSelect }: { files: FileTreeEntry[]; selected: string | null; onSelect(path: string): void }) {
  return (
    <nav aria-label="Skill files" className="h-fit rounded-2xl bg-white/45 p-2 dark:bg-white/5">
      <ul className="flex flex-col gap-2">
        {groupFiles(files).map((group) => (
          <li key={group.folder ?? "."}>
            {group.folder && (
              <p className="flex items-center gap-1.5 px-2 pt-1 font-mono text-xs text-muted-foreground">
                <Folder className="size-3.5" aria-hidden />
                {group.folder}/
              </p>
            )}
            <ul className="mt-1 flex flex-col">
              {group.files.map((file) => {
                const label = group.folder ? file.path.slice(group.folder.length + 1) : file.path;
                const Icon = file.asset ? FileArchive : file.path.startsWith("scripts/") ? FileCode : FileText;
                const current = file.path === selected;
                return (
                  <li key={file.path}>
                    <button
                      type="button"
                      onClick={() => onSelect(file.path)}
                      aria-current={current ? "true" : undefined}
                      data-asset={file.asset ? "true" : undefined}
                      title={file.path}
                      className={cn(
                        "flex min-h-9 w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left font-mono text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
                        group.folder && "pl-6",
                        current ? "bg-primary/10 text-primary" : "text-foreground hover:bg-white/60 dark:hover:bg-white/10",
                      )}
                    >
                      <Icon className="size-3.5 shrink-0" aria-hidden />
                      <span className="min-w-0 truncate">{label}</span>
                      {file.asset && file.bytes !== undefined && (
                        <span className="ml-auto shrink-0 font-sans text-[11px] tabular-nums text-muted-foreground">{formatBytes(file.bytes)}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 9: Write the viewer**

```tsx
// apps/web/src/components/prompt-bot/skills/skill-files-view.tsx
"use client";
import * as React from "react";
import { AlertTriangle, FileArchive } from "lucide-react";
import type { SkillFile } from "@/lib/skills/types";
import { FileTree, formatBytes, type FileTreeEntry } from "./file-tree";
import { SkillMarkdown } from "./skill-markdown";

type AssetEntry = { path: string; bytes: number; fileName?: string };
const utf8Bytes = (value: string) => new TextEncoder().encode(value).length;

/**
 * A skill's files, read-only: the tree, SKILL.md rendered, other text files as-is, and the
 * original files under assets/ described by name and size (their bytes are never shown here).
 * Shared by job version previews and legacy packs.
 */
export function SkillFilesView({ files, assets = [] }: { files: SkillFile[]; assets?: AssetEntry[] }) {
  const entries = React.useMemo<FileTreeEntry[]>(
    () => [...files.map((f) => ({ path: f.path, bytes: utf8Bytes(f.content) })), ...assets.map((a) => ({ path: a.path, bytes: a.bytes, asset: true }))],
    [files, assets],
  );
  const fallback = files.find((f) => f.path === "SKILL.md")?.path ?? entries[0]?.path ?? null;
  const [selected, setSelected] = React.useState<string | null>(fallback);
  const current = selected !== null && entries.some((e) => e.path === selected) ? selected : fallback;
  const file = files.find((f) => f.path === current) ?? null;
  const asset = assets.find((a) => a.path === current) ?? null;

  if (entries.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">This version has no files.</p>;

  return (
    <div className="grid gap-4 md:grid-cols-[14rem_minmax(0,1fr)]">
      <FileTree files={entries} selected={current} onSelect={setSelected} />
      <div className="min-w-0">
        {current && <p className="truncate font-mono text-sm">{current}</p>}
        {file?.path.startsWith("scripts/") && (
          <p role="note" className="mt-3 flex items-start gap-2 rounded-xl bg-amber-400/15 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            Review scripts before running them. The LMS never runs them for you.
          </p>
        )}
        {asset ? (
          <div className="mt-3 flex items-start gap-3 rounded-2xl bg-white/60 p-4 text-sm dark:bg-white/5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FileArchive className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="truncate font-medium">{asset.fileName ?? asset.path.split("/").pop()}</p>
              <p className="text-muted-foreground">Original file · {formatBytes(asset.bytes)}</p>
              <p className="mt-1 text-xs text-muted-foreground">Included so the skill can reuse your template exactly.</p>
            </div>
          </div>
        ) : file?.path === "SKILL.md" ? (
          <SkillMarkdown content={file.content} />
        ) : file ? (
          <pre
            aria-label={`Contents of ${file.path}`}
            className="mt-3 max-h-[32rem] overflow-auto whitespace-pre-wrap break-words rounded-2xl bg-white/60 p-4 font-mono text-xs leading-relaxed dark:bg-white/5"
          >
            {file.content}
          </pre>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 10: Run the tests and watch them pass**

Run: `npx vitest run src/lib/skills/jobs/client.test.ts src/components/prompt-bot/skills/`
Expected: PASS (client, file-tree, skill-files-view and the unchanged skill-markdown tests).

- [ ] **Step 11: Accessibility check**

Invoke the `fixing-accessibility` skill with the Skill tool for `file-tree.tsx` and `skill-files-view.tsx`: every tree button has a name (the file label), the selected one carries `aria-current`, icons are `aria-hidden`, the script notice is a `note`, the text `pre` is labelled. Fix anything it reports in these two files and re-run Step 10.

- [ ] **Step 12: Typecheck and commit**

```bash
npx tsc --noEmit
git add src/lib/skills/jobs/client.ts src/lib/skills/jobs/client.test.ts src/components/prompt-bot/skills/file-tree.tsx src/components/prompt-bot/skills/file-tree.test.ts src/components/prompt-bot/skills/skill-files-view.tsx src/components/prompt-bot/skills/skill-files-view.test.ts
git commit -m "feat(skills-builder): add the jobs client and a read-only skill files view"
```
Expected: no type errors.

---

### Task 17: Skills Builder home, new job form and the legacy pack page

**Files:**
- Modify: `apps/web/src/app/(app)/prompt-bot/skills/page.tsx` (replace the interim Task 15 page)
- Modify: `apps/web/src/app/(app)/prompt-bot/skills/skills-page.test.ts` (replace)
- Create: `apps/web/src/app/(app)/prompt-bot/skills/new-job-form.tsx`
- Test: `apps/web/src/app/(app)/prompt-bot/skills/new-job-form.test.ts`
- Create: `apps/web/src/app/(app)/prompt-bot/skills/legacy/[packId]/page.tsx`
- Create: `apps/web/src/app/(app)/prompt-bot/skills/legacy/[packId]/legacy-pack-view.tsx`
- Test: `apps/web/src/app/(app)/prompt-bot/skills/legacy/[packId]/legacy-pack.test.ts`
- Verify only: `apps/web/src/components/prompt-bot/prompt-bot-tabs.tsx` (Task 15 already narrowed `isSkillsPath`)

**Interfaces:**
- Consumes: `createJob` (Task 16); `downloadZip`, `getItem` from `@/lib/skills/client` (kept by Task 15 for legacy packs); `loadPackView(packId, userId): Promise<SkillPackView | null>` from `@/lib/skills/packs` (legacy, read-only after Task 15); `SkillPackView`, `SkillItemView`, `SkillFile` from `@/lib/skills/types`; `SkillFilesView` (Task 16); `useLocalDraft`; `NotConfigured`; `prisma.skillJob` (Task 2) and `prisma.skillPack`.
- Produces: `export default async function SkillsBuilderPage()`; `export function NewJobForm(props: { draftKey: string })`; `export default async function LegacyPackPage(props: { params: Promise<{ packId: string }> })`; `export function LegacyPackView(props: { pack: SkillPackView })`.

- [ ] **Step 1: Write the failing tests**

Replace the whole of `apps/web/src/app/(app)/prompt-bot/skills/skills-page.test.ts` with:

```ts
/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  isAiConfigured: vi.fn(),
  jobFindMany: vi.fn(),
  packFindMany: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/ai/config", () => ({ isAiConfigured: mocks.isAiConfigured }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { skillJob: { findMany: mocks.jobFindMany }, skillPack: { findMany: mocks.packFindMany } } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), redirect: mocks.redirect }));
afterEach(cleanup);

import SkillsBuilderPage from "./page";

const JOB = { id: "j1", title: "Monthly board update", updatedAt: new Date("2026-11-25T10:00:00Z"), _count: { skills: 2, files: 1 } };
const PACK = { id: "p1", title: "Board pack", updatedAt: new Date("2026-11-24T10:00:00Z") };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isAiConfigured.mockReturnValue(true);
  mocks.getCurrentUser.mockResolvedValue({ id: "u1", role: "MENTEE" });
  mocks.jobFindMany.mockResolvedValue([JOB]);
  mocks.packFindMany.mockResolvedValue([PACK]);
});

describe("Skills Builder home", () => {
  it("shows the new job form and the user's jobs, newest first", async () => {
    render(await SkillsBuilderPage());
    expect(mocks.jobFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "u1" },
        orderBy: { updatedAt: "desc" },
        take: 20,
        select: expect.objectContaining({ _count: { select: { skills: true, files: { where: { deletedAt: null } } } } }),
      }),
    );
    expect(screen.getByRole("heading", { level: 1, name: "Skills Builder" })).toBeTruthy();
    expect(screen.getByText(/built from your own files and templates/)).toBeTruthy();
    expect(screen.getByLabelText("Describe the job as you do it today")).toBeTruthy();
    const link = screen.getByRole("link", { name: /Monthly board update/ });
    expect(link.getAttribute("href")).toBe("/prompt-bot/skills/j1");
    expect(within(link).getByText("2 skills · 1 file")).toBeTruthy();
    expect(screen.getByText(/sent to Anthropic's API to build your skills/)).toBeTruthy();
  });

  it("lists earlier packs collapsed, read-only, linking to the legacy page", async () => {
    render(await SkillsBuilderPage());
    const details = screen.getByText("Earlier skill packs").closest("details")!;
    expect(details.open).toBe(false);
    expect(within(details).getByText("Read-only")).toBeTruthy();
    expect(within(details).getByRole("link", { name: /Board pack/ }).getAttribute("href")).toBe("/prompt-bot/skills/legacy/p1");
  });

  it("hides the legacy section when there are no earlier packs", async () => {
    mocks.packFindMany.mockResolvedValue([]);
    render(await SkillsBuilderPage());
    expect(screen.queryByText("Earlier skill packs")).toBeNull();
  });

  it("replaces the form with the not-configured panel but keeps the lists", async () => {
    mocks.isAiConfigured.mockReturnValue(false);
    mocks.getCurrentUser.mockResolvedValue({ id: "a1", role: "ADMIN" });
    render(await SkillsBuilderPage());
    expect(screen.getByText("Prompt Bot isn't configured yet")).toBeTruthy();
    expect(screen.getByText(/ANTHROPIC_API_KEY/)).toBeTruthy();
    expect(screen.queryByLabelText("Describe the job as you do it today")).toBeNull();
    expect(screen.getByRole("link", { name: /Monthly board update/ })).toBeTruthy();
  });

  it("never links to the removed catalog", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "c1", role: "MENTOR" });
    render(await SkillsBuilderPage());
    expect(screen.queryByRole("link", { name: /catalog/i })).toBeNull();
  });
});
```

```ts
// apps/web/src/app/(app)/prompt-bot/skills/new-job-form.test.ts
/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ push: vi.fn(), createJob: vi.fn(), toastError: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }));
vi.mock("@/lib/skills/jobs/client", () => ({ createJob: mocks.createJob }));

import { NewJobForm } from "./new-job-form";

const mount = async () => {
  render(createElement(NewJobForm, { draftKey: "skills-builder:job-draft:u1" }));
  await act(async () => {});
};
const description = () => screen.getByLabelText("Describe the job as you do it today") as HTMLTextAreaElement;
const title = () => screen.getByLabelText(/Job title/) as HTMLInputElement;
const start = () => screen.getByRole("button", { name: /Start job/ });

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("NewJobForm", () => {
  it("needs a description before it can start", async () => {
    await mount();
    expect((start() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(description(), { target: { value: "   " } });
    expect((start() as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps the draft across visits and clears it once the job exists", async () => {
    await mount();
    fireEvent.change(title(), { target: { value: "Board update" } });
    fireEvent.change(description(), { target: { value: "Every month I turn my notes into the board deck." } });
    cleanup();
    await mount();
    expect(title().value).toBe("Board update");
    expect(description().value).toBe("Every month I turn my notes into the board deck.");

    mocks.createJob.mockResolvedValue({ ok: true, data: { id: "j1" } });
    await act(async () => {
      fireEvent.click(start());
    });
    expect(mocks.createJob).toHaveBeenCalledWith({ title: "Board update", description: "Every month I turn my notes into the board deck." });
    expect(mocks.push).toHaveBeenCalledWith("/prompt-bot/skills/j1");
    cleanup();
    await mount();
    expect(title().value).toBe("");
    expect(description().value).toBe("");
  });

  it("leaves out a blank title, starts with Ctrl+Enter and reports failures", async () => {
    await mount();
    fireEvent.change(description(), { target: { value: "I write the weekly report." } });
    mocks.createJob.mockResolvedValue({ ok: false, code: "VALIDATION_ERROR", message: "Validation failed" });
    await act(async () => {
      fireEvent.keyDown(description(), { key: "Enter", ctrlKey: true });
    });
    expect(mocks.createJob).toHaveBeenCalledWith({ description: "I write the weekly report." });
    expect(mocks.toastError).toHaveBeenCalledWith("Validation failed");
    expect(mocks.push).not.toHaveBeenCalled();
    expect((start() as HTMLButtonElement).disabled).toBe(false);
  });
});
```

```ts
// apps/web/src/app/(app)/prompt-bot/skills/legacy/[packId]/legacy-pack.test.ts
/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SkillPackView } from "@/lib/skills/types";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  loadPackView: vi.fn(),
  redirect: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  getItem: vi.fn(),
  downloadZip: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/skills/packs", () => ({ loadPackView: mocks.loadPackView }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, notFound: mocks.notFound }));
vi.mock("@/lib/skills/client", () => ({ getItem: mocks.getItem, downloadZip: mocks.downloadZip }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
afterEach(cleanup);

import LegacyPackPage from "./page";
import { LegacyPackView } from "./legacy-pack-view";

const SKILL_MD = '---\nname: board-update\ndescription: "Writes it."\n---\n\n# Board update\n\nRead the notes.\n';
const PACK = {
  id: "p1",
  title: "Board pack",
  description: "Every month I write the board update.",
  role: null,
  matrix: { id: "m", name: "Skill definition", questions: [] },
  items: [
    { id: "i1", order: 0, kind: "CUSTOM", name: "board-update", purpose: "Writes the board update.", status: "READY", files: [{ path: "SKILL.md", bytes: 80 }], validationErrors: [], scoreRevision: 0, answers: [] },
    { id: "i2", order: 1, kind: "CUSTOM", name: "never-written", purpose: "Draft only.", status: "DRAFT", files: null, validationErrors: [], scoreRevision: 0, answers: [] },
  ],
} as unknown as SkillPackView;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "u1", role: "MENTEE" });
  mocks.getItem.mockResolvedValue({ ok: true, data: { ...PACK.items[0], files: [{ path: "SKILL.md", content: SKILL_MD }] } });
  mocks.downloadZip.mockResolvedValue({ ok: true });
});

describe("legacy pack page", () => {
  it("is 404 for a pack that is not the user's", async () => {
    mocks.loadPackView.mockResolvedValue(null);
    await expect(LegacyPackPage({ params: Promise.resolve({ packId: "p9" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.loadPackView).toHaveBeenCalledWith("p9", "u1");
  });

  it("renders the read-only view for the owner", async () => {
    mocks.loadPackView.mockResolvedValue(PACK);
    render(await LegacyPackPage({ params: Promise.resolve({ packId: "p1" }) }));
    await act(async () => {});
    expect(screen.getByRole("heading", { level: 1, name: "Board pack" })).toBeTruthy();
  });
});

describe("LegacyPackView", () => {
  const mount = async () => {
    render(createElement(LegacyPackView, { pack: PACK }));
    await act(async () => {});
  };

  it("shows only written skills, their files and the read-only note", async () => {
    await mount();
    expect(screen.getByText(/made with the earlier Skills Builder\. It can't be changed\./)).toBeTruthy();
    expect(screen.getByRole("button", { name: /board-update/ })).toBeTruthy();
    expect(screen.queryByText("never-written")).toBeNull();
    expect(mocks.getItem).toHaveBeenCalledWith("p1", "i1");
    expect(screen.getByRole("heading", { name: "Board update" })).toBeTruthy();
  });

  it("has no editing, generating or renaming controls", async () => {
    await mount();
    expect(screen.queryByRole("textbox")).toBeNull();
    for (const name of [/Generate/, /Save/, /Edit/, /Rename/, /Retry/, /Refine/]) expect(screen.queryByRole("button", { name })).toBeNull();
  });

  it("downloads one skill or the whole pack", async () => {
    await mount();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Download skill" }));
    });
    expect(mocks.downloadZip).toHaveBeenCalledWith("/api/v1/prompt-bot/skill-packs/p1/items/i1/download");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Download pack" }));
    });
    expect(mocks.downloadZip).toHaveBeenCalledWith("/api/v1/prompt-bot/skill-packs/p1/download");
  });

  it("says when nothing in the pack was written", async () => {
    render(createElement(LegacyPackView, { pack: { ...PACK, items: [PACK.items[1]] } }));
    await act(async () => {});
    expect(screen.getByText("No skills in this pack were written, so there is nothing to show or download.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Download pack" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run "src/app/(app)/prompt-bot/skills/skills-page.test.ts" "src/app/(app)/prompt-bot/skills/new-job-form.test.ts" "src/app/(app)/prompt-bot/skills/legacy"`
Expected: FAIL: the home page has no job form or job list ("Unable to find a label with the text of: Describe the job as you do it today"), and "Failed to resolve import "./new-job-form"" / "./page" / "./legacy-pack-view".

- [ ] **Step 3: Invoke the `impeccable` skill**

Invoke the `impeccable` skill with the Skill tool for the home and legacy screens and apply it on top of the LMS design system: one centred column (`max-w-3xl`), the New job card as the primary surface, the job list as a calm secondary card, the legacy section visually quieter (collapsed `<details>`), and a single primary action per card.

- [ ] **Step 4: Write the new job form**

```tsx
// apps/web/src/app/(app)/prompt-bot/skills/new-job-form.tsx
"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useLocalDraft } from "@/components/prompt-bot/use-local-draft";
import { createJob } from "@/lib/skills/jobs/client";
import { JOB_LIMITS } from "@/lib/skills/limits";

const PLACEHOLDER = [
  "e.g. Every month I turn the finance export and my notes into the board deck:",
  "1. pull the numbers from the Excel export",
  "2. update the KPI slides in our template",
  "3. write a one-page summary for the board",
  "It goes to five board members, who want numbers first and no surprises.",
].join("\n");

/** `draftKey` names the browser storage slots that keep unsubmitted text; include the user's id. */
export function NewJobForm({ draftKey }: { draftKey: string }) {
  const router = useRouter();
  const [title, setTitle, clearTitle] = useLocalDraft(`${draftKey}:title`);
  const [description, setDescription, clearDescription] = useLocalDraft(`${draftKey}:description`);
  const [busy, setBusy] = React.useState(false);
  const ready = description.trim().length > 0 && !busy;

  async function submit(event: React.FormEvent | React.KeyboardEvent) {
    event.preventDefault();
    if (!ready) return;
    setBusy(true);
    const result = await createJob({ ...(title.trim() ? { title: title.trim() } : {}), description });
    if (result.ok) {
      clearTitle();
      clearDescription();
      router.push(`/prompt-bot/skills/${result.data.id}`);
      return;
    }
    toast.error(result.message);
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="glass rounded-[1.75rem] p-5 sm:p-6" aria-labelledby="new-job-heading">
      <h2 id="new-job-heading" className="text-lg font-semibold">New job</h2>
      <p className="mt-1 text-sm text-muted-foreground">One recurring piece of work. You&apos;ll add files and answer a few questions next.</p>
      <label htmlFor="new-job-title" className="mt-5 block text-sm font-medium">
        Job title <span className="font-normal text-muted-foreground">(optional)</span>
      </label>
      <Input
        id="new-job-title"
        value={title}
        maxLength={JOB_LIMITS.titleChars}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="e.g. Monthly board update"
        className="mt-2 bg-white/60 dark:bg-white/5"
      />
      <label htmlFor="new-job-description" className="mt-4 block text-sm font-medium">
        Describe the job as you do it today
      </label>
      <Textarea
        id="new-job-description"
        value={description}
        maxLength={JOB_LIMITS.descriptionChars}
        onChange={(e) => setDescription(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit(e);
        }}
        placeholder={PLACEHOLDER}
        className="mt-2 min-h-40 resize-y bg-white/60 dark:bg-white/5"
      />
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">Steps, inputs, outputs and who it&apos;s for. Ctrl+Enter starts.</span>
        <Button type="submit" size="lg" disabled={!ready}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ArrowRight className="size-4" aria-hidden />}
          {busy ? "Starting…" : "Start job"}
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 5: Write the home page**

Replace the whole of `apps/web/src/app/(app)/prompt-bot/skills/page.tsx` with:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { Archive, Clock3 } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { isAiConfigured } from "@/lib/ai/config";
import { prisma } from "@/lib/db/prisma";
import { Badge } from "@/components/ui/badge";
import { NotConfigured } from "@/components/prompt-bot/not-configured";
import { NewJobForm } from "./new-job-form";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const ROW =
  "flex min-h-11 items-center justify-between gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-white/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 dark:hover:bg-white/5";

export default async function SkillsBuilderPage() {
  const user = await getCurrentUser();
  if (!user) return redirect("/login");
  const [jobs, packs] = await Promise.all([
    prisma.skillJob.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: { id: true, title: true, updatedAt: true, _count: { select: { skills: true, files: { where: { deletedAt: null } } } } },
    }),
    prisma.skillPack.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: { id: true, title: true, updatedAt: true },
    }),
  ]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Skills Builder</h1>
        <p className="mt-2 text-muted-foreground">
          Turn a job you do every week into your own Agent Skills, built from your own files and templates.
        </p>
      </header>

      {isAiConfigured() ? <NewJobForm draftKey={`skills-builder:job-draft:${user.id}`} /> : <NotConfigured isAdmin={user.role === "ADMIN"} />}

      {jobs.length > 0 && (
        <section className="glass rounded-[1.75rem] p-5" aria-labelledby="your-jobs">
          <h2 id="your-jobs" className="text-sm font-medium text-muted-foreground">Your jobs</h2>
          <ul className="mt-3 divide-y divide-border/60">
            {jobs.map((job) => (
              <li key={job.id}>
                <Link href={`/prompt-bot/skills/${job.id}`} className={ROW}>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{job.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      {plural(job._count.skills, "skill")} · {plural(job._count.files, "file")}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                    <Clock3 className="size-3.5" aria-hidden />
                    {job.updatedAt.toLocaleDateString()}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {packs.length > 0 && (
        <details className="group rounded-[1.75rem] bg-white/35 p-5 dark:bg-white/5">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl text-sm font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 [&::-webkit-details-marker]:hidden">
            <Archive className="size-4" aria-hidden />
            Earlier skill packs
            <Badge variant="outline" className="ml-1">Read-only</Badge>
          </summary>
          <ul className="mt-3 divide-y divide-border/60">
            {packs.map((pack) => (
              <li key={pack.id}>
                <Link href={`/prompt-bot/skills/legacy/${pack.id}`} className={ROW}>
                  <span className="min-w-0 truncate">{pack.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{pack.updatedAt.toLocaleDateString()}</span>
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="text-center text-xs text-muted-foreground">
        Your job, files and answers are stored in the LMS and sent to Anthropic&apos;s API to build your skills.
      </p>
    </div>
  );
}
```

- [ ] **Step 6: Write the legacy page and view**

```tsx
// apps/web/src/app/(app)/prompt-bot/skills/legacy/[packId]/page.tsx
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { loadPackView } from "@/lib/skills/packs";
import { LegacyPackView } from "./legacy-pack-view";

/** A pack from the earlier Skills Builder: viewable and downloadable, never changed. Needs no AI. */
export default async function LegacyPackPage({ params }: { params: Promise<{ packId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return redirect("/login");
  const { packId } = await params;
  const pack = await loadPackView(packId, user.id);
  if (!pack) notFound();
  return <LegacyPackView pack={pack} />;
}
```

```tsx
// apps/web/src/app/(app)/prompt-bot/skills/legacy/[packId]/legacy-pack-view.tsx
"use client";
import * as React from "react";
import Link from "next/link";
import { Download, Info, Loader2, PackageOpen } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SkillFilesView } from "@/components/prompt-bot/skills/skill-files-view";
import { downloadZip, getItem } from "@/lib/skills/client";
import type { SkillFile, SkillPackView } from "@/lib/skills/types";
import { cn } from "@/lib/utils";

const packUrl = (packId: string) => `/api/v1/prompt-bot/skill-packs/${packId}`;

export function LegacyPackView({ pack }: { pack: SkillPackView }) {
  const skills = pack.items.filter((i) => i.kind === "CUSTOM" && i.status === "READY" && (i.files?.length ?? 0) > 0);
  const [selectedId, setSelectedId] = React.useState<string | null>(skills[0]?.id ?? null);
  const [contents, setContents] = React.useState<Record<string, SkillFile[]>>({});
  const [failed, setFailed] = React.useState<string | null>(null);
  const selected = skills.find((s) => s.id === selectedId) ?? null;

  React.useEffect(() => {
    if (!selectedId || contents[selectedId]) return;
    let cancelled = false;
    void getItem(pack.id, selectedId).then((result) => {
      if (cancelled) return;
      if (result.ok && result.data.files) {
        const files = result.data.files;
        setContents((prev) => ({ ...prev, [selectedId]: files }));
      } else setFailed(selectedId);
    });
    return () => {
      cancelled = true;
    };
  }, [pack.id, selectedId, contents]);

  async function download(url: string) {
    const result = await downloadZip(url);
    if (!result.ok) toast.error(result.message);
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <header className="min-w-0">
        <h1 className="truncate text-2xl font-semibold tracking-tight">{pack.title}</h1>
        <p className="mt-1 line-clamp-3 max-w-3xl text-sm text-muted-foreground">{pack.description}</p>
      </header>

      <p role="note" className="flex items-start gap-2 rounded-2xl bg-primary/5 px-4 py-3 text-sm">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <span>
          This pack was made with the earlier Skills Builder. It can&apos;t be changed.{" "}
          <Link href="/prompt-bot/skills" className="font-medium text-primary underline-offset-4 hover:underline">
            Start a new job
          </Link>{" "}
          to build skills from your files.
        </span>
      </p>

      {skills.length === 0 ? (
        <p className="glass rounded-[1.75rem] p-8 text-center text-sm text-muted-foreground">
          No skills in this pack were written, so there is nothing to show or download.
        </p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <nav aria-label="Skills in this pack" className="glass h-fit rounded-[1.75rem] p-3">
            <ul className="flex flex-col gap-1">
              {skills.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    aria-pressed={s.id === selectedId}
                    onClick={() => setSelectedId(s.id)}
                    className={cn(
                      "flex min-h-11 w-full flex-col items-start rounded-xl px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
                      s.id === selectedId ? "bg-primary/10 text-primary" : "hover:bg-white/60 dark:hover:bg-white/10",
                    )}
                  >
                    <span className="font-mono text-sm">{s.name}</span>
                    <span className="line-clamp-2 text-xs text-muted-foreground">{s.purpose}</span>
                  </button>
                </li>
              ))}
            </ul>
            <Button className="mt-3 w-full" size="lg" onClick={() => void download(`${packUrl(pack.id)}/download`)}>
              <PackageOpen className="size-4" aria-hidden />
              Download pack
            </Button>
          </nav>

          {selected && (
            <section className="glass min-w-0 rounded-[1.75rem] p-5" aria-labelledby="legacy-skill-heading">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 id="legacy-skill-heading" className="truncate font-mono text-lg font-semibold">{selected.name}</h2>
                  <p className="text-sm text-muted-foreground">{selected.purpose}</p>
                </div>
                <Button variant="outline" size="lg" onClick={() => void download(`${packUrl(pack.id)}/items/${selected.id}/download`)}>
                  <Download className="size-4" aria-hidden />
                  Download skill
                </Button>
              </div>
              <div className="mt-5">
                {contents[selected.id] ? (
                  <SkillFilesView files={contents[selected.id]} />
                ) : failed === selected.id ? (
                  <p role="alert" className="py-6 text-center text-sm">We couldn&apos;t load the files. Check your connection and reload the page.</p>
                ) : (
                  <p role="status" className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Loading the files…
                  </p>
                )}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Run the tests and watch them pass**

Run: `npx vitest run "src/app/(app)/prompt-bot/skills/skills-page.test.ts" "src/app/(app)/prompt-bot/skills/new-job-form.test.ts" "src/app/(app)/prompt-bot/skills/legacy" src/components/prompt-bot/prompt-bot-tabs.test.ts`
Expected: PASS. The tabs test (updated in Task 15) still marks `/prompt-bot/skills` and `/prompt-bot/skills/j1` as Skills Builder and no longer lists `/prompt-bot/catalog`; if it does, stop and fix Task 15 first.

- [ ] **Step 8: Accessibility check**

Invoke the `fixing-accessibility` skill with the Skill tool for `page.tsx`, `new-job-form.tsx` and `legacy-pack-view.tsx`: labelled fields, a heading for each card, the disabled Start button still discoverable, `<summary>` reachable by keyboard with a visible focus ring, pressed state on the legacy skill picker, link text that makes sense out of context. Fix what it reports and re-run Step 7.

- [ ] **Step 9: Typecheck and commit**

```bash
npx tsc --noEmit
git add "src/app/(app)/prompt-bot/skills/page.tsx" "src/app/(app)/prompt-bot/skills/skills-page.test.ts" "src/app/(app)/prompt-bot/skills/new-job-form.tsx" "src/app/(app)/prompt-bot/skills/new-job-form.test.ts" "src/app/(app)/prompt-bot/skills/legacy"
git commit -m "feat(skills-builder): add the jobs home page and the read-only legacy pack page"
```

---
### Task 18: Job workspace shell (page, steps, polling, describe)

**Files:**
- Create: `apps/web/src/app/(app)/prompt-bot/skills/[jobId]/page.tsx`
- Create: `apps/web/src/app/(app)/prompt-bot/skills/[jobId]/job-steps.ts`
- Create: `apps/web/src/app/(app)/prompt-bot/skills/[jobId]/describe-panel.tsx`
- Create: `apps/web/src/app/(app)/prompt-bot/skills/[jobId]/job-workspace.tsx`
- Create (temporary stubs, replaced in Tasks 19–21): `apps/web/src/app/(app)/prompt-bot/skills/[jobId]/files-panel.tsx`, `questions-panel.tsx`, `skills-panel.tsx`
- Test: `apps/web/src/app/(app)/prompt-bot/skills/[jobId]/job-steps.test.ts`, `job-page.test.ts`, `describe-panel.test.ts`, `job-workspace.test.ts`

**Interfaces:**
- Consumes: `loadJobView(jobId, userId): Promise<JobView | null>` from `@/lib/skills/jobs/jobs` (Task 9); `prisma.skillPack.findFirst`; `getJob`, `patchJob`, `deleteJob`, `saveJobAnswer`, `scoreJob`, `jobDownloadUrl` (Task 16); `downloadZip` from `@/lib/skills/client`; `useMatrixAnswers`, `SAVE_DELAY_MS` (600), `SCORE_DELAY_MS` (1500) from `@/components/prompt-bot/use-matrix-answers`; `readiness`, `unansweredQuestionIds` from `@/lib/prompt-bot/scoring`; `JOB_LIMITS` from `@/lib/skills/limits`; `JobView`, `JobFileView`, `JobSkillView` (Task 8).
- Produces (contract):
  - `job-steps.ts`: `JobStep`, `JOB_STEPS`, `stepFromHash(hash)`, `nextPollDelay(previous)`, `POLL_FIRST_MS = 3000`, `POLL_CAP_MS = 11 * 60_000`, `unansweredCount(questions, answerFor)`; plus (additive, used only by the workspace) `POLL_MAX_MS = 15_000`, `pollKey(job: JobView): string`, `mergePolled(local: JobView, fresh: JobView): { job: JobView; analysed: boolean }`.
  - `export function DescribePanel(props: { jobId: string; description: string; onDescriptionChange(value: string): void })`.
  - `export function JobWorkspace(props: { initial: JobView; aiConfigured: boolean; isAdmin: boolean })`.
  - The workspace passes panels exactly the contract props: `FilesPanel({ jobId, files, aiConfigured, onFileChange, onFileRemoved })`, `QuestionsPanel({ matrix, state })`, `SkillsPanel({ job, gaps, aiConfigured, flushSaves, onJobChange, onSkillChange, onSkillRemoved })`.

Ownership decisions in this task (the panels rely on them):
- The workspace owns `useMatrixAnswers`. The description is saved through `state.queueSave("description", …)`, so it is flushed with the answers before Suggest/Generate (`flushSaves`) and on page leave (keepalive).
- `QuestionsPanel` owns `useActiveQuestion` itself (its props are only `matrix` and `state`); panels stay mounted (`hidden`), so the selected question and in-flight uploads survive step changes.
- `onFileChange` upserts a file; when it is `READY` with a new or changed analysis the workspace bumps the scoring revision and schedules a score. `onFileRemoved` removes the file, drops its id from every skill's `fileIds` and rescores.
- `onSkillChange` upserts a skill; `onJobChange` (Suggest's reply) replaces only `skills` and `suggestedAt`, never the description being typed.

- [ ] **Step 1: Write the failing pure-helper test**

```ts
// apps/web/src/app/(app)/prompt-bot/skills/[jobId]/job-steps.test.ts
import { describe, expect, it } from "vitest";
import type { AnswerView } from "@/lib/prompt-bot/sessions";
import type { JobFileView, JobSkillView, JobView } from "@/lib/skills/jobs/types";
import { JOB_STEPS, mergePolled, nextPollDelay, POLL_CAP_MS, POLL_FIRST_MS, pollKey, stepFromHash, unansweredCount } from "./job-steps";

const file = (over: Partial<JobFileView> = {}): JobFileView => ({
  id: "f1", fileName: "deck.pptx", assetName: "deck.pptx", kind: "PPTX", size: 1000, createdAt: "2026-11-25T10:00:00.000Z",
  analysisStatus: "PENDING", analysis: null, analysisEdited: false, analysisError: null, bundlable: true, ...over,
});
const skill = (over: Partial<JobSkillView> = {}): JobSkillView => ({
  id: "s1", order: 0, name: "board-update", purpose: "Writes it.", fileIds: ["f1"], status: "DRAFT", validationErrors: [], latestVersion: 0, versions: [], ...over,
});
const job = (over: Partial<JobView> = {}): JobView => ({
  id: "j1", title: "Board", description: "d", scoreRevision: 0, updatedAt: "2026-11-25T10:00:00.000Z", suggestedAt: null,
  matrix: { id: "m", name: "Skill definition", questions: [] }, answers: [], files: [], skills: [], ...over,
});

describe("steps", () => {
  it("lists the four steps in order", () => {
    expect(JOB_STEPS.map((s) => [s.id, s.label])).toEqual([["job", "Job"], ["files", "Files"], ["questions", "Questions"], ["skills", "Skills"]]);
  });

  it("reads the step from the URL hash, defaulting to job", () => {
    expect(stepFromHash("#files")).toBe("files");
    expect(stepFromHash("skills")).toBe("skills");
    expect(stepFromHash("")).toBe("job");
    expect(stepFromHash("#nope")).toBe("job");
  });
});

describe("polling", () => {
  it("backs off by half each time up to 15 s", () => {
    expect(POLL_FIRST_MS).toBe(3000);
    expect(nextPollDelay(3000)).toBe(4500);
    expect(nextPollDelay(12_000)).toBe(15_000);
    expect(nextPollDelay(15_000)).toBe(15_000);
    expect(POLL_CAP_MS).toBe(660_000);
  });

  it("keys on pending files and generating skills only", () => {
    expect(pollKey(job({ files: [file({ analysisStatus: "READY" })], skills: [skill()] }))).toBe("");
    expect(pollKey(job({ files: [file()], skills: [skill({ status: "GENERATING" })] }))).toBe("f:f1,s:s1");
  });

  it("takes only the polled rows' status fields and reports a finished analysis", () => {
    const local = job({
      description: "typed locally",
      files: [file(), file({ id: "f2", analysisStatus: "READY", analysis: "mine" })],
      skills: [skill({ status: "GENERATING", purpose: "typed purpose" })],
    });
    const fresh = job({
      description: "server",
      files: [file({ fileName: "SERVER", analysisStatus: "READY", analysis: "## Colours" }), file({ id: "f2", analysisStatus: "READY", analysis: "server copy" })],
      skills: [skill({ status: "READY", purpose: "server purpose", latestVersion: 1, versions: [{ version: 1, name: "board-update", createdAt: "2026-11-25T11:00:00.000Z", assets: 1 }] })],
    });
    const { job: merged, analysed } = mergePolled(local, fresh);
    expect(analysed).toBe(true);
    expect(merged.description).toBe("typed locally");
    expect(merged.files[0]).toEqual({ ...local.files[0], analysisStatus: "READY", analysis: "## Colours" });
    expect(merged.files[1]).toBe(local.files[1]);
    expect(merged.skills[0]).toEqual({ ...local.skills[0], status: "READY", latestVersion: 1, versions: fresh.skills[0].versions });
  });

  it("reports no analysis when a pending file failed", () => {
    const { analysed, job: merged } = mergePolled(job({ files: [file()] }), job({ files: [file({ analysisStatus: "FAILED", analysisError: "We couldn't analyse this file." })] }));
    expect(analysed).toBe(false);
    expect(merged.files[0].analysisStatus).toBe("FAILED");
  });
});

describe("unansweredCount", () => {
  it("counts relevant questions below 3", () => {
    const answers: Record<string, AnswerView> = {
      a: { questionId: "a", answer: "", score: 3, reason: null, notRelevant: false },
      b: { questionId: "b", answer: "", score: 1, reason: null, notRelevant: false },
      c: { questionId: "c", answer: "", score: 0, reason: null, notRelevant: true },
    };
    expect(unansweredCount([{ id: "a" }, { id: "b" }, { id: "c" }], (id) => answers[id])).toBe(1);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run "src/app/(app)/prompt-bot/skills/[jobId]/job-steps.test.ts"`
Expected: FAIL, "Failed to resolve import "./job-steps"".

- [ ] **Step 3: Write the helpers**

```ts
// apps/web/src/app/(app)/prompt-bot/skills/[jobId]/job-steps.ts
import { unansweredQuestionIds } from "@/lib/prompt-bot/scoring";
import type { AnswerView } from "@/lib/prompt-bot/sessions";
import type { JobView } from "@/lib/skills/jobs/types";

export type JobStep = "job" | "files" | "questions" | "skills";
export const JOB_STEPS: { id: JobStep; label: string }[] = [
  { id: "job", label: "Job" },
  { id: "files", label: "Files" },
  { id: "questions", label: "Questions" },
  { id: "skills", label: "Skills" },
];

export function stepFromHash(hash: string): JobStep {
  const id = hash.replace(/^#/, "");
  return JOB_STEPS.some((s) => s.id === id) ? (id as JobStep) : "job";
}

export const POLL_FIRST_MS = 3000;
export const POLL_MAX_MS = 15_000;
/** A minute past the generation stale window: by then the server reports unfinished work as interrupted. */
export const POLL_CAP_MS = 11 * 60_000;

export function nextPollDelay(previous: number): number {
  return Math.min(Math.round(previous * 1.5), POLL_MAX_MS);
}

export function unansweredCount(questions: { id: string }[], answerFor: (id: string) => AnswerView): number {
  return unansweredQuestionIds(questions.map((q) => answerFor(q.id))).length;
}

/** What the page polls for: files being analysed and skills being written. Empty means nothing to wait for. */
export function pollKey(job: JobView): string {
  return [
    ...job.files.filter((f) => f.analysisStatus === "PENDING").map((f) => `f:${f.id}`),
    ...job.skills.filter((s) => s.status === "GENERATING").map((s) => `s:${s.id}`),
  ].join(",");
}

/**
 * Applies a poll: only rows that were waiting and have finished change, and only their status fields,
 * so text the user is typing (description, purposes, names) is never overwritten by the server copy.
 */
export function mergePolled(local: JobView, fresh: JobView): { job: JobView; analysed: boolean } {
  const freshFiles = new Map(fresh.files.map((f) => [f.id, f]));
  let analysed = false;
  const files = local.files.map((f) => {
    const next = freshFiles.get(f.id);
    if (f.analysisStatus !== "PENDING" || !next || next.analysisStatus === "PENDING") return f;
    if (next.analysisStatus === "READY") analysed = true;
    return { ...f, analysisStatus: next.analysisStatus, analysis: next.analysis, analysisEdited: next.analysisEdited, analysisError: next.analysisError };
  });
  const freshSkills = new Map(fresh.skills.map((s) => [s.id, s]));
  const skills = local.skills.map((s) => {
    const next = freshSkills.get(s.id);
    if (s.status !== "GENERATING" || !next || next.status === "GENERATING") return s;
    return { ...s, status: next.status, validationErrors: next.validationErrors, latestVersion: next.latestVersion, versions: next.versions };
  });
  return { job: { ...local, files, skills }, analysed };
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run "src/app/(app)/prompt-bot/skills/[jobId]/job-steps.test.ts"`
Expected: PASS.

- [ ] **Step 5: Write the failing page, describe-panel and workspace tests**

```ts
// apps/web/src/app/(app)/prompt-bot/skills/[jobId]/job-page.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  isAiConfigured: vi.fn(),
  loadJobView: vi.fn(),
  packFindFirst: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/ai/config", () => ({ isAiConfigured: mocks.isAiConfigured }));
vi.mock("@/lib/skills/jobs/jobs", () => ({ loadJobView: mocks.loadJobView }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { skillPack: { findFirst: mocks.packFindFirst } } }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, notFound: mocks.notFound }));
vi.mock("./job-workspace", () => ({ JobWorkspace: () => null }));

import JobPage from "./page";
import { JobWorkspace } from "./job-workspace";

const params = (jobId: string) => ({ params: Promise.resolve({ jobId }) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "u1", role: "ADMIN" });
  mocks.isAiConfigured.mockReturnValue(true);
});

describe("job page", () => {
  it("sends signed-out visitors to the login page", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    await expect(JobPage(params("j1"))).rejects.toThrow("NEXT_REDIRECT /login");
  });

  it("renders the workspace for the owner's job", async () => {
    const view = { id: "j1" };
    mocks.loadJobView.mockResolvedValue(view);
    const element = await JobPage(params("j1"));
    expect(mocks.loadJobView).toHaveBeenCalledWith("j1", "u1");
    expect(element.type).toBe(JobWorkspace);
    expect(element.props).toEqual({ initial: view, aiConfigured: true, isAdmin: true });
  });

  it("redirects an old pack link to the legacy page", async () => {
    mocks.loadJobView.mockResolvedValue(null);
    mocks.packFindFirst.mockResolvedValue({ id: "p1" });
    await expect(JobPage(params("p1"))).rejects.toThrow("NEXT_REDIRECT /prompt-bot/skills/legacy/p1");
    expect(mocks.packFindFirst).toHaveBeenCalledWith({ where: { id: "p1", userId: "u1" }, select: { id: true } });
  });

  it("is 404 when neither a job nor a pack of the user's has that id", async () => {
    mocks.loadJobView.mockResolvedValue(null);
    mocks.packFindFirst.mockResolvedValue(null);
    await expect(JobPage(params("x"))).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
```

```ts
// apps/web/src/app/(app)/prompt-bot/skills/[jobId]/describe-panel.test.ts
/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DescribePanel } from "./describe-panel";

afterEach(cleanup);

describe("DescribePanel", () => {
  it("edits the description, counts characters and shows what to include", () => {
    const onDescriptionChange = vi.fn();
    render(createElement(DescribePanel, { jobId: "j1", description: "Every month", onDescriptionChange }));
    const box = screen.getByLabelText("Describe the job as you do it today") as HTMLTextAreaElement;
    expect(box.value).toBe("Every month");
    expect(box.maxLength).toBe(20_000);
    expect(screen.getByText("11 / 20,000")).toBeTruthy();
    fireEvent.change(box, { target: { value: "Every month I write the board update" } });
    expect(onDescriptionChange).toHaveBeenCalledWith("Every month I write the board update");
    expect(screen.getByText(/the steps you take, what you start from, what you hand over, who reads it, how you know it's good/)).toBeTruthy();
  });
});
```

```ts
// apps/web/src/app/(app)/prompt-bot/skills/[jobId]/job-workspace.test.ts
/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JobFileView, JobSkillView, JobView } from "@/lib/skills/jobs/types";

const mocks = vi.hoisted(() => ({
  getJob: vi.fn(),
  patchJob: vi.fn(),
  deleteJob: vi.fn(),
  saveJobAnswer: vi.fn(),
  scoreJob: vi.fn(),
  downloadZip: vi.fn(),
  push: vi.fn(),
  panels: {} as Record<string, Record<string, unknown>>,
}));
vi.mock("@/lib/skills/jobs/client", () => ({
  getJob: mocks.getJob,
  patchJob: mocks.patchJob,
  deleteJob: mocks.deleteJob,
  saveJobAnswer: mocks.saveJobAnswer,
  scoreJob: mocks.scoreJob,
  jobDownloadUrl: (id: string) => `/dl/${id}`,
}));
vi.mock("@/lib/skills/client", () => ({ downloadZip: mocks.downloadZip }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("./describe-panel", async () => {
  const { createElement: h } = await import("react");
  return {
    DescribePanel: (props: Record<string, unknown>) => {
      mocks.panels.describe = props;
      return h("p", null, `description:${props.description as string}`);
    },
  };
});
vi.mock("./files-panel", async () => {
  const { createElement: h } = await import("react");
  return {
    FilesPanel: (props: { files: JobFileView[] } & Record<string, unknown>) => {
      mocks.panels.files = props;
      return h("ul", null, props.files.map((f) => h("li", { key: f.id }, `${f.fileName}:${f.analysisStatus}`)));
    },
  };
});
vi.mock("./questions-panel", () => ({
  QuestionsPanel: (props: Record<string, unknown>) => {
    mocks.panels.questions = props;
    return null;
  },
}));
vi.mock("./skills-panel", async () => {
  const { createElement: h } = await import("react");
  return {
    SkillsPanel: (props: { job: JobView; gaps: number } & Record<string, unknown>) => {
      mocks.panels.skills = props;
      return h("p", null, `skills:${props.job.skills.map((s) => `${s.name}=${s.status}`).join("|")} gaps:${props.gaps}`);
    },
  };
});

import { JobWorkspace } from "./job-workspace";

const file = (over: Partial<JobFileView> = {}): JobFileView => ({
  id: "f1", fileName: "deck.pptx", assetName: "deck.pptx", kind: "PPTX", size: 1000, createdAt: "2026-11-25T10:00:00.000Z",
  analysisStatus: "READY", analysis: "## Colours", analysisEdited: false, analysisError: null, bundlable: true, ...over,
});
const skill = (over: Partial<JobSkillView> = {}): JobSkillView => ({
  id: "s1", order: 0, name: "board-update", purpose: "Writes it.", fileIds: ["f1"], status: "DRAFT", validationErrors: [], latestVersion: 0, versions: [], ...over,
});
const JOB: JobView = {
  id: "j1",
  title: "Monthly board update",
  description: "Every month I write the board update.",
  scoreRevision: 2,
  updatedAt: "2026-11-25T10:00:00.000Z",
  suggestedAt: null,
  matrix: {
    id: "m",
    name: "Skill definition",
    questions: [
      { id: "q1", text: "When should this skill be used?", guidance: "Triggers", order: 0 },
      { id: "q2", text: "What context does it need to know?", guidance: "Background", order: 1 },
    ],
  },
  answers: [
    { questionId: "q1", answer: "Monthly", score: 3, reason: "Clear", notRelevant: false },
    { questionId: "q2", answer: "", score: 1, reason: "Vague", notRelevant: false },
  ],
  files: [file()],
  skills: [skill()],
};
const ok = <T,>(data: T) => ({ ok: true as const, data });
const settle = (ms = 0) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
const mount = async (initial: JobView = JOB, aiConfigured = true) => {
  render(createElement(JobWorkspace, { initial, aiConfigured, isAdmin: false }));
  await settle();
};
const steps = () => within(screen.getByRole("navigation", { name: "Steps" }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/prompt-bot/skills/j1");
  mocks.patchJob.mockResolvedValue(ok(JOB));
  mocks.saveJobAnswer.mockResolvedValue(ok({ saved: true }));
  mocks.scoreJob.mockResolvedValue(ok({ applied: false, revision: 0, answers: [] }));
  mocks.downloadZip.mockResolvedValue({ ok: true });
  vi.stubGlobal("confirm", vi.fn(() => true));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("JobWorkspace steps", () => {
  it("opens the step named in the URL hash and keeps the hash in sync", async () => {
    window.location.hash = "#files";
    await mount();
    expect(steps().getByRole("button", { name: /Files/ }).getAttribute("aria-current")).toBe("step");
    fireEvent.click(steps().getByRole("button", { name: /Skills/ }));
    expect(steps().getByRole("button", { name: /Skills/ }).getAttribute("aria-current")).toBe("step");
    expect(window.location.hash).toBe("#skills");
  });

  it("shows counts on the steps and the number of unanswered questions to the skills panel", async () => {
    await mount();
    expect(steps().getByRole("button", { name: /Files/ }).textContent).toContain("1");
    expect(steps().getByRole("button", { name: /Questions/ }).textContent).toContain("1 of 2");
    expect(screen.getByText(/gaps:1/)).toBeTruthy();
  });

  it("never asks with window.confirm", async () => {
    await mount();
    expect(window.confirm).not.toHaveBeenCalled();
  });
});

describe("JobWorkspace polling", () => {
  it("polls while a file is analysed, merges only its status, rescores, then stops", async () => {
    const waiting = { ...JOB, files: [file({ analysisStatus: "PENDING", analysis: null })] };
    mocks.getJob.mockResolvedValue(ok({ ...JOB, description: "server copy", files: [file({ fileName: "SERVER", analysisStatus: "READY", analysis: "## Fonts" })] }));
    await mount(waiting);
    expect(screen.getByText("deck.pptx:PENDING")).toBeTruthy();
    await settle(3000);
    expect(mocks.getJob).toHaveBeenCalledWith("j1");
    expect(screen.getByText("deck.pptx:READY")).toBeTruthy();
    expect(screen.getByText("description:Every month I write the board update.")).toBeTruthy();
    await settle(1500);
    expect(mocks.scoreJob).toHaveBeenCalledWith("j1", 3);
    await settle(60_000);
    expect(mocks.getJob).toHaveBeenCalledTimes(1);
  });

  it("polls while a skill is written and shows the result", async () => {
    mocks.getJob.mockResolvedValue(ok({ ...JOB, skills: [skill({ status: "READY", latestVersion: 1 })] }));
    await mount({ ...JOB, skills: [skill({ status: "GENERATING" })] });
    expect(screen.getByText(/board-update=GENERATING/)).toBeTruthy();
    await settle(3000);
    expect(screen.getByText(/board-update=READY/)).toBeTruthy();
  });

  it("says it is still working once the cap passes", async () => {
    mocks.getJob.mockResolvedValue(ok({ ...JOB, skills: [skill({ status: "GENERATING" })] }));
    await mount({ ...JOB, skills: [skill({ status: "GENERATING" })] });
    await settle(12 * 60_000);
    expect(screen.getByRole("status").textContent).toMatch(/Still working/);
  });
});

describe("JobWorkspace description", () => {
  it("saves the description after the save delay, then rescores", async () => {
    await mount();
    await act(async () => {
      (mocks.panels.describe.onDescriptionChange as (v: string) => void)("Weekly board update");
    });
    expect(screen.getByText("description:Weekly board update")).toBeTruthy();
    expect(mocks.patchJob).not.toHaveBeenCalled();
    await settle(600);
    expect(mocks.patchJob).toHaveBeenCalledWith("j1", { description: "Weekly board update" }, expect.anything());
    await settle(1500);
    expect(mocks.scoreJob).toHaveBeenCalledWith("j1", 3);
  });

  it("rescores when a file's analysis becomes ready or is edited, and drops a removed file from skills", async () => {
    await mount();
    await act(async () => {
      (mocks.panels.files.onFileChange as (f: JobFileView) => void)(file({ id: "f2", fileName: "brief.docx", analysis: "## Tone" }));
    });
    expect(screen.getByText("brief.docx:READY")).toBeTruthy();
    await settle(1500);
    expect(mocks.scoreJob).toHaveBeenCalledTimes(1);
    await act(async () => {
      (mocks.panels.files.onFileRemoved as (id: string) => void)("f1");
    });
    expect(screen.queryByText("deck.pptx:READY")).toBeNull();
    expect((mocks.panels.skills.job as JobView).skills[0].fileIds).toEqual([]);
    await settle(1500);
    expect(mocks.scoreJob).toHaveBeenCalledTimes(2);
  });

  it("takes only skills from a suggestion reply", async () => {
    await mount();
    await act(async () => {
      (mocks.panels.skills.onJobChange as (j: JobView) => void)({ ...JOB, description: "server", skills: [skill({ id: "s9", name: "weekly-report" })] });
    });
    expect(screen.getByText(/skills:weekly-report=DRAFT/)).toBeTruthy();
    expect(screen.getByText("description:Every month I write the board update.")).toBeTruthy();
  });
});

describe("JobWorkspace header", () => {
  it("renames the job", async () => {
    mocks.patchJob.mockResolvedValue(ok({ ...JOB, title: "Board pack" }));
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "Rename job" }));
    const input = screen.getByLabelText("Job title");
    fireEvent.change(input, { target: { value: "Board pack" } });
    await act(async () => {
      fireEvent.submit(input.closest("form")!);
    });
    expect(mocks.patchJob).toHaveBeenCalledWith("j1", { title: "Board pack" });
    expect(screen.getByRole("heading", { level: 1, name: "Board pack" })).toBeTruthy();
  });

  it("downloads all skills only when one has a version", async () => {
    await mount();
    expect((screen.getByRole("button", { name: /Download all skills/ }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    await mount({ ...JOB, skills: [skill({ status: "READY", latestVersion: 1 })] });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Download all skills/ }));
    });
    expect(mocks.downloadZip).toHaveBeenCalledWith("/dl/j1");
  });

  it("deletes the job only after a destructive confirm", async () => {
    mocks.deleteJob.mockResolvedValue(ok({ deleted: true }));
    await mount();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Delete job" }));
    });
    const dialog = screen.getByRole("alertdialog");
    expect(dialog.textContent).toContain("It can't be undone");
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    });
    expect(mocks.deleteJob).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Delete job" }));
    });
    await act(async () => {
      fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete job" }));
    });
    expect(mocks.deleteJob).toHaveBeenCalledWith("j1");
    expect(mocks.push).toHaveBeenCalledWith("/prompt-bot/skills");
  });

  it("shows the not-configured notice without the AI key", async () => {
    await mount(JOB, false);
    expect(screen.getByText("Prompt Bot isn't configured yet")).toBeTruthy();
  });
});
```

- [ ] **Step 6: Run them and watch them fail**

Run: `npx vitest run "src/app/(app)/prompt-bot/skills/[jobId]"`
Expected: FAIL, "Failed to resolve import "./page"", "./describe-panel" and "./job-workspace" (job-steps passes).

- [ ] **Step 7: Invoke the `impeccable` skill**

Invoke the `impeccable` skill with the Skill tool for the workspace shell and apply it on top of the LMS design system: the title as the page's one `h1`, the step navigation as a quiet segmented row that wraps on phones (numbered, current step in `bg-primary text-primary-foreground` as in the old pack view), badges in tabular numerals, one primary header action (Download all skills), the destructive action visually secondary.

- [ ] **Step 8: Write the server page**

```tsx
// apps/web/src/app/(app)/prompt-bot/skills/[jobId]/page.tsx
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAiConfigured } from "@/lib/ai/config";
import { prisma } from "@/lib/db/prisma";
import { loadJobView } from "@/lib/skills/jobs/jobs";
import { JobWorkspace } from "./job-workspace";

export default async function JobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return redirect("/login");
  const { jobId } = await params;
  const view = await loadJobView(jobId, user.id);
  if (!view) {
    // Links to packs from the earlier Skills Builder used this URL; keep them working.
    const pack = await prisma.skillPack.findFirst({ where: { id: jobId, userId: user.id }, select: { id: true } });
    if (pack) return redirect(`/prompt-bot/skills/legacy/${pack.id}`);
    notFound();
  }
  // Viewing, editing text and downloads need no AI; the workspace disables the AI actions without it.
  return <JobWorkspace initial={view} aiConfigured={isAiConfigured()} isAdmin={user.role === "ADMIN"} />;
}
```

- [ ] **Step 9: Write the describe panel**

```tsx
// apps/web/src/app/(app)/prompt-bot/skills/[jobId]/describe-panel.tsx
"use client";
import { Lightbulb } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { JOB_LIMITS } from "@/lib/skills/limits";

const PLACEHOLDER = "What you do, step by step, what you start from (files, data, notes), what you hand over, and who it's for.";

/** Step 1. The workspace owns saving (debounced, flushed before Suggest and Generate, sent on page leave). */
export function DescribePanel({ jobId, description, onDescriptionChange }: { jobId: string; description: string; onDescriptionChange(value: string): void }) {
  const id = `job-description-${jobId}`;
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <section className="glass rounded-[1.75rem] p-5">
        <label htmlFor={id} className="text-sm font-medium">
          Describe the job as you do it today
        </label>
        <Textarea
          id={id}
          value={description}
          maxLength={JOB_LIMITS.descriptionChars}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder={PLACEHOLDER}
          aria-describedby={`${id}-count`}
          className="mt-2 min-h-64 resize-y bg-white/60 dark:bg-white/5"
        />
        <p id={`${id}-count`} className="mt-2 text-right text-xs tabular-nums text-muted-foreground">
          {description.length.toLocaleString("en-US")} / {JOB_LIMITS.descriptionChars.toLocaleString("en-US")}
        </p>
      </section>
      <aside className="glass h-fit rounded-[1.75rem] p-5 text-sm" aria-labelledby={`${id}-hint`}>
        <h2 id={`${id}-hint`} className="flex items-center gap-2 font-semibold">
          <Lightbulb className="size-4 text-primary" aria-hidden />
          What to include
        </h2>
        <p className="mt-2 text-muted-foreground">
          Include: the steps you take, what you start from, what you hand over, who reads it, how you know it&apos;s good.
        </p>
      </aside>
    </div>
  );
}
```

- [ ] **Step 10: Write temporary panel stubs so the workspace compiles**

Tasks 19–21 replace each of these files completely. They exist only so this task builds and type-checks; their props are the final contract props.

```tsx
// apps/web/src/app/(app)/prompt-bot/skills/[jobId]/files-panel.tsx
"use client";
import type { JobFileView } from "@/lib/skills/jobs/types";

/** Replaced in Task 19. */
export function FilesPanel(props: { jobId: string; files: JobFileView[]; aiConfigured: boolean; onFileChange(file: JobFileView): void; onFileRemoved(fileId: string): void }) {
  return <p className="text-sm text-muted-foreground">{props.files.length} files</p>;
}
```

```tsx
// apps/web/src/app/(app)/prompt-bot/skills/[jobId]/questions-panel.tsx
"use client";
import type { useMatrixAnswers } from "@/components/prompt-bot/use-matrix-answers";
import type { SkillMatrixView } from "@/lib/skills/types";

/** Replaced in Task 20. */
export function QuestionsPanel(props: { matrix: SkillMatrixView; state: ReturnType<typeof useMatrixAnswers> }) {
  return <p className="text-sm text-muted-foreground">{props.matrix.questions.length} questions</p>;
}
```

```tsx
// apps/web/src/app/(app)/prompt-bot/skills/[jobId]/skills-panel.tsx
"use client";
import type { JobSkillView, JobView } from "@/lib/skills/jobs/types";

/** Replaced in Task 21. */
export function SkillsPanel(props: {
  job: JobView;
  gaps: number;
  aiConfigured: boolean;
  flushSaves(): Promise<void>;
  onJobChange(job: JobView): void;
  onSkillChange(skill: JobSkillView): void;
  onSkillRemoved(skillId: string): void;
}) {
  return <p className="text-sm text-muted-foreground">{props.job.skills.length} skills</p>;
}
```

- [ ] **Step 11: Write the workspace**

```tsx
// apps/web/src/app/(app)/prompt-bot/skills/[jobId]/job-workspace.tsx
"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Download, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, type ConfirmDialogHandle } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { NotConfigured } from "@/components/prompt-bot/not-configured";
import { useMatrixAnswers } from "@/components/prompt-bot/use-matrix-answers";
import type { CallResult, ScoreReply } from "@/lib/prompt-bot/client";
import { readiness } from "@/lib/prompt-bot/scoring";
import { downloadZip } from "@/lib/skills/client";
import { deleteJob, getJob, jobDownloadUrl, patchJob, saveJobAnswer, scoreJob } from "@/lib/skills/jobs/client";
import type { JobFileView, JobSkillView, JobView } from "@/lib/skills/jobs/types";
import { JOB_LIMITS } from "@/lib/skills/limits";
import { cn } from "@/lib/utils";
import { DescribePanel } from "./describe-panel";
import { FilesPanel } from "./files-panel";
import { JOB_STEPS, mergePolled, nextPollDelay, POLL_CAP_MS, POLL_FIRST_MS, pollKey, stepFromHash, unansweredCount, type JobStep } from "./job-steps";
import { QuestionsPanel } from "./questions-panel";
import { SkillsPanel } from "./skills-panel";

const NOT_CONFIGURED: CallResult<ScoreReply> = { ok: false, code: "AI_NOT_CONFIGURED", message: "Prompt Bot isn't configured yet." };

type Props = { initial: JobView; aiConfigured: boolean; isAdmin: boolean };

export function JobWorkspace({ initial, aiConfigured, isAdmin }: Props) {
  const router = useRouter();
  const [job, setJob] = React.useState(initial);
  const jobRef = React.useRef(job);
  React.useEffect(() => {
    jobRef.current = job;
  });
  const [description, setDescription] = React.useState(initial.description);
  const [title, setTitle] = React.useState(initial.title);
  const [editingTitle, setEditingTitle] = React.useState(false);
  const [step, setStep] = React.useState<JobStep>("job");
  const [stalledFor, setStalledFor] = React.useState("");
  const confirmRef = React.useRef<ConfirmDialogHandle>(null);

  const state = useMatrixAnswers({
    initialAnswers: initial.answers,
    initialRevision: initial.scoreRevision,
    saveAnswer: (questionId, patch, options) => saveJobAnswer(initial.id, questionId, patch, options),
    score: (revision) => (aiConfigured ? scoreJob(initial.id, revision) : Promise.resolve(NOT_CONFIGURED)),
  });
  const { bumpRevision, scheduleScore, queueSave } = state;
  const rescore = React.useCallback(() => {
    bumpRevision();
    scheduleScore();
  }, [bumpRevision, scheduleScore]);

  // A job that was never scored (fresh from the home page) gets its bars once.
  const [neverScored] = React.useState(initial.answers.length === 0 && initial.description.trim() !== "" && aiConfigured);
  React.useEffect(() => {
    if (neverScored) scheduleScore();
  }, [neverScored, scheduleScore]);

  // The step lives in the URL hash, so reload and Back keep it.
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the hash is browser-only state, read after hydration
    setStep(stepFromHash(window.location.hash));
    const read = () => setStep(stepFromHash(window.location.hash));
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  function go(next: JobStep) {
    setStep(next);
    window.history.replaceState(null, "", `#${next}`);
  }

  // Analysis and generation run after their requests return, so the job is polled while either is running.
  const key = pollKey(job);
  const stalled = key !== "" && stalledFor === key;
  React.useEffect(() => {
    if (!key) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let delay = POLL_FIRST_MS;
    let waited = 0;
    const poll = async () => {
      const result = await getJob(initial.id);
      if (cancelled) return;
      if (result.ok) {
        const fresh = result.data;
        const { analysed } = mergePolled(jobRef.current, fresh);
        setJob((current) => mergePolled(current, fresh).job);
        if (analysed) rescore();
      }
      waited += delay;
      if (waited >= POLL_CAP_MS) return setStalledFor(key);
      delay = nextPollDelay(delay);
      timer = setTimeout(poll, delay);
    };
    timer = setTimeout(poll, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key, initial.id, rescore]);

  function updateDescription(value: string) {
    setDescription(value);
    bumpRevision();
    queueSave("description", async (options) => {
      const saved = await patchJob(initial.id, { description: value }, options);
      if (!saved.ok) toast.error(saved.message);
      scheduleScore();
    });
  }

  const onFileChange = React.useCallback(
    (file: JobFileView) => {
      const previous = jobRef.current.files.find((f) => f.id === file.id);
      setJob((j) => ({
        ...j,
        files: j.files.some((f) => f.id === file.id) ? j.files.map((f) => (f.id === file.id ? file : f)) : [...j.files, file],
      }));
      const analysisChanged = file.analysisStatus === "READY" && (previous?.analysisStatus !== "READY" || previous.analysis !== file.analysis);
      if (analysisChanged) rescore();
    },
    [rescore],
  );

  const onFileRemoved = React.useCallback(
    (fileId: string) => {
      setJob((j) => ({
        ...j,
        files: j.files.filter((f) => f.id !== fileId),
        skills: j.skills.map((s) => (s.fileIds.includes(fileId) ? { ...s, fileIds: s.fileIds.filter((id) => id !== fileId) } : s)),
      }));
      rescore();
    },
    [rescore],
  );

  const onSkillChange = React.useCallback((skill: JobSkillView) => {
    setJob((j) => ({
      ...j,
      skills: j.skills.some((s) => s.id === skill.id) ? j.skills.map((s) => (s.id === skill.id ? skill : s)) : [...j.skills, skill],
    }));
  }, []);
  const onSkillRemoved = React.useCallback((skillId: string) => {
    setJob((j) => ({ ...j, skills: j.skills.filter((s) => s.id !== skillId) }));
  }, []);
  const onJobChange = React.useCallback((next: JobView) => {
    setJob((j) => ({ ...j, skills: next.skills, suggestedAt: next.suggestedAt }));
  }, []);

  async function saveTitle(event?: React.FormEvent) {
    event?.preventDefault();
    setEditingTitle(false);
    const value = title.trim();
    if (!value || value === job.title) return setTitle(job.title);
    const result = await patchJob(job.id, { title: value });
    if (!result.ok) {
      toast.error(result.message);
      return setTitle(job.title);
    }
    setJob((j) => ({ ...j, title: result.data.title }));
    setTitle(result.data.title);
  }

  async function remove() {
    const confirmed = await confirmRef.current?.open({
      title: "Delete this job?",
      description: "This deletes its files, answers, skills and every version. It can't be undone.",
      confirmLabel: "Delete job",
      destructive: true,
    });
    if (!confirmed) return;
    const result = await deleteJob(job.id);
    if (!result.ok) return void toast.error(result.message);
    router.push("/prompt-bot/skills");
  }

  async function downloadAll() {
    const result = await downloadZip(jobDownloadUrl(job.id));
    if (!result.ok) toast.error(result.message);
  }

  const answers = job.matrix.questions.map((q) => state.answerFor(q.id));
  const ready = readiness(answers);
  const gaps = unansweredCount(job.matrix.questions, state.answerFor);
  const badges: Record<JobStep, string | null> = {
    job: null,
    files: String(job.files.length),
    questions: `${ready.answered} of ${ready.relevant}`,
    skills: String(job.skills.length),
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      {!aiConfigured && <NotConfigured isAdmin={isAdmin} />}

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {editingTitle ? (
            <form onSubmit={saveTitle} className="max-w-xl">
              <label htmlFor="job-title" className="sr-only">Job title</label>
              <Input
                id="job-title"
                autoFocus
                value={title}
                maxLength={JOB_LIMITS.titleChars}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => void saveTitle()}
                className="text-lg font-semibold"
              />
            </form>
          ) : (
            <div className="flex items-center gap-1">
              <h1 className="truncate text-2xl font-semibold tracking-tight">{job.title}</h1>
              <Button variant="ghost" size="icon" aria-label="Rename job" onClick={() => setEditingTitle(true)}>
                <Pencil className="size-4" aria-hidden />
              </Button>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="lg" disabled={!job.skills.some((s) => s.latestVersion > 0)} onClick={() => void downloadAll()}>
            <Download className="size-4" aria-hidden />
            Download all skills
          </Button>
          <Button variant="ghost" size="icon" aria-label="Delete job" className="size-11 text-muted-foreground hover:text-destructive" onClick={() => void remove()}>
            <Trash2 className="size-4" aria-hidden />
          </Button>
        </div>
      </header>

      <nav aria-label="Steps">
        <ol className="flex flex-wrap gap-2">
          {JOB_STEPS.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => go(s.id)}
                aria-current={step === s.id ? "step" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
                  step === s.id ? "bg-primary text-primary-foreground" : "bg-white/55 text-muted-foreground hover:text-foreground dark:bg-white/5",
                )}
              >
                <span aria-hidden className="flex size-5 items-center justify-center rounded-full bg-black/5 text-xs tabular-nums dark:bg-white/10">
                  {i + 1}
                </span>
                {s.label}
                {badges[s.id] !== null && (
                  <span className={cn("rounded-full px-1.5 text-xs tabular-nums", step === s.id ? "bg-white/20" : "bg-black/5 dark:bg-white/10")}>
                    {badges[s.id]}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      {stalled && (
        <p role="status" className="rounded-xl bg-warning/10 px-3 py-2 text-sm">
          Still working. This is taking longer than usual. Refresh this page later to see the result.
        </p>
      )}

      <div hidden={step !== "job"}>
        <DescribePanel jobId={job.id} description={description} onDescriptionChange={updateDescription} />
      </div>
      <div hidden={step !== "files"}>
        <FilesPanel jobId={job.id} files={job.files} aiConfigured={aiConfigured} onFileChange={onFileChange} onFileRemoved={onFileRemoved} />
      </div>
      <div hidden={step !== "questions"}>
        <QuestionsPanel matrix={job.matrix} state={state} />
      </div>
      <div hidden={step !== "skills"}>
        <SkillsPanel
          job={job}
          gaps={gaps}
          aiConfigured={aiConfigured}
          flushSaves={state.flushSaves}
          onJobChange={onJobChange}
          onSkillChange={onSkillChange}
          onSkillRemoved={onSkillRemoved}
        />
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Your job, files and answers are stored in the LMS and sent to Anthropic&apos;s API to build your skills.
      </p>
      <ConfirmDialog ref={confirmRef} />
    </div>
  );
}
```

- [ ] **Step 12: Run the tests and watch them pass**

Run: `npx vitest run "src/app/(app)/prompt-bot/skills/[jobId]" src/components/prompt-bot/use-matrix-answers.test.ts`
Expected: PASS (the shared hook's own tests are unchanged and still pass).

- [ ] **Step 13: Accessibility check**

Invoke the `fixing-accessibility` skill with the Skill tool for `job-workspace.tsx` and `describe-panel.tsx`: one `h1`, icon-only buttons named ("Rename job", "Delete job"), `aria-current="step"` on the current step, the stalled message as `status`, the character count tied to the textarea with `aria-describedby`, 44 px targets for the step buttons and header actions. Fix what it reports and re-run Step 12.

- [ ] **Step 14: Typecheck, lint and commit**

```bash
npx tsc --noEmit && npx eslint "src/app/(app)/prompt-bot/skills/[jobId]"
git add "src/app/(app)/prompt-bot/skills/[jobId]"
git commit -m "feat(skills-builder): add the job workspace with steps, polling and the job description"
```
Expected: no type or lint errors.

---
### Task 19: Files panel (uploads and analyses)

**Files:**
- Modify (replace the Task 18 stub): `apps/web/src/app/(app)/prompt-bot/skills/[jobId]/files-panel.tsx`
- Test: `apps/web/src/app/(app)/prompt-bot/skills/[jobId]/files-panel.test.ts`

**Interfaces:**
- Consumes: `uploadJobFile`, `saveAnalysis`, `analyseAgain`, `removeJobFile` (Task 16); `JobFileView` (Task 8); `KIND_LABEL`, `SkillFileKind` from `@/lib/skills/files/types` (Task 3, client-safe); `JOB_LIMITS` (Task 1); `formatBytes` from `@/components/prompt-bot/skills/file-tree` (Task 16); `SafeMarkdown`; `ConfirmDialog`. Server replies are the spec's: upload 201 `JobFileView` (`PENDING`) or an error whose `message` is shown as-is (`UNSUPPORTED_FILE`, `FILE_ENCRYPTED`, `FILE_UNREADABLE`, `FILE_TOO_LARGE`, `TOO_MANY_FILES`, `UPLOAD_INCOMPLETE`, `LIMIT_REACHED`).
- Produces: `export function FilesPanel(props: { jobId: string; files: JobFileView[]; aiConfigured: boolean; onFileChange(file: JobFileView): void; onFileRemoved(fileId: string): void })` and `export const FILE_ACCEPT = ".pptx,.docx,.xlsx,.pdf,.png,.jpg,.jpeg"`.

Behaviour pinned here:
- Uploads run **one at a time** in the order chosen; each has a row (`Waiting…`, `Uploading…`, or the server's error with **Dismiss**). A finished upload's row disappears and the file card appears (via `onFileChange`). A file over 20 MB fails on its row without being sent.
- Card states: `PENDING` "Analysing…"; `READY` the analysis as Markdown, "Edited by you" badge, **Edit** / **Analyse again** (confirm only when edited) / **Remove**; `FAILED` the error, **Analyse again**, **Write it yourself**, **Remove**; `!bundlable` adds "Too large to bundle — the skill will use the analysis only."
- Without the AI key: uploading and **Analyse again** are disabled; editing and removing still work.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/app/(app)/prompt-bot/skills/[jobId]/files-panel.test.ts
/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JobFileView } from "@/lib/skills/jobs/types";

const mocks = vi.hoisted(() => ({ uploadJobFile: vi.fn(), saveAnalysis: vi.fn(), analyseAgain: vi.fn(), removeJobFile: vi.fn(), toastError: vi.fn() }));
vi.mock("@/lib/skills/jobs/client", () => ({
  uploadJobFile: mocks.uploadJobFile,
  saveAnalysis: mocks.saveAnalysis,
  analyseAgain: mocks.analyseAgain,
  removeJobFile: mocks.removeJobFile,
}));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError, success: vi.fn() } }));

import { FILE_ACCEPT, FilesPanel } from "./files-panel";

const file = (over: Partial<JobFileView> = {}): JobFileView => ({
  id: "f1", fileName: "Q3 deck.pptx", assetName: "q3-deck.pptx", kind: "PPTX", size: 4_404_019, createdAt: "2026-11-25T10:00:00.000Z",
  analysisStatus: "READY", analysis: "## Colours\n\nNavy #1F4E79 for titles.", analysisEdited: false, analysisError: null, bundlable: true, ...over,
});
const ok = <T,>(data: T) => ({ ok: true as const, data });
const mount = (files: JobFileView[], aiConfigured = true) => {
  const props = { jobId: "j1", files, aiConfigured, onFileChange: vi.fn(), onFileRemoved: vi.fn() };
  render(createElement(FilesPanel, props));
  return props;
};
const flush = () => act(async () => {});
const dialog = () => within(screen.getByRole("alertdialog"));
const pick = async (files: File[]) => {
  await act(async () => {
    fireEvent.change(screen.getByLabelText("Choose files to upload"), { target: { files } });
  });
};

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("FilesPanel cards", () => {
  it("shows the kind, size and an analysing state for a pending file", () => {
    mount([file({ analysisStatus: "PENDING", analysis: null })]);
    expect(screen.getByText("PowerPoint · 4.2 MB")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Analysing…");
    expect(screen.queryByRole("button", { name: /^Analyse again/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Edit/ })).toBeNull();
  });

  it("renders a ready analysis and saves an edit", async () => {
    mocks.saveAnalysis.mockResolvedValue(ok(file({ analysis: "## Colours\n\nNavy.", analysisEdited: true })));
    const props = mount([file()]);
    expect(screen.getByRole("heading", { name: "Colours" })).toBeTruthy();
    expect(screen.queryByText("Edited by you")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Edit/ }));
    const box = screen.getByLabelText("Style guide for Q3 deck.pptx") as HTMLTextAreaElement;
    expect(box.value).toBe("## Colours\n\nNavy #1F4E79 for titles.");
    expect(box.maxLength).toBe(12_000);
    fireEvent.change(box, { target: { value: "## Colours\n\nNavy." } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    });
    expect(mocks.saveAnalysis).toHaveBeenCalledWith("j1", "f1", "## Colours\n\nNavy.");
    expect(props.onFileChange).toHaveBeenCalledWith(expect.objectContaining({ analysisEdited: true }));
    expect(screen.queryByLabelText("Style guide for Q3 deck.pptx")).toBeNull();
  });

  it("cancels an edit without saving", () => {
    mount([file()]);
    fireEvent.click(screen.getByRole("button", { name: /^Edit/ }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Style guide for Q3 deck.pptx")).toBeNull();
    expect(mocks.saveAnalysis).not.toHaveBeenCalled();
  });

  it("re-analyses at once when the analysis was not edited", async () => {
    mocks.analyseAgain.mockResolvedValue(ok(file({ analysisStatus: "PENDING", analysis: null })));
    const props = mount([file()]);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Analyse again/ }));
    });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(mocks.analyseAgain).toHaveBeenCalledWith("j1", "f1");
    expect(props.onFileChange).toHaveBeenCalledWith(expect.objectContaining({ analysisStatus: "PENDING" }));
  });

  it("asks before replacing an edited analysis", async () => {
    mocks.analyseAgain.mockResolvedValue(ok(file({ analysisStatus: "PENDING" })));
    mount([file({ analysisEdited: true })]);
    expect(screen.getByText("Edited by you")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Analyse again/ }));
    });
    expect(dialog().getByText("Replace your edited style guide?")).toBeTruthy();
    await act(async () => {
      fireEvent.click(dialog().getByRole("button", { name: "Cancel" }));
    });
    expect(mocks.analyseAgain).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Analyse again/ }));
    });
    await act(async () => {
      fireEvent.click(dialog().getByRole("button", { name: "Analyse again" }));
    });
    expect(mocks.analyseAgain).toHaveBeenCalledTimes(1);
  });

  it("offers to write the style guide by hand when analysis failed", async () => {
    mount([file({ analysisStatus: "FAILED", analysis: null, analysisError: "We couldn't analyse this file. Try again, or write the style guide yourself." })]);
    expect(screen.getByText("We couldn't analyse this file. Try again, or write the style guide yourself.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Analyse again/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Write it yourself/ }));
    const box = screen.getByLabelText("Style guide for Q3 deck.pptx") as HTMLTextAreaElement;
    expect(box.value).toBe("");
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("says when a file is too large to bundle", () => {
    mount([file({ size: 14_000_000, bundlable: false })]);
    expect(screen.getByText("Too large to bundle — the skill will use the analysis only.")).toBeTruthy();
  });

  it("removes a file only after a destructive confirm", async () => {
    mocks.removeJobFile.mockResolvedValue(ok({ deleted: true }));
    const props = mount([file()]);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Remove/ }));
    });
    expect(dialog().getByText(/Versions you already generated keep their copy/)).toBeTruthy();
    await act(async () => {
      fireEvent.click(dialog().getByRole("button", { name: "Remove" }));
    });
    expect(mocks.removeJobFile).toHaveBeenCalledWith("j1", "f1");
    expect(props.onFileRemoved).toHaveBeenCalledWith("f1");
  });

  it("shows the server's refusal when a remove is not allowed", async () => {
    mocks.removeJobFile.mockResolvedValue({ ok: false, code: "ALREADY_GENERATING", message: "A skill is being written. Wait for it to finish." });
    const props = mount([file()]);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Remove/ }));
    });
    await act(async () => {
      fireEvent.click(dialog().getByRole("button", { name: "Remove" }));
    });
    expect(mocks.toastError).toHaveBeenCalledWith("A skill is being written. Wait for it to finish.");
    expect(props.onFileRemoved).not.toHaveBeenCalled();
  });
});

describe("FilesPanel uploads", () => {
  it("accepts only the supported types and states the limits", () => {
    mount([]);
    expect((screen.getByLabelText("Choose files to upload") as HTMLInputElement).accept).toBe(FILE_ACCEPT);
    expect(FILE_ACCEPT).toBe(".pptx,.docx,.xlsx,.pdf,.png,.jpg,.jpeg");
    expect(screen.getByText(/PowerPoint, Word, Excel, PDF, PNG or JPG · up to 20 MB each · 10 files/)).toBeTruthy();
    expect(screen.getByText("No files yet. Add the decks, documents and sheets you use for this job.")).toBeTruthy();
  });

  it("uploads one file at a time and shows a failure on its row", async () => {
    let finishFirst: (value: unknown) => void = () => {};
    mocks.uploadJobFile
      .mockImplementationOnce(() => new Promise((resolve) => (finishFirst = resolve)))
      .mockResolvedValueOnce({ ok: false, code: "FILE_ENCRYPTED", message: "This PDF is password-protected. Remove the password, then upload it again." });
    const props = mount([]);
    const deck = new File([new Uint8Array([80, 75, 3, 4])], "deck.pptx");
    const pdf = new File([new Uint8Array([37, 80, 68, 70])], "locked.pdf");
    await pick([deck, pdf]);
    expect(mocks.uploadJobFile).toHaveBeenCalledTimes(1);
    expect(mocks.uploadJobFile).toHaveBeenCalledWith("j1", deck);
    expect(screen.getByText("Uploading…")).toBeTruthy();
    expect(screen.getByText("Waiting…")).toBeTruthy();
    await act(async () => {
      finishFirst(ok(file({ id: "f9", fileName: "deck.pptx", analysisStatus: "PENDING" })));
    });
    await flush();
    expect(props.onFileChange).toHaveBeenCalledWith(expect.objectContaining({ id: "f9" }));
    expect(mocks.uploadJobFile).toHaveBeenCalledTimes(2);
    expect(mocks.uploadJobFile).toHaveBeenLastCalledWith("j1", pdf);
    const row = screen.getByText("locked.pdf").closest("li")!;
    expect(within(row).getByText("This PDF is password-protected. Remove the password, then upload it again.")).toBeTruthy();
    fireEvent.click(within(row).getByRole("button", { name: /Dismiss/ }));
    expect(screen.queryByText("locked.pdf")).toBeNull();
  });

  it("refuses a file over 20 MB without sending it", async () => {
    mount([]);
    const big = new File([new Uint8Array([1])], "huge.pptx");
    Object.defineProperty(big, "size", { value: 21 * 1024 * 1024 });
    await pick([big]);
    expect(mocks.uploadJobFile).not.toHaveBeenCalled();
    expect(screen.getByText("This file is over 20 MB. Upload a smaller copy.")).toBeTruthy();
  });

  it("uploads dropped files", async () => {
    mocks.uploadJobFile.mockResolvedValue(ok(file({ id: "f2", analysisStatus: "PENDING" })));
    const props = mount([]);
    const dropped = new File([new Uint8Array([1])], "brief.docx");
    await act(async () => {
      fireEvent.drop(screen.getByTestId("file-drop-zone"), { dataTransfer: { files: [dropped] } });
    });
    await flush();
    expect(mocks.uploadJobFile).toHaveBeenCalledWith("j1", dropped);
    expect(props.onFileChange).toHaveBeenCalled();
  });

  it("disables uploads and re-analysis without the AI, but keeps editing", () => {
    mount([file()], false);
    expect((screen.getByRole("button", { name: /Upload files/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText("Choose files to upload") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: /^Analyse again/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: /^Edit/ }) as HTMLButtonElement).disabled).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run "src/app/(app)/prompt-bot/skills/[jobId]/files-panel.test.ts"`
Expected: FAIL: `FILE_ACCEPT` is not exported by the Task 18 stub and no card or upload control renders.

- [ ] **Step 3: Invoke the `impeccable` skill**

Invoke the `impeccable` skill with the Skill tool for the Files step and apply it on top of the LMS design system: a generous dashed drop zone that is also a plain button target on touch devices, file cards as calm `glass` cards with the kind icon in a tinted square, the analysis set in readable prose width, state colours from the existing tokens (`primary` for analysing, `destructive` for failed, `warning` for the too-large note), and secondary actions as small outline/ghost buttons.

- [ ] **Step 4: Write the panel**

Replace the whole of `apps/web/src/app/(app)/prompt-bot/skills/[jobId]/files-panel.tsx` with:

```tsx
"use client";
import * as React from "react";
import { AlertTriangle, FileImage, FileSpreadsheet, FileText, Loader2, PenLine, Pencil, Presentation, RotateCcw, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, type ConfirmDialogHandle } from "@/components/ui/confirm-dialog";
import { Textarea } from "@/components/ui/textarea";
import { SafeMarkdown } from "@/components/prompt-bot/safe-markdown";
import { formatBytes } from "@/components/prompt-bot/skills/file-tree";
import { KIND_LABEL, type SkillFileKind } from "@/lib/skills/files/types";
import { analyseAgain, removeJobFile, saveAnalysis, uploadJobFile } from "@/lib/skills/jobs/client";
import type { JobFileView } from "@/lib/skills/jobs/types";
import { JOB_LIMITS } from "@/lib/skills/limits";
import { cn } from "@/lib/utils";

export const FILE_ACCEPT = ".pptx,.docx,.xlsx,.pdf,.png,.jpg,.jpeg";
const MB = 1024 * 1024;
const KIND_ICON: Record<SkillFileKind, typeof FileText> = {
  PPTX: Presentation,
  DOCX: FileText,
  XLSX: FileSpreadsheet,
  PDF: FileText,
  PNG: FileImage,
  JPEG: FileImage,
};
const PROSE =
  "max-w-prose text-sm leading-relaxed [&_a]:text-primary [&_a]:underline [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-xs dark:[&_code]:bg-white/10 [&_h1]:mt-3 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:mt-4 [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:font-semibold [&_li]:mt-1 [&_ol]:mt-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mt-2 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5";

type Confirm = ConfirmDialogHandle["open"];
type UploadRow = { key: number; name: string; status: "waiting" | "uploading" | "failed"; message?: string };
type Props = { jobId: string; files: JobFileView[]; aiConfigured: boolean; onFileChange(file: JobFileView): void; onFileRemoved(fileId: string): void };

/** Step 2: uploads (one at a time) and each file's analysis, editable by the user. */
export function FilesPanel({ jobId, files, aiConfigured, onFileChange, onFileRemoved }: Props) {
  const [rows, setRows] = React.useState<UploadRow[]>([]);
  const [dragging, setDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const confirmRef = React.useRef<ConfirmDialogHandle>(null);
  const queue = React.useRef<Promise<void>>(Promise.resolve());
  const nextKey = React.useRef(0);
  const latest = React.useRef({ onFileChange });
  React.useEffect(() => {
    latest.current = { onFileChange };
  });

  const confirm: Confirm = React.useCallback((options) => confirmRef.current?.open(options) ?? Promise.resolve(false), []);
  const patchRow = (key: number, patch: Partial<UploadRow>) => setRows((all) => all.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  function enqueue(list: File[]) {
    if (!aiConfigured) return;
    for (const file of list) {
      const key = ++nextKey.current;
      if (file.size > JOB_LIMITS.fileBytes) {
        setRows((all) => [...all, { key, name: file.name, status: "failed", message: `This file is over ${JOB_LIMITS.fileBytes / MB} MB. Upload a smaller copy.` }]);
        continue;
      }
      setRows((all) => [...all, { key, name: file.name, status: "waiting" }]);
      queue.current = queue.current.then(async () => {
        patchRow(key, { status: "uploading" });
        const result = await uploadJobFile(jobId, file);
        if (result.ok) {
          setRows((all) => all.filter((r) => r.key !== key));
          latest.current.onFileChange(result.data);
        } else patchRow(key, { status: "failed", message: result.message });
      });
    }
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby="files-heading">
      <div
        data-testid="file-drop-zone"
        onDragOver={(e) => {
          e.preventDefault();
          if (aiConfigured) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          enqueue(Array.from(e.dataTransfer.files));
        }}
        className={cn(
          "glass flex flex-col items-center gap-3 rounded-[1.75rem] border-2 border-dashed border-primary/25! p-6 text-center transition-colors",
          dragging && "border-primary! bg-primary/5",
        )}
      >
        <h2 id="files-heading" className="text-lg font-semibold">Files you use for this job</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Add your templates, past examples and reference documents. Each one is analysed into a style guide you can edit.
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={FILE_ACCEPT}
          disabled={!aiConfigured}
          aria-label="Choose files to upload"
          className="sr-only"
          onChange={(e) => {
            enqueue(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <Button size="lg" disabled={!aiConfigured} onClick={() => inputRef.current?.click()}>
          <Upload className="size-4" aria-hidden />
          Upload files
        </Button>
        <p className="text-xs text-muted-foreground">PowerPoint, Word, Excel, PDF, PNG or JPG · up to 20 MB each · {JOB_LIMITS.filesPerJob} files</p>
      </div>

      {rows.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="Uploads">
          {rows.map((row) => (
            <li key={row.key} className={cn("flex items-start gap-3 rounded-2xl px-4 py-3 text-sm", row.status === "failed" ? "bg-destructive/10" : "bg-primary/5")}>
              {row.status === "failed" ? (
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
              ) : (
                <Loader2 className={cn("mt-0.5 size-4 shrink-0 text-primary", row.status === "uploading" && "animate-spin")} aria-hidden />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{row.name}</p>
                <p className={cn("text-xs", row.status === "failed" ? "text-destructive" : "text-muted-foreground")}>
                  {row.status === "failed" ? row.message : row.status === "uploading" ? "Uploading…" : "Waiting…"}
                </p>
              </div>
              {row.status === "failed" && (
                <Button variant="ghost" size="icon" className="size-11 shrink-0" onClick={() => setRows((all) => all.filter((r) => r.key !== row.key))}>
                  <X className="size-4" aria-hidden />
                  <span className="sr-only">Dismiss {row.name}</span>
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {files.length === 0 && rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">No files yet. Add the decks, documents and sheets you use for this job.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {files.map((f) => (
            <li key={f.id}>
              <FileCard jobId={jobId} file={f} aiConfigured={aiConfigured} confirm={confirm} onChange={onFileChange} onRemoved={onFileRemoved} />
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog ref={confirmRef} />
    </section>
  );
}

function FileCard({
  jobId,
  file,
  aiConfigured,
  confirm,
  onChange,
  onRemoved,
}: {
  jobId: string;
  file: JobFileView;
  aiConfigured: boolean;
  confirm: Confirm;
  onChange(file: JobFileView): void;
  onRemoved(fileId: string): void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [busy, setBusy] = React.useState<"save" | "analyse" | "remove" | null>(null);
  const Icon = KIND_ICON[file.kind];
  const headingId = `file-${file.id}`;
  const pending = file.analysisStatus === "PENDING";
  const named = (label: string) => (
    <>
      {label}
      <span className="sr-only">: {file.fileName}</span>
    </>
  );

  function edit(text: string) {
    setDraft(text);
    setEditing(true);
  }

  async function save() {
    if (!draft.trim()) return;
    setBusy("save");
    const result = await saveAnalysis(jobId, file.id, draft);
    setBusy(null);
    if (!result.ok) return void toast.error(result.message);
    setEditing(false);
    onChange(result.data);
  }

  async function again() {
    if (
      file.analysisEdited &&
      !(await confirm({
        title: "Replace your edited style guide?",
        description: "Analysing again replaces the style guide you edited with a new one from the AI.",
        confirmLabel: "Analyse again",
      }))
    )
      return;
    setBusy("analyse");
    const result = await analyseAgain(jobId, file.id);
    setBusy(null);
    if (!result.ok) return void toast.error(result.message);
    setEditing(false);
    onChange(result.data);
  }

  async function remove() {
    const confirmed = await confirm({
      title: `Remove ${file.fileName}?`,
      description: "Skills you generate next won't use it. Versions you already generated keep their copy.",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!confirmed) return;
    setBusy("remove");
    const result = await removeJobFile(jobId, file.id);
    setBusy(null);
    if (!result.ok) return void toast.error(result.message);
    onRemoved(file.id);
  }

  return (
    <article className="glass rounded-[1.75rem] p-5" aria-labelledby={headingId}>
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 id={headingId} className="truncate font-medium" title={file.fileName}>{file.fileName}</h3>
          <p className="text-xs text-muted-foreground">
            {KIND_LABEL[file.kind]} · {formatBytes(file.size)}
          </p>
        </div>
        {file.analysisEdited && file.analysisStatus === "READY" && <Badge variant="secondary">Edited by you</Badge>}
      </div>

      {!file.bundlable && (
        <p className="mt-3 rounded-xl bg-warning/10 px-3 py-2 text-xs">Too large to bundle — the skill will use the analysis only.</p>
      )}

      {pending && (
        <p role="status" className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
          Analysing… This can take up to a minute.
        </p>
      )}

      {!pending && editing && (
        <div className="mt-4">
          <Textarea
            aria-label={`Style guide for ${file.fileName}`}
            value={draft}
            maxLength={JOB_LIMITS.analysisChars}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={"## Colours\n## Fonts\n## Layout\n## Structure\n## Tone and content"}
            className="min-h-64 bg-white/60 font-mono text-xs leading-relaxed dark:bg-white/5"
          />
          <div className="mt-2 flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            <Button onClick={() => void save()} disabled={!draft.trim() || busy !== null}>
              {busy === "save" && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Save
            </Button>
          </div>
        </div>
      )}

      {!pending && !editing && file.analysisStatus === "READY" && file.analysis && (
        <SafeMarkdown className={cn("mt-4", PROSE)}>{file.analysis}</SafeMarkdown>
      )}

      {!pending && !editing && file.analysisStatus === "FAILED" && (
        <p className="mt-4 flex items-start gap-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {file.analysisError ?? "We couldn't analyse this file. Try again, or write the style guide yourself."}
        </p>
      )}

      {!pending && !editing && (
        <div className="mt-4 flex flex-wrap gap-2">
          {file.analysisStatus === "READY" ? (
            <Button variant="outline" size="sm" onClick={() => edit(file.analysis ?? "")} disabled={busy !== null}>
              <Pencil className="size-4" aria-hidden />
              {named("Edit")}
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => edit("")} disabled={busy !== null}>
              <PenLine className="size-4" aria-hidden />
              {named("Write it yourself")}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => void again()} disabled={!aiConfigured || busy !== null}>
            {busy === "analyse" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RotateCcw className="size-4" aria-hidden />}
            {named("Analyse again")}
          </Button>
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={() => void remove()} disabled={busy !== null}>
            <Trash2 className="size-4" aria-hidden />
            {named("Remove")}
          </Button>
        </div>
      )}
    </article>
  );
}
```

- [ ] **Step 5: Run it and watch it pass**

Run: `npx vitest run "src/app/(app)/prompt-bot/skills/[jobId]/files-panel.test.ts" "src/app/(app)/prompt-bot/skills/[jobId]/job-workspace.test.ts"`
Expected: PASS (the workspace test mocks the panel, so it is unaffected).

- [ ] **Step 6: Accessibility check**

Invoke the `fixing-accessibility` skill with the Skill tool for `files-panel.tsx`: the hidden file input is labelled and reachable through the visible **Upload files** button; every card action names its file (`sr-only` suffix keeps the visible label at the start of the name); "Analysing…" is a live `status`; upload failures are readable next to the file name; the drop zone is not the only way to upload; 44 px targets on phones (`size="sm"` buttons are 40 px on phones; give the card actions `className="min-h-11 sm:min-h-8"` if the audit flags them). Fix what it reports and re-run Step 5.

- [ ] **Step 7: Typecheck and commit**

```bash
npx tsc --noEmit
git add "src/app/(app)/prompt-bot/skills/[jobId]/files-panel.tsx" "src/app/(app)/prompt-bot/skills/[jobId]/files-panel.test.ts"
git commit -m "feat(skills-builder): add the files step with uploads and editable analyses"
```

---

### Task 20: Questions panel

**Files:**
- Modify (replace the Task 18 stub): `apps/web/src/app/(app)/prompt-bot/skills/[jobId]/questions-panel.tsx`
- Test: `apps/web/src/app/(app)/prompt-bot/skills/[jobId]/questions-panel.test.ts`

**Interfaces:**
- Consumes: `MatrixPanel` from `@/components/prompt-bot/matrix-panel`; `useActiveQuestion`, `useMatrixAnswers` (type only) from `@/components/prompt-bot/use-matrix-answers`; `SkillMatrixView` from `@/lib/skills/types`.
- Produces: `export function QuestionsPanel(props: { matrix: SkillMatrixView; state: ReturnType<typeof useMatrixAnswers> })`. It reads `state.answerFor`, `state.scoreState` and calls `state.updateAnswer` only; saving and scoring stay in the workspace's hook.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/app/(app)/prompt-bot/skills/[jobId]/questions-panel.test.ts
/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnswerView } from "@/lib/prompt-bot/sessions";
import { QuestionsPanel } from "./questions-panel";

afterEach(cleanup);

type State = Parameters<typeof QuestionsPanel>[0]["state"];
const MATRIX = {
  id: "pbm_skill_definition",
  name: "Skill definition",
  questions: [
    { id: "q1", text: "When should this skill be used?", guidance: "Triggers and phrases.", order: 0 },
    { id: "q2", text: "What context does it need to know?", guidance: "Background that stays true.", order: 1 },
  ],
};
const ANSWERS: Record<string, AnswerView> = {
  q1: { questionId: "q1", answer: "Every month", score: 3, reason: "Clear trigger", notRelevant: false },
  q2: { questionId: "q2", answer: "", score: 1, reason: "Only hinted at", notRelevant: false },
};
const mount = () => {
  const state = { answerFor: (id: string) => ANSWERS[id], scoreState: "idle", updateAnswer: vi.fn() } as unknown as State;
  render(createElement(QuestionsPanel, { matrix: MATRIX, state }));
  return state;
};

describe("QuestionsPanel", () => {
  it("shows the questions with bars, readiness and what they are scored against", () => {
    mount();
    expect(screen.getByRole("heading", { level: 2, name: "Skill definition" })).toBeTruthy();
    expect(screen.getAllByRole("meter")).toHaveLength(2);
    expect(screen.getByText(/of 2 ready/).textContent).toBe("1 of 2 ready");
    expect(screen.getByText("Scored against your job description, answers and files.")).toBeTruthy();
  });

  it("opens the first question, then focuses the box of the one selected", () => {
    mount();
    expect((screen.getByLabelText("When should this skill be used?") as HTMLTextAreaElement).value).toBe("Every month");
    fireEvent.click(screen.getByRole("button", { name: /^2\.\s*What context/ }));
    const box = screen.getByLabelText("What context does it need to know?") as HTMLTextAreaElement;
    expect(document.activeElement).toBe(box);
    expect(box.placeholder).toBe("Background that stays true.");
  });

  it("sends typing and relevance changes to the shared answer state", () => {
    const state = mount();
    fireEvent.change(screen.getByLabelText("When should this skill be used?"), { target: { value: "Monthly board meetings" } });
    expect(state.updateAnswer).toHaveBeenCalledWith("q1", { answer: "Monthly board meetings" });
    fireEvent.click(screen.getByRole("button", { name: "Mark not relevant: What context does it need to know?" }));
    expect(state.updateAnswer).toHaveBeenCalledWith("q2", { notRelevant: true });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run "src/app/(app)/prompt-bot/skills/[jobId]/questions-panel.test.ts"`
Expected: FAIL: the Task 18 stub renders no heading, meters or answer box.

- [ ] **Step 3: Invoke the `impeccable` skill**

Invoke the `impeccable` skill with the Skill tool and apply it on top of the LMS design system, keeping the enhancer's proven two-column layout (matrix left, answer right) so the two products feel the same; on phones the matrix stacks above the answer box.

- [ ] **Step 4: Write the panel**

Replace the whole of `apps/web/src/app/(app)/prompt-bot/skills/[jobId]/questions-panel.tsx` with:

```tsx
"use client";
import { Textarea } from "@/components/ui/textarea";
import { MatrixPanel } from "@/components/prompt-bot/matrix-panel";
import { useActiveQuestion, type useMatrixAnswers } from "@/components/prompt-bot/use-matrix-answers";
import type { SkillMatrixView } from "@/lib/skills/types";

const ANSWER_MAX = 4000;

/** Step 3: the skill-definition matrix with 3-slice bars, and the selected question's answer. */
export function QuestionsPanel({ matrix, state }: { matrix: SkillMatrixView; state: ReturnType<typeof useMatrixAnswers> }) {
  const { activeId, answerRef, selectQuestion } = useActiveQuestion(matrix.questions[0]?.id ?? null);
  const active = matrix.questions.find((q) => q.id === activeId) ?? null;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <MatrixPanel
        heading={matrix.name}
        headingLevel="h2"
        groups={[{ id: matrix.id || "skill-definition", title: "Questions", questions: matrix.questions }]}
        answerFor={state.answerFor}
        activeId={activeId}
        scoreState={state.scoreState}
        onSelect={selectQuestion}
        onToggleRelevant={(id) => state.updateAnswer(id, { notRelevant: !state.answerFor(id).notRelevant })}
      >
        <p className="mt-3 text-xs text-muted-foreground">Scored against your job description, answers and files.</p>
      </MatrixPanel>
      <section className="glass h-fit rounded-[1.75rem] p-5">
        {active ? (
          <>
            <label htmlFor="job-answer" className="text-sm font-medium">{active.text}</label>
            <Textarea
              id="job-answer"
              ref={answerRef}
              value={state.answerFor(active.id).answer}
              maxLength={ANSWER_MAX}
              onChange={(e) => state.updateAnswer(active.id, { answer: e.target.value })}
              placeholder={active.guidance}
              className="mt-2 min-h-48 resize-y bg-white/60 dark:bg-white/5"
            />
            <p className="mt-2 text-xs text-muted-foreground">Short notes are fine. Anything your description or files already say counts too.</p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No questions are set up yet.</p>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Run it and watch it pass**

Run: `npx vitest run "src/app/(app)/prompt-bot/skills/[jobId]/questions-panel.test.ts" src/components/prompt-bot/matrix-panel.test.ts`
Expected: PASS.

- [ ] **Step 6: Accessibility check**

Invoke the `fixing-accessibility` skill with the Skill tool for `questions-panel.tsx`: the answer box is labelled by its question, the guidance is a placeholder plus visible helper text (placeholder alone is not a label), focus moves to the box only after a row click. Fix what it reports and re-run Step 5.

- [ ] **Step 7: Typecheck and commit**

```bash
npx tsc --noEmit
git add "src/app/(app)/prompt-bot/skills/[jobId]/questions-panel.tsx" "src/app/(app)/prompt-bot/skills/[jobId]/questions-panel.test.ts"
git commit -m "feat(skills-builder): add the questions step to the job workspace"
```

---
### Task 21: Skills panel (suggest, skill cards, generate, versions, downloads)

**Files:**
- Create: `apps/web/src/app/(app)/prompt-bot/skills/[jobId]/version-preview.tsx`
- Create: `apps/web/src/app/(app)/prompt-bot/skills/[jobId]/skill-card.tsx`
- Modify (replace the Task 18 stub): `apps/web/src/app/(app)/prompt-bot/skills/[jobId]/skills-panel.tsx`
- Test: `apps/web/src/app/(app)/prompt-bot/skills/[jobId]/version-preview.test.ts`, `skill-card.test.ts`, `skills-panel.test.ts`

**Interfaces:**
- Consumes: `suggestSkills`, `addJobSkill`, `patchJobSkill`, `removeJobSkill`, `generateJobSkill`, `getVersion`, `versionDownloadUrl` (Task 16); `downloadZip` from `@/lib/skills/client`; `SkillFilesView` (Task 16); `JobView`, `JobSkillView`, `JobFileView`, `VersionDetail` (Task 8); `JOB_LIMITS` (Task 1); `SAVE_DELAY_MS` (600) from `@/components/prompt-bot/use-matrix-answers`. Server replies: suggest 200 `JobView`; add 201 `JobSkillView` or 409 `DUPLICATE_NAME` / `TOO_MANY_SKILLS`; patch 409 `DUPLICATE_NAME` / `ALREADY_GENERATING`; generate 202 `JobSkillView` (`GENERATING`) or 400/409/429/503 with a message.
- Produces (contract): `SkillsPanel(props: { job; gaps; aiConfigured; flushSaves; onJobChange; onSkillChange; onSkillRemoved })`, `SkillCard(props: { jobId; skill; files; gaps; aiConfigured; flushSaves; onChange; onRemoved })`, `VersionPreview(props: { jobId; skill })`; plus `export const unansweredPhrase = (gaps: number) => string` from `skill-card.tsx` ("1 question unanswered" / "3 questions unanswered"), shared by the panel and the card.

The confirmation rule (the double-confirm follow-up): **Suggest** and **Generate** each show **at most one** `ConfirmDialog`, and only when `gaps > 0`. With every question answered they act at once. A new version never replaces an older one, so there is no "replace files" confirmation at all. `window.confirm` is never called (asserted).

- [ ] **Step 1: Write the failing version-preview test**

```ts
// apps/web/src/app/(app)/prompt-bot/skills/[jobId]/version-preview.test.ts
/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JobSkillView, VersionDetail } from "@/lib/skills/jobs/types";

const mocks = vi.hoisted(() => ({ getVersion: vi.fn(), downloadZip: vi.fn(), toastError: vi.fn() }));
vi.mock("@/lib/skills/jobs/client", () => ({
  getVersion: mocks.getVersion,
  versionDownloadUrl: (j: string, s: string, v: number, f: string) => `/dl/${j}/${s}/${v}/${f}`,
}));
vi.mock("@/lib/skills/client", () => ({ downloadZip: mocks.downloadZip }));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }));

import { VersionPreview } from "./version-preview";

const detail = (version: number): VersionDetail => ({
  skillId: "s1",
  version,
  name: version === 1 ? "board-notes" : "board-update",
  description: "Writes it.",
  createdAt: "2026-11-25T14:02:00.000Z",
  files: [{ path: "SKILL.md", content: `---\nname: x\ndescription: "d"\n---\n\n# Version ${version}\n` }],
  assets: [{ fileId: "f1", path: "assets/deck.pptx", fileName: "deck.pptx", bytes: 2048 }],
});
const skill = (over: Partial<JobSkillView> = {}): JobSkillView => ({
  id: "s1",
  order: 0,
  name: "board-update",
  purpose: "Writes it.",
  fileIds: [],
  status: "READY",
  validationErrors: [],
  latestVersion: 2,
  versions: [
    { version: 2, name: "board-update", createdAt: "2026-11-25T14:02:00.000Z", assets: 1 },
    { version: 1, name: "board-notes", createdAt: "2026-11-24T09:00:00.000Z", assets: 0 },
  ],
  ...over,
});
const flush = () => act(async () => {});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getVersion.mockImplementation(async (_j: string, _s: string, v: number) => ({ ok: true, data: detail(v) }));
  mocks.downloadZip.mockResolvedValue({ ok: true });
});
afterEach(cleanup);

describe("VersionPreview", () => {
  it("shows the latest version first and lists every version", async () => {
    render(createElement(VersionPreview, { jobId: "j1", skill: skill() }));
    await flush();
    expect(mocks.getVersion).toHaveBeenCalledWith("j1", "s1", 2);
    expect(screen.getByRole("heading", { name: "Version 2" })).toBeTruthy();
    const options = Array.from((screen.getByLabelText("Version") as HTMLSelectElement).options).map((o) => o.textContent ?? "");
    expect(options).toHaveLength(2);
    expect(options[0].startsWith("v2 · ")).toBe(true);
    expect(options[1].startsWith("v1 · ")).toBe(true);
    expect(screen.getByText("We keep the last 20 versions of each skill.")).toBeTruthy();
    expect(screen.getByText("board-update/")).toBeTruthy();
  });

  it("previews an older version and remembers loaded ones", async () => {
    render(createElement(VersionPreview, { jobId: "j1", skill: skill() }));
    await flush();
    fireEvent.change(screen.getByLabelText("Version"), { target: { value: "1" } });
    await flush();
    expect(mocks.getVersion).toHaveBeenLastCalledWith("j1", "s1", 1);
    expect(screen.getByRole("heading", { name: "Version 1" })).toBeTruthy();
    expect(screen.getByText("board-notes/")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Version"), { target: { value: "2" } });
    await flush();
    expect(mocks.getVersion).toHaveBeenCalledTimes(2);
  });

  it("downloads the selected version as an upload zip or a pack", async () => {
    render(createElement(VersionPreview, { jobId: "j1", skill: skill() }));
    await flush();
    fireEvent.change(screen.getByLabelText("Version"), { target: { value: "1" } });
    await flush();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Download skill/ }));
    });
    expect(mocks.downloadZip).toHaveBeenCalledWith("/dl/j1/s1/1/upload");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Download as pack/ }));
    });
    expect(mocks.downloadZip).toHaveBeenCalledWith("/dl/j1/s1/1/pack");
  });

  it("reports a refused download", async () => {
    mocks.downloadZip.mockResolvedValue({ ok: false, message: "A file this version uses is no longer available. Generate the skill again." });
    render(createElement(VersionPreview, { jobId: "j1", skill: skill() }));
    await flush();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Download skill/ }));
    });
    expect(mocks.toastError).toHaveBeenCalledWith("A file this version uses is no longer available. Generate the skill again.");
  });

  it("jumps to a new version when one arrives", async () => {
    const view = render(createElement(VersionPreview, { jobId: "j1", skill: skill() }));
    await flush();
    fireEvent.change(screen.getByLabelText("Version"), { target: { value: "1" } });
    await flush();
    view.rerender(
      createElement(VersionPreview, {
        jobId: "j1",
        skill: skill({ latestVersion: 3, versions: [{ version: 3, name: "board-update", createdAt: "2026-11-25T15:00:00.000Z", assets: 1 }, ...skill().versions] }),
      }),
    );
    await flush();
    expect((screen.getByLabelText("Version") as HTMLSelectElement).value).toBe("3");
    expect(mocks.getVersion).toHaveBeenLastCalledWith("j1", "s1", 3);
  });

  it("offers to load again when a version can't be read", async () => {
    mocks.getVersion.mockResolvedValueOnce({ ok: false, code: "NETWORK_ERROR", message: "Couldn't reach the server." });
    render(createElement(VersionPreview, { jobId: "j1", skill: skill() }));
    await flush();
    expect(screen.getByRole("alert").textContent).toContain("couldn't load this version");
    fireEvent.click(screen.getByRole("button", { name: /Load again/ }));
    await flush();
    expect(screen.getByRole("heading", { name: "Version 2" })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Write the failing skill-card test**

```ts
// apps/web/src/app/(app)/prompt-bot/skills/[jobId]/skill-card.test.ts
/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JobFileView, JobSkillView } from "@/lib/skills/jobs/types";

const mocks = vi.hoisted(() => ({ patchJobSkill: vi.fn(), generateJobSkill: vi.fn(), removeJobSkill: vi.fn(), toastError: vi.fn() }));
vi.mock("@/lib/skills/jobs/client", () => ({
  patchJobSkill: mocks.patchJobSkill,
  generateJobSkill: mocks.generateJobSkill,
  removeJobSkill: mocks.removeJobSkill,
}));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }));
vi.mock("./version-preview", () => ({ VersionPreview: () => null }));

import { SkillCard, unansweredPhrase } from "./skill-card";

const FILES: JobFileView[] = [
  { id: "f1", fileName: "Q3 deck.pptx", assetName: "q3-deck.pptx", kind: "PPTX", size: 1000, createdAt: "2026-11-25T10:00:00.000Z", analysisStatus: "READY", analysis: "x", analysisEdited: false, analysisError: null, bundlable: true },
  { id: "f2", fileName: "numbers.xlsx", assetName: "numbers.xlsx", kind: "XLSX", size: 1000, createdAt: "2026-11-25T10:00:00.000Z", analysisStatus: "READY", analysis: "y", analysisEdited: false, analysisError: null, bundlable: true },
];
const skill = (over: Partial<JobSkillView> = {}): JobSkillView => ({
  id: "s1", order: 0, name: "board-update", purpose: "Writes the board update.", fileIds: ["f1"], status: "DRAFT", validationErrors: [], latestVersion: 0, versions: [], ...over,
});
const ok = <T,>(data: T) => ({ ok: true as const, data });
const settle = (ms = 0) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
const mount = async (over: Partial<JobSkillView> = {}, gaps = 0, aiConfigured = true) => {
  const props = { jobId: "j1", skill: skill(over), files: FILES, gaps, aiConfigured, flushSaves: vi.fn(async () => {}), onChange: vi.fn(), onRemoved: vi.fn() };
  render(createElement(SkillCard, props));
  await settle();
  return props;
};
const click = (name: RegExp | string) =>
  act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
    await vi.advanceTimersByTimeAsync(0);
  });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.clearAllMocks();
  vi.stubGlobal("confirm", vi.fn(() => true));
  mocks.generateJobSkill.mockResolvedValue(ok(skill({ status: "GENERATING" })));
  mocks.patchJobSkill.mockImplementation(async (_j: string, _s: string, patch: Partial<JobSkillView>) => ok(skill(patch)));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("unansweredPhrase", () => {
  it("counts questions in words", () => {
    expect(unansweredPhrase(1)).toBe("1 question unanswered");
    expect(unansweredPhrase(3)).toBe("3 questions unanswered");
  });
});

describe("SkillCard generate", () => {
  it("generates at once, with no dialog, when every question is answered", async () => {
    const props = await mount();
    await click(/^Generate$/);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(props.flushSaves).toHaveBeenCalledTimes(1);
    expect(props.flushSaves.mock.invocationCallOrder[0]).toBeLessThan(mocks.generateJobSkill.mock.invocationCallOrder[0]);
    expect(mocks.generateJobSkill).toHaveBeenCalledWith("j1", "s1");
    expect(props.onChange).toHaveBeenCalledWith(expect.objectContaining({ status: "GENERATING" }));
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it("asks exactly once when questions are unanswered, and does nothing on cancel", async () => {
    await mount({ latestVersion: 2, status: "READY" }, 3);
    await click(/^Generate v3$/);
    expect(screen.getAllByRole("alertdialog")).toHaveLength(1);
    expect(screen.getByRole("alertdialog").textContent).toContain("3 questions unanswered — the skill will be more general. Generate anyway?");
    await act(async () => {
      fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Cancel" }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mocks.generateJobSkill).not.toHaveBeenCalled();
    await click(/^Generate v3$/);
    await act(async () => {
      fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Generate anyway" }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mocks.generateJobSkill).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it("shows the server's refusal", async () => {
    mocks.generateJobSkill.mockResolvedValue({ ok: false, code: "FILES_ANALYSING", message: "Wait until your files have been analysed." });
    await mount();
    await click(/^Generate$/);
    expect(mocks.toastError).toHaveBeenCalledWith("Wait until your files have been analysed.");
  });

  it("is disabled while writing and without the AI", async () => {
    await mount({ status: "GENERATING" });
    expect((screen.getByRole("button", { name: /^Generate/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("status").textContent).toContain("Writing… (this can take a minute or two)");
    cleanup();
    await mount({}, 0, false);
    expect((screen.getByRole("button", { name: /^Generate/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("SkillCard status", () => {
  it("labels drafts and ready versions", async () => {
    await mount();
    expect(screen.getByText("Draft")).toBeTruthy();
    cleanup();
    await mount({ status: "READY", latestVersion: 2, versions: [{ version: 2, name: "board-update", createdAt: "2026-11-25T14:00:00.000Z", assets: 1 }] });
    expect(screen.getByText("v2 ready")).toBeTruthy();
    expect(screen.queryByText(/Renamed/)).toBeNull();
  });

  it("keeps older versions available after a failed attempt", async () => {
    await mount({ status: "FAILED", latestVersion: 1, validationErrors: ["SKILL.md: description cannot contain < or >"], versions: [{ version: 1, name: "board-update", createdAt: "2026-11-25T14:00:00.000Z", assets: 0 }] });
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Last attempt failed");
    expect(alert.textContent).toContain("SKILL.md: description cannot contain < or >");
    expect(alert.textContent).toContain("v1 is still available.");
  });

  it("says a rename takes effect in the next version", async () => {
    await mount({ name: "monthly-board-update", status: "READY", latestVersion: 1, versions: [{ version: 1, name: "board-update", createdAt: "2026-11-25T14:00:00.000Z", assets: 0 }] });
    expect(screen.getByText("Renamed — generate again to use the new name")).toBeTruthy();
  });
});

describe("SkillCard editing", () => {
  it("saves a rename on blur and shows the server's normalised name", async () => {
    mocks.patchJobSkill.mockResolvedValue(ok(skill({ name: "monthly-board-update" })));
    const props = await mount();
    const input = screen.getByLabelText("Skill name") as HTMLInputElement;
    expect(input.className).toContain("font-mono");
    fireEvent.change(input, { target: { value: "Monthly Board Update" } });
    await act(async () => {
      fireEvent.blur(input);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mocks.patchJobSkill).toHaveBeenCalledWith("j1", "s1", { name: "Monthly Board Update" });
    expect(input.value).toBe("monthly-board-update");
    expect(props.onChange).toHaveBeenCalledWith(expect.objectContaining({ name: "monthly-board-update" }));
  });

  it("shows a duplicate name inline", async () => {
    mocks.patchJobSkill.mockResolvedValue({ ok: false, code: "DUPLICATE_NAME", message: 'A skill named "weekly-report" is already in this job. Choose another name.' });
    await mount();
    const input = screen.getByLabelText("Skill name");
    fireEvent.change(input, { target: { value: "weekly-report" } });
    await act(async () => {
      fireEvent.blur(input);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText('A skill named "weekly-report" is already in this job. Choose another name.')).toBeTruthy();
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it("autosaves the purpose after a pause, and before generating", async () => {
    await mount();
    fireEvent.change(screen.getByLabelText("Purpose"), { target: { value: "Writes the monthly board update." } });
    expect(mocks.patchJobSkill).not.toHaveBeenCalled();
    await settle(600);
    expect(mocks.patchJobSkill).toHaveBeenCalledWith("j1", "s1", { purpose: "Writes the monthly board update." }, {});
    fireEvent.change(screen.getByLabelText("Purpose"), { target: { value: "Writes it from the deck." } });
    await click(/^Generate$/);
    expect(mocks.patchJobSkill).toHaveBeenLastCalledWith("j1", "s1", { purpose: "Writes it from the deck." }, {});
    expect(mocks.patchJobSkill.mock.invocationCallOrder.at(-1)!).toBeLessThan(mocks.generateJobSkill.mock.invocationCallOrder[0]);
  });

  it("toggles which files the skill uses", async () => {
    const props = await mount();
    const deck = screen.getByRole("button", { name: "Q3 deck.pptx" });
    const sheet = screen.getByRole("button", { name: "numbers.xlsx" });
    expect(deck.getAttribute("aria-pressed")).toBe("true");
    expect(sheet.getAttribute("aria-pressed")).toBe("false");
    await act(async () => {
      fireEvent.click(sheet);
    });
    expect(mocks.patchJobSkill).toHaveBeenCalledWith("j1", "s1", { fileIds: ["f1", "f2"] });
    expect(props.onChange).toHaveBeenCalled();
  });

  it("removes the skill and its versions after a destructive confirm", async () => {
    mocks.removeJobSkill.mockResolvedValue(ok({ deleted: true }));
    const props = await mount();
    await click(/^Remove/);
    expect(screen.getByRole("alertdialog").textContent).toContain("This deletes all its versions.");
    await act(async () => {
      fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Remove" }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mocks.removeJobSkill).toHaveBeenCalledWith("j1", "s1");
    expect(props.onRemoved).toHaveBeenCalledWith("s1");
  });
});
```

- [ ] **Step 3: Write the failing skills-panel test**

```ts
// apps/web/src/app/(app)/prompt-bot/skills/[jobId]/skills-panel.test.ts
/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JobSkillView, JobView } from "@/lib/skills/jobs/types";

const mocks = vi.hoisted(() => ({
  suggestSkills: vi.fn(),
  addJobSkill: vi.fn(),
  patchJobSkill: vi.fn(),
  generateJobSkill: vi.fn(),
  removeJobSkill: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock("@/lib/skills/jobs/client", () => ({
  suggestSkills: mocks.suggestSkills,
  addJobSkill: mocks.addJobSkill,
  patchJobSkill: mocks.patchJobSkill,
  generateJobSkill: mocks.generateJobSkill,
  removeJobSkill: mocks.removeJobSkill,
}));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }));
vi.mock("./version-preview", () => ({ VersionPreview: () => null }));

import { SkillsPanel } from "./skills-panel";

const skill = (over: Partial<JobSkillView> = {}): JobSkillView => ({
  id: "s1", order: 0, name: "board-update", purpose: "Writes it.", fileIds: [], status: "DRAFT", validationErrors: [], latestVersion: 0, versions: [], ...over,
});
const JOB: JobView = {
  id: "j1", title: "Board", description: "Every month…", scoreRevision: 0, updatedAt: "2026-11-25T10:00:00.000Z", suggestedAt: null,
  matrix: { id: "m", name: "Skill definition", questions: [] }, answers: [], files: [], skills: [],
};
const ok = <T,>(data: T) => ({ ok: true as const, data });
const mount = (job: JobView = JOB, gaps = 0, aiConfigured = true) => {
  const props = { job, gaps, aiConfigured, flushSaves: vi.fn(async () => {}), onJobChange: vi.fn(), onSkillChange: vi.fn(), onSkillRemoved: vi.fn() };
  render(createElement(SkillsPanel, props));
  return props;
};
const press = (name: RegExp) =>
  act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("confirm", vi.fn(() => true));
  mocks.suggestSkills.mockResolvedValue(ok({ ...JOB, skills: [skill()] }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SkillsPanel suggest", () => {
  it("invites a suggestion when there are no skills, and suggests at once with no gaps", async () => {
    const props = mount();
    expect(screen.getByText("Let the AI suggest the skills for this job.")).toBeTruthy();
    await press(/^Suggest skills/);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(props.flushSaves.mock.invocationCallOrder[0]).toBeLessThan(mocks.suggestSkills.mock.invocationCallOrder[0]);
    expect(mocks.suggestSkills).toHaveBeenCalledWith("j1");
    expect(props.onJobChange).toHaveBeenCalledWith(expect.objectContaining({ skills: [expect.objectContaining({ id: "s1" })] }));
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it("asks once when questions are unanswered", async () => {
    mount(JOB, 2);
    await press(/^Suggest skills/);
    const dialog = screen.getByRole("alertdialog");
    expect(dialog.textContent).toContain("2 questions unanswered — suggestions will be more general. Suggest anyway?");
    expect(dialog.textContent).not.toContain("replaces");
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    });
    expect(mocks.suggestSkills).not.toHaveBeenCalled();
    await press(/^Suggest skills/);
    await act(async () => {
      fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Suggest anyway" }));
    });
    expect(mocks.suggestSkills).toHaveBeenCalledTimes(1);
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it("warns that drafts are replaced when suggesting again", async () => {
    mount({ ...JOB, skills: [skill(), skill({ id: "s2", name: "kept", latestVersion: 1, status: "READY" })] }, 1);
    expect(screen.getByText(/Keeps skills you've generated and replaces the drafts/)).toBeTruthy();
    await press(/^Suggest again/);
    expect(screen.getByRole("alertdialog").textContent).toContain("This replaces the skills you haven't generated yet.");
  });

  it("shows a failed suggestion", async () => {
    mocks.suggestSkills.mockResolvedValue({ ok: false, code: "LIMIT_REACHED", message: "You've reached today's limit." });
    const props = mount();
    await press(/^Suggest skills/);
    expect(mocks.toastError).toHaveBeenCalledWith("You've reached today's limit.");
    expect(props.onJobChange).not.toHaveBeenCalled();
  });

  it("can't suggest without the AI", () => {
    mount(JOB, 0, false);
    expect((screen.getByRole("button", { name: /^Suggest skills/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("SkillsPanel skills", () => {
  it("lists a card per skill", () => {
    mount({ ...JOB, skills: [skill(), skill({ id: "s2", name: "weekly-report" })] });
    expect((screen.getAllByLabelText("Skill name") as HTMLInputElement[]).map((i) => i.value)).toEqual(["board-update", "weekly-report"]);
  });

  it("adds a skill by hand", async () => {
    mocks.addJobSkill.mockResolvedValue(ok(skill({ id: "s3", name: "weekly-report" })));
    const props = mount({ ...JOB, skills: [skill()] });
    fireEvent.click(screen.getByRole("button", { name: /^Add skill/ }));
    fireEvent.change(screen.getByLabelText("New skill name"), { target: { value: "Weekly report" } });
    fireEvent.change(screen.getByLabelText("What it does"), { target: { value: "Writes the weekly report." } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add" }));
    });
    expect(mocks.addJobSkill).toHaveBeenCalledWith("j1", { name: "Weekly report", purpose: "Writes the weekly report." });
    expect(props.onSkillChange).toHaveBeenCalledWith(expect.objectContaining({ id: "s3" }));
    expect(screen.queryByLabelText("New skill name")).toBeNull();
  });

  it("shows a duplicate name inline when adding", async () => {
    mocks.addJobSkill.mockResolvedValue({ ok: false, code: "DUPLICATE_NAME", message: 'A skill named "board-update" is already in this job. Choose another name.' });
    mount({ ...JOB, skills: [skill()] });
    fireEvent.click(screen.getByRole("button", { name: /^Add skill/ }));
    fireEvent.change(screen.getByLabelText("New skill name"), { target: { value: "Board update" } });
    fireEvent.change(screen.getByLabelText("What it does"), { target: { value: "Again." } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add" }));
    });
    expect(screen.getByText('A skill named "board-update" is already in this job. Choose another name.')).toBeTruthy();
  });

  it("stops offering Add at five skills", () => {
    mount({ ...JOB, skills: [1, 2, 3, 4, 5].map((n) => skill({ id: `s${n}`, name: `skill-${n}` })) });
    expect((screen.getByRole("button", { name: /^Add skill/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("A job can have at most 5 skills.")).toBeTruthy();
  });
});
```

- [ ] **Step 4: Run them and watch them fail**

Run: `npx vitest run "src/app/(app)/prompt-bot/skills/[jobId]/version-preview.test.ts" "src/app/(app)/prompt-bot/skills/[jobId]/skill-card.test.ts" "src/app/(app)/prompt-bot/skills/[jobId]/skills-panel.test.ts"`
Expected: FAIL, "Failed to resolve import "./version-preview"" and "./skill-card"; the skills-panel stub renders no Suggest button.

- [ ] **Step 5: Invoke the `impeccable` skill**

Invoke the `impeccable` skill with the Skill tool for the Skills step and apply it on top of the LMS design system: the empty state as one inviting card with a single primary action; each skill as a `glass` card with the name in `font-mono`, the status as a small badge beside it, file chips as pill toggles (pressed = `bg-primary/10 text-primary ring-1 ring-primary/30`), the Generate button as the card's one primary action, Remove visually quiet; the version preview below a hairline divider so the card reads top-down: name → purpose → files → status → generate → versions.

- [ ] **Step 6: Write the version preview**

```tsx
// apps/web/src/app/(app)/prompt-bot/skills/[jobId]/version-preview.tsx
"use client";
import * as React from "react";
import { ChevronDown, Download, Loader2, PackageOpen, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SkillFilesView } from "@/components/prompt-bot/skills/skill-files-view";
import { downloadZip } from "@/lib/skills/client";
import { getVersion, versionDownloadUrl } from "@/lib/skills/jobs/client";
import type { JobSkillView, VersionDetail } from "@/lib/skills/jobs/types";

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Read-only preview and downloads of one version of a skill. Versions never change, so loaded ones are kept. */
export function VersionPreview({ jobId, skill }: { jobId: string; skill: JobSkillView }) {
  const newest = skill.versions[0]?.version ?? skill.latestVersion;
  const [seenLatest, setSeenLatest] = React.useState(skill.latestVersion);
  const [selected, setSelected] = React.useState(newest);
  // A new version arriving (generation finished) moves the preview to it.
  if (seenLatest !== skill.latestVersion) {
    setSeenLatest(skill.latestVersion);
    setSelected(newest);
  }
  const [details, setDetails] = React.useState<Record<number, VersionDetail>>({});
  const [failed, setFailed] = React.useState<number | null>(null);
  const [attempt, setAttempt] = React.useState(0);
  const detail = details[selected] ?? null;
  const selectId = `version-${skill.id}`;

  React.useEffect(() => {
    if (details[selected]) return;
    let cancelled = false;
    void getVersion(jobId, skill.id, selected).then((result) => {
      if (cancelled) return;
      if (result.ok) setDetails((prev) => ({ ...prev, [selected]: result.data }));
      else setFailed(selected);
    });
    return () => {
      cancelled = true;
    };
  }, [jobId, skill.id, selected, details, attempt]);

  async function download(format: "upload" | "pack") {
    const result = await downloadZip(versionDownloadUrl(jobId, skill.id, selected, format));
    if (!result.ok) toast.error(result.message);
  }

  return (
    <div className="mt-5 border-t border-border/60 pt-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <label htmlFor={selectId} className="block text-xs font-medium text-muted-foreground">Version</label>
          <span className="relative mt-1 inline-block">
            <select
              id={selectId}
              value={selected}
              onChange={(e) => setSelected(Number(e.target.value))}
              className="min-h-11 appearance-none rounded-xl border border-border bg-white/60 py-2 pl-3 pr-9 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 dark:bg-white/5 sm:min-h-9"
            >
              {skill.versions.map((v) => (
                <option key={v.version} value={v.version}>
                  v{v.version} · {when(v.createdAt)}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="lg" onClick={() => void download("upload")}>
            <Download className="size-4" aria-hidden />
            Download skill
          </Button>
          <Button variant="outline" size="lg" onClick={() => void download("pack")}>
            <PackageOpen className="size-4" aria-hidden />
            Download as pack
          </Button>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">We keep the last 20 versions of each skill.</p>

      <div className="mt-4">
        {detail ? (
          <>
            <p className="mb-3 font-mono text-xs text-muted-foreground">{detail.name}/</p>
            <SkillFilesView files={detail.files} assets={detail.assets} />
          </>
        ) : failed === selected ? (
          <div role="alert" className="flex flex-col items-center gap-3 py-6 text-center text-sm">
            <p>We couldn&apos;t load this version. Check your connection.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setFailed(null);
                setAttempt((a) => a + 1);
              }}
            >
              <RotateCcw className="size-4" aria-hidden />
              Load again
            </Button>
          </div>
        ) : (
          <p role="status" className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Loading v{selected}…
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Write the skill card**

```tsx
// apps/web/src/app/(app)/prompt-bot/skills/[jobId]/skill-card.tsx
"use client";
import * as React from "react";
import { AlertTriangle, Loader2, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, type ConfirmDialogHandle } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SAVE_DELAY_MS } from "@/components/prompt-bot/use-matrix-answers";
import type { SaveOptions } from "@/lib/prompt-bot/client";
import { generateJobSkill, patchJobSkill, removeJobSkill } from "@/lib/skills/jobs/client";
import type { JobFileView, JobSkillView } from "@/lib/skills/jobs/types";
import { cn } from "@/lib/utils";
import { VersionPreview } from "./version-preview";

const PURPOSE_MAX = 300;
const INLINE_NAME_ERRORS = new Set(["DUPLICATE_NAME", "ALREADY_GENERATING", "VALIDATION_ERROR"]);

export const unansweredPhrase = (gaps: number) => `${gaps} question${gaps === 1 ? "" : "s"} unanswered`;

type Props = {
  jobId: string;
  skill: JobSkillView;
  files: JobFileView[];
  gaps: number;
  aiConfigured: boolean;
  flushSaves(): Promise<void>;
  onChange(skill: JobSkillView): void;
  onRemoved(skillId: string): void;
};

export function SkillCard({ jobId, skill, files, gaps, aiConfigured, flushSaves, onChange, onRemoved }: Props) {
  const [name, setName] = React.useState(skill.name);
  const [nameError, setNameError] = React.useState<string | null>(null);
  const [purpose, setPurpose] = React.useState(skill.purpose);
  const [busy, setBusy] = React.useState<"generate" | "remove" | null>(null);
  const confirmRef = React.useRef<ConfirmDialogHandle>(null);
  const purposeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPurpose = React.useRef<string | null>(null);
  const generating = skill.status === "GENERATING";
  const latest = skill.versions[0] ?? null;
  const renamed = skill.latestVersion > 0 && latest !== null && latest.name !== skill.name;
  const ids = { name: `skill-name-${skill.id}`, nameError: `skill-name-error-${skill.id}`, purpose: `skill-purpose-${skill.id}`, files: `skill-files-${skill.id}` };

  const savePurpose = React.useCallback(
    async (options: SaveOptions = {}) => {
      if (purposeTimer.current) clearTimeout(purposeTimer.current);
      purposeTimer.current = null;
      const value = pendingPurpose.current;
      pendingPurpose.current = null;
      if (value === null || !value.trim()) return;
      const result = await patchJobSkill(jobId, skill.id, { purpose: value }, options);
      if (!result.ok) toast.error(result.message);
      else onChange(result.data);
    },
    [jobId, skill.id, onChange],
  );
  // Leaving the page or the step never drops a typed purpose.
  React.useEffect(() => () => void savePurpose(), [savePurpose]);

  function updatePurpose(value: string) {
    setPurpose(value);
    pendingPurpose.current = value;
    if (purposeTimer.current) clearTimeout(purposeTimer.current);
    purposeTimer.current = setTimeout(() => void savePurpose(), SAVE_DELAY_MS);
  }

  async function saveName() {
    const value = name.trim();
    if (!value || value === skill.name) {
      setName(skill.name);
      setNameError(null);
      return;
    }
    const result = await patchJobSkill(jobId, skill.id, { name: value });
    if (!result.ok) {
      if (INLINE_NAME_ERRORS.has(result.code)) setNameError(result.message);
      else {
        toast.error(result.message);
        setName(skill.name);
      }
      return;
    }
    setNameError(null);
    setName(result.data.name);
    onChange(result.data);
  }

  async function toggleFile(fileId: string) {
    const next = skill.fileIds.includes(fileId) ? skill.fileIds.filter((id) => id !== fileId) : [...skill.fileIds, fileId];
    const result = await patchJobSkill(jobId, skill.id, { fileIds: next });
    if (!result.ok) return void toast.error(result.message);
    onChange(result.data);
  }

  async function generate() {
    if (gaps > 0) {
      const confirmed = await confirmRef.current?.open({
        title: `${unansweredPhrase(gaps)} — the skill will be more general. Generate anyway?`,
        confirmLabel: "Generate anyway",
      });
      if (!confirmed) return;
    }
    setBusy("generate");
    await flushSaves();
    await savePurpose();
    const result = await generateJobSkill(jobId, skill.id);
    setBusy(null);
    if (!result.ok) return void toast.error(result.message);
    onChange(result.data);
  }

  async function remove() {
    const confirmed = await confirmRef.current?.open({
      title: `Remove ${skill.name}?`,
      description: "This deletes all its versions.",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!confirmed) return;
    setBusy("remove");
    const result = await removeJobSkill(jobId, skill.id);
    setBusy(null);
    if (!result.ok) return void toast.error(result.message);
    onRemoved(skill.id);
  }

  return (
    <article className="glass rounded-[1.75rem] p-5" aria-label={`Skill ${skill.name}`}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <label htmlFor={ids.name} className="sr-only">Skill name</label>
          <Input
            id={ids.name}
            value={name}
            maxLength={120}
            disabled={generating}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? ids.nameError : undefined}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => void saveName()}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            className="bg-white/60 font-mono text-base font-semibold dark:bg-white/5"
          />
          {nameError && (
            <p id={ids.nameError} className="mt-1 text-xs text-destructive">{nameError}</p>
          )}
        </div>
        {generating ? null : skill.status === "READY" ? (
          <Badge variant="success" className="mt-3">v{skill.latestVersion} ready</Badge>
        ) : skill.status === "DRAFT" ? (
          <Badge variant="secondary" className="mt-3">Draft</Badge>
        ) : null}
      </div>

      <label htmlFor={ids.purpose} className="mt-4 block text-sm font-medium">Purpose</label>
      <Textarea
        id={ids.purpose}
        value={purpose}
        maxLength={PURPOSE_MAX}
        onChange={(e) => updatePurpose(e.target.value)}
        onBlur={() => void savePurpose()}
        className="mt-2 min-h-20 bg-white/60 dark:bg-white/5"
      />

      <fieldset className="mt-4">
        <legend className="text-sm font-medium">Files this skill uses</legend>
        {files.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">No files in this job yet. Add some in Files.</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {files.map((f) => {
              const on = skill.fileIds.includes(f.id);
              return (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={on}
                  disabled={generating}
                  onClick={() => void toggleFile(f.id)}
                  className={cn(
                    "min-h-11 max-w-full truncate rounded-full px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-50 sm:min-h-9",
                    on ? "bg-primary/10 text-primary ring-1 ring-primary/30" : "bg-white/55 text-muted-foreground hover:text-foreground dark:bg-white/5",
                  )}
                >
                  {f.fileName}
                </button>
              );
            })}
          </div>
        )}
      </fieldset>

      {generating && (
        <p role="status" className="mt-4 flex items-center gap-2 rounded-xl bg-primary/5 px-3 py-2 text-sm">
          <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
          Writing… (this can take a minute or two)
        </p>
      )}
      {!generating && skill.status === "FAILED" && (
        <div role="alert" className="mt-4 rounded-2xl bg-destructive/10 p-4 text-sm text-destructive">
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="size-4" aria-hidden />
            Last attempt failed
          </p>
          {skill.validationErrors.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {skill.validationErrors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          {skill.latestVersion > 0 && <p className="mt-2 text-foreground">v{skill.latestVersion} is still available.</p>}
        </div>
      )}
      {renamed && <p className="mt-3 text-xs text-muted-foreground">Renamed — generate again to use the new name</p>}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" className="min-h-11 text-muted-foreground hover:text-destructive sm:min-h-8" disabled={generating || busy !== null} onClick={() => void remove()}>
          <Trash2 className="size-4" aria-hidden />
          Remove<span className="sr-only">: {skill.name}</span>
        </Button>
        <Button size="lg" disabled={generating || busy !== null || !aiConfigured} onClick={() => void generate()}>
          {busy === "generate" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Wand2 className="size-4" aria-hidden />}
          {skill.latestVersion === 0 ? "Generate" : `Generate v${skill.latestVersion + 1}`}
        </Button>
      </div>

      {skill.versions.length > 0 && <VersionPreview jobId={jobId} skill={skill} />}
      <ConfirmDialog ref={confirmRef} />
    </article>
  );
}
```

- [ ] **Step 8: Write the skills panel**

Replace the whole of `apps/web/src/app/(app)/prompt-bot/skills/[jobId]/skills-panel.tsx` with:

```tsx
"use client";
import * as React from "react";
import { Loader2, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, type ConfirmDialogHandle } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { addJobSkill, suggestSkills } from "@/lib/skills/jobs/client";
import type { JobSkillView, JobView } from "@/lib/skills/jobs/types";
import { JOB_LIMITS } from "@/lib/skills/limits";
import { SkillCard, unansweredPhrase } from "./skill-card";

const INLINE_ADD_ERRORS = new Set(["DUPLICATE_NAME", "TOO_MANY_SKILLS", "VALIDATION_ERROR"]);

type Props = {
  job: JobView;
  gaps: number;
  aiConfigured: boolean;
  flushSaves(): Promise<void>;
  onJobChange(job: JobView): void;
  onSkillChange(skill: JobSkillView): void;
  onSkillRemoved(skillId: string): void;
};

/** Step 4: suggested and added skills, each generated into versions. */
export function SkillsPanel({ job, gaps, aiConfigured, flushSaves, onJobChange, onSkillChange, onSkillRemoved }: Props) {
  const [suggesting, setSuggesting] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [name, setName] = React.useState("");
  const [purpose, setPurpose] = React.useState("");
  const [addError, setAddError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const confirmRef = React.useRef<ConfirmDialogHandle>(null);
  const drafts = job.skills.filter((s) => s.latestVersion === 0).length;
  const full = job.skills.length >= JOB_LIMITS.skillsPerJob;
  const hasSkills = job.skills.length > 0;

  async function suggest() {
    if (gaps > 0) {
      const confirmed = await confirmRef.current?.open({
        title: `${unansweredPhrase(gaps)} — suggestions will be more general. Suggest anyway?`,
        ...(drafts > 0 ? { description: "This replaces the skills you haven't generated yet." } : {}),
        confirmLabel: "Suggest anyway",
      });
      if (!confirmed) return;
    }
    setSuggesting(true);
    await flushSaves();
    const result = await suggestSkills(job.id);
    setSuggesting(false);
    if (!result.ok) return void toast.error(result.message);
    onJobChange(result.data);
  }

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || !purpose.trim() || saving) return;
    setSaving(true);
    const result = await addJobSkill(job.id, { name, purpose });
    setSaving(false);
    if (!result.ok) {
      if (INLINE_ADD_ERRORS.has(result.code)) setAddError(result.message);
      else toast.error(result.message);
      return;
    }
    setName("");
    setPurpose("");
    setAddError(null);
    setAdding(false);
    onSkillChange(result.data);
  }

  const suggestButton = (
    <Button size="lg" variant={hasSkills ? "outline" : "default"} disabled={!aiConfigured || suggesting} onClick={() => void suggest()}>
      {suggesting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
      {suggesting ? "Suggesting…" : hasSkills ? "Suggest again" : "Suggest skills"}
    </Button>
  );

  return (
    <section className="flex flex-col gap-4" aria-labelledby="skills-heading">
      {hasSkills ? (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="skills-heading" className="text-lg font-semibold">Skills for this job</h2>
            <p className="text-sm text-muted-foreground">Rename, remove or add skills, choose their files, then generate each one.</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            {suggestButton}
            <span className="text-xs text-muted-foreground">Keeps skills you&apos;ve generated and replaces the drafts.</span>
          </div>
        </div>
      ) : (
        <div className="glass flex flex-col items-center gap-3 rounded-[1.75rem] p-8 text-center">
          <h2 id="skills-heading" className="text-lg font-semibold">Skills</h2>
          <p className="max-w-md text-sm text-muted-foreground">Let the AI suggest the skills for this job.</p>
          <p className="max-w-md text-xs text-muted-foreground">Usually one. More only when the job has clearly separate parts.</p>
          {suggestButton}
        </div>
      )}

      {job.skills.length > 0 && (
        <ul className="flex flex-col gap-4">
          {job.skills.map((s) => (
            <li key={s.id}>
              <SkillCard
                jobId={job.id}
                skill={s}
                files={job.files}
                gaps={gaps}
                aiConfigured={aiConfigured}
                flushSaves={flushSaves}
                onChange={onSkillChange}
                onRemoved={onSkillRemoved}
              />
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <form onSubmit={add} className="glass rounded-[1.75rem] p-5" aria-label="Add a skill">
          <label htmlFor="new-skill-name" className="text-sm font-medium">New skill name</label>
          <Input
            id="new-skill-name"
            autoFocus
            value={name}
            maxLength={120}
            onChange={(e) => {
              setName(e.target.value);
              setAddError(null);
            }}
            placeholder="e.g. Weekly report"
            aria-invalid={addError ? true : undefined}
            aria-describedby={addError ? "new-skill-error" : undefined}
            className="mt-2 bg-white/60 font-mono dark:bg-white/5"
          />
          <label htmlFor="new-skill-purpose" className="mt-4 block text-sm font-medium">What it does</label>
          <Textarea
            id="new-skill-purpose"
            value={purpose}
            maxLength={300}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="One sentence: what it produces and when it is used."
            className="mt-2 min-h-20 bg-white/60 dark:bg-white/5"
          />
          {addError && (
            <p id="new-skill-error" className="mt-2 text-sm text-destructive">{addError}</p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setAdding(false);
                setAddError(null);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || !purpose.trim() || saving}>
              {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Add
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col items-start gap-1">
          <Button variant="outline" size="lg" disabled={full} onClick={() => setAdding(true)}>
            <Plus className="size-4" aria-hidden />
            Add skill
          </Button>
          {full && <span className="text-xs text-muted-foreground">A job can have at most {JOB_LIMITS.skillsPerJob} skills.</span>}
        </div>
      )}
      <ConfirmDialog ref={confirmRef} />
    </section>
  );
}
```

- [ ] **Step 9: Run the tests and watch them pass**

Run: `npx vitest run "src/app/(app)/prompt-bot/skills/[jobId]"`
Expected: PASS (version-preview, skill-card, skills-panel, plus Tasks 18–20's tests).

- [ ] **Step 10: Prove there is no `window.confirm` left in the Skills Builder**

Run: `grep -rn "window.confirm\|[^.]confirm(" "src/app/(app)/prompt-bot/skills" src/components/prompt-bot/skills --include=*.tsx`
Expected: no output.

- [ ] **Step 11: Accessibility check**

Invoke the `fixing-accessibility` skill with the Skill tool for `skills-panel.tsx`, `skill-card.tsx` and `version-preview.tsx`: each card is a named `article`; the name field has a label and its error is tied with `aria-describedby` and `aria-invalid`; file chips are toggle buttons with `aria-pressed` inside a `fieldset`/`legend`; "Writing…" is a `status`, a failed attempt an `alert`; the version `select` is labelled; Remove names its skill; dialogs return focus to the button that opened them (Radix default). Fix what it reports and re-run Step 9.

- [ ] **Step 12: Typecheck, lint and commit**

```bash
npx tsc --noEmit && npx eslint "src/app/(app)/prompt-bot/skills"
git add "src/app/(app)/prompt-bot/skills/[jobId]/skills-panel.tsx" "src/app/(app)/prompt-bot/skills/[jobId]/skill-card.tsx" "src/app/(app)/prompt-bot/skills/[jobId]/version-preview.tsx" "src/app/(app)/prompt-bot/skills/[jobId]/skills-panel.test.ts" "src/app/(app)/prompt-bot/skills/[jobId]/skill-card.test.ts" "src/app/(app)/prompt-bot/skills/[jobId]/version-preview.test.ts"
git commit -m "feat(skills-builder): add the skills step with suggestions, versions and downloads"
```

---

### Batch 3 gate

- [ ] **Step 1: Full suite and static checks**

```bash
cd "/Users/tharunkumarl/Full Stack/lms/apps/web"
npx vitest run && npx tsc --noEmit && npx eslint src/ && npx next build
```
Expected: every test passes, no type or lint errors, and the build lists `/prompt-bot/skills`, `/prompt-bot/skills/[jobId]` and `/prompt-bot/skills/legacy/[packId]` and no `/prompt-bot/catalog`.

- [ ] **Step 2: Quick look at 360 px and in dark mode**

```bash
npm run dev
```
Signed in with a local account, open `/prompt-bot/skills`, start a job, and walk the four steps (no AI key is needed to see the layout; with no key the AI actions are disabled and the notice shows). Check at 360 × 740 (browser device toolbar) and with the theme switched to dark:
- no horizontal scroll on any step; the step buttons wrap; the header actions wrap under the title;
- every control is at least 44 px tall on the phone width;
- the Files drop zone, file cards, question panel (stacked above the answer box), skill cards and the version preview are readable in dark mode (no white-on-white, focus rings visible);
- the legacy page (open any old pack from "Earlier skill packs") shows no edit controls.

Fix anything found in the owning task's files with a failing test first, then re-run Step 1. Stop the dev server. Do not start Batch 4 until this gate is green.

---

## Batch 4 — End to end (Tasks 22–23)

Batch 4 starts only when the Batch 3 gate is green. Task 22 changes test tooling only (the fake API, a fixture writer and its script). Task 23 changes no production code.

### Task 22: Fake Anthropic shapes and E2E fixture files

**Files:**
- Modify: `apps/web/scripts/fake-anthropic.mjs` (complete replacement below)
- Create: `apps/web/src/lib/skills/files/e2e-fixtures.ts` (writes the browser-run fixture files; test and script only)
- Create: `apps/web/scripts/make-skill-fixtures.ts`
- Test: `apps/web/src/lib/skills/files/e2e-fixtures.test.ts`

**Interfaces:**
- Consumes (Task 3–7 fixtures and parsers): `buildPptx`, `buildDocx`, `buildXlsx`, `tinyPdf`, `tinyPng`, `oleHeader`, `sha256Hex` from `src/lib/skills/files/fixtures.ts`; `readUpload(bytes): Promise<ReadUpload>` from `src/lib/skills/files/extract.ts`; `FileReadError` (`code`) from `src/lib/skills/files/types.ts`. Wire shapes the app sends (Task 8): analysis = `messages.create` with `system: ANALYSE_SYSTEM` (contains "style guide"), user `content` an array of blocks (`document` and/or `image` first, then `text`), no `output_config.format`; suggest = `beta.messages.create` whose `output_config.format.schema.properties` has `skills`, user text listing files as `- id: <id> …` (`buildSuggestMessage`); job generation = schema properties with `body` and without `assets`, retry text contains `<validation_errors>` (`buildJobRetryMessage`); scoring = system containing "assess how well" (unchanged); enhance = streaming (unchanged).
- Produces:
  - `export type WrittenFixture = { name: string; path: string; bytes: number; sha256: string }`
  - `export const VALID_FIXTURES = ["deck.pptx", "brief.docx", "numbers.xlsx", "brand.pdf", "logo.png", "big-deck.pptx"] as const`
  - `export const LOCKED_FIXTURE = "locked.docx"`
  - `export async function writeSkillFixtures(outDir: string, options?: { bigDeckBytes?: number }): Promise<WrittenFixture[]>` (default `bigDeckBytes` 12 MB)
  - CLI: `npx tsx scripts/make-skill-fixtures.ts <outDir>` prints `<sha256>  <name>  <bytes>` per file.
  - Fake API logs exactly: `[fake] analyse pdf`, `[fake] analyse image`, `[fake] analyse text`, `[fake] suggest`, `[fake] generate`, `[fake] generate (retry)`, `[fake] score`, `[fake] enhance`. Never request text.

The fixture writer imports only `./fixtures` and Node built-ins with relative paths, so `tsx` loads it without the `@/` alias.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/skills/files/e2e-fixtures.test.ts
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LOCKED_FIXTURE, VALID_FIXTURES, writeSkillFixtures, type WrittenFixture } from "./e2e-fixtures";
import { readUpload } from "./extract";
import { sha256Hex } from "./fixtures";
import { FileReadError } from "./types";

const EXPECTED_KIND: Record<(typeof VALID_FIXTURES)[number], string> = {
  "deck.pptx": "PPTX",
  "brief.docx": "DOCX",
  "numbers.xlsx": "XLSX",
  "brand.pdf": "PDF",
  "logo.png": "PNG",
  "big-deck.pptx": "PPTX",
};

let dir = "";
let written: WrittenFixture[] = [];

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "skill-fixtures-"));
  // A small padded deck keeps the test fast; the CLI default is 12 MB.
  written = await writeSkillFixtures(dir, { bigDeckBytes: 256 * 1024 });
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("writeSkillFixtures", () => {
  it("writes every browser-run fixture with its size and SHA-256", async () => {
    expect(written.map((f) => f.name).sort()).toEqual([...VALID_FIXTURES, LOCKED_FIXTURE].sort());
    for (const file of written) {
      const bytes = new Uint8Array(await readFile(file.path));
      expect(file.path).toBe(path.join(dir, file.name));
      expect(file.bytes).toBe(bytes.byteLength);
      expect(file.sha256).toBe(sha256Hex(bytes));
    }
  });

  it("pads big-deck.pptx to the requested size", () => {
    const big = written.find((f) => f.name === "big-deck.pptx")!;
    expect(big.bytes).toBeGreaterThanOrEqual(256 * 1024);
  });

  it("produces files the upload reader accepts, each as its own kind", async () => {
    for (const name of VALID_FIXTURES) {
      const bytes = new Uint8Array(await readFile(path.join(dir, name)));
      const result = await readUpload(bytes);
      expect(result.kind, name).toBe(EXPECTED_KIND[name]);
      expect(result.facts.kind, name).toBe(EXPECTED_KIND[name]);
    }
  });

  it("gives the deck real theme colours for the analysis to quote", async () => {
    const result = await readUpload(new Uint8Array(await readFile(path.join(dir, "deck.pptx"))));
    if (result.facts.kind !== "PPTX") throw new Error("expected PPTX facts");
    expect(result.facts.theme?.colors).toContainEqual({ slot: "accent1", hex: "#1F4E79" });
    expect(result.facts.slideCount).toBe(3);
  });

  it("makes locked.docx an OLE file that the reader refuses as encrypted", async () => {
    const bytes = new Uint8Array(await readFile(path.join(dir, LOCKED_FIXTURE)));
    const error = await readUpload(bytes).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FileReadError);
    expect((error as FileReadError).code).toBe("FILE_ENCRYPTED");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd "/Users/tharunkumarl/Full Stack/lms/apps/web" && npx vitest run src/lib/skills/files/e2e-fixtures.test.ts`
Expected: FAIL with `Failed to resolve import "./e2e-fixtures"`.

- [ ] **Step 3: Write the fixture writer and its script**

Fixture colours are given as OOXML writes them (`srgbClr@val`, six hex digits without `#`); the extractor reports them as `#1F4E79`.

```ts
// apps/web/src/lib/skills/files/e2e-fixtures.ts
/**
 * Test and E2E tooling only: writes the files the browser run uploads, built by the same
 * fixture builders the unit tests use. Relative imports only (scripts load this through tsx).
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildDocx, buildPptx, buildXlsx, oleHeader, sha256Hex, tinyPdf, tinyPng, type FixtureTheme } from "./fixtures";

export type WrittenFixture = { name: string; path: string; bytes: number; sha256: string };

export const VALID_FIXTURES = ["deck.pptx", "brief.docx", "numbers.xlsx", "brand.pdf", "logo.png", "big-deck.pptx"] as const;
export const LOCKED_FIXTURE = "locked.docx";

const BIG_DECK_BYTES = 12 * 1024 * 1024;

const THEME: FixtureTheme = {
  name: "Acme Board",
  colors: { dk1: "1A1A1A", lt1: "FFFFFF", dk2: "0B2545", lt2: "EEF2F7", accent1: "1F4E79", accent2: "E07A1F", accent3: "2E8B57" },
  majorFont: "Montserrat",
  minorFont: "Source Sans Pro",
};

function deck(padBytes?: number): Uint8Array {
  return buildPptx({
    theme: THEME,
    slideSize: { cx: 12_192_000, cy: 6_858_000 },
    masters: ["Acme Master"],
    layouts: ["Title Slide", "Title and Content", "Two Content"],
    slides: [
      { title: "Q3 board update", body: ["Acme Corp", "October 2026"], layout: 1, colors: ["1F4E79"], fonts: ["Montserrat"] },
      { title: "Revenue and runway", body: ["ARR up 18% quarter on quarter", "Runway 22 months"], layout: 2, chart: true },
      { title: "Hiring plan", body: ["Four engineering hires", "One product designer"], layout: 3, table: true, picture: true },
    ],
    ...(padBytes ? { padBytes } : {}),
  });
}

async function build(options: { bigDeckBytes?: number }): Promise<Record<string, Uint8Array>> {
  return {
    "deck.pptx": deck(),
    "brief.docx": buildDocx({
      theme: THEME,
      defaults: { font: "Source Sans Pro", sizePt: 11 },
      styles: [
        { id: "Title", name: "Title", font: "Montserrat", sizePt: 28, color: "0B2545", bold: true },
        { id: "Heading1", name: "heading 1", font: "Montserrat", sizePt: 16, color: "1F4E79", bold: true, basedOn: "Normal" },
      ],
      paragraphs: [
        { text: "Board brief", style: "Title" },
        { text: "Summary", style: "Heading1" },
        { text: "Numbers first, no surprises. One page, plain words." },
        { text: "Risks", style: "Heading1" },
        { text: "Name each risk with an owner and a date." },
      ],
      page: { widthIn: 8.27, heightIn: 11.69, orientation: "portrait" },
      tables: 1,
    }),
    "numbers.xlsx": buildXlsx({
      theme: THEME,
      sheets: [
        {
          name: "Monthly KPIs",
          rows: [
            ["Month", "ARR", "Burn", "Runway (months)"],
            ["2026-08", 1_200_000, 180_000, { formula: "B2/C2", value: 6.67 }],
            ["2026-09", 1_310_000, 175_000, { formula: "B3/C3", value: 7.49 }],
          ],
        },
        { name: "Headcount", rows: [["Team", "Now", "Plan"], ["Engineering", 14, 18]], inlineStrings: true },
      ],
      numFmts: ['"$"#,##0', "0.0%"],
      definedNames: ["Runway"],
      charts: 1,
    }),
    "brand.pdf": tinyPdf({ pages: 3, title: "Acme brand book" }),
    "logo.png": await tinyPng(320, 120),
    "big-deck.pptx": deck(options.bigDeckBytes ?? BIG_DECK_BYTES),
    [LOCKED_FIXTURE]: oleHeader(),
  };
}

export async function writeSkillFixtures(outDir: string, options: { bigDeckBytes?: number } = {}): Promise<WrittenFixture[]> {
  await mkdir(outDir, { recursive: true });
  const files = await build(options);
  const written: WrittenFixture[] = [];
  for (const [name, bytes] of Object.entries(files)) {
    const target = path.join(outDir, name);
    await writeFile(target, bytes);
    written.push({ name, path: target, bytes: bytes.byteLength, sha256: sha256Hex(bytes) });
  }
  return written;
}
```

```ts
// apps/web/scripts/make-skill-fixtures.ts
// Writes the Skills Builder end-to-end fixture files and prints their SHA-256.
// Usage: npx tsx scripts/make-skill-fixtures.ts <outDir>
import { writeSkillFixtures } from "../src/lib/skills/files/e2e-fixtures";

async function main() {
  const outDir = process.argv[2];
  if (!outDir) {
    console.error("Usage: npx tsx scripts/make-skill-fixtures.ts <outDir>");
    process.exit(1);
  }
  for (const file of await writeSkillFixtures(outDir)) console.log(`${file.sha256}  ${file.name}  ${file.bytes}`);
}

void main();
```

- [ ] **Step 4: Replace the fake API**

```js
// apps/web/scripts/fake-anthropic.mjs
// Local stand-in for the Anthropic Messages API, for Prompt Bot and Skills Builder end-to-end
// runs without an API key. Speaks the real wire formats: SSE for streaming, JSON for everything
// else (plain text for file analysis, JSON text for structured outputs).
// Run: node scripts/fake-anthropic.mjs (port 4010), then start the app with
//   ANTHROPIC_BASE_URL=http://127.0.0.1:4010 ANTHROPIC_API_KEY=test
// FAKE_FIRST_INVALID=1 makes the first job-skill draft fail validation (exercises the retry).
// Logs only which kind of call arrived, never request text.
import http from "node:http";

const PORT = Number(process.env.FAKE_ANTHROPIC_PORT ?? 4010);

// Same shape as a real prompt-bot-v2 reply: sections addressed to the AI, no placeholders,
// and missing details turned into clarifying questions in the Iteration request.
const ENHANCED = `## Persona
You are an experienced freelance copywriter who wins first clients through short, specific cold emails.

## Context
I am a freelance designer looking for my first paying client. I want to email small business owners who have outdated websites.

## Data
- Offer: a one-page website redesign delivered in two weeks.
- Proof: three practice projects for local cafés.

## Output expectations
Write one cold email under 150 words with:
- A subject line under 8 words.
- A first sentence about the reader's business, not about me.
- One low-pressure call to action: a 15-minute call.

## Iteration request
Before you write, ask me these questions and wait for my answers:
1. Which industry should the email target?
2. What tone should it have: formal, friendly or bold?
3. Is there a price or discount to mention?

Then write the email and offer two alternative subject lines.
`;

// The six sections ANALYSE_SYSTEM asks for, with real hex values.
const ANALYSIS = `## Colours
- Primary navy \`#1F4E79\` for titles and chart series one.
- Accent orange \`#E07A1F\` for highlights and call-outs.
- Background white \`#FFFFFF\`, body text near-black \`#1A1A1A\`.

## Fonts
- Headings: Montserrat, bold.
- Body: Source Sans Pro, 11–18 pt.

## Layout
16:9 slides (13.33 × 7.5 in). Layouts used: Title Slide, Title and Content, Two Content.

## Structure
Title slide, then one slide per topic: revenue and runway (chart), hiring plan (table).

## Tone and content
Numbers first, short bullet points, no surprises.

## Reusing this file
Start from the original file and reuse its master and layouts instead of recreating the design.
`;

function scoreFor(user) {
  const questions = [...user.matchAll(/- id: (\S+)\n {2}question: (.*)\n/g)];
  const written = user.split("<text>")[1] ?? "";
  return questions.map(([, id, q]) => ({
    questionId: id,
    score: written.includes(q) ? 3 : 1,
    reason: written.includes(q) ? "Answered with specifics" : "Only hinted at in the prompt",
  }));
}

const VALID_JOB_DRAFT = {
  description:
    'Writes the monthly board update from rough notes and this month\'s numbers, in the house style: numbers first, "no surprises". Use when asked for a board update, an investor update or a monthly summary deck.',
  compatibility: "",
  body:
    "# Board update writer\n\nRead `references/company-context.md` before writing, because the board expects the same framing every month.\n\n1. Ask for this month's numbers if they are missing.\n2. Draft the update, then run `scripts/word_count.py` on it and keep it under 400 words.\n3. Build the deck from the bundled template and follow `references/style-guide.md` for colours and fonts.\n",
  references: [
    { path: "company-context.md", content: "# Company context\n\n[Add your company's tone of voice here]\n" },
    // The server writes references/style-guide.md itself and must drop this one.
    { path: "style-guide.md", content: "# A style guide the model should not have written\n" },
  ],
  scripts: [{ path: "scripts/word_count.py", content: "import sys\nprint(len(sys.stdin.read().split()))\n", purpose: "Counts the words in a draft read from standard input." }],
};

/** Every block type in the first user message, so analysis calls can be told apart without reading their text. */
function blockTypes(content) {
  return Array.isArray(content) ? content.map((block) => block?.type).filter((type) => typeof type === "string") : ["text"];
}

/** The text the app wrote into the first user message (string content, or the text blocks of an array). */
function userText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n");
}

// Skills Builder shapes, recognised by the JSON schema the app sends.
function skillsStructured(props, user) {
  if ("skills" in props) {
    console.log("[fake] suggest");
    const ids = [...new Set([...user.matchAll(/- id: (\S+)/g)].map((m) => m[1]))];
    return {
      skills: [
        { name: "Board Update Writer", purpose: "Writes the monthly board update and deck from my notes and numbers.", fileIds: [...ids, "file_that_does_not_exist"] },
        { name: "board update writer", purpose: "A near-duplicate name, to check that names are made unique.", fileIds: ids.slice(0, 1) },
      ],
    };
  }
  if ("body" in props && !("assets" in props)) {
    const retry = user.includes("<validation_errors>");
    console.log(`[fake] generate${retry ? " (retry)" : ""}`);
    return process.env.FAKE_FIRST_INVALID && !retry ? { ...VALID_JOB_DRAFT, description: "Uses <angle> brackets, which the validator rejects" } : VALID_JOB_DRAFT;
  }
  return null;
}

function structured(system, user) {
  if (system.includes("assess how well")) {
    console.log("[fake] score");
    return { scores: scoreFor(user) };
  }
  return { note: "unknown structured request" };
}

function send(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function message(res, id, model, text, outputTokens) {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      id, type: "message", role: "assistant", model,
      content: [{ type: "text", text }],
      stop_reason: "end_turn", stop_sequence: null,
      usage: { input_tokens: 100, output_tokens: outputTokens },
    }),
  );
}

http
  .createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", async () => {
      if (req.method !== "POST" || !req.url?.startsWith("/v1/messages")) {
        res.writeHead(404).end();
        return;
      }
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      } catch {
        res.writeHead(400).end();
        return;
      }
      const system = typeof body.system === "string" ? body.system : JSON.stringify(body.system ?? "");
      const first = body.messages?.[0]?.content;
      const user = userText(first);
      const model = body.model ?? "claude-haiku-4-5";
      const id = `msg_fake_${Date.now()}`;

      if (body.stream) {
        console.log("[fake] enhance");
        res.writeHead(200, { "content-type": "text/event-stream" });
        send(res, "message_start", {
          type: "message_start",
          message: { id, type: "message", role: "assistant", model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 100, output_tokens: 0 } },
        });
        send(res, "content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
        for (const piece of ENHANCED.match(/.{1,12}/gs) ?? []) {
          send(res, "content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: piece } });
          await new Promise((r) => setTimeout(r, 15));
        }
        send(res, "content_block_stop", { type: "content_block_stop", index: 0 });
        send(res, "message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 180 } });
        send(res, "message_stop", { type: "message_stop" });
        res.end();
        return;
      }

      // File analysis: plain text reply (no output_config.format); the block types say what was sent.
      if (system.includes("style guide") && !body.output_config?.format) {
        const types = blockTypes(first);
        const kind = types.includes("document") ? "pdf" : types.includes("image") ? "image" : "text";
        console.log(`[fake] analyse ${kind}`);
        await new Promise((r) => setTimeout(r, 400)); // long enough for the UI to show "Analysing…"
        message(res, id, model, ANALYSIS, 300);
        return;
      }

      const props = body.output_config?.format?.schema?.properties ?? {};
      const payload = skillsStructured(props, user) ?? structured(system, user);
      message(res, id, model, JSON.stringify(payload), 80);
    });
  })
  .listen(PORT, "127.0.0.1", () => console.log(`fake anthropic on http://127.0.0.1:${PORT}`));
```

- [ ] **Step 5: Run the test and check the fake API by hand**

Run: `cd "/Users/tharunkumarl/Full Stack/lms/apps/web" && npx vitest run src/lib/skills/files/e2e-fixtures.test.ts`
Expected: PASS (5 tests).

Then:

```bash
cd "/Users/tharunkumarl/Full Stack/lms/apps/web"
node scripts/fake-anthropic.mjs & FAKE=$!
sleep 1
curl -s http://127.0.0.1:4010/v1/messages -H 'content-type: application/json' \
  -d '{"model":"claude-haiku-4-5","system":"Write a style guide","messages":[{"role":"user","content":[{"type":"document","source":{"type":"base64","media_type":"application/pdf","data":"JVBERi0="}},{"type":"text","text":"x"}]}]}' \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).content[0].text.split("\n")[0]))'
curl -s http://127.0.0.1:4010/v1/messages -H 'content-type: application/json' \
  -d '{"model":"claude-opus-5-5","messages":[{"role":"user","content":"- id: f1 name: deck.pptx\n- id: f2 name: brief.docx"}],"output_config":{"format":{"type":"json_schema","schema":{"properties":{"skills":{}}}}}}' \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(JSON.parse(s).content[0].text).skills[0].fileIds.join(",")))'
curl -s http://127.0.0.1:4010/v1/messages -H 'content-type: application/json' \
  -d '{"model":"claude-opus-5-5","messages":[{"role":"user","content":"x"}],"output_config":{"format":{"type":"json_schema","schema":{"properties":{"body":{},"description":{}}}}}}' \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(Object.keys(JSON.parse(JSON.parse(s).content[0].text)).sort().join(",")))'
kill $FAKE
npx tsx scripts/make-skill-fixtures.ts "${TMPDIR:-/tmp}/skills-fixture-check" && ls -la "${TMPDIR:-/tmp}/skills-fixture-check"
```

Expected: the first reply prints `## Colours`; the second prints `f1,f2,file_that_does_not_exist`; the third prints `body,compatibility,description,references,scripts`; the server log shows `[fake] analyse pdf`, `[fake] suggest`, `[fake] generate` and nothing from the request bodies. The script prints seven `<sha256>  <name>  <bytes>` lines and `big-deck.pptx` is at least 12 582 912 bytes (12 MB). Remove the check folder afterwards.

- [ ] **Step 6: Commit**

```bash
cd "/Users/tharunkumarl/Full Stack/lms"
git add apps/web/scripts/fake-anthropic.mjs apps/web/scripts/make-skill-fixtures.ts apps/web/src/lib/skills/files/e2e-fixtures.ts apps/web/src/lib/skills/files/e2e-fixtures.test.ts
git commit -m "test(skills-builder): fake API shapes for jobs and E2E fixture files"
```

---

### Task 23: End-to-end verification

Use the `agent-browser:agent-browser` skill (invoke it with the Skill tool first) for every browser command, in an isolated session. Do not change production code in this task. If a step fails, fix it in the owning task's files with a failing test first, commit there, then re-run this task from Step 1.

**Files:** none (verification only; temporary output under `$TMPDIR/skills-jobs-e2e/`, never committed).

**Interfaces:**
- Consumes: everything in the Interface Contract; `writeSkillFixtures` via `scripts/make-skill-fixtures.ts` and the fake API from Task 22; routes `GET /api/v1/prompt-bot/skill-jobs/:id/download`, `GET …/skills/:skillId/versions/:version/download?format=upload|pack`, `GET /api/v1/prompt-bot/skill-packs/:id/download`.
- Produces: a pass/fail report for the human partner (oracle results, screenshots taken on failure, the production checklist).

- [ ] **Step 1: Full suite and static checks**

```bash
cd "/Users/tharunkumarl/Full Stack/lms/apps/web"
npx vitest run && npx tsc --noEmit && npx eslint src/ && npx next build
```
Expected: all green. `next build` lists the `skill-jobs` routes and no `skill-catalog` or `/prompt-bot/catalog` routes.

- [ ] **Step 2: Start the fake API and the app, and write the fixtures**

```bash
cd "/Users/tharunkumarl/Full Stack/lms/apps/web"
OUT="${TMPDIR:-/tmp}/skills-jobs-e2e"
rm -rf "$OUT" && mkdir -p "$OUT"
npx tsx scripts/make-skill-fixtures.ts "$OUT/in" | tee "$OUT/fixtures.sha256"
FAKE_FIRST_INVALID=1 node scripts/fake-anthropic.mjs > "$OUT/fake.log" 2>&1 &      # 127.0.0.1:4010
ANTHROPIC_BASE_URL=http://127.0.0.1:4010 ANTHROPIC_API_KEY=test npm run dev > "$OUT/dev.log" 2>&1 &
npx prisma migrate status
```
Expected: seven fixture lines; `fake anthropic on http://127.0.0.1:4010` in `fake.log`; the dev server answers on `http://localhost:3000`; `migrate status` reports the schema up to date including `20261125120000_add_skill_jobs`.

- [ ] **Step 3: Seed one legacy pack for the participant account**

Pick a participant (MENTEE) account with an email and password in your local database and put its email in `E2E_EMAIL`. The SQL inserts one pack with one READY custom skill whose files pass the validator.

```bash
cd "/Users/tharunkumarl/Full Stack/lms/apps/web"
E2E_EMAIL="participant@example.com"   # replace with the local MENTEE account's email
cat > "$OUT/legacy.sql" <<SQL
INSERT INTO "skill_packs" ("id","user_id","title","description","role","created_at","updated_at")
SELECT 'e2e_legacy_pack', u.id, 'Legacy weekly review', 'Every Friday I review the week and plan the next one.', NULL, NOW(), NOW()
FROM "users" u WHERE u.email = '${E2E_EMAIL}' AND u.role = 'MENTEE'
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "skill_pack_items" ("id","pack_id","order","kind","catalog_entry_id","name","purpose","status","files","validation_errors","score_revision","generation_started_at","created_at","updated_at")
SELECT 'e2e_legacy_item', 'e2e_legacy_pack', 0, 'CUSTOM', NULL, 'weekly-review', 'Reviews the week and drafts next week''s plan.', 'READY',
  '[{"path":"SKILL.md","content":"---\nname: \"weekly-review\"\ndescription: \"Reviews the week and drafts the plan for the next one. Use on Fridays or when asked for a weekly review.\"\n---\n\n# Weekly review\n\nList what shipped, what slipped and why, then draft next week.\n"},{"path":"references/context.md","content":"# Context\n\n[Add your team context here]\n"}]'::jsonb,
  ARRAY[]::TEXT[], 0, NULL, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM "skill_packs" WHERE "id" = 'e2e_legacy_pack')
ON CONFLICT ("id") DO NOTHING;
SQL
npx prisma db execute --file "$OUT/legacy.sql" --schema prisma/schema.prisma
```
Expected: `Script executed successfully.` If the pack row did not appear (wrong email or role), the item insert is skipped; fix `E2E_EMAIL` and run it again.

- [ ] **Step 4: Browser run on desktop (1440 × 900)**

In an isolated `agent-browser` session, sign in as that participant through the LMS login page. Prompt Bot may be hidden from participants' navigation; open the URLs directly. Watch `$OUT/fake.log` alongside.

1. Open `/prompt-bot/skills`. Expect the "Skills Builder" header, the **New job** card, no "Manage skill catalog" link, and a collapsed **Earlier skill packs** section listing "Legacy weekly review" with a "Read-only" badge.
2. Title "Monthly board update", description "Every month I turn my notes and the KPI sheet into a board update deck and a one-page brief for the CEO.", press **Start job**. Expect the workspace with steps **1 Job · 2 Files · 3 Questions · 4 Skills** and the URL ending `#job` or no hash.
3. Go to **Files** (URL hash `#files`). Upload `deck.pptx`, `brief.docx`, `numbers.xlsx`, `brand.pdf`, `logo.png`, `big-deck.pptx` and `locked.docx` from `$OUT/in` through the upload control (`agent-browser upload`). Expect:
   - six file cards, each showing "Analysing…" and then the analysis (`## Colours … #1F4E79`) within one or two polls; `fake.log` shows `analyse text` (×4: pptx, docx, xlsx, big deck), `analyse pdf` (×1) and `analyse image` (×1);
   - `big-deck.pptx` shows "Too large to bundle — the skill will use the analysis only.";
   - `locked.docx` shows the inline error "This file is password-protected or in an old Office format. Remove the password or save it as .pptx, .docx or .xlsx, then upload it again." and no card.
4. On `brief.docx` press **Edit**, append the line "Always open with the three numbers the CEO asked for.", press **Save**. Expect the rendered analysis with that line and the "Edited by you" badge. Reload the page: the hash keeps the Files step and the edit is still there.
5. Go to **Questions**. Eight questions with 3-slice bars. Answer "When should this skill be used?" with "When the monthly board update or CEO brief is due." and "What are the steps?" with "Pull the KPI sheet, update the deck, write the brief, send to the CEO for review." Wait about 3 s: expect "Updating…" then the bars of those two questions to change and the readiness count to move. Mark one question not relevant: expect the unanswered count to drop.
6. Go to **Skills**, press **Suggest skills**. Expect exactly one `ConfirmDialog` ("… questions unanswered — suggestions will be more general. Suggest anyway?") and no browser `confirm`. Confirm. Expect two skill cards, `board-update-writer` and `board-update-writer-2`; the first has chips for every uploaded file and nothing for the bogus id. `fake.log` shows `suggest`.
7. Rename `board-update-writer-2` to "CEO Brief" and leave the field: expect `ceo-brief`. Rename it to "board update writer": expect the inline duplicate-name error and the name to stay `ceo-brief`.
8. On `board-update-writer` press **Generate**. Expect one `ConfirmDialog` (questions unanswered), confirm, then "Writing… (this can take a minute or two)" and, within a poll or two, "v1 ready". `fake.log` shows `generate` then `generate (retry)`.
9. In the v1 preview expect the file tree `SKILL.md`, `references/company-context.md`, `references/style-guide.md`, `scripts/word_count.py`, `assets/deck.pptx`, `assets/brief.docx`, `assets/numbers.xlsx`, `assets/brand.pdf`, `assets/logo.png` (no `assets/big-deck.pptx`), with sizes on the asset entries. `SKILL.md` renders and ends with "## Files in this skill", naming "big-deck.pptx" as too large to include. Open `references/style-guide.md`: it contains the line you added to `brief.docx`'s analysis and not "A style guide the model should not have written". Open `scripts/word_count.py`: "Review scripts before running them".
10. Go to **Job**, append " Include a risks section." to the description. Go back to **Skills** and press **Generate v2**. Expect the dialog again (gaps remain), confirm, then "v2 ready" (the log shows `generate` and `generate (retry)` once more). Choose `v1` in the versions select: the v1 preview still loads. Choose `v2` again.
11. Press **Download skill** and **Download as pack** for v2, then **Download all skills** in the header: no error toast. Check the browser console has no errors.
12. Fetch the zips for the oracle: with `agent-browser eval`, run the snippet below on the job page and save each output to `$OUT/upload.b64`, `$OUT/pack.b64` and `$OUT/v1-upload.b64` respectively (pass `"upload", "latest"`, then `"pack", "latest"`, then `"upload", 1`):

```js
(async (format, version) => {
  const jobId = location.pathname.split("/").pop();
  const job = (await (await fetch(`/api/v1/prompt-bot/skill-jobs/${jobId}`, { credentials: "include" })).json()).data;
  const skill = job.skills.find((s) => s.name === "board-update-writer");
  const res = await fetch(`/api/v1/prompt-bot/skill-jobs/${jobId}/skills/${skill.id}/versions/${version}/download?format=${format}`, { credentials: "include" });
  if (!res.ok) return `HTTP ${res.status}`;
  const bytes = new Uint8Array(await res.arrayBuffer());
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
})("upload", "latest")
```

13. Fetch the whole-job pack the same way from `/api/v1/prompt-bot/skill-jobs/${jobId}/download` and save it as `$OUT/job-pack.b64`. Because `ceo-brief` has no version, it contains `board-update-writer` only.
14. Open `/prompt-bot/skills/e2e_legacy_pack`: expect a redirect to `/prompt-bot/skills/legacy/e2e_legacy_pack`, the read-only note, `weekly-review` with its rendered `SKILL.md`, no edit, generate or rename controls, and working **Download skill** and **Download pack**. Fetch `/api/v1/prompt-bot/skill-packs/e2e_legacy_pack/download` the same way and save it as `$OUT/legacy.b64`.
15. Open `/prompt-bot/catalog`: expect the 404 page. `fetch("/api/v1/prompt-bot/skill-catalog")` returns 404.

- [ ] **Step 5: Mobile and dark mode**

Set the viewport to 390 × 844 (`agent-browser set viewport 390 844`). Open the job and visit each of the four steps, the legacy page and `/prompt-bot/skills`. On each, run:

```js
document.documentElement.scrollWidth <= window.innerWidth
```
Expected: `true` everywhere. The step navigation wraps, the question panel stacks above the answer box, skill card buttons are full width or wrap, and the file upload control is reachable. Switch the theme to dark (the LMS theme toggle) and take one screenshot of the Files step and one of the Skills step: text and cards stay readable (no white-on-white, no invisible borders). Switch back.

- [ ] **Step 6: Run the oracle on the downloads**

```bash
OUT="${TMPDIR:-/tmp}/skills-jobs-e2e"
VALIDATOR="/Users/tharunkumarl/.claude/skills/synced/bfef6136-f152-4b96-834c-6925fa876c60_248f4955-89f1-4681-b216-9881dcea93ad/skill-creator/scripts/quick_validate.py"
DECK_SHA=$(awk '$2 == "deck.pptx" { print $1 }' "$OUT/fixtures.sha256")
cd "$OUT"
for z in upload pack v1-upload job-pack legacy; do base64 -d < "$z.b64" > "$z.zip"; done
for z in upload pack v1-upload job-pack legacy; do
  unzip -Z1 "$z.zip" | grep -E '(^/|(^|/)\.\.(/|$)|\\)' && echo "UNSAFE PATH in $z" || echo "paths ok: $z"
done
rm -rf u p v1 jp lg && mkdir u p v1 jp lg
unzip -q upload.zip -d u && unzip -q pack.zip -d p && unzip -q v1-upload.zip -d v1 && unzip -q job-pack.zip -d jp && unzip -q legacy.zip -d lg

# Upload zips: exactly one root folder, the skill name, which passes the validator.
for dir in u v1; do
  roots=$(ls "$dir")
  [ "$roots" = "board-update-writer" ] || echo "BAD ROOT in $dir: $roots"
  python3 "$VALIDATOR" "$dir/board-update-writer" || echo "INVALID upload zip: $dir"
done

# Packs: README, no recommended-skills.md, every unpacked skill and every inner upload zip valid.
for pack in p jp lg; do
  ls "$pack"/*/README.md > /dev/null || echo "MISSING README in $pack"
  ls "$pack"/*/recommended-skills.md 2> /dev/null && echo "UNEXPECTED recommended-skills.md in $pack"
  for skill in "$pack"/*/skills/*/; do python3 "$VALIDATOR" "$skill" || echo "INVALID: $skill"; done
  for z in "$pack"/*/upload-to-claude/*.zip; do
    name=$(basename "$z" .zip)
    roots=$(unzip -Z1 "$z" | cut -d/ -f1 | sort -u)
    [ "$roots" = "$name" ] || echo "BAD ROOT in $z: $roots"
    rm -rf "inner-$pack-$name" && mkdir "inner-$pack-$name" && unzip -q "$z" -d "inner-$pack-$name"
    python3 "$VALIDATOR" "inner-$pack-$name/$name" || echo "INVALID upload zip: $z"
  done
done

# The bundled original is byte-for-byte the uploaded fixture, in every place it ships.
for f in u/board-update-writer/assets/deck.pptx v1/board-update-writer/assets/deck.pptx \
         p/*/skills/board-update-writer/assets/deck.pptx inner-p-board-update-writer/board-update-writer/assets/deck.pptx \
         jp/*/skills/board-update-writer/assets/deck.pptx; do
  [ "$(shasum -a 256 $f | cut -d' ' -f1)" = "$DECK_SHA" ] && echo "sha ok: $f" || echo "SHA MISMATCH: $f"
done
ls u/board-update-writer/assets/big-deck.pptx 2> /dev/null && echo "UNEXPECTED big-deck bundled"
grep -q "too large to include" u/board-update-writer/SKILL.md && echo "analysis-only note ok"
ls jp/*/skills/ | tr '\n' ' '; echo
```
Expected: `paths ok` for all five zips; `Skill is valid!` for every folder and inner zip; no `BAD ROOT`, `INVALID`, `UNSAFE PATH`, `MISSING README`, `UNEXPECTED` or `SHA MISMATCH` lines; five `sha ok` lines; `analysis-only note ok`; the job pack lists `board-update-writer` only; the legacy pack holds `weekly-review`.

- [ ] **Step 7: Stop the servers and check the logs**

```bash
OUT="${TMPDIR:-/tmp}/skills-jobs-e2e"
kill %1 %2 2> /dev/null || pkill -f "scripts/fake-anthropic.mjs"; pkill -f "next dev" || true
grep -c "^\[fake\]" "$OUT/fake.log"
grep -E "Every month I turn|Always open with|board update deck|Acme" "$OUT/fake.log" "$OUT/dev.log" && echo "PRIVACY: request text logged" || echo "logs carry no request text"
```
Expected: `logs carry no request text`. `dev.log` contains no stack traces from `[skills-builder]` other than expected `error.name` lines.

- [ ] **Step 8: Real-API smoke test** (uses real usage; the key is in `apps/web/.env`)

Restart `npm run dev` without the fake overrides. In the browser: create one job, upload one real PowerPoint deck of your own (a branded one, under 10 MB) and one real PDF. Expect both analyses `READY` within about a minute; the deck's analysis quotes its theme colours as hex values that appear in the deck's `facts` (check with `fetch("/api/v1/prompt-bot/skill-jobs/<id>/files/<fileId>")` → `data.facts.theme.colors`), and the PDF's analysis marks what it saw as "(approximate)". Answer two questions (bars update within about 3 s), Suggest, Generate one skill, download its upload zip and its pack, and run Step 6's validator loop on them (replace the skill name). Expect every folder valid, a description that says when to use the skill, and `assets/<deck>.pptx` byte-identical to the uploaded deck.

- [ ] **Step 9: Production checklist** (report to the human partner; do not execute)

- Migration `20261125120000_add_skill_jobs` (two enums, five tables, indexes and foreign keys; additive, no `DROP`) is applied by `start.sh` (`prisma migrate deploy`) before `next start`; the previous image keeps working against the new schema during the switch.
- No new environment variables. `ANTHROPIC_API_KEY` from the enhancer rollout is reused.
- `skill_analyze` defaults to 40 per user per day; admins change it with `PATCH /api/v1/prompt-bot/settings`.
- Uploads add up to 200 MB per job to Postgres. Watch database size after release; per-job limits are the control.
- File analysis and generation run in `after()` on the long-running `next start` process. App Runner ends HTTP requests at 120 s; every in-request AI call (scoring, suggest) has an SDK timeout below that, and a deploy that interrupts background work leaves the file re-analysable after 5 minutes and the skill re-generatable after 10.
- After deploy: on production, upload one PPTX to a new job and confirm its analysis appears (proves `after()` and the analysis call), generate one skill, download it, and open it in Claude (Settings → Capabilities → Skills → upload).
- Legacy packs stay readable at `/prompt-bot/skills/legacy/<id>`; old links redirect. Catalog rows stay in the database, unused.

---

**Contract notes for the plan assembler:**
- Task 22 adds `src/lib/skills/files/e2e-fixtures.ts` (`WrittenFixture`, `VALID_FIXTURES`, `LOCKED_FIXTURE`, `writeSkillFixtures(outDir, options?)`) and its test; add them to the File Structure table.
- Fixture colours are passed to `buildPptx`/`buildDocx`/`buildXlsx` (`FixtureTheme.colors`, `FixtureSlide.colors`, `FixtureStyle.color`) as six hex digits without `#`, as OOXML stores them; Task 3's `fixtures.ts` must accept that form.
- `writeSkillFixtures` relies on `buildPptx({ padBytes })` producing a valid package of at least `padBytes` bytes (padding stored uncompressed in a non-XML part), and on `FixtureSlide.layout` being a 1-based layout index.
