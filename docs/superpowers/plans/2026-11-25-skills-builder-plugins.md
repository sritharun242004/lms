# Skills Builder Plugins — Implementation Plan

Spec: [2026-11-25-skills-builder-plugins-design.md](../specs/2026-11-25-skills-builder-plugins-design.md) (binding: API Contract, Orchestration, Plugin Zip Layout). Branch `feat/skills-builder-plugins` from `main` 897d4b6. Each task: failing test first, then code, then `npm run test` for touched files and typecheck. Tracks A and B run in parallel once **A0** lands; C merges.

## Track A — Server (`apps/web/src/lib/skills/**`, `app/api/v1/prompt-bot/skill-jobs/**`, `prisma/`)

- [ ] **A0 Contract first (unblocks B).** Add to `jobs/types.ts`: `SkillRole`, `PluginView`, `PluginVersionSummary`, `PluginVersionDetail`, `PluginSkillDetail`, `RawPluginSuggestion`; extend `JobSkillView` (`role`, `label`, `focus`, `step`) and `JobView` (`company`, `plugin`). Add the new `JOB_LIMITS` keys (`skillsPerJob: 7`, sub-skill bounds, char caps, asset budgets, `pluginVersionsKept`). In `client.ts` add `generatePlugin`, `getPluginVersion`, `pluginDownloadUrl`, extend `patchJob`/`addJobSkill`/`patchJobSkill`; remove `generateJobSkill` last (C1). Push and tell Track B.
- [ ] **A1 Migration.** Prisma models per spec; `prisma migrate diff` → `20261125170000_add_skill_plugins` + the MAIN `UPDATE`. Tests: SQL guards (no DROP/RENAME/ALTER COLUMN, cascade FK) and the rolled-back real-Postgres check (first skill by order → MAIN, others SUB).
- [ ] **A2 Names.** `names.ts`: `defaultPluginName(company, title)`, `defaultPluginDisplayName(company, title)`, `effectivePlugin(job)`. Unit tests (no company, unicode, empty → `my-plugin`, 120-char display cap).
- [ ] **A3 View mapping.** `jobs.ts`: `toPluginView` (defaults, stale GENERATING → FAILED, versions newest first), skills main-first with `role/label/focus/step`, `company`. Data-layer tests.
- [ ] **A4 PATCH task.** `PATCH /:id` accepts `company`, `pluginName`, `pluginDisplayName` (`null` resets; normalise id; 409 while generating). Route + data tests.
- [ ] **A5 Skills CRUD rules.** `addSkill` always SUB, appended last, cap 6 subs; `updateSkill` + `label/focus/step`, `order` reorders; `deleteSkill` → `MAIN_REQUIRED` for MAIN, `ALREADY_GENERATING` when the plugin is generating. New error classes + `jobErrorResponse` mapping. Tests.
- [ ] **A6 Suggest → plugin structure.** `SUGGEST_SYSTEM` + `buildSuggestMessage` (company, plugin wording), `suggestJobSkills` schema → `RawPluginSuggestion`; `cleanPluginSuggestion` + fallbacks; `suggestForJob` replacement rule (keep legacy-versioned rows; kept MAIN stays MAIN). Fake: `[fake] suggest-plugin` builders in `fake-anthropic-shapes.mjs` (five task types, one duplicate-name reply) + parse test.
- [ ] **A7 Generate prompts.** Main message gets `<plugin>` + `<sub_skills>` (workflow order); new `buildSubSkillGenerateMessage` and `GENERATE_SUB_SKILL_RULES` (stand-alone, focus only). Fake: `[fake] generate sub <name>`; the fake main draft includes its own "## How this skill works" to prove replacement. Prompt-content tests.
- [ ] **A8 Server-owned sections.** `assemble.ts`: `howThisSkillWorksSection(plugin, subs)` and `withHowThisSkillWorks` (after "Before you start", replaces a model copy); `standAloneNote(...)` + sub-skill "Before you start" intro variant. Tests: every sub-skill named once in order with its command; exactly one section.
- [ ] **A9 Asset plan for plugins.** `planPluginAssets(skills, files)`: main bundles its bundlable files; subs copy ≤ 1 MB selected files while total ≤ 25 MB; otherwise the "Kept in the `<main>` skill…" line in `filesSection`. Per-skill style guide filtered to its own files. Tests for budget edges.
- [ ] **A10 Plugin files + validator.** `plugin.ts`: `buildPluginManifest` (semver `1.<n-1>.0`, author fallback), `buildCommands` (main = full-flow wording), `validatePlugin` (all spec rules, errors prefixed by skill). Tests per rule.
- [ ] **A11 Generation.** `plugin-generate.ts`: `startPluginGeneration` (preconditions, `PLUGIN_INVALID` details, claim, `plugin_generate` unit with refund) and `runPluginGeneration` (parallel per skill, retry once, any fail → FAILED with no write, claim-guarded transaction, prune to 20). Add `plugin_generate` (10/day) to `AiFeature`/`AI_FEATURES` and the admin usage labels. `purgeUnreferencedFiles` also reads plugin `assetFileIds`. Tests.
- [ ] **A12 Version detail + zips.** `plugin-download.ts`: `loadPluginVersionDetail` (zod-parse stored JSON), `buildPluginZip` (single top folder, no forbidden entries), `buildPluginShareZip` (README via a `renderPluginReadme` in `pack-docs.ts`: skills table + how to call each + install). Size pre-check. **`plugin-zip.test.ts`**: unzip, check `plugin.json` keys/values, each `SKILL.md` name == folder and `validateJobSkill`, each sub-skill folder alone validates, one command per skill, main workflow names every sub, asset SHA-256, share zip embeds the byte-identical plugin zip.
- [ ] **A13 Routes.** `plugin/generate` (POST 202), `plugin/versions/[version]` (GET), `plugin/versions/[version]/download?format=plugin|share`; delete route 21 and its tests. Route tests: 401, 404 ownership, 503 before spending, 400/409 codes, filenames and content types.

## Track B — UI (`apps/web/src/app/(app)/prompt-bot/skills/**`), against A0 types with a mocked client

Invoke **`impeccable`** before each task (LMS design system), finish each with `baseline-ui` + `fixing-accessibility`; 44 px targets, 390/360 px, dark mode. Component tests mock `@/lib/skills/jobs/client` with `vi.hoisted` and use fixture `JobView`s (`plugin-fixtures.ts`: no skills, draft plugin, generating, READY v2, FAILED with prefixed errors, migrated job with legacy versions).

- [ ] **B0 Fixtures + step model.** `plugin-fixtures.ts`; polling in `job-workspace.tsx` keyed on `plugin.status === "GENERATING"` (replace per-skill polling). Tests.
- [ ] **B1 Company field.** `task-panel.tsx`: "Company or team (optional)" (≤ 80, autosaved via `patchJob`). Tests.
- [ ] **B2 Plugin card.** `plugin-card.tsx`: display name, ID with live kebab preview, Default hint/reset (`null`), ID-change warning when `latestVersion > 0`, "Shows in Claude as …". Tests.
- [ ] **B3 Hierarchy overview.** `plugin-overview.tsx` replaces the skills list in `skills-panel.tsx`: main row (badge "Main — runs everything, using all sub-skills", how to call), numbered sub-skill rows (badge "Use alone for just this part", step line, focus, move up/down, how-to-call lines with copy buttons). Reuse `skill-card.tsx` editing and file chips; remove its per-skill Generate/version UI. Tests for call strings (`/<plugin>:<skill>`).
- [ ] **B4 Add/remove bounds.** Add sub-skill (disabled at 6), Remove (disabled at 2 with reason; never on main), Redraft confirm copy. Tests.
- [ ] **B5 Generate plugin.** Button, unanswered-questions confirm, "Writing N skills…", FAILED list by skill, `PLUGIN_INVALID` details inline. Tests.
- [ ] **B6 Versions + preview.** `plugin-version-preview.tsx`: versions list, a tab per skill (SKILL.md, references, assets) plus `plugin.json` and commands; pruned-version message. Tests.
- [ ] **B7 Downloads + How to use.** Download for Claude (`format=plugin`), Download to share (`format=share`), updated callout copy; header "Download plugin" (hidden until v1). Tests.
- [ ] **B8 Legacy section.** "Earlier single-skill versions" (today's per-skill versions + routes 22–24 links) shown only when any skill has `latestVersion > 0`. Tests.

## Track C — Merge and verify

- [ ] **C1 Merge.** Rebase B onto A; delete `generateJobSkill` and dead per-skill generate UI; full typecheck, lint, Vitest.
- [ ] **C2 Browser E2E (fake API, MENTEE).** Task with company "Acme" → questions → Create my skills (1 main + 3 subs) → rename plugin and a sub, reorder, add one, remove one → Generate → preview shows the workflow section → both downloads pass the zip checks and `quick_validate.py` on each `skills/*` folder; migrated job shows main + subs and old versions still download; 390 px + dark screenshots.
- [ ] **C3 Real smoke.** Real API: one plugin. claude.ai: Plugins → Add → Upload plugin; display name shown; "use `<main>`" runs the full flow; "use `<sub>`" runs one part. Claude Code: `/<plugin>:<main>` and `/<plugin>:<sub>`. Record whether commands duplicate skills in chat (spec decision 10).
- [ ] **C4 PR.** One PR; rollout and production check per spec.

Counts: Track A 14 tasks (A0–A13), Track B 9 (B0–B8), Track C 4.
