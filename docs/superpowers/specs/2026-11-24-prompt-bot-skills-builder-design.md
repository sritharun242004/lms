# Prompt Bot — Skills Builder Design

## Objective

Let LMS users turn a task or their day-to-day work into **reusable AI skills**. A skill is a packaged set of context and instructions that saves re-explaining everything each time. The flow at `/prompt-bot/skills`:

1. **Describe:** the user describes a task or their routine work, with an optional role.
2. **Split:** the AI splits it into a proposed list of **custom skills to build**, plus **existing public skills** recommended from an admin-curated catalog (for example impeccable for UI/UX work, or a presentation skill for decks).
3. **Refine:** each custom skill is refined with the same matrix and 3-slice status-bar experience as the Prompt Bot enhancer, using a skill-definition matrix.
4. **Generate:** the AI writes each skill as valid **Agent Skills** files.
5. **Preview** the files, edit them, and **download** a zip pack to reuse in Claude, Cursor, Codex and other tools that read the standard.

This spec depends on the shared AI foundation and the matrix and status-bar components defined in [2026-11-24-prompt-bot-enhancer-design.md](2026-11-24-prompt-bot-enhancer-design.md). It replaces the "template" concept seen in the reference product.

## Compatibility Invariants

- Built inside `apps/web`, the same as the enhancer.
- It reuses the enhancer's:
  - AI client and usage limits (`skill_split`, `skill_generate`, plus `score` for live scoring);
  - matrix tables;
  - status-bar, question-row and answer components.
- Nothing about the enhancer's behaviour changes.
- The server never executes generated scripts.

## Target Format: Agent Skills

These rules were verified on 2026-11-24 against Anthropic's skill-creator validator and packager.

- **Folder:** a skill is a folder `<name>/` with exactly one `SKILL.md` at its root. It may also contain `references/` (docs loaded on demand), `scripts/` (executable helpers) and `assets/` (templates and files used in output).
- **`SKILL.md` frontmatter:**
  - Must be YAML between `---` lines.
  - Allowed keys: `name`, `description`, `license`, `allowed-tools`, `metadata`, `compatibility`.
  - `name` is required: kebab-case (`^[a-z0-9-]+$`), no leading, trailing or double hyphen, at most 64 characters.
  - `description` is required: at most 1024 characters, no `<` or `>`. It says what the skill does **and** when to use it, phrased to trigger reliably.
  - `compatibility` is optional, at most 500 characters.
- **Body:** instructions in the imperative, ideally under 500 lines. Larger material goes in `references/` with pointers from `SKILL.md`.
- **Excluded from packages:** `__pycache__/`, `node_modules/`, `*.pyc`, `.DS_Store`, and a root `evals/` folder.
- **Claude.ai accepts one skill per uploaded zip,** with the skill folder at the zip root. A multi-skill pack therefore includes one upload-ready zip per skill.

## Access

- **All signed-in roles** can build skill packs. Packs are private to their owner; anyone else's id returns 404.
- **The skill catalog** is readable by everyone. Only ADMIN and MENTOR can create, edit or deactivate entries.

## Data Model

```prisma
enum SkillItemKind {
  CUSTOM
  CATALOG
}

enum SkillItemStatus {
  DRAFT
  GENERATING
  READY
  FAILED
}

model SkillPack {
  id          String   @id @default(cuid())
  userId      String   @map("user_id")
  title       String   @default("My skills")
  description String                          // what the user described
  role        String?                         // optional "CTO of a 200-person SaaS"
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")
  items       SkillPackItem[]
  @@index([userId, updatedAt])
  @@map("skill_packs")
}

model SkillPackItem {
  id              String          @id @default(cuid())
  packId          String          @map("pack_id")
  order           Int
  kind            SkillItemKind
  catalogEntryId  String?         @map("catalog_entry_id")  // CATALOG items
  name            String                                    // kebab-case for CUSTOM
  purpose         String                                    // one line shown in the list
  status          SkillItemStatus @default(DRAFT)
  files           Json?                                     // [{ path, content }] for CUSTOM once generated
  validationErrors String[]       @map("validation_errors")
  scoreRevision   Int             @default(0) @map("score_revision")
  createdAt       DateTime        @default(now()) @map("created_at")
  updatedAt       DateTime        @updatedAt @map("updated_at")
  answers         SkillItemAnswer[]
  @@index([packId, order])
  @@map("skill_pack_items")
}

model SkillItemAnswer {
  id          String    @id @default(cuid())
  itemId      String    @map("item_id")
  questionId  String    @map("question_id")          // questions of the skill-definition matrix
  answer      String    @default("")
  score       Int       @default(0)
  reason      String?
  notRelevant Boolean   @default(false) @map("not_relevant")
  scoredAt    DateTime? @map("scored_at")
  @@unique([itemId, questionId])
  @@map("skill_item_answers")
}

model SkillCatalogEntry {
  id           String   @id @default(cuid())
  slug         String   @unique
  name         String
  description  String                     // when it helps; used by the split step for matching
  sourceUrl    String   @map("source_url")
  license      String                     // SPDX id or "source-available"
  bundlable    Boolean  @default(false)   // true only for verified permissive licenses
  installNotes String   @map("install_notes")
  tags         String[]
  isActive     Boolean  @default(true) @map("is_active")
  createdById  String?  @map("created_by_id")
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")
  @@map("skill_catalog_entries")
}
```

The migration seeds two things:

- **The `skill-definition` matrix** (kind `SKILL`):

  | # | Question | Guidance |
  |---|---|---|
  | 1 | When should this skill be used? | Situations, requests and phrases that should trigger it, and when it should *not* be used. |
  | 2 | What context does it need to know? | Background about the person, team, company or domain that stays true across uses. |
  | 3 | What inputs will it receive? | What the user provides each time (files, notes, data) and in what shape. |
  | 4 | What are the steps? | The sequence of work, decisions and checks. |
  | 5 | What does a great output look like? | Format, structure, length, tone, and an example if possible. |
  | 6 | What is the quality bar? | Criteria the output must meet before it is done. |
  | 7 | What tools, files or resources does it use? | Templates, reference documents, scripts, apps or plugins it relies on. |
  | 8 | What should it avoid? | Mistakes, sensitive areas, things never to do. |

- **The initial catalog entries:** each entry's license is verified at implementation time, from the source repository's LICENSE file. The verified value goes into `license` and `bundlable`, and any candidate whose license cannot be verified is seeded with `bundlable = false` (link only). Candidates:
  - impeccable (UI/UX design and polish);
  - Anthropic's public skills for presentations (pptx), documents (docx), spreadsheets (xlsx), PDFs and frontend design;
  - Anthropic's skill-creator (for refining skills).

  Anthropic's document skills are source-available, not open source, so they are link only.

## Flow and Contracts

**Split** (`POST /api/v1/prompt-bot/skill-packs` `{description, role?}`):
- The best model receives the description, the role, and the active catalog entries (slug, name, description).
- It returns structured `{ customSkills: [{name, purpose}], catalogMatches: [{slug, why}] }`:
  - at most 8 custom skills;
  - at most 6 catalog matches;
  - catalog slugs not in the active catalog are dropped.
- The pack and its items are created. Custom names are normalised to valid kebab-case, and duplicates get a numeric suffix.
- Usage feature: `skill_split`.

**Edit list:**
- `PATCH /skill-packs/:id` updates the title.
- `POST /skill-packs/:id/items` adds a custom skill `{name, purpose}`.
- `PATCH /skill-packs/:id/items/:itemId` updates `{name?, purpose?, order?}`.
- `DELETE /skill-packs/:id/items/:itemId` removes an item.

**Refine:**
- `PUT /skill-packs/:id/items/:itemId/answers/:questionId` saves an answer `{answer?, notRelevant?}`.
- `POST /skill-packs/:id/items/:itemId/score` `{revision}` scores the item.
- Scoring follows the enhancer's contract exactly (0–3, reasons, stale-revision rule). The text being scored is the purpose plus all answers.

**Generate** (`POST /skill-packs/:id/items/:itemId/generate`):
- The best model receives the pack description, role, skill name, purpose and answers, with unanswered questions listed as gaps. It returns structured output:
  `{ name, description, compatibility?, body, references: [{path, content}], scripts: [{path, content, purpose}], assets: [{path, content}] }`.
- **Content rules given to the model:**
  - Explain the *why* rather than writing rigid ALWAYS/NEVER rules.
  - Put stable context in `references/`.
  - Include scripts only when a deterministic, repeatable helper is clearly useful. Scripts must not make network calls or read credentials.
  - Never invent facts about the user. Missing context becomes clearly marked placeholders in `references/`.
- **The server assembles files and validates them** against the Target Format rules:
  - frontmatter keys and limits;
  - exactly one `SKILL.md`;
  - paths limited to `references/`, `scripts/` and `assets/`, plus `SKILL.md`;
  - no `..`, no absolute paths;
  - file size at most 200 KB each and 1 MB per skill.
- On failure the errors go back to the model for one retry. If it still fails, the item becomes `FAILED` with `validationErrors` and a Retry.
- Usage feature: `skill_generate`.

**Preview and edit:**
- `GET /skill-packs/:id` returns items with their files.
- `PATCH /skill-packs/:id/items/:itemId/files` `{files}` saves edits, re-validating with the same rules.
- The UI shows a file tree, a rendered `SKILL.md`, and editable text for each file. `scripts/` files carry a "Review scripts before running them" notice.

**Download:**
- `GET /skill-packs/:id/download` returns a pack zip; `GET /skill-packs/:id/items/:itemId/download` returns a single skill zip in upload-ready form.
- Zips are built server-side with `fflate`. Every path is generated by the server from the validated names and paths, never taken raw from user input.
- Only `READY` custom items are included.

Pack zip layout:
```
<pack-slug>/
  README.md                       # what's inside; install steps per tool (see below)
  recommended-skills.md           # catalog matches: name, why, source link, license, install notes
  upload-to-claude/<skill>.zip    # one per custom skill, folder at zip root (Claude.ai: one skill per upload)
  skills/<skill>/SKILL.md         # unpacked copies for Claude Code / Cursor / Codex
  skills/<skill>/references/…
  skills/<skill>/scripts/…
  skills/<skill>/assets/…
```

`README.md` install steps:
- **Claude.ai / Claude Desktop:** Settings → Capabilities → Skills → upload each zip from `upload-to-claude/`.
- **Claude Code:** copy `skills/<skill>` into `~/.claude/skills/` (personal) or `.claude/skills/` (one project).
- **Other tools that support Agent Skills:** copy each `skills/<skill>` folder into that tool's skills folder, per its documentation.
- Catalog skills are installed from their own sources, as listed in `recommended-skills.md`.

Catalog skills are bundled only when `bundlable = true` and their license file is included. By default they are listed only.

## UI

**`/prompt-bot/skills`:**
- A list of the user's packs.
- A **New skill pack** form with "Describe a task or your day-to-day work" and an optional role.

**`/prompt-bot/skills/[packId]`** shows the pack in three steps:
1. **Skills list:** "Build custom" items, which can be renamed, removed or added to, and "Use existing" catalog cards showing name, why, license and a link.
2. **Refine:** selecting a custom skill opens the enhancer's two-column layout:
   - left: the skill-definition matrix with 3-slice bars and auto-ticks;
   - right: the purpose and short answers.
   - A **Generate skill** button carries the same "N questions not answered yet" warning as Enhance.
3. **Preview and download:** a file tree and editor per skill, plus **Download skill** and **Download pack**.

**`/prompt-bot/catalog`** (ADMIN/MENTOR): manage catalog entries (source URL, license, bundlable, install notes, tags, active).

A "Skills Builder" tab sits next to "Prompt Bot" in the `/prompt-bot` area.

## Error Handling

The enhancer's codes apply (400 / 403 / 404 / 429 `LIMIT_REACHED` / 503 `AI_NOT_CONFIGURED` / 502 `AI_FAILED`), plus:
- generation validation failure → item `FAILED` with readable `validationErrors`;
- download of a pack with no ready skills → 409 `NOTHING_TO_DOWNLOAD`.

## Testing

Witnessed failing-test-first, as in the enhancer spec.

**Unit:**
- Name normalisation and dedupe.
- The frontmatter validator, case by case: every rule passes and fails once.
- Path sanitiser (rejects `..`, absolute paths and other directories).
- Size limits.
- Zip layout, including one zip per skill with the folder at its root.
- README and `recommended-skills.md` rendering.
- Catalog-slug filtering of split output.

**Routes** (AI mocked):
- Ownership 404.
- Catalog role checks.
- One retry, then `FAILED`.
- 409 when the pack is empty.
- Limits (429).

**Components:**
- Pack steps.
- File tree.
- Script notice.

**End to end:**
- Fake-Anthropic browser run: describe → split → refine with bars → generate → edit → download.
- The pack zip is unzipped and checked.
- Each skill folder is validated with Anthropic's `quick_validate.py` as an external oracle.

## Rollout

- **Branch and PR:** `feat/prompt-bot-skills-builder`, opened as one PR after the enhancer PR has merged.
- **Migration:** creates the tables and seeds the skill-definition matrix and the catalog, with verified licenses.
- **Configuration:** no new environment variables.

## Out of Scope

- Running or testing generated skills inside the LMS.
- Publishing skills to a marketplace.
- Sharing packs between users.
- Claude Code plugin bundles (commands, MCP config).
- Automatic import of catalog skills' contents.
