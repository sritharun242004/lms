# Prompt Bot — Skills Builder: Jobs Redesign

## Objective

CEOs and CTOs turn **one recurring job** into their **own** Agent Skills. They describe the job as they do it today, attach the files they already use (decks, documents, spreadsheets, PDFs, screenshots), answer the skill-definition questions, accept or adjust the skills the AI suggests, and download Agent Skills that reuse their exact templates and house style.

There are no existing, public or catalog skills anywhere in the product after this change.

This spec replaces the flow in [2026-11-24-prompt-bot-skills-builder-design.md](2026-11-24-prompt-bot-skills-builder-design.md) (describe → split → refine → generate). Everything that spec said about the **Agent Skills target format**, the validator, scripts never running server-side, and privacy still holds and is not repeated here except where it changes. The AI foundation, matrix tables and status-bar components come from [2026-11-24-prompt-bot-enhancer-design.md](2026-11-24-prompt-bot-enhancer-design.md).

## Compatibility Invariants

- Built inside `apps/web`. Nothing about the enhancer's behaviour changes; its tests keep passing.
- Reuses: the AI client (`src/lib/ai/claude.ts`), usage limits (`consumeAiUsage`), the `skill-definition` matrix (kind `SKILL`, `pbq_skill_1` … `pbq_skill_8`), `scoreAndApply`, `useMatrixAnswers`, `MatrixPanel`, `QuestionRow`, `StatusBar`, `ReadinessMeter`, `SafeMarkdown`, the Agent Skills validator (`validateSkillFiles`, `checkSkillPath`), `buildSkillMd`, names (`normalizeSkillName`, `uniqueSkillName`), `fflate`, `sharp`, `ConfirmDialog`.
- Migrations are additive only. No table, column or enum value is dropped or renamed.
- The server never executes generated scripts, never runs macros, and never renders uploaded files.
- Prompt text, job descriptions, answers, file names, file contents and analyses are never written to logs. Logs carry error class names only.

## Concepts

- **Job:** one recurring piece of work, owned by one user. It holds a description, answers to the 8 questions, up to 10 uploaded files, and the skills built from it.
- **Resource file:** an upload (PPTX, DOCX, XLSX, PDF, PNG, JPEG). Its bytes live in Postgres. Each has deterministic **facts** and an editable **analysis** (a readable style guide).
- **Skill:** a confirmed or suggested skill of a job (name, purpose, which files it uses). It has a status for its latest generation attempt and zero or more **versions**.
- **Version:** an immutable generated snapshot of one skill (`v1`, `v2`, …): text files plus references to the bundled original files.
- **Legacy pack:** a `SkillPack` from the previous flow. Read-only.

## Access

- Every signed-in role can create jobs. A job, file, skill or version that is not the caller's returns **404** (never 403, so existence is not leaked).
- No admin surface. The catalog admin page is removed.

## Data Model

Additive Prisma changes in migration `20261125120000_add_skill_jobs`.

```prisma
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
  fileName          String              @map("file_name")       // as uploaded, for display only
  assetName         String              @map("asset_name")      // server-made, safe: the name under assets/
  kind              SkillJobFileKind
  mimeType          String              @map("mime_type")       // canonical for the kind, not the browser's claim
  size              Int
  sha256            String
  data              Bytes
  facts             Json?                                       // deterministic extraction (FileFacts)
  analysis          String?                                     // readable style guide (AI, or the user's edit)
  analysisStatus    SkillAnalysisStatus @default(PENDING) @map("analysis_status")
  analysisStartedAt DateTime?           @map("analysis_started_at")
  analysisEdited    Boolean             @default(false) @map("analysis_edited")
  analysisError     String?             @map("analysis_error")
  deletedAt         DateTime?           @map("deleted_at")      // removed from the job but kept for older versions
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
  name                String                                    // kebab-case; owns the folder of the NEXT version
  purpose             String
  fileIds             String[]        @default([]) @map("file_ids")
  status              SkillItemStatus @default(DRAFT)            // reused enum: DRAFT | GENERATING | READY | FAILED
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

model SkillVersion {
  id           String        @id @default(cuid())
  skillId      String        @map("skill_id")
  version      Int
  name         String                                           // the folder and SKILL.md name of this version
  description  String                                           // the frontmatter description, for display
  files        Json                                             // text files: [{ path, content }]
  assets       Json                                             // bundled originals: [{ fileId, path, fileName, bytes }]
  assetFileIds String[]      @default([]) @map("asset_file_ids") // same ids as `assets`, for indexed lookups
  createdAt    DateTime      @default(now()) @map("created_at")
  skill        SkillJobSkill @relation(fields: [skillId], references: [id], onDelete: Cascade)
  @@unique([skillId, version])
  @@map("skill_versions")
}
```

Back-relations added: `User.skillJobs SkillJob[] @relation("SkillJobOwner")` and `PromptMatrixQuestion.skillJobAnswers SkillJobAnswer[]`. Neither changes an existing column.

Rules the model encodes:

- **Skill names are unique per job** (`@@unique([jobId, name])`). Routes check first and return 409 `DUPLICATE_NAME`; a concurrent race that reaches the index (Prisma `P2002`) maps to the same 409.
- **Asset names are unique per job** (`@@unique([jobId, assetName])`), including removed-but-kept files, so a version's `assets/<name>` path never changes meaning.
- **Bytes are never read for lists.** Every list or view query uses `omit: { data: true }`. Only analysis and zip building read `data`, one file at a time.
- **Versions are immutable.** Nothing updates a `SkillVersion` row. Renaming a skill changes the next version's name only.
- **A removed file is soft-deleted only while a version needs it.** `DELETE` sets `deletedAt` if any `SkillVersion.assetFileIds` of the job contains the id; otherwise the row is deleted. Whenever versions or skills are deleted, `purgeUnreferencedFiles(jobId)` hard-deletes soft-deleted files no version references.
- **At most 20 versions per skill.** Creating version *n* deletes versions `≤ n − 20` in the same transaction, then purges unreferenced files. The UI says "We keep the last 20 versions of each skill."

### Legacy and catalog tables (decision)

Tables stay in place, unused, with **no DROP**:

- `skill_catalog_entries` and `skill_pack_items.catalog_entry_id` are kept. The `SkillCatalogEntry` model stays in `schema.prisma` (so `prisma migrate diff` never proposes a DROP) with a `/// Deprecated 2026-11-25` doc comment. No code reads or writes it.
- `skill_packs`, `skill_pack_items`, `skill_item_answers` stay and are read by the legacy read-only view only. Nothing writes to them any more.
- The `SkillItemKind` enum and `CATALOG` rows stay; legacy views show only `CUSTOM` items.

## Limits

All in `src/lib/skills/limits.ts` (`JOB_LIMITS`), pure constants.

| Bound | Value | Why |
|---|---|---|
| Job description | 20 000 chars | Same as the old split input. |
| Job title | 120 chars | Same as pack titles. |
| Active files per job | 10 | Approved design. |
| Upload size | 20 MB (20 × 1024²) | Approved design; under Claude's 32 MB request cap after base64 (×4/3 ≈ 26.7 MB). |
| Bundled original | ≤ 10 MB each | Approved design. Larger files are analysis only; SKILL.md says so. |
| Bundled originals per skill version | ≤ 25 MB total | Keeps each upload zip small enough to upload and the pack bounded. Files beyond the budget (in the skill's file order) are analysis only, noted the same way. |
| Skills per job | 5 | One is usual; more only for clearly separate parts. |
| Analysis text | 12 000 chars | Keeps `references/style-guide.md` (all analyses) under the 200 KB file limit. |
| Facts JSON | 64 KB | Bounded storage and prompt size; extractors truncate and set `truncated: true`. |
| OOXML parts read | XML part ≤ 16 MB inflated (declared size), ≤ 64 MB inflated in total, ≤ 300 slides/sheets parsed | Zip-bomb and CPU bound. |
| PDF pages for analysis | ≤ 100 (estimated) | The fast model has a 200K-token context; Claude's PDF limit there is 100 pages. |
| Image sent to Claude | longest edge ≤ 1568 px | Re-encoded with `sharp`; always under the API's per-image size limit. The original is bundled unchanged. |
| Versions kept per skill | 20 | Bounded storage. |
| Pack zip | ≤ 100 MB (computed before building) | Built in memory; otherwise 409 `PACK_TOO_LARGE` asks for per-skill downloads. |

**Upload body:** read with `readBytesWithin(req, JOB_LIMITS.fileBytes)`: a declared `content-length` over the cap is refused before reading; otherwise the stream is read and cancelled as soon as it exceeds the cap. Note `proxy.ts` already buffers bodies up to `proxyClientMaxBodySize: "155mb"`, so the handler's check is the real bound. A body stream that errors part-way (connection dropped) is refused with 400 `UPLOAD_INCOMPLETE` ("The upload didn't finish. Try again.") and nothing is stored: the row is inserted only after the whole body has been read and checked.

**Time bounds (App Runner ends requests at 120 s):**

| Call | Where | SDK options |
|---|---|---|
| Scoring (Haiku) | request | existing (90 s, 1 retry) |
| Suggest (Opus) | request | `timeout: 100_000, maxRetries: 0` |
| File analysis (Haiku) | `after()` | `timeout: 90_000, maxRetries: 1`; stale after 5 min |
| Generation (Opus) | `after()` | `timeout: 240_000, maxRetries: 0`, two attempts; stale after 10 min (existing) |

## Usage Limits

| Feature | Counted when | Default per day |
|---|---|---|
| `score` | each job scoring call | 300 (existing) |
| `skill_split` | each **Suggest** press | 10 (existing, reused) |
| `skill_generate` | each **Generate** press (the automatic retry is free) | 20 (existing) |
| `skill_analyze` (**new**) | each upload and each **Analyse again** | 40 |

`skill_analyze` is added to `AiFeature`, `AI_FEATURES` and `DEFAULT_LIMITS`. Admins change it through the existing `PATCH /api/v1/prompt-bot/settings`. No migration is needed: missing keys fall back to defaults.

Units are spent **before** the AI call and **after** every cheap check (ownership, counts, body size, file type, file readability), so a refused upload never spends a unit.

## File Analysis Pipeline

### Stage 1 — sniff (synchronous, in the upload request)

The kind comes from the bytes, never from the browser's MIME type or the extension.

| Magic | Result |
|---|---|
| `PK\x03\x04` | Zip: open as OOXML (below). |
| `D0 CF 11 E0 A1 B1 1A E1` | 422 `FILE_ENCRYPTED`: "This file is password-protected or in an old Office format. Remove the password or save it as .pptx, .docx or .xlsx, then upload it again." (Encrypted OOXML and `.ppt/.doc/.xls` are both OLE containers.) |
| `%PDF-` | PDF. If the bytes contain `/Encrypt` → 422 `FILE_ENCRYPTED` ("This PDF is password-protected…"). |
| `89 50 4E 47 0D 0A 1A 0A` | PNG. |
| `FF D8 FF` | JPEG. |
| anything else, or empty | 415 `UNSUPPORTED_FILE`: "Upload a PowerPoint, Word, Excel, PDF, PNG or JPG file." |

OOXML classification, by parts present: `ppt/presentation.xml` → PPTX; `word/document.xml` → DOCX; `xl/workbook.xml` → XLSX; otherwise 415. A package containing `vbaProject.bin` anywhere → 415 `UNSUPPORTED_FILE` ("Macro-enabled files aren't supported. Save it as .pptx, .docx or .xlsx without macros."). A zip that fflate cannot read → 422 `FILE_UNREADABLE` ("We couldn't read this file. It may be damaged. Open and save it again, then upload it.").

Canonical MIME types stored: PPTX `application/vnd.openxmlformats-officedocument.presentationml.presentation`, DOCX `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, XLSX `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, PDF `application/pdf`, PNG `image/png`, JPEG `image/jpeg`.

### Stage 2 — deterministic extraction (synchronous)

OOXML is unzipped with `fflate.unzipSync(bytes, { filter })`. The filter admits only the parts listed below and refuses any part whose declared `originalSize` exceeds 16 MB or would push the running total past 64 MB (the extractor then sets `truncated: true` and continues without that part). XML is scanned with a small tolerant element scanner (`src/lib/skills/files/xml.ts`: prefix-agnostic tag matching, attribute parsing, entity decoding); no XML library is added and no DTD or entity expansion is ever performed. Any extractor exception becomes 422 `FILE_UNREADABLE`.

Colours are 6-digit upper-case hex (`#1F4E79`). `srgbClr@val` is used as is; `sysClr` uses `@lastClr`. Lengths are converted from EMU (914 400 per inch) or twentieths of a point (1440 per inch); font sizes from half-points (`w:sz`) or hundredths (`a:rPr@sz`).

**Theme (PPTX, DOCX, XLSX)** — `ppt/theme/theme*.xml` (first by number, plus all names), `word/theme/theme1.xml`, `xl/theme/theme1.xml`:
- `a:theme@name`; `a:clrScheme` slots `dk1, lt1, dk2, lt2, accent1…accent6, hlink, folHlink` → `{ slot, hex }`;
- `a:fontScheme/a:majorFont/a:latin@typeface`, `a:minorFont/a:latin@typeface`.

**PPTX** (`PptxFacts`):
- `ppt/presentation.xml`: `p:sldSz@cx,@cy` → `slideSize { widthIn, heightIn, aspect }` where aspect is the nearest of `16:9`, `4:3`, `16:10`, `A4` (±2 %), else `custom`; `p:sldIdLst/p:sldId@r:id` order.
- `ppt/_rels/presentation.xml.rels`: maps those ids to `slides/slideN.xml`.
- `ppt/slideMasters/slideMaster*.xml`: `p:cSld@name` (or `Master N`) → `masters`.
- `ppt/slideLayouts/slideLayout*.xml`: `p:cSld@name` → `layouts` (by file number).
- `ppt/slides/slideN.xml` in presentation order (≤ 300 parsed; first 60 detailed): `title` = text of the shape whose `p:ph@type` is `title` or `ctrTitle`; `placeholders` = distinct `p:ph@type` (`body` when absent); `text` = all `a:t` joined, whitespace-collapsed, ≤ 300 chars; `tables` = count of `a:tbl`; `charts` = `graphicData@uri` ending `/chart`; `images` = count of `p:pic`; `layout` = the name of the layout targeted by `ppt/slides/_rels/slideN.xml.rels`.
- `colorsUsed`: top 12 `a:srgbClr@val` across parsed slides with counts; `fontsUsed`: up to 12 distinct `a:latin@typeface` across parsed slides, excluding theme references (`+mj-lt`, `+mn-lt`).
- `slideCount` counts every slide in `sldIdLst`.

**DOCX** (`DocxFacts`):
- `word/styles.xml`: `w:docDefaults` (`w:rFonts@w:ascii`, `w:sz@w:val`/2 pt) → `defaults`; each `w:style` → `{ id: @w:styleId, name: w:name@w:val, type: @w:type, basedOn, font, sizePt, color (w:color@w:val, hex, not "auto"), bold }`. Kept: styles used in the document, plus `Normal`, `Title`, `Heading1`–`Heading6`, max 40.
- `word/document.xml`: paragraphs (`w:p`); headings = paragraphs whose `w:pStyle@w:val` is `Title` or `Heading1`–`Heading6` (also matched by style name `heading N`), `{ level (Title = 0), text ≤ 200 chars }`, max 100; `tables` (`w:tbl`); `images` (`w:drawing`); `sections` from the last `w:sectPr/w:pgSz@w:w,@w:h,@w:orient` (inches, orientation); `textSample` = body text in order, ≤ 4 000 chars.
- `word/theme/theme1.xml` → `theme`.

**XLSX** (`XlsxFacts`):
- `xl/workbook.xml`: `sheet@name`, `@r:id` in order (≤ 20); `definedName@name` (≤ 30).
- `xl/_rels/workbook.xml.rels` → sheet part paths.
- `xl/sharedStrings.xml`: `si` → text (`t` runs joined); only indices referenced by header rows are kept.
- `xl/worksheets/sheetN.xml`: `dimension@ref`; `rows` = count of `row`; `headerRow` = first row's cells in column order, text from shared strings (`t="s"`), inline strings (`t="inlineStr"`), or `v` (≤ 30 cells, each ≤ 80 chars); `formulas` = count of `f`; `formulaSamples` = first 10 distinct `f` texts (≤ 120 chars).
- `xl/styles.xml`: `numFmt@formatCode` (custom formats, ≤ 20) → `numberFormats`.
- `charts` = number of `xl/charts/chart*.xml` parts.
- `xl/theme/theme1.xml` → `theme`.

**PDF** (`PdfFacts`): `version` from the header (`%PDF-1.7`); `pages` = count of `/Type /Page` objects (not `/Pages`), or `null` when the count is 0 (object streams hide it); `title` from an uncompressed `/Title (…)` literal when present, ≤ 200 chars. Nothing else is parsed; Claude reads the PDF itself.

**Images** (`ImageFacts`): `sharp(bytes).metadata()` → `width`, `height`. A format that disagrees with the magic bytes, or a decode failure → 422 `FILE_UNREADABLE`.

The serialized facts are checked against 64 KB; if larger, the extractor's arrays are trimmed (slides, headings, styles, sheets) until they fit and `truncated` is set.

### Stage 3 — AI analysis (in `after()`)

After the row is stored as `PENDING` (with `analysisStartedAt = now`), the route answers 201 and runs `runFileAnalysis(jobId, fileId, userId)` in `after()`:

- **Model:** `FAST_MODEL` (`claude-haiku-4-5`), plain text reply (no structured output), `max_tokens: 3000`, `timeout: 90_000`, `maxRetries: 1`, through `client.messages.create`.
- **Content blocks** (user message):
  - PDF: `{ type: "document", source: { type: "base64", media_type: "application/pdf", data }, title: <assetName> }` first, then the text block. If `facts.pages > 100` the call is skipped and the file becomes `FAILED` with "This PDF has more than 100 pages, so it can't be analysed. Upload the pages that show the style, or write the style guide yourself." The file can still be bundled and the user can write the analysis by hand.
  - PNG/JPEG: `{ type: "image", source: { type: "base64", media_type, data } }` from a `sharp` copy resized to fit 1568 × 1568 (`fit: "inside", withoutEnlargement: true`), re-encoded as the same format, then the text block.
  - PPTX/DOCX/XLSX: text only.
  - Text block: `<file name="…" kind="…">` plus `<facts>` (the facts JSON) and the instruction to write the style guide.
- **System prompt** `ANALYSE_SYSTEM`: write a style guide another AI will follow to produce work that looks and reads like this file. Markdown, sections in order — `## Colours` (every colour with its hex and role), `## Fonts` (headings, body, sizes), `## Layout` (slide size or page setup, masters/layouts or grid, spacing), `## Structure` (the order of sections or slides, recurring elements, tables and charts), `## Tone and content` (voice, length, terminology), `## Reusing this file` (how to start from the original instead of recreating it). Use the facts as ground truth; anything seen only in a PDF or image is marked "(approximate)". Never invent colours, fonts or numbers. At most about 600 words.
- **Result:** a non-empty reply trimmed to 12 000 chars → `READY` with `analysis`, `analysisEdited = false`, `analysisError = null`. A `max_tokens` stop, a refusal, an empty reply, or an SDK error → `FAILED` with `analysisError = "We couldn't analyse this file. Try again, or write the style guide yourself."`. The run never throws.
- **Staleness:** a `PENDING` file whose `analysisStartedAt` is more than 5 minutes old is shown as `FAILED` with "Analysing this file was interrupted. Analyse it again." and may be re-analysed.

### Editing an analysis

`PATCH …/files/:fileId { analysis }` (1–12 000 chars) stores the text, sets `analysisEdited = true`, `analysisStatus = READY`, `analysisError = null`. Refused with 409 `ALREADY_ANALYSING` while a fresh analysis is running. **User edits win:** generation always uses the stored `analysis` as written. **Analyse again** replaces it (the UI confirms first when `analysisEdited` is true).

## Questions and Scoring

- The job uses the `skill-definition` matrix exactly as seeded (8 questions). Answers are per **job**, in `skill_job_answers`.
- Saving an answer and scoring follow the enhancer's contract: `{ answer?, notRelevant? }`, scores 0–3 with reasons, the stale-revision rule (`shouldApplyRevision`), `score` usage.
- **Scoring base** (`jobScoringBase`): `Job: <title>\n<description>` then, for each active file whose analysis is `READY`, `File: <fileName>\n<first 1 500 chars of its analysis>`, capped at 12 000 chars in total. So the AI credits what the description and the files already say.
- Editing the description, or a file's analysis becoming `READY` or being edited, bumps the revision and schedules a rescore (client side, via `useMatrixAnswers.bumpRevision` + `scheduleScore`).

## Suggest Skills

`POST /skill-jobs/:id/suggest` (synchronous, Opus, `skill_split`):

- Allowed at any time; the UI warns first when questions are unanswered (below). Refused with 400 `VALIDATION_ERROR` "Describe the job first." when the description is empty, 409 `FILES_ANALYSING` while any active file is `PENDING`, 409 `ALREADY_GENERATING` while any skill is generating.
- Model input (`buildSuggestMessage`): title, description, answered questions (`Q:`/`A:`), gaps, the active files as `- id: … name: … kind: … size: …` plus the first 1 500 chars of each `READY` analysis, and the names and purposes of skills that already have versions ("already built").
- Structured output schema: `{ skills: [{ name: string, purpose: string, fileIds: string[] }] }`.
- System prompt `SUGGEST_SYSTEM`: propose the skills that capture this job; usually exactly one; more only when the job has clearly separate parts with different inputs, outputs or audiences; never split a job into its steps; never repeat an already-built skill; each skill lists the file ids it should reuse (templates it produces from, references it follows); kebab-case names; one-sentence purposes; use only what the person wrote.
- **Clean-up** (`cleanSuggestions`): purposes one-lined and ≤ 300 chars; names normalised and made unique against the skills that are kept and each other (`uniqueSkillName`); `fileIds` filtered to active file ids, deduplicated; capped so the job holds at most 5 skills. If nothing usable remains and the job has no skills, one skill is created from the title (`normalizeSkillName(title, "my-skill")`) with the first sentence of the description as purpose and all active files.
- **Apply** (one transaction): delete the job's skills with `latestVersion = 0` that are not generating, insert the cleaned suggestions after the kept skills (`order` continues), set `suggestedAt = now`. Skills with versions are never touched. Reply: the job view.

**Confirm, rename, remove, add:** suggested skills are persisted as `DRAFT` rows, so they survive a reload. The user renames (`PATCH`), changes purpose or files (`PATCH`), removes (`DELETE`) or adds (`POST`) skills before generating. Generating is the confirmation; nothing is generated automatically.

## Generate

`POST /skill-jobs/:id/skills/:skillId/generate` → 202, then `runJobSkillGeneration` in `after()`. Same claim-then-spend pattern as today (`startGeneration`): ownership 404 → refuse 409 `ALREADY_GENERATING` if fresh `GENERATING` → refuse 409 `FILES_ANALYSING` if any of the skill's active files is `PENDING` → refuse 400 when the job description is empty → atomically claim (`status = GENERATING`, `generationStartedAt = now`, `validationErrors = []`) → `consumeAiUsage("skill_generate")` (on failure the claim is handed back).

### Inputs to the model (`buildJobGenerateMessage`)

`<job>` title and description, `<answers>` (answered, relevant), `<gaps>` (relevant, score < 3, with guidance), `<skill>` name and purpose, `<files>` one entry per file the skill uses: name, kind, how it ships (`bundled at assets/<assetName>` or `analysis only (too large to bundle)`), and its analysis (or "No analysis available").

### Model output (`generateJobSkillDraft`)

Opus 5.5 with `betas: ["server-side-fallback-2026-07-01"]`, `fallbacks: "default"`, structured output:

```json
{ "description": "…", "compatibility": "…", "body": "…",
  "references": [{ "path": "…", "content": "…" }],
  "scripts": [{ "path": "…", "content": "…", "purpose": "…" }] }
```

There is no `assets` field: assets are the uploaded originals only. `GENERATE_JOB_SYSTEM` keeps the old content rules (why over rigid rules, stable context in `references/`, scripts only when a deterministic helper is clearly useful, no network or credentials in scripts, placeholders instead of invented facts) and adds: write the job's instructions in the imperative as the person does the job today; point to `references/style-guide.md` for look and voice; when a bundled original is a template, tell Claude to start from `assets/<name>` and reuse its masters, layouts, styles and theme rather than recreating the design; never write `references/style-guide.md` (the server writes it); never reference a file that is not listed.

### Assembly (server-owned, `assembleJobSkill`)

1. **Asset plan** (`planAssets`): walk the skill's active files in its `fileIds` order. A file is **bundled** when `size ≤ 10 MB` and the running total stays `≤ 25 MB`; otherwise it is **analysis only** with reason `too-large` or `over-budget`.
2. **`SKILL.md`** = `buildSkillMd(name, description, compatibility, body + filesSection)`. `filesSection` is written by the server, always:
   ```markdown
   ## Files in this skill

   - `references/style-guide.md`: colours, fonts, layouts and structure taken from the files below. Follow it for anything you produce.
   - `assets/q3-board-deck.pptx`: the original "Q3 board deck.pptx". Start from this file and reuse its masters, layouts and theme instead of recreating the design.
   - "Brand book.pdf" (14.2 MB) was too large to include. Its style is described in `references/style-guide.md`.
   ```
   The style-guide line appears only when at least one file is used. Each line names the original file name with `"` and `<`/`>` removed.
3. **`references/style-guide.md`** (when the skill uses files): `# Style guide`, a one-line note ("Taken from the files uploaded for this job. Analyses edited by hand are used exactly as written."), then per file `## <fileName>` with a status line (`Bundled as assets/<assetName>.` or `Not bundled (too large).`) and the stored analysis (or "No analysis is available for this file."). If the file would exceed 200 KB, each analysis is shortened proportionally and ends with "[Shortened to fit the 200 KB file limit.]".
4. Model `references` (any path that resolves to `references/style-guide.md` is dropped: the server's wins) and `scripts` go in through the existing `inFolder` rule. Scripts not mentioned in the body get the existing "## Scripts" list.
5. **Assets:** `[{ fileId, path: "assets/<assetName>", fileName, bytes }]`.

### Validation

`validateJobSkill(name, files, assets)` = `validateSkillFiles(files, name)` plus, for assets: `checkSkillPath(path)` passes, no path collides (case-insensitively) with a text file, text files + assets ≤ 100, each asset ≤ 10 MB, total ≤ 25 MB. On errors: one retry with `buildRetryMessage`-style feedback (`<previous_attempt>` + `<validation_errors>`). Still failing → skill `FAILED` with readable `validationErrors`; existing versions are untouched and remain downloadable.

### Writing a version (one transaction)

Create `SkillVersion { version: latestVersion + 1, name, description, files, assets, assetFileIds }`, update the skill (`status: READY`, `latestVersion`, `validationErrors: []`), delete versions `≤ new − 20`; then `purgeUnreferencedFiles(jobId)`. A failure anywhere becomes `FAILED` with "The AI couldn't finish writing this skill. Try again." (the existing message). The run never throws; an interrupted run becomes retryable after 10 minutes (existing staleness rule, shown as `FAILED` "Writing this skill was interrupted. Generate it again.").

## Versions and Downloads

- `GET …/skills/:skillId/versions/:version` (`version` is a positive integer or `latest`) → `VersionDetail` with text file contents and asset entries (no bytes).
- `GET …/skills/:skillId/versions/:version/download?format=upload` → the **upload zip**: `<name>/SKILL.md`, `<name>/references/…`, `<name>/scripts/…`, `<name>/assets/<assetName>` (binary, stored uncompressed). Filename `<name>-v<version>.zip`.
- `GET …/skills/:skillId/versions/:version/download?format=pack` → a **pack zip** with that one version.
- `GET /skill-jobs/:id/download` → the **pack zip** of the latest version of every skill that has one; 409 `NOTHING_TO_DOWNLOAD` when none.

Pack layout (slug = `normalizeSkillName(job.title, "skill-pack")`):

```
<slug>/
  README.md                        # what's inside (skill, version, purpose) and install steps
  upload-to-claude/<name>.zip      # one per skill: the upload zip, folder at its root
  skills/<name>/SKILL.md           # unpacked copies for Claude Code / Cursor / Codex
  skills/<name>/references/…
  skills/<name>/scripts/…
  skills/<name>/assets/<assetName> # original bytes
```

- Every entry path is built by the server from a validated name and a re-checked path (`checkSkillPath`). Assets are passed as `Uint8Array` and stored with `level: 0` (Office files and images are already compressed); text is `strToU8`.
- The pack size is computed before building: `Σ (2 × (text bytes + asset bytes)) + README`. Over 100 MB → 409 `PACK_TOO_LARGE`: "This pack is over 100 MB. Download each skill on its own."
- Two latest versions with the same name → 409 `DUPLICATE_NAME` ("Two skills are named "x". Rename one and generate it again.").
- An asset row missing at download time → 409 `ASSET_MISSING` ("A file this version uses is no longer available. Generate the skill again.").
- README: `# <title>`, "Agent Skills built with Prompt Bot's Skills Builder.", `## What this job is`, the description, `## Skills in this pack` (`- \`name\` (v3): purpose`), the existing install steps (Claude.ai upload from `upload-to-claude/`, Claude Code copy, other tools), `## Before you run anything` (review `scripts/`), and `## About the files in assets/` ("These are your original files, included so the skill can reuse your templates.").

## Legacy Skill Packs

- `/prompt-bot/skills` shows a collapsed **Earlier skill packs** section (only when the user has any) with a "Read-only" badge.
- `/prompt-bot/skills/legacy/[packId]` shows the pack title and description, its `CUSTOM` items that are `READY` with files, a read-only file viewer (file tree, rendered `SKILL.md`, other files as text), **Download skill** and **Download pack**, and the note "This pack was made with the earlier Skills Builder. It can't be changed. Start a new job to build skills from your files."
- Old links `/prompt-bot/skills/<packId>` keep working: the `[jobId]` page redirects to `/prompt-bot/skills/legacy/<id>` when no job but an owned pack has that id.
- Kept API (GET only): `/skill-packs/:id`, `/skill-packs/:id/items/:itemId`, `/skill-packs/:id/download`, `/skill-packs/:id/items/:itemId/download`. Catalog items are not returned. The legacy pack zip no longer contains `recommended-skills.md`.
- Removed API: `POST /skill-packs`, `PATCH /skill-packs/:id`, item `POST`/`PATCH`/`DELETE`, answers, score, generate, files.

## Catalog Removal

Removed: `src/app/api/v1/prompt-bot/skill-catalog/**`, `src/app/(app)/prompt-bot/catalog/**`, `src/lib/skills/{catalog-candidates,catalog-input,catalog-licenses,catalog-seed,license,split}.ts` and their tests, `catalogSeedSql`/`sqlTextArray` in `src/lib/skills/seed-sql.ts` (the file goes), `scripts/verify-catalog-licenses.ts`, the catalog half of `scripts/skills-builder-seed-sql.ts` (the script goes: its migration is already applied), `renderRecommended` and `recommended-skills.md`, catalog matches in the AI layer (`splitWork`, `SPLIT_SYSTEM`), the "Manage skill catalog" link, and `/prompt-bot/catalog` from `isSkillsPath`. `src/lib/skills/migration-seed.test.ts` keeps its matrix and "only adds" assertions against the old migration and drops the catalog assertion.

## API Reference

All under `/api/v1/prompt-bot/skill-jobs`. JSON envelope as everywhere (`{ success, data }` / `{ success: false, error: { code, message, details? } }`). 401 `UNAUTHORIZED` without a session. Ownership failures are 404 `NOT_FOUND`.

| Method & path | Body / query | Success | Errors |
|---|---|---|---|
| `POST /` | `{ title?: 1–120, description?: ≤ 20 000 }` | 201 `JobView` | 400 |
| `GET /:id` | — | 200 `JobView` | 404 |
| `PATCH /:id` | `{ title?, description? }` (at least one) | 200 `JobView` | 400, 404 |
| `DELETE /:id` | — | 200 `{ deleted: true }` | 404 |
| `PUT /:id/answers/:questionId` | `{ answer?: ≤ 4000, notRelevant? }` | 200 `{ saved: true }` | 400, 404 (job or question) |
| `POST /:id/score` | `{ revision }` | 200 `ScoreReply` | 400, 404, 429, 503, 502 |
| `POST /:id/files?name=<encoded file name>` | raw bytes | 201 `JobFileView` (`PENDING`) | 400 (no name, empty, `UPLOAD_INCOMPLETE`), 404, 409 `TOO_MANY_FILES`, 413 `FILE_TOO_LARGE`, 415 `UNSUPPORTED_FILE`, 422 `FILE_ENCRYPTED`/`FILE_UNREADABLE`, 429, 503 |
| `GET /:id/files/:fileId` | — | 200 `JobFileDetail` (with facts) | 404 |
| `PATCH /:id/files/:fileId` | `{ analysis: 1–12 000 }` | 200 `JobFileView` | 400, 404, 409 `ALREADY_ANALYSING` |
| `DELETE /:id/files/:fileId` | — | 200 `{ deleted: true }` | 404, 409 `ALREADY_GENERATING` |
| `POST /:id/files/:fileId/analyse` | — | 202 `JobFileView` (`PENDING`) | 404, 409 `ALREADY_ANALYSING`, 429, 503 |
| `POST /:id/suggest` | — | 200 `JobView` | 400, 404, 409 `FILES_ANALYSING`/`ALREADY_GENERATING`/`TOO_MANY_SKILLS` (5 skills already have versions, so nothing can be added)/`DUPLICATE_NAME` (a concurrent save won the name), 429, 502, 503 |
| `POST /:id/skills` | `{ name: 1–120, purpose: 1–300, fileIds?: string[] }` | 201 `JobSkillView` | 400, 404, 409 `DUPLICATE_NAME`/`TOO_MANY_SKILLS` |
| `PATCH /:id/skills/:skillId` | `{ name?, purpose?, fileIds?, order? }` | 200 `JobSkillView` | 400, 404, 409 `DUPLICATE_NAME`/`ALREADY_GENERATING` |
| `DELETE /:id/skills/:skillId` | — | 200 `{ deleted: true }` | 404, 409 `ALREADY_GENERATING` |
| `POST /:id/skills/:skillId/generate` | — | 202 `JobSkillView` | 400, 404, 409 `ALREADY_GENERATING`/`FILES_ANALYSING`, 429, 503 |
| `GET /:id/skills/:skillId/versions/:version` | `version` = int ≥ 1 or `latest` | 200 `VersionDetail` | 400, 404 |
| `GET /:id/skills/:skillId/versions/:version/download` | `?format=upload\|pack` (default `upload`) | 200 zip | 400, 404, 409 `ASSET_MISSING`/`PACK_TOO_LARGE` |
| `GET /:id/download` | — | 200 zip | 404, 409 `NOTHING_TO_DOWNLOAD`/`DUPLICATE_NAME`/`ASSET_MISSING`/`PACK_TOO_LARGE` |

Error mapping for AI calls is the existing `aiErrorResponse` (503 `AI_NOT_CONFIGURED`, 429 `LIMIT_REACHED` with `feature` and `resetAt`, 502 `AI_FAILED`). Only AI-layer errors (`LimitReachedError`, `AiNotConfiguredError`, `isAiCallError`) are mapped; anything else is a real 500. Upload, analyse, suggest, generate and score refuse with 503 up front when `ANTHROPIC_API_KEY` is missing; viewing, editing text and downloading never need the AI.

`fileIds` in skill bodies are filtered to the job's active files (unknown ids are dropped silently, as the model's are). `fileIds` max 10 entries.

Views (`src/lib/skills/jobs/types.ts`, dates as ISO strings):

```ts
type JobFileView = { id; fileName; assetName; kind; size; createdAt; analysisStatus: "PENDING" | "READY" | "FAILED";
  analysis: string | null; analysisEdited: boolean; analysisError: string | null; bundlable: boolean };
type JobFileDetail = JobFileView & { facts: FileFacts | null };
type VersionSummary = { version; name; createdAt; assets: number };   // no contents or descriptions: views stay small
type JobSkillView = { id; order; name; purpose; fileIds: string[]; status: "DRAFT" | "GENERATING" | "READY" | "FAILED";
  validationErrors: string[]; latestVersion: number; versions: VersionSummary[] };   // newest first
type JobView = { id; title; description; scoreRevision; updatedAt; suggestedAt: string | null;
  matrix: SkillMatrixView; answers: AnswerView[]; files: JobFileView[]; skills: JobSkillView[] };
type VersionDetail = { skillId; version; name; description; createdAt; files: SkillFile[];
  assets: { path; fileId; fileName; bytes }[] };
```

`bundlable` is `size ≤ 10 MB`. Views apply the staleness rules (interrupted analysis or generation reads as `FAILED` with its message). Soft-deleted files never appear in `files`.

## UI

Use the LMS design system (`glass` cards, `components/ui`, `--primary`, `rounded-2xl`/`rounded-[1.75rem]`, lucide icons, dark mode). Invoke the `impeccable` skill before each UI task. Every screen works at 360 px wide: one column, controls at least 44 px tall, no horizontal scroll.

### `/prompt-bot/skills` — home

- Header "Skills Builder" and one line: "Turn a job you do every week into your own Agent Skills, built from your own files and templates."
- **New job** card: title (optional, "e.g. Monthly board update"), a large textarea "Describe the job as you do it today" (placeholder lists: steps, inputs, outputs, who it's for), button **Start job** (`⌘/Ctrl+Enter`). Draft kept in browser storage (`useLocalDraft`). Creating needs no AI.
- **Your jobs**: title, "N skills · M files", updated date; newest first, 20 shown.
- **Earlier skill packs** (collapsed `<details>`, only when any exist): title, "Read-only".
- Privacy line: "Your job, files and answers are stored in the LMS and sent to Anthropic's API to build your skills."
- Without `ANTHROPIC_API_KEY`: the New job card is replaced by `NotConfigured`; jobs and legacy packs stay listed.

### `/prompt-bot/skills/[jobId]` — job workspace

Header: editable title (pencil → input, Enter/blur saves), **Download all skills** (enabled when any skill has a version), and a labelled **Delete job** icon button (`ConfirmDialog`, destructive).

Step navigation (an ordered list of buttons, `aria-current="step"`, wraps on mobile): **1 Job · 2 Files · 3 Questions · 4 Skills**. Every step is reachable at any time; the Files step shows a count badge, the Questions step the readiness meter's "N of 8", the Skills step the skill count. The selected step is kept in the URL hash (`#files`) so reload and Back keep it.

1. **Job:** the description textarea (autosaves through `useMatrixAnswers.queueSave("description")`, which bumps the revision and rescores), character count, and a hint card "Include: the steps you take, what you start from, what you hand over, who reads it, how you know it's good."
2. **Files:** a drop zone and **Upload files** button (multiple; uploads run one at a time with a per-file progress row); accepted types and limits as helper text ("PowerPoint, Word, Excel, PDF, PNG or JPG · up to 20 MB each · 10 files"). Each file card: icon by kind, name, size, kind, status:
   - `PENDING` — "Analysing…" with spinner (polled);
   - `READY` — the analysis rendered with `SafeMarkdown`, an **Edit** toggle (textarea, **Save**, **Cancel**), an "Edited by you" badge when `analysisEdited`, **Analyse again** (confirm when edited: "Replace your edited style guide?"), **Remove**;
   - `FAILED` — the error, **Analyse again**, **Write it yourself** (opens the editor empty);
   - files over 10 MB show "Too large to bundle — the skill will use the analysis only."
   Upload errors appear inline on the file's progress row with the server's message (unsupported, encrypted, unreadable, too large, too many files, limit reached).
3. **Questions:** the enhancer's two-column layout: left `MatrixPanel` (8 questions, 3-slice bars, readiness, "Updating…"), right the selected question's answer box with its guidance as placeholder. On mobile the panel stacks above the answer box. A note under the panel: "Scored against your job description, answers and files."
4. **Skills:**
   - Empty: "Let the AI suggest the skills for this job." **Suggest skills**. If questions are unanswered, one `ConfirmDialog`: "N questions unanswered — suggestions will be more general. Suggest anyway?" Re-suggest when skills exist: "Suggest again" (keeps skills that have versions; replaces drafts) with the same dialog plus "This replaces the skills you haven't generated yet."
   - **Add skill** (name + purpose) for manual additions.
   - Skill card per skill: editable name (kebab-case shown in `font-mono`, normalised on save, duplicate → inline error), purpose (autosave), file chips (toggle which of the job's files this skill uses), status line (`Draft`, `Writing… (this can take a minute or two)`, `v3 ready`, `Last attempt failed` + errors, with older versions still available), "Renamed — generate again to use the new name" when the name differs from the latest version's, **Generate** / **Generate v{n+1}** (one `ConfirmDialog` only when questions are unanswered: "N questions unanswered — the skill will be more general. Generate anyway?"; no confirm otherwise, because a new version never replaces an old one), **Remove** (confirm, destructive; "This deletes all its versions.").
   - **Versions**: a select (`v3 · 25 Nov 14:02`, newest first) and a read-only preview (`SkillFilesView`: file tree with `assets/` entries showing size and "original file", rendered `SKILL.md`, other text files in a monospace block, the "Review scripts before running them" notice on `scripts/` files). **Download skill** (upload zip of the selected version) and **Download as pack**. Note "We keep the last 20 versions of each skill."
- Polling: while any file is `PENDING` or any skill is `GENERATING`, poll `GET /skill-jobs/:id` (3 s, ×1.5 backoff, max 15 s, capped at 11 minutes, then "Still working. Refresh later."). Updates replace only the polled rows' status fields so typing is never overwritten. When a file turns `READY` the workspace bumps the scoring revision and schedules a score.
- Without `ANTHROPIC_API_KEY`: AI actions (upload, analyse, score, suggest, generate) are disabled with the `NotConfigured` notice at the top; viewing, editing text and downloads work.

### `/prompt-bot/skills/legacy/[packId]`

As described under Legacy Skill Packs. Reuses `SkillFilesView`.

### Tabs

`PromptBotTabs` keeps "Prompt Bot" and "Skills Builder"; `isSkillsPath` matches `/prompt-bot/skills` and `/prompt-bot/skills/…` only.

## Error Handling

The enhancer's codes apply (400 `VALIDATION_ERROR`, 401, 403 `FORBIDDEN` is not used by these routes, 404 `NOT_FOUND`, 429 `LIMIT_REACHED`, 503 `AI_NOT_CONFIGURED`, 502 `AI_FAILED`) plus the 409/413/415/422 codes in the API table. Client copy shows the server's `message`. Analysis and generation failures are recorded on the row, never thrown out of `after()`.

## Follow-ups Folded In

- **Double confirm on Generate again** (old `SkillRefine.generate` used a `ConfirmDialog` and then `window.confirm`): the new flow uses exactly one `ConfirmDialog`, and only when questions are unanswered. No `window.confirm` anywhere in the Skills Builder.
- **DB unique index for skill names**: `@@unique([jobId, name])` on the new table (cheap: new table, no backfill). Legacy items are read-only, so no index is added there.

## Testing

Witnessed failing-test-first for every production change (Vitest, `src/**/*.test.ts`; component tests use `React.createElement` and `/** @vitest-environment jsdom */`; Prisma and the AI client are mocked as in the existing tests).

**Fixtures are generated in tests, never committed as binaries.** `src/lib/skills/files/fixtures.ts` (imported only by tests and the E2E fixture script) builds real packages with `fflate.zipSync`:
- `buildPptx({ slides, theme, slideSize, layouts, masters, macro? })` writes `[Content_Types].xml`, `_rels/.rels`, `ppt/presentation.xml`, `ppt/_rels/presentation.xml.rels`, `ppt/theme/theme1.xml`, `ppt/slideMasters/slideMaster1.xml`, `ppt/slideLayouts/slideLayoutN.xml`, `ppt/slides/slideN.xml` and their rels;
- `buildDocx({ paragraphs, styles, theme, page })` and `buildXlsx({ sheets, sharedStrings, numFmts, theme })` likewise;
- `tinyPdf({ pages, encrypted? })` writes a valid minimal PDF as text; `tinyPng(width, height)` / `tinyJpeg` via `sharp({ create })`;
- `oleHeader()` (encrypted/legacy Office), `zipBomb()` (an entry whose declared size exceeds 16 MB).

**Unit:**
- Sniffing: every kind; OLE → `FILE_ENCRYPTED`; encrypted PDF; macro package; random bytes and empty → `UNSUPPORTED_FILE`; corrupt zip → `FILE_UNREADABLE`; declared MIME ignored.
- XML scanner: prefixes, self-closing tags, attributes with entities, numeric entities, nested different tags.
- Theme: all 12 slots, `sysClr@lastClr`, major/minor fonts.
- PPTX: slide size and aspect, masters, layout names, slide order from `sldIdLst` (not file numbers), per-slide title/placeholders/tables/charts/images/layout, colours and fonts used, truncation at 60 detailed slides, oversize part skipped with `truncated`.
- DOCX: defaults, styles (font, size, colour, bold, basedOn), headings with levels, tables, images, page size/orientation, text sample bound.
- XLSX: sheet order and names, header row through shared and inline strings, formulas count and samples, custom number formats, charts, defined names.
- PDF: version, page count, `null` pages, title; images: dimensions, mismatched or undecodable bytes; resized copy ≤ 1568 px.
- Facts bound: oversized facts trimmed to ≤ 64 KB with `truncated`.
- Asset names: unsafe characters, leading dots, Unicode, length, extension by kind (not by the upload name), case-insensitive dedupe.
- Scoring base: description + READY analyses, truncation, failed files skipped.
- Suggestions clean-up: unique names against kept skills, unknown file ids dropped, cap at 5, fallback single skill.
- Asset plan: ≤ 10 MB rule, 25 MB budget, order. Files section text. Style guide (edited analysis verbatim, missing analysis, shortening to 200 KB). Model `references/style-guide.md` dropped. Validation of asset paths, collisions, count.
- Zips: binary asset bytes round-trip exactly (compare SHA-256), assets stored with level 0, upload zip root folder, pack layout, size guard, duplicate names, unsafe paths refused.
- Instructions: analysis message per kind (document block first for PDF, image block for images), suggest and generate messages (gaps, files with bundled/analysis-only status), retry message.
- Claude calls (SDK mocked): analysis uses `messages.create` with `FAST_MODEL`, the right content blocks and request options; suggest/generate use `beta.messages.create` with the fallback beta, schemas, and options; stop reasons and bad JSON raise `AiResponseError`.

**Routes** (AI and Prisma mocked): ownership 404 on every route; upload — content-length over cap refused before reading, streamed body over cap, count cap, each sniff error code, usage spent only after checks, 503 without a key, `after()` scheduled, 201 view; analysis edit/again and their 409s; suggest preconditions and transaction; skill add/rename duplicate (pre-check and `P2002`), rename while generating; generate claim, 409s, 429, 503; versions `latest` and invalid version; downloads 409s and content type; legacy GET routes still work and removed methods are gone.

**Data layer:** analysis run — READY, FAILED on each failure class, PDF over 100 pages skipped, interrupted staleness; generation — retry once then FAILED with old versions kept, version numbering, pruning to 20, purge of unreferenced soft-deleted files; file delete — soft vs hard.

**Components:** home page lists (jobs, legacy collapsed), new job form, step nav and hash, files panel states (pending, ready with edit, failed, too large badge, upload error row), questions panel bars and stacked layout, skills panel (suggest with one confirm, generate with one confirm only when gaps exist, rename duplicate error, file chips, versions select and preview, downloads), `SkillFilesView` (asset entries, script notice), legacy view read-only (no edit controls).

**End to end** (fake Anthropic, browser): `apps/web/scripts/fake-anthropic.mjs` is extended to recognise the new shapes by request: analysis (system prompt marker "style guide", plain text reply; logs `analyse pdf|image|text` from the content block types, never content), suggest (schema property `skills`), job generation (schema has `body` and no `assets`; `FAKE_FIRST_INVALID=1` makes the first draft fail validation). `apps/web/scripts/make-skill-fixtures.ts` writes `deck.pptx`, `brief.docx`, `numbers.xlsx`, `brand.pdf`, `logo.png`, a 12 MB padded PPTX and an OLE file to a temp folder from the same fixture builders. Browser run (isolated `agent-browser` session, a MENTEE account): start a job → upload all fixtures (watch analyses turn READY; the OLE file shows the encrypted message; the 12 MB deck shows "Too large to bundle") → edit one analysis → answer questions and watch bars move → Suggest (one confirm with gaps) → rename a skill → Generate (fake logs `generate` then `generate (retry)`) → v1 preview shows `assets/deck.pptx` → change the description, Generate v2 → v1 still previewable → download skill zip and pack zip. Then the oracle: unzip both, check no unsafe paths, every `skills/<name>/` and every `upload-to-claude/*.zip` (single root folder = name) passes `quick_validate.py` (`/Users/tharunkumarl/.claude/skills/synced/bfef6136-f152-4b96-834c-6925fa876c60_248f4955-89f1-4681-b216-9881dcea93ad/skill-creator/scripts/quick_validate.py`), and `assets/deck.pptx` in both zips has the same SHA-256 as the uploaded fixture. Also: a legacy pack (seeded by SQL in the local DB) opens read-only and downloads; `/prompt-bot/catalog` is 404; mobile viewport (390 × 844) walk-through of all four steps without horizontal scroll.

**Real API smoke** (after the fake run): one job with one real PPTX and one PDF; analyses mention the deck's theme colours by hex; one generated skill passes the oracle.

## Rollout

- **Branch and PR:** `feat/skills-builder-jobs` from `main`; one PR.
- **Migration:** `20261125120000_add_skill_jobs` (two enums, five tables, indexes, foreign keys). Applied by `start.sh` (`prisma migrate deploy`) on deploy; additive, so the previous image keeps working against the new schema during the switch.
- **Configuration:** no new environment variables. `skill_analyze` uses its default (40/day) until an admin changes it.
- **Data:** legacy packs stay readable; nothing is migrated into jobs. Catalog rows stay in the database, unused.
- **Storage:** uploads add up to 200 MB per job to Postgres. Watch database size after release; per-job limits are the control.
- **Production check after deploy:** upload a PPTX on production and confirm the analysis appears (proves `after()` and the analysis call), generate one skill, download it.

## Out of Scope

- Editing generated files in the app (change the job, files or analyses and generate a new version instead).
- Rendering or previewing uploaded files (thumbnails, slide images).
- Reading legacy formats (`.ppt`, `.doc`, `.xls`), Keynote, Pages, Numbers, Google formats, SVG, GIF, WebP.
- OCR beyond what Claude reads from PDFs and images.
- Sharing jobs or skills between users; publishing skills.
- Migrating legacy packs into jobs.
- Running or testing generated skills inside the LMS.
