# Prompt Bot — Skills Builder: Plugins

## Objective

Each task now produces **one Claude plugin**, uploaded as one zip: a **main skill** that runs the whole job end to end **and orchestrates every sub-skill** (today's skill content plus a workflow section), plus **2–6 sub-skills** (the AI proposes 2–4), each **self-sufficient when called alone** for just that part — e.g. a deck task → `deck-analyzer`, `deck-designer`, `deck-formatter`, `deck-grammar-check`. The user calls either the main skill (everything) or any one sub-skill (one part). The user names the plugin and every skill before generating; one **Generate plugin** writes a new immutable version of the whole plugin, validated, downloadable as an uploadable plugin zip.

This spec changes [the tasks spec](2026-11-25-skills-builder-tasks-design.md) and [the jobs spec](2026-11-25-skills-builder-jobs-design.md). Everything there still holds unless changed here (files, analysis, questions, per-use inputs, style guide, "Before you start", staleness, limits, ownership, envelope, error copy style).

## Decisions beyond the approved design

1. **Plugin versions are self-contained rows** (`SkillPluginVersion`: every text file + asset entries). Member skills are not stored as `SkillVersion` rows, so renaming/removing a sub-skill never breaks an old plugin version.
2. **Assets:** binary originals are bundled **once, in the main skill** (`skills/<main>/assets/…`). A sub-skill gets its own copy only when the file is ≤ 1 MB and it selected that file, while the plugin's total asset bytes stay ≤ 25 MB (today's verified one-skill cap). Otherwise the sub-skill's "Files in this skill" line says *"Kept in the `<main>` skill of this plugin (`assets/<name>`). If you can't open it, ask the user to attach it."* Reason: reading a sibling skill's folder by relative path is not verified in claude.ai, and copying 10 MB files up to 6 times would break the size cap. Text references (style-guide sections for the skill's own files) are always copied into each skill.
3. **No `agents/`** in v1: they only load in Claude Code/Cowork, add nothing in chat, and claude.ai's handling of them on upload is unverified.
4. **Usage:** a new feature `plugin_generate` (default **10/day**), one unit per plugin generation (it makes 3–7 model calls). `skill_split` stays the unit for Suggest.
5. **Generation runs every skill in parallel** (≤ 7 calls, each ≤ 2 attempts × 240 s) inside one `after()`, so the existing 10-minute stale window still holds.
6. **Names are normalised, not rejected** (as skills are today): the server kebab-cases and returns the result; the UI shows the normalised id live. Duplicates are 409 `DUPLICATE_NAME`.
7. **Plugin `version`** in `plugin.json` = `1.<n-1>.0` for plugin version n (v1 = `1.0.0`, v2 = `1.1.0`).
8. **The orchestration and stand-alone sections are server-owned** (like "Before you start"), so every generated plugin has them verbatim and tests can assert them; the model writes only the steps around them.
9. **Each sub-skill's "Before you start" lists all per-use inputs** under the wording "Ask only for the ones this part needs", instead of a stored per-sub-skill input list.
10. **Commands** are thin pointers, e.g. *"Use the `deck-grammar-check` skill from this plugin on: $ARGUMENTS"*. Whether claude.ai shows a command and a skill with the same name as two entries is checked in Track C; if it does, the command's description starts "Shortcut:" so the skill stays the obvious one.

## Data Model (additive migration `20261125170000_add_skill_plugins`)

```prisma
enum SkillRole { MAIN SUB }

model SkillJob {               // + fields
  company                   String          @default("")      // <= 80, "" = none
  pluginName                String?         @map("plugin_name")          // null = default (follows company/title)
  pluginDisplayName         String?         @map("plugin_display_name")  // null = default
  pluginStatus              SkillItemStatus @default(DRAFT) @map("plugin_status")
  pluginValidationErrors    String[]        @default([]) @map("plugin_validation_errors")
  pluginGenerationStartedAt DateTime?       @map("plugin_generation_started_at")
  pluginLatestVersion       Int             @default(0) @map("plugin_latest_version")
  pluginVersions            SkillPluginVersion[]
}

model SkillJobSkill {          // + fields
  role  SkillRole @default(SUB)
  label String    @default("")   // display label <= 60, e.g. "Grammar check"
  focus String    @default("")   // sub-skill: what it does and what it leaves to main, <= 600
  step  String    @default("")   // sub-skill: its line in the main workflow, <= 160, e.g. "Analyse the source files"
}

model SkillPluginVersion {
  id           String   @id @default(cuid())
  jobId        String   @map("job_id")
  version      Int
  name         String                  // plugin id at this version
  displayName  String   @map("display_name")
  /// [{ name, role, label, purpose, description, files: [{path, content}] }], main first.
  skills       Json
  /// Plugin-level text files: .claude-plugin/plugin.json, commands/*.md.
  files        Json
  /// [{ fileId, skill, path, fileName, bytes }] — bundled originals per skill.
  assets       Json
  assetFileIds String[] @default([]) @map("asset_file_ids")
  createdAt    DateTime @default(now()) @map("created_at")
  job          SkillJob @relation(fields: [jobId], references: [id], onDelete: Cascade)
  @@unique([jobId, version])
  @@map("skill_plugin_versions")
}
```

SQL outline: `CREATE TYPE "SkillRole"`; `ALTER TABLE skill_jobs ADD COLUMN …` (7 columns, all defaulted/nullable); `ALTER TABLE skill_job_skills ADD COLUMN role/label/focus`; `CREATE TABLE skill_plugin_versions` + unique index + FK cascade; **data:** `UPDATE skill_job_skills SET role='MAIN' WHERE id IN (SELECT DISTINCT ON (job_id) id FROM skill_job_skills ORDER BY job_id, "order", created_at)`. Nothing dropped, renamed or retyped.

**Existing tasks (migration decision):** every existing job becomes a plugin draft — its first skill (lowest order) is MAIN, the rest SUB (jobs had ≤ 5 skills, so they fit). Their old per-skill `SkillVersion`s are untouched and still preview/download as single-skill zips (routes 22–24) under **Earlier single-skill versions**. A job with no skills gets its structure from Create my skills. A job with 1 skill must reach 2 sub-skills before generating.

`purgeUnreferencedFiles` also keeps files referenced by any `SkillPluginVersion.assetFileIds`. Pruning keeps the newest **20** plugin versions.

## Limits (added to `JOB_LIMITS`)

`skillsPerJob: 7` (was 5), `subSkillsMin: 2`, `subSkillsMax: 6`, `aiSubSkillsMax: 4`, `companyChars: 80`, `pluginDisplayNameChars: 120`, `skillLabelChars: 60`, `skillFocusChars: 600`, `skillStepChars: 160`, `pluginAssetBytes: 25 MB` (all copies), `subSkillAssetCopyBytes: 1 MB`, `pluginVersionsKept: 20`. Name rules unchanged: `SKILL_NAME_MAX = 64`, `^[a-z0-9]+(-[a-z0-9]+)*$`.

## Naming Rules

- **Plugin display name** default: `"<Company> · <Task title>"`, or the title alone when no company. One line, 1–120.
- **Plugin id** default: `normalizeSkillName("<company> <title>", "my-plugin")`. Stored only once the user sets it (`nameIsDefault`). Changing it after a version exists shows: *"Claude treats a new ID as a new plugin. Remove the old one from Claude after you upload this."*
- **Skill names**: kebab, ≤ 64, unique within the plugin (existing `@@unique([jobId, name])`). Main default from the AI, else `normalizeSkillName(title)`. A skill may share the plugin id.
- Names are written into `plugin.json`, each `SKILL.md` frontmatter `name` (== folder) and `commands/<skill>.md` file name; the zip file name never matters to Claude.
- How to call (shown in UI and README): chat — *"use `<skill>` on this…"*; Claude Code/Cowork — `/<plugin>:<skill>`.

## Plugin Zip Layout

`GET …/plugin/versions/:v/download?format=plugin` → `<plugin>-v<n>.zip`:

```
acme-quarterly-deck/
├── .claude-plugin/plugin.json
├── commands/
│   ├── quarterly-deck.md          # main
│   ├── deck-designer.md
│   └── deck-grammar-check.md
└── skills/
    ├── quarterly-deck/            # main: whole job
    │   ├── SKILL.md
    │   ├── references/style-guide.md
    │   └── assets/template.pptx   # bundled once
    ├── deck-designer/
    │   ├── SKILL.md
    │   ├── references/style-guide.md   # only its files' sections
    │   └── assets/logo.png             # <= 1 MB copy
    └── deck-grammar-check/
        └── SKILL.md
```

```json
{ "name": "acme-quarterly-deck", "displayName": "Acme · Quarterly deck", "version": "1.0.0",
  "description": "<main skill purpose> Includes: deck-designer, deck-grammar-check.", "author": { "name": "Acme" } }
```

`author.name` = company, else the user's name, else `"Skills Builder"`. `description` ≤ 1024. No top-level `bin/`, `hooks/`, `.mcp.json` or `agents/`.

`commands/<skill>.md`:

```markdown
---
description: <skill purpose, one line, <= 1024>
---
Use the `<skill>` skill from this plugin on: $ARGUMENTS
```

The main skill's command runs the whole flow: *"Run the `<main>` skill from this plugin — the whole job, using each sub-skill in turn — on: $ARGUMENTS"*.

`format=share` → `<plugin>-v<n>-share.zip`: `<plugin>-share/README.md` (what the plugin is, a table of skills with purpose + how to call each, install steps), `<plugin>-share/plugin/<plugin>/…` (readable files, as above), `<plugin>-share/upload-to-claude/<plugin>.zip` (stored, level 0). Size checked before bytes load (`packZipBytes`).

## Orchestration (server-owned SKILL.md sections)

**Main skill** — inserted after "Before you start" (removing any model-written section with the same heading). Sub-skills appear in their `order`, which the user can change:

```markdown
## How this skill works

This skill runs the whole job and uses every sub-skill in this plugin. At each step, load and follow that sub-skill's SKILL.md (in Claude Code or Cowork you can also run its command), then carry on here.

1. Gather the inputs listed in "Before you start".
2. `deck-analyzer` — Analyse the source files. (`/acme-quarterly-deck:deck-analyzer`)
3. `deck-designer` — Lay out the slides in the house style. (`/acme-quarterly-deck:deck-designer`)
4. `deck-formatter` — Apply the template's formatting. (`/acme-quarterly-deck:deck-formatter`)
5. `deck-grammar-check` — Check the wording before handing over. (`/acme-quarterly-deck:deck-grammar-check`)
6. Finish with the steps below and hand the result over.
```

**Each sub-skill** — inserted after the title line, then its own "Before you start" (all per-use inputs; intro "Ask only for the ones this part needs, and only if the request doesn't already give them."):

```markdown
> Part of the **Acme · Quarterly deck** plugin. Use this skill alone when you only need this part; the `quarterly-deck` skill also runs it as step 3 of the whole job.
```

A sub-skill never depends on the main skill or a sibling being loaded: its steps, its references and its "Files in this skill" lines stand alone (decision 2 covers assets it doesn't carry).

## Plugin Validation (`validatePlugin`, server-owned)

Each `skills/<name>/` passes the existing `validateJobSkill`. Plus: plugin id valid kebab; `displayName` 1–120; `version` semver; `description` 1–1024; `author.name` non-empty; skill names unique, folder == frontmatter `name`; one command per skill with a non-empty `description` frontmatter; the main SKILL.md has exactly one "## How this skill works" section naming every sub-skill; each sub-skill has the stand-alone note; 1 MAIN + 2–6 SUB; total assets ≤ `pluginAssetBytes`; paths ≤ 200; no forbidden top-level entries. Errors are prefixed with the skill name (`deck-designer: description is too long`).

## API Contract (binding for both tracks)

Prefix and envelope unchanged; common failures as in the tasks spec. Shared types live in `src/lib/skills/jobs/types.ts` (written first, Track A task A0).

### View types

```ts
export type SkillRole = "MAIN" | "SUB";

export type JobSkillView = {           // + role, label, focus
  id: string; order: number; role: SkillRole; name: string; label: string; purpose: string; focus: string; step: string;
  fileIds: string[]; status: SkillItemStatus; validationErrors: string[];
  latestVersion: number; versions: VersionSummary[];   // legacy per-skill versions only (read-only)
};

export type PluginVersionSummary = { version: number; name: string; displayName: string; createdAt: string; skills: number; assets: number };

export type PluginView = {
  name: string;               // effective id (default or set)
  nameIsDefault: boolean;
  displayName: string;        // effective
  displayNameIsDefault: boolean;
  status: SkillItemStatus;    // DRAFT | GENERATING | READY | FAILED (stale GENERATING reads as FAILED, as today)
  validationErrors: string[];
  latestVersion: number;      // 0 = never generated
  versions: PluginVersionSummary[];   // newest first, <= 20
};

export type JobView = { /* tasks fields … */ company: string; plugin: PluginView; skills: JobSkillView[] /* main first */ };

export type PluginSkillDetail = { name: string; role: SkillRole; label: string; purpose: string; description: string;
  files: SkillFile[]; assets: VersionAsset[] };
export type PluginVersionDetail = { version: number; name: string; displayName: string; createdAt: string;
  manifest: { name: string; displayName: string; version: string; description: string; author: { name: string } };
  commands: SkillFile[]; skills: PluginSkillDetail[] };

/** Suggest's raw reply. */
export type RawPluginSuggestion = {
  main: { name: string; label: string; purpose: string; fileIds: string[] };
  subSkills: { name: string; label: string; purpose: string; focus: string; step: string; fileIds: string[] }[];   // in workflow order
};
```

### Routes (new or changed; all others unchanged)

| # | Method & path | Request | Success | Errors |
|---|---|---|---|---|
| 3 | `PATCH /:id` changed | + `company?: string (≤ 80)`, `pluginName?: string (1–120) \| null`, `pluginDisplayName?: string (1–120) \| null` (`null` = back to default) | 200 `JobView` | 409 `ALREADY_GENERATING` (plugin name change while generating) |
| 17 | `POST /:id/suggest` changed | — | 200 `JobView` (1 MAIN + 2–4 SUB) | as today; replaces every skill without legacy versions; rows with `latestVersion > 0` stay (kept MAIN stays MAIN) |
| 18 | `POST /:id/skills` changed | `{ name, label?: ≤ 60, purpose, focus?: ≤ 600, step?: ≤ 160, fileIds? }` — always a SUB, appended last in the workflow | 201 `JobSkillView` | 409 `TOO_MANY_SKILLS` "A plugin can have at most 6 sub-skills.", `DUPLICATE_NAME` |
| 19 | `PATCH /:id/skills/:skillId` changed | + `label?`, `focus?`, `step?`; `order` reorders the workflow (`role` is not patchable) | 200 `JobSkillView` | 409 `DUPLICATE_NAME`/`ALREADY_GENERATING` |
| 20 | `DELETE /:id/skills/:skillId` changed | — | 200 `{ deleted: true }` | 409 `MAIN_REQUIRED` "The main skill can't be removed. Rename it instead.", `ALREADY_GENERATING` (plugin generating) |
| 21 | `POST /:id/skills/:skillId/generate` **removed** | — | — | 404 (UI no longer calls it) |
| 25 | `POST /:id/plugin/generate` **new** | — | 202 `PluginView` (`GENERATING`) | 400 `EMPTY_DESCRIPTION` "Describe the task first.", 400 `PLUGIN_INVALID` (`details: { skills: ["Add at least 2 sub-skills."] }`), 409 `ALREADY_GENERATING`/`FILES_ANALYSING`, 429 (`plugin_generate`), 503 |
| 26 | `GET /:id/plugin/versions/:version` **new** | `version` = int ≥ 1 or `latest` | 200 `PluginVersionDetail` | 400, 404 "Version not found" |
| 27 | `GET /:id/plugin/versions/:version/download?format=plugin\|share` **new** | — | 200 zip (`<plugin>-v<n>.zip` / `<plugin>-v<n>-share.zip`) | 409 `ASSET_MISSING`/`PACK_TOO_LARGE` |

Routes 22–24 stay for legacy per-skill versions. The UI polls `GET /:id` while `plugin.status === "GENERATING"`.

Example — `POST /:id/plugin/generate` → 202:

```json
{ "success": true, "data": { "name": "acme-quarterly-deck", "nameIsDefault": true, "displayName": "Acme · Quarterly deck",
  "displayNameIsDefault": true, "status": "GENERATING", "validationErrors": [], "latestVersion": 0, "versions": [] } }
```

### Client functions (`client.ts`)

New: `generatePlugin(jobId) → PluginView`, `getPluginVersion(jobId, version) → PluginVersionDetail`, `pluginDownloadUrl(jobId, version, format: "plugin" | "share")`. Changed: `patchJob` accepts `company`, `pluginName`, `pluginDisplayName`; `addJobSkill`/`patchJobSkill` accept `label`, `focus`, `step`. Removed: `generateJobSkill`.

## AI Prompt Changes

- **Suggest** (`SUGGEST_SYSTEM`, `buildSuggestMessage`, `suggestJobSkills` schema → `RawPluginSuggestion`): "Design one plugin for this task: a main skill that does the whole job end to end, and 2–4 sub-skills, each one focused part a person would ask for on its own (design, analysis, formatting, a checker…). Kebab-case names that read well after a slash, a short label, a 'when to use' purpose, a focus saying what it does and leaves to the main skill, a one-line `step` for its place in the main workflow, the sub-skills in the order the main skill should run them, and the files it needs." `<task>` gains `company:` when set. Clean-up: `cleanPluginSuggestion` (unique names, one-line fields, known files, cap 4 subs; < 2 subs → fallback `<base>-planner` "Plans the work and gathers the inputs before starting" and `<base>-checker` "Checks finished work against this task's standards and lists fixes"; no main → today's `fallbackSuggestion`).
- **Generate main** (`buildJobGenerateMessage`): + `<plugin name displayName>` and `<sub_skills>` (name, purpose) in workflow order. Rules: the server adds "How this skill works"; write the main skill's own steps so they refer to each sub-skill by name where it applies; never copy a sub-skill's instructions in full.
- **Generate sub** (new `buildSubSkillGenerateMessage`, `GENERATE_SUB_SKILL_RULES` appended to `GENERATE_JOB_SYSTEM`): `<task>`, `<questions>` (only its files attached), `<main_skill>`, `<sub_skill name purpose focus>`, `<siblings>`. Rules: do only the focus; work completely on its own when called alone (its own steps and checks, no reliance on the main skill or siblings being loaded); stay short; same per-use rule; the server adds the stand-alone note and "Before you start". The server inserts "Before you start" into every skill (main and sub) with all per-use inputs.
- Same structured draft (`JobSkillDraft`), same Opus call, same retry-with-errors.

## Generation Flow

`startPluginGeneration`: ownership → description → files not analysing → structure valid (`PLUGIN_INVALID`) → claim job (`pluginStatus = GENERATING`, guard on stale like today) → consume `plugin_generate` (refund the claim on failure). `runPluginGeneration` (in `after()`, never throws): snapshot skills/files/questions; for each skill in parallel: plan assets (main bundles all its bundlable files; sub copies ≤ 1 MB ones within budget, else note), build message, call, assemble, `validateJobSkill`, one retry. Any skill fails → `FAILED` with prefixed errors, nothing written. All pass → build `plugin.json` + commands, `validatePlugin`, then one transaction guarded by this run's claim: insert `SkillPluginVersion` n, set `pluginLatestVersion`, `READY`, prune > 20.

## UI (Skills step and Task step)

Invoke **`impeccable`** before each UI task; LMS design system, 44 px targets, 390/360 px, dark mode, `fixing-accessibility`.

- **Task step:** "Company or team (optional)" input under the title (≤ 80, autosaved with the title).
- **Skills step, before Create my skills:** today's empty state, copy "Claude will suggest one plugin: a main skill for the whole job and a few sub-skills for its parts."
- **Overview (after Create my skills):**
  - **Plugin card:** Display name input; ID input with live kebab preview, "Default" hint and reset; the ID-change warning once a version exists; "Shows in Claude as **Acme · Quarterly deck**".
  - **Hierarchy:** the main skill sits on top, the sub-skills indented under it as numbered workflow steps.
  - **Main skill row** (badge "Main — runs everything, using all sub-skills"): name, label, purpose, file chips; how to call (chat: say "use `quarterly-deck` for this"; Claude Code / Cowork: `/acme-quarterly-deck:quarterly-deck`); no remove.
  - **Sub-skills list** (each badged "Use alone for just this part"; move up/down reorders the workflow): per row name, label, purpose, step line, focus (collapsed "What it leaves to the main skill"), file chips, **How to call**: "In Claude chat: say "use `deck-grammar-check` on this…"" and "Claude Code / Cowork: `/acme-quarterly-deck:deck-grammar-check`" (copy buttons). Remove disabled at 2 ("A plugin needs at least 2 sub-skills."); **Add sub-skill** disabled at 6.
  - **Generate plugin** (one confirm when questions are unanswered); status line ("Writing 5 skills…", errors listed by skill); **Redraft** confirm "This replaces your plugin's skills and names. Past versions stay downloadable."
  - **Versions:** list of plugin versions; preview with a tab per skill (SKILL.md, references, assets list) plus `plugin.json` and commands.
  - **Downloads:** **Download for Claude** (plugin zip) and **Download to share**. **How to use** callout: "In Claude: Settings → Capabilities → turn on Create and edit files. Then Plugins → Add → Upload plugin and choose the plugin zip. In chat, ask for a sub-skill by name ("use deck-grammar-check on this"). In Claude Code or Cowork, type `/acme-quarterly-deck:deck-grammar-check`."
  - **Earlier single-skill versions** (legacy jobs only): today's per-skill version list and downloads, read-only.
- Workspace header "Download all skills" → **Download plugin** (latest, `format=plugin`; hidden until v1). Step nav "3 Skills (n)" counts all skills.

## Testing

Failing test first for every production change (Vitest; Prisma and AI mocked with `vi.hoisted`; jsdom component tests).

- **Unit:** default names (company/no company, unicode, empty → fallbacks), `cleanPluginSuggestion` (caps, uniqueness, fallbacks), sub-skill asset planning (≤ 1 MB copy, budget exhausted → note, main always bundles), `buildPluginManifest` (semver per version, author fallback chain), `buildCommand`, `validatePlugin` (each rule), prompts contain `<sub_skills>`/`<sub_skill>`/`<siblings>`, "Before you start" in every skill.
- **Orchestration:** the main SKILL.md has exactly one "## How this skill works" section that names every sub-skill (in order, with its `/<plugin>:<sub>` command), replacing a model-written copy (the fake main draft includes one); each sub-skill has the stand-alone note and its own "Before you start"; each sub-skill folder, zipped alone, passes `validateJobSkill` (and `quick_validate.py` in E2E).
- **Plugin zip test (`plugin-zip.test.ts`):** build a v1 from a fixture, unzip with `fflate`, assert: exactly one top-level folder `<plugin>/`; `.claude-plugin/plugin.json` parses with the exact keys and values; every `skills/<n>/SKILL.md` frontmatter `name == n` and passes `validateJobSkill`; a `commands/<n>.md` per skill with `description` frontmatter; no `bin/`/`agents/`; assets' SHA-256 equal the originals; share zip contains README, readable folder and the stored plugin zip byte-identical to `format=plugin`.
- **Oracle:** the E2E step runs Anthropic `quick_validate.py` on each unzipped `skills/*` folder.
- **Data layer:** view mapping (plugin defaults, `nameIsDefault`, main first), PATCH plugin fields (normalise, `null` resets), skills CRUD role rules (`MAIN_REQUIRED`, 6-sub cap), suggest replacement keeps legacy-versioned rows, generation (claim, unit refund, parallel, any-fail → FAILED with no write, claim-guarded write, prune 20), purge keeps plugin-referenced files, migration SQL guards + real-Postgres rolled-back check (first skill → MAIN).
- **Routes:** 401/404 ownership on 25–27, 503 before spending, `PLUGIN_INVALID` details, download content types/filenames; route 21 gone.
- **Fake Anthropic:** `main` in the schema → `[fake] suggest-plugin`, replies keyed by the five task types (e.g. carousel → `carousel-designer`, `caption-writer`, `hashtag-check`), one reply with a duplicate sub name to exercise clean-up; `<sub_skill>` in the message → `[fake] generate sub <name>`; builders in `fake-anthropic-shapes.mjs` with a parse test.
- **Components:** company field, plugin card (preview, reset, warning), skill rows (add/remove bounds, how-to-call strings), generate/poll, version preview tabs, downloads/callout copy, legacy section.
- **Browser E2E** (fake API, MENTEE): new task with company "Acme" → questions → Create my skills shows overview (1 main + 3 subs) → rename plugin + one sub, add one, remove one → Generate → v1 preview → both downloads pass the zip checks and oracle; a migrated job shows main + subs and its old versions still download; 390 px and dark screenshots.
- **Real smoke:** upload the plugin zip in claude.ai (Plugins → Add → Upload plugin): plugin shows the display name, main skill runs the full flow and a sub-skill runs alone when called by name in chat; in Claude Code `/plugin:sub-skill` runs; record whether commands duplicate skills in chat (decision 10).

## Rollout

Branch `feat/skills-builder-plugins` from `main` (897d4b6); one PR. Migration runs in `start.sh` (`prisma migrate deploy`); additive, so the previous image keeps working during the switch (it ignores the new columns; route 21 still works there). New usage feature `plugin_generate` (10/day) appears in the admin usage page. No new environment variables. **Production check:** an existing job shows main + subs and its old versions download; a new task generates and downloads a plugin that uploads in claude.ai.

## Out of Scope

Plugin marketplaces, hooks, MCP servers, `agents/`; editing a past version; per-sub-skill generation; sharing a plugin with other LMS users.
