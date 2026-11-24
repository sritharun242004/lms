# Prompt Bot Skills Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/prompt-bot/skills`: describe your work, get a split into custom skills plus catalog recommendations, refine each custom skill with the enhancer's matrix and 3-slice bars, generate valid Agent Skills files, preview and edit them, and download upload-ready zips.

**Architecture:** Everything lives inside `apps/web`, on top of the already-built enhancer.
- **Data:** four Prisma models and one forward-only migration. The migration also seeds the `skill-definition` matrix (kind `SKILL`) and the skill catalog from TypeScript sources; catalog licenses come from a verification script that reads each source repository's LICENSE file.
- **Server:** pure modules under `src/lib/skills/` (name normalisation, split clean-up, Agent Skills validator, file assembly, README rendering, zips with `fflate`), two new best-model calls in `src/lib/ai/claude.ts`, a pack data layer that reuses the enhancer's scorer and revision rule, and routes under `/api/v1/prompt-bot/skill-packs` and `/api/v1/prompt-bot/skill-catalog`. Generation is claimed synchronously and written after the response with Next's `after()`, because App Runner ends HTTP requests after 120 s and an Opus skill can take longer; the UI polls.
- **Client:** the enhancer workspace's answer, save and score logic moves into a shared `useMatrixAnswers` hook and `MatrixPanel` component (one refactor task, proven by the unchanged enhancer workspace tests). The Skills Builder pages reuse them, plus `QuestionRow`, `StatusBar` and `ReadinessMeter`.

**Tech Stack:** Next.js 16.2 App Router (`after` from `next/server`), React 19, TypeScript, Prisma 6 on PostgreSQL, Zod 3, `@anthropic-ai/sdk` 1.13 (structured JSON-schema output, beta server-side fallback), `fflate` (zips), `yaml` (frontmatter parsing as YAML 1.1, like Anthropic's PyYAML-based validator), `react-markdown` (rendered `SKILL.md`), Vitest with Testing Library (jsdom via a `/** @vitest-environment jsdom */` header), and the LMS UI kit.

**Spec:** `docs/superpowers/specs/2026-11-24-prompt-bot-skills-builder-design.md` (foundation: `docs/superpowers/specs/2026-11-24-prompt-bot-enhancer-design.md`). Executors read both.

## Global Constraints

- **Scope:** build only inside `apps/web`. Nothing about the enhancer's behaviour changes. Every existing enhancer test keeps passing unchanged, except that `src/lib/ai/claude.test.ts` gains a mock for `beta.messages.create`.
- **Branch and commits:** work on `feat/prompt-bot-skills-builder`, created from `feat/prompt-bot-enhancer`. Commit locally at the end of every task with a Conventional Commit subject (`feat(skills-builder): …`, `refactor(prompt-bot): …`). Do not push.
- **Migrations:** forward-only. Generate SQL with `prisma migrate diff` from the schema at git `HEAD` to the edited schema, append the seed SQL, apply with `prisma migrate deploy`. Never run `prisma migrate dev`, `migrate reset`, `db push`, or anything that drops data. The migration folder is `20261124120000_add_skills_builder`.
- **Seeds:** the `skill-definition` matrix and the catalog are seeded by that migration from single TypeScript sources (`src/lib/skills/builtin-skill-matrix.ts`, `src/lib/skills/catalog-seed.ts`), printed by `scripts/skills-builder-seed-sql.ts` with the same SQL helpers that produced the enhancer's seed.
- **Environment:** no new environment variables. The local fake API uses the SDK's standard `ANTHROPIC_BASE_URL` only during end-to-end checks.
- **Models:** `BEST_MODEL` (`claude-opus-5-5`) for split and generate, with `betas: ["server-side-fallback-2026-07-01"]` and `fallbacks: "default"`. `FAST_MODEL` (`claude-haiku-4-5`) for per-question scoring, through the enhancer's existing `scoreQuestions`.
- **Usage features:** `skill_split` per split, `skill_generate` per Generate press (the one automatic retry does not count again), `score` per item scoring call. Counted with `consumeAiUsage` before the AI call.
- **Access:** every signed-in role builds packs; a pack or item that is not the caller's returns 404. The catalog is readable by everyone; only ADMIN and MENTOR create, edit or deactivate entries (`canEditMatrices` from `src/lib/prompt-bot/matrix-input.ts` is the existing ADMIN/MENTOR rule and is reused as is).
- **Error codes:** 400 `VALIDATION_ERROR`, 401 `UNAUTHORIZED`, 403 `FORBIDDEN`, 404 `NOT_FOUND`, 429 `LIMIT_REACHED`, 503 `AI_NOT_CONFIGURED`, 502 `AI_FAILED`, 409 `NOTHING_TO_DOWNLOAD`, and (plan addition, see Architecture) 409 `ALREADY_GENERATING`.
- **Agent Skills format** (spec, verified against Anthropic's validator): one `SKILL.md` per skill folder; frontmatter keys only `name`, `description`, `license`, `allowed-tools`, `metadata`, `compatibility`; `name` kebab-case `^[a-z0-9-]+$`, no leading, trailing or double hyphen, at most 64 characters; `description` at most 1024 characters with no `<` or `>`; `compatibility` at most 500 characters; packages exclude `__pycache__/`, `node_modules/`, `*.pyc`, `.DS_Store` and a root `evals/`; Claude.ai takes one skill per zip with the folder at the zip root.
- **Spec limits:** at most 8 custom skills and 6 catalog matches per split; 200 KB per file and 1 MB per skill; paths only `SKILL.md`, `references/…`, `scripts/…`, `assets/…`, never `..` or absolute. Plan addition: at most 100 files per skill (bounds zero-byte file floods the byte limits cannot).
- **Name ownership:** an item's `name` is the skill's identity. The folder name and the `SKILL.md` `name` must equal it; renaming rewrites `SKILL.md`.
- **Scripts:** generated scripts are never executed server-side. Every `scripts/` file in the preview shows the notice "Review scripts before running them."
- **Zips:** built server-side with `fflate`; every entry path is produced by the server from a validated name and a re-checked path; only `READY` custom items are included.
- **Catalog licenses:** `license` and `bundlable` come only from the verification in Task 2. `bundlable` is true only for a verified permissive license (Apache-2.0, MIT, BSD-2-Clause, BSD-3-Clause, ISC). Catalog skills are listed with a link in `recommended-skills.md`; their contents are never bundled in this release (automatic import is out of scope).
- **Privacy:** descriptions, answers and generated files are never written to logs. Pages show "Your descriptions and answers are stored in the LMS and sent to Anthropic's API to build your skills."
- **Tests:** Vitest only picks up `src/**/*.test.ts`, so component tests are `.test.ts` files that use `React.createElement` (no JSX in tests) and start with `/** @vitest-environment jsdom */`. Every production change follows a witnessed failing-test-first cycle.
- **Design:** LMS design system (`glass` cards, `components/ui`, `--primary`, `rounded-2xl`/`rounded-[1.75rem]`, lucide icons, dark mode). Before writing UI code in Tasks 15–19, invoke the `impeccable` skill with the Skill tool, as the user's global CLAUDE.md requires, and follow it on top of the existing design system.
- **New dependencies:** `fflate`, `yaml`, `react-markdown` (all in `apps/web`). Nothing else.

## Review Focus

1. **The server restarts while a skill is being written** (a deploy during generation). The item must not stay "Writing…" forever: after 15 minutes it reads as `FAILED` with "Writing this skill was interrupted. Generate it again." and Generate works again. Pinned by the stale-item test in Task 9 and the stale-claim test in Task 12.
2. **The user renames a skill that is already `READY`.** The folder and the `SKILL.md` `name` must stay identical, so downloads stay valid; renaming while generating is refused. Pinned by the rename tests in Task 10.
3. **The model or the user supplies a hostile path** (`../../x`, `/etc/passwd`, `C:/x`, `references\x`, `references/SKILL.md`, `.DS_Store`, `evals/…`). It must be reported as a validation error and must never reach a zip. Pinned by the path table in Task 5 and the zip guard test in Task 7.
4. **YAML edge cases in frontmatter.** A model description with quotes, colons, `#` or newlines must still produce valid YAML, and a user edit like `description: yes` (a boolean in YAML 1.1, which Anthropic's validator uses) must be rejected exactly as the oracle would. Pinned by Task 5's `yes` case and Task 6's round-trip test.
5. **Two skills normalise to the same name** ("Board Update" and "board-update" from the split, or a rename or add that matches a sibling). Each gets a numeric suffix so folders never collide. Pinned by Task 4's dedupe tests and Task 10's add and rename tests.

---

### Task 0: Workspace baseline

**Files:** none (environment only).

- [ ] **Step 1: Create the branch from the enhancer branch**

```bash
cd "/Users/tharunkumarl/Full Stack/lms"
git switch feat/prompt-bot-enhancer
git status --short
git switch -c feat/prompt-bot-skills-builder
npm ci
```
Expected: `git status --short` shows only files that are not yours to touch (at planning time: an untracked `apps/web/src/app/(app)/prompt-bot/matrices/matrix-editor.test.ts` and `docs/superpowers/specs/2026-07-30-login-bookkeeping-error-fix.md`). Leave them untracked and never `git add` them. `npm ci` finishes without errors.

- [ ] **Step 2: Record the baseline**

```bash
cd "/Users/tharunkumarl/Full Stack/lms/apps/web"
npx prisma migrate status
npx vitest run
npx tsc --noEmit
```
Expected: migrations up to date (including `20261124090000_add_prompt_bot`), the suite passes, no type errors. If anything fails on the untouched branch, stop and report it before changing code.

---

### Task 1: Shared seed SQL and the skill-definition matrix

**Files:**
- Create: `apps/web/src/lib/prompt-bot/seed-sql.ts`
- Modify: `apps/web/scripts/prompt-bot-seed-sql.ts` (use the shared helpers)
- Modify: `apps/web/src/lib/prompt-bot/builtin-matrices.ts:13` (`kind` union gains `"SKILL"`)
- Create: `apps/web/src/lib/skills/builtin-skill-matrix.ts`
- Test: `apps/web/src/lib/prompt-bot/seed-sql.test.ts`, `apps/web/src/lib/skills/builtin-skill-matrix.test.ts`

**Interfaces:**
- Consumes: `BUILTIN_MATRICES`, `BuiltinMatrix` from `src/lib/prompt-bot/builtin-matrices.ts`.
- Produces:
  - `sqlLiteral(value: string | null): string`
  - `matrixSeedSql(m: BuiltinMatrix): string[]` (one `prompt_matrices` INSERT, then one `prompt_matrix_questions` INSERT per question, exactly as the enhancer migration contains them)
  - `SKILL_MATRIX_ID = "pbm_skill_definition"`, `SKILL_MATRIX_SLUG = "skill-definition"`, `SKILL_MATRIX: BuiltinMatrix` (kind `"SKILL"`, question ids `pbq_skill_1` … `pbq_skill_8`)

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/src/lib/prompt-bot/seed-sql.test.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BUILTIN_MATRICES } from "./builtin-matrices";
import { matrixSeedSql, sqlLiteral } from "./seed-sql";

const ENHANCER_SQL = readFileSync(
  path.join(__dirname, "../../../prisma/migrations/20261124090000_add_prompt_bot/migration.sql"),
  "utf8",
);

describe("seed SQL helpers", () => {
  it("doubles single quotes and writes NULL for null", () => {
    expect(sqlLiteral("it's")).toBe("'it''s'");
    expect(sqlLiteral(null)).toBe("NULL");
  });

  it("reproduces every seed row already in the enhancer migration", () => {
    const lines = BUILTIN_MATRICES.flatMap(matrixSeedSql);
    expect(lines).toHaveLength(BUILTIN_MATRICES.length + BUILTIN_MATRICES.reduce((n, m) => n + m.questions.length, 0));
    for (const line of lines) expect(ENHANCER_SQL).toContain(line);
  });
});
```

```ts
// apps/web/src/lib/skills/builtin-skill-matrix.test.ts
import { describe, expect, it } from "vitest";
import { BUILTIN_MATRICES } from "@/lib/prompt-bot/builtin-matrices";
import { SKILL_MATRIX, SKILL_MATRIX_ID, SKILL_MATRIX_SLUG } from "./builtin-skill-matrix";

const QUESTIONS: [string, string][] = [
  ["When should this skill be used?", "Situations, requests and phrases that should trigger it, and when it should not be used."],
  ["What context does it need to know?", "Background about the person, team, company or domain that stays true across uses."],
  ["What inputs will it receive?", "What the user provides each time (files, notes, data) and in what shape."],
  ["What are the steps?", "The sequence of work, decisions and checks."],
  ["What does a great output look like?", "Format, structure, length, tone, and an example if possible."],
  ["What is the quality bar?", "Criteria the output must meet before it is done."],
  ["What tools, files or resources does it use?", "Templates, reference documents, scripts, apps or plugins it relies on."],
  ["What should it avoid?", "Mistakes, sensitive areas, things never to do."],
];

describe("skill-definition matrix", () => {
  it("is a SKILL matrix with the spec's eight questions and guidance, in order", () => {
    expect(SKILL_MATRIX.id).toBe(SKILL_MATRIX_ID);
    expect(SKILL_MATRIX.slug).toBe(SKILL_MATRIX_SLUG);
    expect(SKILL_MATRIX.kind).toBe("SKILL");
    expect(SKILL_MATRIX.questions.map((q) => [q.text, q.guidance])).toEqual(QUESTIONS);
    expect(SKILL_MATRIX.questions.map((q) => q.id)).toEqual(QUESTIONS.map((_, i) => `pbq_skill_${i + 1}`));
  });

  it("does not collide with the enhancer's built-in matrices", () => {
    const taken = new Set(BUILTIN_MATRICES.flatMap((m) => [m.id, m.slug, ...m.questions.map((q) => q.id)]));
    for (const value of [SKILL_MATRIX.id, SKILL_MATRIX.slug, ...SKILL_MATRIX.questions.map((q) => q.id)]) {
      expect(taken.has(value)).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd apps/web && npx vitest run src/lib/prompt-bot/seed-sql.test.ts src/lib/skills/builtin-skill-matrix.test.ts`
Expected: FAIL, "Failed to resolve import ./seed-sql" and "Failed to resolve import ./builtin-skill-matrix".

- [ ] **Step 3: Extract the helpers and widen the matrix kind**

```ts
// apps/web/src/lib/prompt-bot/seed-sql.ts
import type { BuiltinMatrix } from "./builtin-matrices";

/** SQL string literal with single quotes doubled; NULL for null. */
export const sqlLiteral = (value: string | null) => (value === null ? "NULL" : `'${value.replace(/'/g, "''")}'`);

/** INSERT statements for one built-in matrix and its questions, exactly as the migrations seed them. */
export function matrixSeedSql(m: BuiltinMatrix): string[] {
  return [
    `INSERT INTO "prompt_matrices" ("id","slug","name","description","kind","is_built_in","is_active","created_at","updated_at") VALUES (${sqlLiteral(m.id)},${sqlLiteral(m.slug)},${sqlLiteral(m.name)},${sqlLiteral(m.description)},'${m.kind}',true,true,NOW(),NOW());`,
    ...m.questions.map(
      (question, order) =>
        `INSERT INTO "prompt_matrix_questions" ("id","matrix_id","order","text","guidance","element","is_active") VALUES (${sqlLiteral(question.id)},${sqlLiteral(m.id)},${order},${sqlLiteral(question.text)},${sqlLiteral(question.guidance)},${sqlLiteral(question.element)},true);`,
    ),
  ];
}
```

Replace the whole of `apps/web/scripts/prompt-bot-seed-sql.ts` with:

```ts
// Prints INSERT statements for the built-in matrices and AI settings.
// Usage: npx tsx scripts/prompt-bot-seed-sql.ts >> prisma/migrations/<dir>/migration.sql
import { BUILTIN_MATRICES } from "../src/lib/prompt-bot/builtin-matrices";
import { matrixSeedSql } from "../src/lib/prompt-bot/seed-sql";

const lines: string[] = ["", "-- Seed: built-in Prompt Bot matrices (src/lib/prompt-bot/builtin-matrices.ts)"];
for (const m of BUILTIN_MATRICES) lines.push(...matrixSeedSql(m));
lines.push(
  `INSERT INTO "ai_settings" ("id","limits","updated_at") VALUES ('singleton','{"score":300,"enhance":30,"skill_split":10,"skill_generate":20}'::jsonb,NOW());`,
);
console.log(lines.join("\n"));
```

In `apps/web/src/lib/prompt-bot/builtin-matrices.ts`, change the `BuiltinMatrix` kind line from `kind: "CORE" | "TASK";` to:

```ts
  kind: "CORE" | "TASK" | "SKILL";
```

- [ ] **Step 4: Write the skill-definition matrix source**

```ts
// apps/web/src/lib/skills/builtin-skill-matrix.ts
/**
 * The Skills Builder's question matrix (spec, 2026-11-24). Seeded by the
 * 20261124120000_add_skills_builder migration (scripts/skills-builder-seed-sql.ts).
 * Relative imports only: scripts load this file through tsx.
 */
import type { BuiltinMatrix, BuiltinQuestion } from "../prompt-bot/builtin-matrices";

export const SKILL_MATRIX_ID = "pbm_skill_definition";
export const SKILL_MATRIX_SLUG = "skill-definition";

const q = (n: number, text: string, guidance: string): BuiltinQuestion => ({ id: `pbq_skill_${n}`, text, guidance, element: null });

export const SKILL_MATRIX: BuiltinMatrix = {
  id: SKILL_MATRIX_ID,
  slug: SKILL_MATRIX_SLUG,
  name: "Skill definition",
  description: "Questions that turn a task into a reusable AI skill (Skills Builder).",
  kind: "SKILL",
  questions: [
    q(1, "When should this skill be used?", "Situations, requests and phrases that should trigger it, and when it should not be used."),
    q(2, "What context does it need to know?", "Background about the person, team, company or domain that stays true across uses."),
    q(3, "What inputs will it receive?", "What the user provides each time (files, notes, data) and in what shape."),
    q(4, "What are the steps?", "The sequence of work, decisions and checks."),
    q(5, "What does a great output look like?", "Format, structure, length, tone, and an example if possible."),
    q(6, "What is the quality bar?", "Criteria the output must meet before it is done."),
    q(7, "What tools, files or resources does it use?", "Templates, reference documents, scripts, apps or plugins it relies on."),
    q(8, "What should it avoid?", "Mistakes, sensitive areas, things never to do."),
  ],
};
```

- [ ] **Step 5: Run the tests and the enhancer seed test, and check the script output is unchanged**

```bash
cd "/Users/tharunkumarl/Full Stack/lms/apps/web"
npx vitest run src/lib/prompt-bot/seed-sql.test.ts src/lib/skills/builtin-skill-matrix.test.ts src/lib/prompt-bot/builtin-matrices.test.ts
npx tsx scripts/prompt-bot-seed-sql.ts | tail -n +2 | while IFS= read -r line; do grep -qxF -- "$line" prisma/migrations/20261124090000_add_prompt_bot/migration.sql || echo "MISSING: $line"; done
npx tsc --noEmit
```
Expected: all PASS; the loop prints nothing (every line the refactored script prints is already in the enhancer migration); no type errors.

- [ ] **Step 6: Commit**

```bash
cd "/Users/tharunkumarl/Full Stack/lms"
git add apps/web/src/lib/prompt-bot/seed-sql.ts apps/web/src/lib/prompt-bot/seed-sql.test.ts apps/web/scripts/prompt-bot-seed-sql.ts apps/web/src/lib/prompt-bot/builtin-matrices.ts apps/web/src/lib/skills/builtin-skill-matrix.ts apps/web/src/lib/skills/builtin-skill-matrix.test.ts
git commit -m "feat(skills-builder): shared seed SQL helpers and skill-definition matrix"
```

---

### Task 2: Catalog candidates and verified licenses

**Files:**
- Create: `apps/web/src/lib/skills/license.ts`
- Create: `apps/web/src/lib/skills/catalog-candidates.ts`
- Create: `apps/web/scripts/verify-catalog-licenses.ts`
- Create (generated by the script, then reviewed): `apps/web/src/lib/skills/catalog-licenses.ts`
- Create: `apps/web/src/lib/skills/catalog-seed.ts`
- Test: `apps/web/src/lib/skills/license.test.ts`, `apps/web/src/lib/skills/catalog-seed.test.ts`

**Interfaces:**
- Produces:
  - `PERMISSIVE_LICENSES: readonly ["Apache-2.0", "MIT", "BSD-2-Clause", "BSD-3-Clause", "ISC"]`, `isPermissiveLicense(license: string): boolean`
  - `classifyLicense(text: string | null): string` — an SPDX id from the list above, `"source-available"` when a license file exists but is not one of them, `"NOASSERTION"` when none was found
  - `CatalogCandidate = { slug; name; description; sourceUrl; repo; dir; installNotes; tags: string[] }`, `CATALOG_CANDIDATES: CatalogCandidate[]`
  - `VERIFIED_LICENSES: Record<string, { license: string; licenseUrl: string | null; checkedOn: string }>` (generated)
  - `CatalogSeedEntry = { id; slug; name; description; sourceUrl; installNotes; tags: string[]; license: string; bundlable: boolean }`, `CATALOG_SEED: CatalogSeedEntry[]`

The plan does not state any candidate's license. Step 6 reads each LICENSE file and the seed is derived from that result.

- [ ] **Step 1: Write the failing classifier test**

```ts
// apps/web/src/lib/skills/license.test.ts
import { describe, expect, it } from "vitest";
import { classifyLicense, isPermissiveLicense } from "./license";

const APACHE = "                                 Apache License\n                           Version 2.0, January 2004\n                        http://www.apache.org/licenses/";
const MIT = "MIT License\n\nCopyright (c) 2025 Someone\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software";
const ISC = "ISC License\n\nPermission to use, copy, modify, and/or distribute this software for any\npurpose with or without fee is hereby granted";
const BSD3 = "Redistribution and use in source and binary forms, with or without modification ... 3. Neither the name of the copyright holder";
const BSD2 = "Redistribution and use in source and binary forms, with or without modification, are permitted provided that";
const PROPRIETARY = "© 2025 Example, Inc. All rights reserved. Use of these materials is governed by your agreement.";

describe("classifyLicense", () => {
  it.each([
    [APACHE, "Apache-2.0"],
    [MIT, "MIT"],
    [ISC, "ISC"],
    [BSD3, "BSD-3-Clause"],
    [BSD2, "BSD-2-Clause"],
    [PROPRIETARY, "source-available"],
    ["   ", "NOASSERTION"],
    [null, "NOASSERTION"],
  ])("classifies %#", (text, expected) => {
    expect(classifyLicense(text)).toBe(expected);
  });
});

describe("isPermissiveLicense", () => {
  it("accepts only the permissive SPDX ids", () => {
    for (const id of ["Apache-2.0", "MIT", "BSD-2-Clause", "BSD-3-Clause", "ISC"]) expect(isPermissiveLicense(id)).toBe(true);
    for (const id of ["source-available", "NOASSERTION", "GPL-3.0", "apache-2.0", ""]) expect(isPermissiveLicense(id)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/skills/license.test.ts` → FAIL, "Failed to resolve import ./license".

- [ ] **Step 3: Implement the classifier**

```ts
// apps/web/src/lib/skills/license.ts
/** SPDX ids whose terms allow redistributing a skill inside a pack together with its license file. */
export const PERMISSIVE_LICENSES = ["Apache-2.0", "MIT", "BSD-2-Clause", "BSD-3-Clause", "ISC"] as const;

export const isPermissiveLicense = (license: string): boolean => (PERMISSIVE_LICENSES as readonly string[]).includes(license);

/**
 * Classifies the text of a LICENSE file. Anything that is not clearly one of the
 * permissive licenses is "source-available" (a file exists but is not one of them);
 * no file at all is SPDX's "NOASSERTION". Both mean link only.
 */
export function classifyLicense(text: string | null): string {
  if (text === null || !text.trim()) return "NOASSERTION";
  const t = text.replace(/\s+/g, " ");
  if (/Apache License,? Version 2\.0/i.test(t)) return "Apache-2.0";
  if (/Permission is hereby granted, free of charge, to any person obtaining a copy/i.test(t)) return "MIT";
  if (/Permission to use, copy, modify, and\/or distribute this software for any purpose with or without fee is hereby granted/i.test(t)) return "ISC";
  if (/Redistribution and use in source and binary forms/i.test(t)) return /Neither the name/i.test(t) ? "BSD-3-Clause" : "BSD-2-Clause";
  return "source-available";
}
```

Run: `npx vitest run src/lib/skills/license.test.ts` → PASS.

- [ ] **Step 4: Write the failing seed test**

```ts
// apps/web/src/lib/skills/catalog-seed.test.ts
import { describe, expect, it } from "vitest";
import { VERIFIED_LICENSES } from "./catalog-licenses";
import { CATALOG_SEED } from "./catalog-seed";
import { isPermissiveLicense, PERMISSIVE_LICENSES } from "./license";
import { isValidSkillName } from "./names";

describe("catalog seed", () => {
  it("seeds the spec's candidates", () => {
    expect(CATALOG_SEED.map((e) => e.slug).sort()).toEqual(["docx", "frontend-design", "impeccable", "pdf", "pptx", "skill-creator", "xlsx"]);
  });

  it("has a license verification record for every candidate", () => {
    for (const entry of CATALOG_SEED) {
      const record = VERIFIED_LICENSES[entry.slug];
      expect(record, entry.slug).toBeDefined();
      expect(record.checkedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.license).toBe(record.license);
    }
  });

  it("never marks a non-permissive or unverified license as bundlable", () => {
    for (const entry of CATALOG_SEED) {
      if (!(PERMISSIVE_LICENSES as readonly string[]).includes(entry.license)) expect(entry.bundlable, entry.slug).toBe(false);
      expect(entry.bundlable).toBe(isPermissiveLicense(entry.license));
    }
  });

  it("keeps Anthropic's document skills link-only", () => {
    for (const slug of ["pptx", "docx", "xlsx", "pdf"]) {
      expect(CATALOG_SEED.find((e) => e.slug === slug)!.bundlable).toBe(false);
    }
  });

  it("uses kebab-case slugs, https GitHub sources and unique ids", () => {
    for (const entry of CATALOG_SEED) {
      expect(isValidSkillName(entry.slug)).toBe(true);
      expect(entry.sourceUrl).toMatch(/^https:\/\/github\.com\//);
      expect(entry.description.length).toBeGreaterThan(20);
      expect(entry.description).not.toMatch(/[<>]/);
    }
    expect(new Set(CATALOG_SEED.map((e) => e.id)).size).toBe(CATALOG_SEED.length);
  });
});
```

This test imports `./names` (`isValidSkillName`), which Task 4 creates. Create that one function now so this task stands alone; Task 4 then adds the rest of the module and its tests:

```ts
// apps/web/src/lib/skills/names.ts
export const SKILL_NAME_MAX = 64;

/** Agent Skills name rule: kebab-case, no leading, trailing or double hyphen, at most 64 characters. */
export function isValidSkillName(name: string): boolean {
  return name.length <= SKILL_NAME_MAX && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(name);
}
```

Run: `npx vitest run src/lib/skills/catalog-seed.test.ts` → FAIL, "Failed to resolve import ./catalog-licenses".

- [ ] **Step 5: Write the candidates and the verification script**

```ts
// apps/web/src/lib/skills/catalog-candidates.ts
/**
 * Public skills the split step may recommend (spec, 2026-11-24). Licenses are NOT
 * recorded here: scripts/verify-catalog-licenses.ts reads each LICENSE file and
 * writes catalog-licenses.ts. Relative imports only: scripts load this through tsx.
 */
export type CatalogCandidate = {
  slug: string;
  name: string;
  description: string;
  sourceUrl: string;
  /** GitHub owner/repo and the skill's folder inside it ("" for the repository root). */
  repo: string;
  dir: string;
  installNotes: string;
  tags: string[];
};

const ANTHROPIC_NOTES =
  "Download the skill folder from the source repository and install it the same way as the skills in this pack (see README.md). Read its LICENSE file before sharing it.";

const anthropic = (slug: string, name: string, description: string, tags: string[]): CatalogCandidate => ({
  slug,
  name,
  description,
  sourceUrl: `https://github.com/anthropics/skills/tree/main/skills/${slug}`,
  repo: "anthropics/skills",
  dir: `skills/${slug}`,
  installNotes: ANTHROPIC_NOTES,
  tags,
});

export const CATALOG_CANDIDATES: CatalogCandidate[] = [
  {
    slug: "impeccable",
    name: "Impeccable",
    description: "Design, critique, audit and polish user interfaces: layout, typography, colour, accessibility and UX copy for websites, apps and dashboards.",
    sourceUrl: "https://github.com/pbakaus/impeccable",
    repo: "pbakaus/impeccable",
    dir: "",
    installNotes: "Follow the installation steps in the source repository's README.",
    tags: ["design", "ui", "ux"],
  },
  anthropic("pptx", "PowerPoint presentations", "Create and edit PowerPoint presentations (.pptx): decks, slides, layouts and speaker notes.", ["presentations", "documents"]),
  anthropic("docx", "Word documents", "Create and edit Word documents (.docx), including formatting, tables, comments and tracked changes.", ["documents", "writing"]),
  anthropic("xlsx", "Excel spreadsheets", "Create, analyse and edit Excel spreadsheets (.xlsx) with formulas, formatting and charts.", ["spreadsheets", "data"]),
  anthropic("pdf", "PDF files", "Read, extract, fill, merge, split and create PDF files.", ["documents", "pdf"]),
  anthropic("frontend-design", "Frontend design", "Build distinctive, production-grade web interfaces with a clear visual direction instead of generic layouts.", ["design", "frontend"]),
  anthropic("skill-creator", "Skill creator", "Create, refine and test skills, including writing descriptions that trigger reliably and evaluating them.", ["skills", "meta"]),
];
```

```ts
// apps/web/scripts/verify-catalog-licenses.ts
// Reads each catalog candidate's LICENSE file from GitHub (the skill folder first,
// then the repository root) and prints catalog-licenses.ts.
// Usage: npx tsx scripts/verify-catalog-licenses.ts > src/lib/skills/catalog-licenses.ts
// Set GITHUB_TOKEN to avoid the unauthenticated rate limit (60 requests per hour).
import { CATALOG_CANDIDATES } from "../src/lib/skills/catalog-candidates";
import { classifyLicense } from "../src/lib/skills/license";

type Entry = { type: string; name: string; download_url: string | null; html_url: string };

const headers: Record<string, string> = { accept: "application/vnd.github+json", "user-agent": "lms-skills-builder-license-check" };
if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

async function listDir(repo: string, dir: string): Promise<Entry[]> {
  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${dir}`, { headers });
  if (!res.ok) {
    console.error(`! ${repo}/${dir}: HTTP ${res.status}`);
    return [];
  }
  const body: unknown = await res.json();
  return Array.isArray(body) ? (body as Entry[]) : [];
}

async function findLicense(repo: string, dir: string): Promise<{ url: string; text: string } | null> {
  for (const folder of dir ? [dir, ""] : [""]) {
    const file = (await listDir(repo, folder)).find((e) => e.type === "file" && /^licen[cs]e(\.(md|txt))?$/i.test(e.name));
    if (!file?.download_url) continue;
    const res = await fetch(file.download_url);
    if (res.ok) return { url: file.html_url, text: await res.text() };
  }
  return null;
}

async function main() {
  const checkedOn = new Date().toISOString().slice(0, 10);
  const rows: string[] = [];
  for (const candidate of CATALOG_CANDIDATES) {
    const found = await findLicense(candidate.repo, candidate.dir);
    const license = classifyLicense(found?.text ?? null);
    console.error(`${candidate.slug}: ${license} (${found?.url ?? "no LICENSE file found"})`);
    rows.push(
      `  ${JSON.stringify(candidate.slug)}: { license: ${JSON.stringify(license)}, licenseUrl: ${JSON.stringify(found?.url ?? null)}, checkedOn: ${JSON.stringify(checkedOn)} },`,
    );
  }
  console.log(
    [
      "// Generated by scripts/verify-catalog-licenses.ts. Re-run it to refresh; do not edit by hand.",
      "// Each value was classified from the LICENSE file in the source repository (skill folder first, then root).",
      "export const VERIFIED_LICENSES: Record<string, { license: string; licenseUrl: string | null; checkedOn: string }> = {",
      ...rows,
      "};",
      "",
    ].join("\n"),
  );
}

void main();
```

- [ ] **Step 6: Run the verification and review every result by reading the license yourself**

```bash
cd "/Users/tharunkumarl/Full Stack/lms/apps/web"
npx tsx scripts/verify-catalog-licenses.ts > src/lib/skills/catalog-licenses.ts
cat src/lib/skills/catalog-licenses.ts
```
Expected: the script prints one line per candidate on stderr (`slug: license (url)`), and the file has seven entries.

Then, for each entry, open its `licenseUrl` (WebFetch, or `gh api repos/<owner>/<repo>/contents/<path> --jq .download_url` and fetch that) and read the license text yourself:
- Confirm the classification matches what the text says. If the classifier says `Apache-2.0`, `MIT`, `ISC`, `BSD-2-Clause` or `BSD-3-Clause`, the file must actually be that license.
- If a file says something the classifier got wrong, or `licenseUrl` is `null`, or the script hit a rate limit (`HTTP 403`), stop: fix the cause (set `GITHUB_TOKEN`, correct `repo`/`dir`), re-run, and re-review. Never hand-edit a license value to make it pass.
- The spec states that Anthropic's document skills (pptx, docx, xlsx, pdf) are source-available. If any of them classifies as permissive, stop and report it to your human partner before seeding.

- [ ] **Step 7: Derive the seed from the verified result**

```ts
// apps/web/src/lib/skills/catalog-seed.ts
/** Catalog rows seeded by the 20261124120000_add_skills_builder migration. Relative imports only (tsx scripts). */
import { CATALOG_CANDIDATES } from "./catalog-candidates";
import { VERIFIED_LICENSES } from "./catalog-licenses";
import { isPermissiveLicense } from "./license";

export type CatalogSeedEntry = {
  id: string;
  slug: string;
  name: string;
  description: string;
  sourceUrl: string;
  installNotes: string;
  tags: string[];
  license: string;
  bundlable: boolean;
};

export const CATALOG_SEED: CatalogSeedEntry[] = CATALOG_CANDIDATES.map((candidate) => {
  const license = VERIFIED_LICENSES[candidate.slug]?.license ?? "NOASSERTION";
  return {
    id: `scat_${candidate.slug.replace(/-/g, "_")}`,
    slug: candidate.slug,
    name: candidate.name,
    description: candidate.description,
    sourceUrl: candidate.sourceUrl,
    installNotes: candidate.installNotes,
    tags: candidate.tags,
    license,
    bundlable: isPermissiveLicense(license),
  };
});
```

- [ ] **Step 8: Run the tests and watch them pass, then commit**

Run: `npx vitest run src/lib/skills/license.test.ts src/lib/skills/catalog-seed.test.ts` → PASS.
```bash
cd "/Users/tharunkumarl/Full Stack/lms"
git add apps/web/src/lib/skills/license.ts apps/web/src/lib/skills/license.test.ts apps/web/src/lib/skills/catalog-candidates.ts apps/web/scripts/verify-catalog-licenses.ts apps/web/src/lib/skills/catalog-licenses.ts apps/web/src/lib/skills/catalog-seed.ts apps/web/src/lib/skills/catalog-seed.test.ts apps/web/src/lib/skills/names.ts
git commit -m "feat(skills-builder): skill catalog with licenses verified from source repositories"
```
In the report for this task, list each slug with its license and `licenseUrl`.

---

### Task 3: Schema and migration

**Files:**
- Modify: `apps/web/prisma/schema.prisma` (two enums, four models, relations on `User` and `PromptMatrixQuestion`)
- Create: `apps/web/src/lib/skills/seed-sql.ts`
- Create: `apps/web/scripts/skills-builder-seed-sql.ts`
- Create: `apps/web/prisma/migrations/20261124120000_add_skills_builder/migration.sql` (generated)
- Test: `apps/web/src/lib/skills/migration-seed.test.ts`

**Interfaces:**
- Consumes: `matrixSeedSql`, `sqlLiteral` (Task 1); `SKILL_MATRIX` (Task 1); `CATALOG_SEED`, `CatalogSeedEntry` (Task 2).
- Produces:
  - Prisma enums `SkillItemKind { CUSTOM CATALOG }`, `SkillItemStatus { DRAFT GENERATING READY FAILED }`
  - Prisma models `SkillPack`, `SkillPackItem` (relations `pack`, `catalogEntry`, `answers`), `SkillItemAnswer` (relations `item`, `question`; unique `itemId_questionId`), `SkillCatalogEntry` (relations `createdBy`, `items`)
  - `sqlTextArray(values: string[]): string`, `catalogSeedSql(entries: CatalogSeedEntry[]): string[]`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/skills/migration-seed.test.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { matrixSeedSql } from "@/lib/prompt-bot/seed-sql";
import { SKILL_MATRIX } from "./builtin-skill-matrix";
import { CATALOG_SEED } from "./catalog-seed";
import { catalogSeedSql, sqlTextArray } from "./seed-sql";

const SQL = readFileSync(
  path.join(__dirname, "../../../prisma/migrations/20261124120000_add_skills_builder/migration.sql"),
  "utf8",
);

describe("skills builder migration", () => {
  it("creates the four Skills Builder tables", () => {
    for (const table of ["skill_packs", "skill_pack_items", "skill_item_answers", "skill_catalog_entries"]) {
      expect(SQL).toContain(`CREATE TABLE "${table}"`);
    }
  });

  it("seeds the skill-definition matrix exactly as defined", () => {
    for (const line of matrixSeedSql(SKILL_MATRIX)) expect(SQL).toContain(line);
  });

  it("seeds the catalog with the verified licenses", () => {
    const lines = catalogSeedSql(CATALOG_SEED);
    expect(lines).toHaveLength(CATALOG_SEED.length);
    for (const line of lines) expect(SQL).toContain(line);
  });

  it("only adds: nothing is dropped and no existing column changes", () => {
    expect(SQL).not.toMatch(/\bDROP\b/i);
    expect(SQL).not.toMatch(/ALTER TABLE "(users|prompt_[a-z_]+|ai_[a-z_]+)" (ADD|ALTER|DROP) COLUMN/i);
  });

  it("writes text arrays as Postgres literals", () => {
    expect(sqlTextArray(["ui", "it's"])).toBe("ARRAY['ui','it''s']::TEXT[]");
    expect(sqlTextArray([])).toBe("ARRAY[]::TEXT[]");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/skills/migration-seed.test.ts` → FAIL, "Failed to resolve import ./seed-sql" (and the migration file does not exist yet).

- [ ] **Step 3: Write the catalog seed helpers and the seed script**

```ts
// apps/web/src/lib/skills/seed-sql.ts
/** Relative imports only: scripts/skills-builder-seed-sql.ts loads this through tsx. */
import { sqlLiteral } from "../prompt-bot/seed-sql";
import type { CatalogSeedEntry } from "./catalog-seed";

export const sqlTextArray = (values: string[]) => `ARRAY[${values.map(sqlLiteral).join(",")}]::TEXT[]`;

export function catalogSeedSql(entries: CatalogSeedEntry[]): string[] {
  return entries.map(
    (e) =>
      `INSERT INTO "skill_catalog_entries" ("id","slug","name","description","source_url","license","bundlable","install_notes","tags","is_active","created_at","updated_at") VALUES (${sqlLiteral(e.id)},${sqlLiteral(e.slug)},${sqlLiteral(e.name)},${sqlLiteral(e.description)},${sqlLiteral(e.sourceUrl)},${sqlLiteral(e.license)},${e.bundlable},${sqlLiteral(e.installNotes)},${sqlTextArray(e.tags)},true,NOW(),NOW());`,
  );
}
```

```ts
// apps/web/scripts/skills-builder-seed-sql.ts
// Prints INSERT statements for the skill-definition matrix and the skill catalog.
// Usage: npx tsx scripts/skills-builder-seed-sql.ts >> prisma/migrations/20261124120000_add_skills_builder/migration.sql
import { matrixSeedSql } from "../src/lib/prompt-bot/seed-sql";
import { SKILL_MATRIX } from "../src/lib/skills/builtin-skill-matrix";
import { CATALOG_SEED } from "../src/lib/skills/catalog-seed";
import { catalogSeedSql } from "../src/lib/skills/seed-sql";

console.log(
  [
    "",
    "-- Seed: skill-definition matrix (src/lib/skills/builtin-skill-matrix.ts)",
    ...matrixSeedSql(SKILL_MATRIX),
    "",
    "-- Seed: skill catalog (src/lib/skills/catalog-seed.ts; licenses from scripts/verify-catalog-licenses.ts)",
    ...catalogSeedSql(CATALOG_SEED),
  ].join("\n"),
);
```

- [ ] **Step 4: Edit the schema**

Append after `model AiSettings { … }` in `apps/web/prisma/schema.prisma`:

```prisma
// ============================================================================
// Prompt Bot — Skills Builder
// ============================================================================

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
  id          String          @id @default(cuid())
  userId      String          @map("user_id")
  title       String          @default("My skills")
  description String
  role        String?
  createdAt   DateTime        @default(now()) @map("created_at")
  updatedAt   DateTime        @updatedAt @map("updated_at")
  user        User            @relation("SkillPackOwner", fields: [userId], references: [id], onDelete: Cascade)
  items       SkillPackItem[]
  @@index([userId, updatedAt])
  @@map("skill_packs")
}

model SkillPackItem {
  id               String             @id @default(cuid())
  packId           String             @map("pack_id")
  order            Int
  kind             SkillItemKind
  catalogEntryId   String?            @map("catalog_entry_id")
  name             String
  purpose          String
  status           SkillItemStatus    @default(DRAFT)
  files            Json?
  validationErrors String[]           @default([]) @map("validation_errors")
  scoreRevision    Int                @default(0) @map("score_revision")
  createdAt        DateTime           @default(now()) @map("created_at")
  updatedAt        DateTime           @updatedAt @map("updated_at")
  pack             SkillPack          @relation(fields: [packId], references: [id], onDelete: Cascade)
  catalogEntry     SkillCatalogEntry? @relation(fields: [catalogEntryId], references: [id], onDelete: SetNull)
  answers          SkillItemAnswer[]
  @@index([packId, order])
  @@map("skill_pack_items")
}

model SkillItemAnswer {
  id          String               @id @default(cuid())
  itemId      String               @map("item_id")
  questionId  String               @map("question_id")
  answer      String               @default("")
  score       Int                  @default(0)
  reason      String?
  notRelevant Boolean              @default(false) @map("not_relevant")
  scoredAt    DateTime?            @map("scored_at")
  item        SkillPackItem        @relation(fields: [itemId], references: [id], onDelete: Cascade)
  question    PromptMatrixQuestion @relation(fields: [questionId], references: [id], onDelete: Cascade)
  @@unique([itemId, questionId])
  @@map("skill_item_answers")
}

model SkillCatalogEntry {
  id           String          @id @default(cuid())
  slug         String          @unique
  name         String
  description  String
  sourceUrl    String          @map("source_url")
  license      String
  bundlable    Boolean         @default(false)
  installNotes String          @map("install_notes")
  tags         String[]        @default([])
  isActive     Boolean         @default(true) @map("is_active")
  createdById  String?         @map("created_by_id")
  createdAt    DateTime        @default(now()) @map("created_at")
  updatedAt    DateTime        @updatedAt @map("updated_at")
  createdBy    User?           @relation("SkillCatalogCreator", fields: [createdById], references: [id], onDelete: SetNull)
  items        SkillPackItem[]
  @@map("skill_catalog_entries")
}
```

In `model User`'s relation list, after `aiUsage AiUsageDaily[] @relation("AiUsageOwner")`, add:

```prisma
  skillPacks          SkillPack[]         @relation("SkillPackOwner")
  skillCatalogEntries SkillCatalogEntry[] @relation("SkillCatalogCreator")
```

In `model PromptMatrixQuestion`, after `answers PromptBotAnswer[]`, add:

```prisma
  skillAnswers SkillItemAnswer[]
```

`validationErrors` and `tags` carry `@default([])` (the spec's model has no default; this mirrors `unansweredQuestionIds` in the enhancer and lets inserts omit them).

- [ ] **Step 5: Generate the migration from HEAD, append the seed, apply it**

```bash
cd "/Users/tharunkumarl/Full Stack/lms/apps/web"
npx prisma format
git show HEAD:apps/web/prisma/schema.prisma > "$TMPDIR/schema-before-skills.prisma"
mkdir -p prisma/migrations/20261124120000_add_skills_builder
npx prisma migrate diff \
  --from-schema-datamodel "$TMPDIR/schema-before-skills.prisma" \
  --to-schema-datamodel prisma/schema.prisma \
  --script > prisma/migrations/20261124120000_add_skills_builder/migration.sql
npx tsx scripts/skills-builder-seed-sql.ts >> prisma/migrations/20261124120000_add_skills_builder/migration.sql
cat prisma/migrations/20261124120000_add_skills_builder/migration.sql
```
Inspect the SQL before applying it. It must contain only `CREATE TYPE` (two), `CREATE TABLE` (four), `CREATE INDEX`/`CREATE UNIQUE INDEX`, `ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY` on the new tables, and the seed `INSERT`s. If it alters or drops anything that already exists, stop and report.

```bash
npx prisma migrate deploy
npx prisma generate
npx prisma migrate status
```
Expected: `20261124120000_add_skills_builder` applied; status reports the database schema is up to date.

- [ ] **Step 6: Run the test and the type check, then commit**

Run: `npx vitest run src/lib/skills/migration-seed.test.ts && npx tsc --noEmit` → PASS, no type errors.
```bash
cd "/Users/tharunkumarl/Full Stack/lms"
git add apps/web/prisma/schema.prisma apps/web/prisma/migrations/20261124120000_add_skills_builder apps/web/src/lib/skills/seed-sql.ts apps/web/scripts/skills-builder-seed-sql.ts apps/web/src/lib/skills/migration-seed.test.ts
git commit -m "feat(skills-builder): skill pack, item, answer and catalog tables with seeded matrix and catalog"
```

---

### Task 4: Skill names and split clean-up

**Files:**
- Modify: `apps/web/src/lib/skills/names.ts` (created with `isValidSkillName` in Task 2)
- Create: `apps/web/src/lib/skills/split.ts`
- Test: `apps/web/src/lib/skills/names.test.ts`, `apps/web/src/lib/skills/split.test.ts`

**Interfaces:**
- Produces:
  - `oneLine(value: string, max?: number): string` (collapses whitespace, trims, cuts to `max`, default unlimited)
  - `normalizeSkillName(raw: string, fallback = "skill"): string` (always passes `isValidSkillName`)
  - `uniqueSkillName(raw: string, taken: Iterable<string>): string` (normalises, then `-2`, `-3` … within 64 characters)
  - `MAX_CUSTOM_SKILLS = 8`, `MAX_CATALOG_MATCHES = 6`, `PURPOSE_MAX = 300`
  - `RawSplit = { customSkills: { name: string; purpose: string }[]; catalogMatches: { slug: string; why: string }[] }`, `SplitResult` (same shape, cleaned)
  - `cleanSplit(raw: RawSplit, activeSlugs: ReadonlySet<string>): SplitResult`

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/src/lib/skills/names.test.ts
import { describe, expect, it } from "vitest";
import { isValidSkillName, normalizeSkillName, oneLine, uniqueSkillName } from "./names";

describe("normalizeSkillName", () => {
  it.each([
    ["Board Update Writer", "board-update-writer"],
    ["  --Weekly   KPI report!!", "weekly-kpi-report"],
    ["Café Menü", "cafe-menu"],
    ["a__b..c", "a-b-c"],
    ["", "skill"],
    ["!!!", "skill"],
  ])("normalises %j to %j", (raw, expected) => {
    expect(normalizeSkillName(raw)).toBe(expected);
  });

  it("caps at 64 characters without leaving a trailing hyphen", () => {
    const name = normalizeSkillName(`${"a".repeat(63)} b`);
    expect(name).toBe("a".repeat(63));
    expect(isValidSkillName(name)).toBe(true);
  });

  it("uses the given fallback when nothing is left", () => {
    expect(normalizeSkillName("???", "skill-pack")).toBe("skill-pack");
  });
});

describe("uniqueSkillName", () => {
  it("adds a numeric suffix when the name is taken", () => {
    expect(uniqueSkillName("Board update", ["board-update"])).toBe("board-update-2");
    expect(uniqueSkillName("board-update", ["board-update", "board-update-2"])).toBe("board-update-3");
    expect(uniqueSkillName("Board update", [])).toBe("board-update");
  });

  it("keeps a suffixed name within 64 characters", () => {
    const long = "a".repeat(64);
    const name = uniqueSkillName(long, [long]);
    expect(name).toBe(`${"a".repeat(62)}-2`);
    expect(isValidSkillName(name)).toBe(true);
  });
});

describe("isValidSkillName", () => {
  it("applies the Agent Skills name rule", () => {
    expect(isValidSkillName("pdf-tools")).toBe(true);
    for (const bad of ["-a", "a-", "a--b", "A", "a_b", "", "a".repeat(65)]) expect(isValidSkillName(bad)).toBe(false);
  });
});

describe("oneLine", () => {
  it("collapses whitespace and cuts to the limit", () => {
    expect(oneLine("  two\n\nlines\t here ")).toBe("two lines here");
    expect(oneLine("abcdef", 3)).toBe("abc");
  });
});
```

```ts
// apps/web/src/lib/skills/split.test.ts
import { describe, expect, it } from "vitest";
import { cleanSplit } from "./split";

const ACTIVE = new Set(["impeccable", "pptx", "docx", "xlsx", "pdf", "frontend-design", "skill-creator"]);

describe("cleanSplit", () => {
  it("normalises names and suffixes duplicates", () => {
    const result = cleanSplit(
      { customSkills: [{ name: "Board Update", purpose: "Monthly board update." }, { name: "board-update", purpose: "Another one." }], catalogMatches: [] },
      ACTIVE,
    );
    expect(result.customSkills).toEqual([
      { name: "board-update", purpose: "Monthly board update." },
      { name: "board-update-2", purpose: "Another one." },
    ]);
  });

  it("keeps at most 8 custom skills and 6 catalog matches", () => {
    const result = cleanSplit(
      {
        customSkills: Array.from({ length: 10 }, (_, i) => ({ name: `Skill ${i}`, purpose: `Does ${i}.` })),
        catalogMatches: [...ACTIVE].map((slug) => ({ slug, why: "Helps." })),
      },
      ACTIVE,
    );
    expect(result.customSkills).toHaveLength(8);
    expect(result.catalogMatches).toHaveLength(6);
  });

  it("drops catalog slugs that are not active, and repeated slugs", () => {
    const result = cleanSplit(
      { customSkills: [], catalogMatches: [{ slug: "ghost", why: "x" }, { slug: "pptx", why: "Decks." }, { slug: "pptx", why: "Again." }] },
      ACTIVE,
    );
    expect(result.catalogMatches).toEqual([{ slug: "pptx", why: "Decks." }]);
  });

  it("collapses whitespace, falls back to the name for an empty purpose, and skips empty entries", () => {
    const result = cleanSplit(
      { customSkills: [{ name: "Inbox  Triage", purpose: "  " }, { name: " ", purpose: " " }, { name: "", purpose: "Writes the\nweekly plan." }], catalogMatches: [] },
      ACTIVE,
    );
    expect(result.customSkills).toEqual([
      { name: "inbox-triage", purpose: "Inbox Triage" },
      { name: "writes-the-weekly-plan", purpose: "Writes the weekly plan." },
    ]);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/lib/skills/names.test.ts src/lib/skills/split.test.ts`
Expected: FAIL, `normalizeSkillName is not a function` (names) and "Failed to resolve import ./split".

- [ ] **Step 3: Implement**

Replace the whole of `apps/web/src/lib/skills/names.ts` with:

```ts
// apps/web/src/lib/skills/names.ts
export const SKILL_NAME_MAX = 64;

/** Agent Skills name rule: kebab-case, no leading, trailing or double hyphen, at most 64 characters. */
export function isValidSkillName(name: string): boolean {
  return name.length <= SKILL_NAME_MAX && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(name);
}

export function oneLine(value: string, max = Number.POSITIVE_INFINITY): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

/** Lower-case ASCII kebab-case that always satisfies isValidSkillName. */
export function normalizeSkillName(raw: string, fallback = "skill"): string {
  const kebab = raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return kebab.slice(0, SKILL_NAME_MAX).replace(/-+$/g, "") || fallback;
}

/** The normalised name, or the first free `<name>-N` (N ≥ 2) that fits in 64 characters. */
export function uniqueSkillName(raw: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = normalizeSkillName(raw);
  if (!used.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const suffix = `-${n}`;
    const candidate = `${base.slice(0, SKILL_NAME_MAX - suffix.length).replace(/-+$/g, "")}${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
}
```

```ts
// apps/web/src/lib/skills/split.ts
import { oneLine, uniqueSkillName } from "./names";

export const MAX_CUSTOM_SKILLS = 8;
export const MAX_CATALOG_MATCHES = 6;
export const PURPOSE_MAX = 300;

export type RawSplit = { customSkills: { name: string; purpose: string }[]; catalogMatches: { slug: string; why: string }[] };
export type SplitResult = RawSplit;

/** Applies the spec's split rules to the model's reply: valid unique names, caps, and active catalog slugs only. */
export function cleanSplit(raw: RawSplit, activeSlugs: ReadonlySet<string>): SplitResult {
  const taken = new Set<string>();
  const customSkills: SplitResult["customSkills"] = [];
  for (const skill of raw.customSkills) {
    if (customSkills.length >= MAX_CUSTOM_SKILLS) break;
    const label = oneLine(skill.name);
    const purpose = oneLine(skill.purpose, PURPOSE_MAX);
    if (!label && !purpose) continue;
    const name = uniqueSkillName(label || purpose, taken);
    taken.add(name);
    customSkills.push({ name, purpose: purpose || label });
  }
  const seen = new Set<string>();
  const catalogMatches: SplitResult["catalogMatches"] = [];
  for (const match of raw.catalogMatches) {
    if (catalogMatches.length >= MAX_CATALOG_MATCHES) break;
    if (!activeSlugs.has(match.slug) || seen.has(match.slug)) continue;
    seen.add(match.slug);
    catalogMatches.push({ slug: match.slug, why: oneLine(match.why, PURPOSE_MAX) });
  }
  return { customSkills, catalogMatches };
}
```

- [ ] **Step 4: Run them and watch them pass, then commit**

Run: `npx vitest run src/lib/skills/names.test.ts src/lib/skills/split.test.ts src/lib/skills/catalog-seed.test.ts` → PASS.
```bash
cd "/Users/tharunkumarl/Full Stack/lms"
git add apps/web/src/lib/skills/names.ts apps/web/src/lib/skills/names.test.ts apps/web/src/lib/skills/split.ts apps/web/src/lib/skills/split.test.ts
git commit -m "feat(skills-builder): skill name normalisation and split clean-up"
```

---

### Task 5: Agent Skills format validator

**Files:**
- Modify: `apps/web/package.json` (via npm: `yaml`)
- Create: `apps/web/src/lib/skills/types.ts`
- Create: `apps/web/src/lib/skills/frontmatter.ts`
- Create: `apps/web/src/lib/skills/format.ts`
- Test: `apps/web/src/lib/skills/format.test.ts`

**Interfaces:**
- Produces:
  - `src/lib/skills/types.ts` (shared by server and client; no runtime imports):
    ```ts
    SkillFile = { path: string; content: string }
    SkillItemKind = "CUSTOM" | "CATALOG"
    SkillItemStatus = "DRAFT" | "GENERATING" | "READY" | "FAILED"
    CatalogCard = { id; slug; name; sourceUrl; license; bundlable: boolean; installNotes }
    SkillItemView = { id; order: number; kind: SkillItemKind; name; purpose; status: SkillItemStatus; files: SkillFile[] | null; validationErrors: string[]; scoreRevision: number; answers: AnswerView[]; catalog: CatalogCard | null }
    SkillMatrixView = { id; name; questions: { id; text; guidance; order: number }[] }
    SkillPackView = { id; title; description; role: string | null; matrix: SkillMatrixView; items: SkillItemView[] }
    CatalogEntryView = { id; slug; name; description; sourceUrl; license; bundlable: boolean; installNotes; tags: string[]; isActive: boolean }
    ```
  - `splitFrontmatter(content: string): { frontmatter: string; body: string; rest: string } | null` (same regex as the Python validator: `^---\n(.*?)\n---`)
  - `SKILL_LIMITS = { fileBytes: 204800, skillBytes: 1048576, files: 100, pathChars: 200, nameChars: 64, descriptionChars: 1024, compatibilityChars: 500 }`, `SKILL_FOLDERS = ["references", "scripts", "assets"]`
  - `checkSkillPath(path: string): { ok: true; path: string } | { ok: false; error: string }`
  - `validateSkillMd(content: string, expectedName: string): string[]`
  - `validateSkillFiles(files: SkillFile[], expectedName: string): string[]` (empty array means valid)
  - `withSkillName(content: string, name: string): string` (sets frontmatter `name`, keeps everything else)

- [ ] **Step 1: Install the YAML parser**

```bash
cd "/Users/tharunkumarl/Full Stack/lms"
npm install yaml --workspace=apps/web
```

- [ ] **Step 2: Write the failing test**

```ts
// apps/web/src/lib/skills/format.test.ts
import { describe, expect, it } from "vitest";
import { checkSkillPath, validateSkillFiles, validateSkillMd, withSkillName } from "./format";

const NAME = "board-update";
const VALID = `name: ${NAME}\ndescription: "Writes the monthly board update. Use when asked for a board update."`;
const md = (front: string, body = "Write the update from the notes.") => `---\n${front}\n---\n\n${body}\n`;
const errorsFor = (content: string, expected = NAME) => validateSkillMd(content, expected);

describe("validateSkillMd", () => {
  it("accepts a valid SKILL.md, including every allowed optional key", () => {
    expect(errorsFor(md(VALID))).toEqual([]);
    expect(errorsFor(md(`${VALID}\nlicense: MIT\nallowed-tools: Read\ncompatibility: "Python 3"\nmetadata:\n  owner: me`))).toEqual([]);
  });

  it("counts description length in characters, as the validator does", () => {
    expect(errorsFor(md(`name: ${NAME}\ndescription: "${"😀".repeat(1024)}"`))).toEqual([]);
    expect(errorsFor(md(`name: ${NAME}\ndescription: "${"😀".repeat(1025)}"`))).toEqual([expect.stringMatching(/1024/)]);
  });

  it.each([
    ["no frontmatter", "Just instructions", /no YAML frontmatter/],
    ["unclosed frontmatter", "---\nname: board-update\n", /closed with a --- line/],
    ["invalid YAML", md("name: [unclosed"), /invalid YAML/],
    ["frontmatter that is not a mapping", md("- a\n- b"), /mapping/],
    ["an unexpected key", md(`${VALID}\nversion: 1`), /unexpected frontmatter key\(s\): version/],
    ["a missing name", md('description: "Writes things."'), /missing name/],
    ["a name that is not text", md('name: 123\ndescription: "Writes things."'), /name must be text/],
    ["a name that is not kebab-case", md('name: Board_Update\ndescription: "Writes things."'), /kebab-case/],
    ["a double hyphen", md('name: board--update\ndescription: "Writes things."'), /hyphen/],
    ["a name over 64 characters", md(`name: ${"a".repeat(65)}\ndescription: "Writes things."`), /64 characters/],
    ["a name that differs from the folder", md('name: other-skill\ndescription: "Writes things."'), /match the skill folder/],
    ["a missing description", md(`name: ${NAME}`), /missing description/],
    ["a YAML 1.1 boolean description", md(`name: ${NAME}\ndescription: yes`), /description must be text/],
    ["an empty description", md(`name: ${NAME}\ndescription: ""`), /description is empty/],
    ["angle brackets in the description", md(`name: ${NAME}\ndescription: "Use <this>"`), /< or >/],
    ["a description over 1024 characters", md(`name: ${NAME}\ndescription: "${"x".repeat(1025)}"`), /1024/],
    ["a compatibility that is not text", md(`${VALID}\ncompatibility: 5`), /compatibility must be text/],
    ["a compatibility over 500 characters", md(`${VALID}\ncompatibility: "${"x".repeat(501)}"`), /500/],
    ["no instructions after the frontmatter", md(VALID, ""), /instructions below the frontmatter/],
  ])("rejects %s", (_label, content, pattern) => {
    expect(errorsFor(content)).toEqual(expect.arrayContaining([expect.stringMatching(pattern)]));
  });
});

describe("checkSkillPath", () => {
  it.each(["SKILL.md", "references/company/context.md", "scripts/count_words.py", "assets/slide-template.md"])("accepts %s", (path) => {
    expect(checkSkillPath(path)).toEqual({ ok: true, path });
  });

  it.each([
    ["", /empty/],
    [`references/${"a".repeat(200)}.md`, /longer than 200/],
    ["references\\x.md", /forward slashes/],
    ["/etc/passwd", /absolute/],
    ["C:/x.md", /absolute/],
    ["../x.md", /'\.\.'/],
    ["references/../../etc/passwd", /'\.\.'/],
    ["references/", /empty or '\.' segment/],
    ["references/./a.md", /empty or '\.' segment/],
    ["notes.md", /inside references\/, scripts\/ or assets\//],
    ["evals/evals.json", /inside references\/, scripts\/ or assets\//],
    ["scripts/__pycache__/a.pyc", /not packaged/],
    ["scripts/a.pyc", /not packaged/],
    ["references/.DS_Store", /not packaged/],
    ["references/SKILL.md", /only one SKILL\.md/],
    ["references/.env", /letters, digits/],
    ["references/a b.md", /letters, digits/],
  ])("rejects %j", (path, pattern) => {
    const result = checkSkillPath(path);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(pattern);
  });
});

describe("validateSkillFiles", () => {
  const skillMd = { path: "SKILL.md", content: md(VALID) };

  it("accepts a complete skill", () => {
    expect(
      validateSkillFiles(
        [skillMd, { path: "references/context.md", content: "x" }, { path: "scripts/count.py", content: "print(1)" }, { path: "assets/t.md", content: "t" }],
        NAME,
      ),
    ).toEqual([]);
  });

  it("requires SKILL.md", () => {
    expect(validateSkillFiles([{ path: "references/a.md", content: "x" }], NAME)).toEqual(["SKILL.md is missing"]);
  });

  it("reports hostile paths and duplicate paths", () => {
    const errors = validateSkillFiles(
      [skillMd, { path: "../../evil.sh", content: "x" }, { path: "references/A.md", content: "x" }, { path: "references/a.md", content: "y" }],
      NAME,
    );
    expect(errors).toEqual([expect.stringMatching(/'\.\.'/), expect.stringMatching(/duplicate path/)]);
  });

  it("enforces 200 KB per file, counted in UTF-8 bytes", () => {
    expect(validateSkillFiles([skillMd, { path: "references/a.md", content: "x".repeat(200 * 1024) }], NAME)).toEqual([]);
    expect(validateSkillFiles([skillMd, { path: "references/a.md", content: "x".repeat(200 * 1024 + 1) }], NAME)).toEqual([
      expect.stringMatching(/200 KB/),
    ]);
    expect(validateSkillFiles([skillMd, { path: "references/a.md", content: "é".repeat(102401) }], NAME)).toEqual([expect.stringMatching(/200 KB/)]);
  });

  it("enforces 1 MB per skill", () => {
    const big = Array.from({ length: 6 }, (_, i) => ({ path: `references/part-${i}.md`, content: "x".repeat(180 * 1024) }));
    expect(validateSkillFiles([skillMd, ...big], NAME)).toEqual([expect.stringMatching(/1 MB/)]);
  });

  it("allows at most 100 files", () => {
    const many = Array.from({ length: 100 }, (_, i) => ({ path: `references/n-${i}.md`, content: "" }));
    expect(validateSkillFiles([skillMd, ...many], NAME)).toEqual([expect.stringMatching(/at most 100 files/)]);
  });
});

describe("withSkillName", () => {
  it("renames the skill and keeps every other key and the body", () => {
    const original = md(`${VALID}\nmetadata:\n  owner: me`, "Body stays.");
    const renamed = withSkillName(original, "weekly-report");
    expect(renamed).toContain("\nname: weekly-report\n");
    expect(renamed).toContain('description: "Writes the monthly board update. Use when asked for a board update."');
    expect(renamed).toContain("owner: me");
    expect(renamed.endsWith("\n\nBody stays.\n")).toBe(true);
    expect(validateSkillMd(renamed, "weekly-report")).toEqual([]);
  });

  it("leaves content without valid frontmatter untouched", () => {
    expect(withSkillName("no frontmatter", "x")).toBe("no frontmatter");
    expect(withSkillName(md("name: [unclosed"), "x")).toBe(md("name: [unclosed"));
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run src/lib/skills/format.test.ts` → FAIL, "Failed to resolve import ./format".

- [ ] **Step 4: Implement**

```ts
// apps/web/src/lib/skills/types.ts
import type { AnswerView } from "@/lib/prompt-bot/sessions";

export type SkillFile = { path: string; content: string };
export type SkillItemKind = "CUSTOM" | "CATALOG";
export type SkillItemStatus = "DRAFT" | "GENERATING" | "READY" | "FAILED";

export type CatalogCard = { id: string; slug: string; name: string; sourceUrl: string; license: string; bundlable: boolean; installNotes: string };

export type SkillItemView = {
  id: string;
  order: number;
  kind: SkillItemKind;
  name: string;
  purpose: string;
  status: SkillItemStatus;
  files: SkillFile[] | null;
  validationErrors: string[];
  scoreRevision: number;
  answers: AnswerView[];
  catalog: CatalogCard | null;
};

export type SkillMatrixView = { id: string; name: string; questions: { id: string; text: string; guidance: string; order: number }[] };

export type SkillPackView = {
  id: string;
  title: string;
  description: string;
  role: string | null;
  matrix: SkillMatrixView;
  items: SkillItemView[];
};

export type CatalogEntryView = {
  id: string;
  slug: string;
  name: string;
  description: string;
  sourceUrl: string;
  license: string;
  bundlable: boolean;
  installNotes: string;
  tags: string[];
  isActive: boolean;
};
```

```ts
// apps/web/src/lib/skills/frontmatter.ts
/** Same pattern as Anthropic's quick_validate.py: `^---\n(.*?)\n---` with DOTALL. No YAML parsing here (client-safe). */
const FRONTMATTER = /^---\n([\s\S]*?)\n---/;

export function splitFrontmatter(content: string): { frontmatter: string; body: string; rest: string } | null {
  if (!content.startsWith("---")) return null;
  const match = FRONTMATTER.exec(content);
  if (!match) return null;
  const rest = content.slice(match[0].length);
  return { frontmatter: match[1], body: rest.replace(/^\n+/, ""), rest };
}
```

```ts
// apps/web/src/lib/skills/format.ts
import { isMap, parse, parseDocument } from "yaml";
import { splitFrontmatter } from "./frontmatter";
import type { SkillFile } from "./types";

/** Agent Skills rules (Anthropic skill-creator validator, verified 2026-11-24) and the spec's size limits. */
export const SKILL_LIMITS = {
  fileBytes: 200 * 1024,
  skillBytes: 1024 * 1024,
  files: 100,
  pathChars: 200,
  nameChars: 64,
  descriptionChars: 1024,
  compatibilityChars: 500,
} as const;
export const SKILL_FOLDERS = ["references", "scripts", "assets"] as const;

const ALLOWED_KEYS = ["allowed-tools", "compatibility", "description", "license", "metadata", "name"];
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const NOT_PACKAGED = new Set(["__pycache__", "node_modules", ".DS_Store"]);
/** The validator parses with PyYAML, which reads YAML 1.1 (`yes` is a boolean there). */
const YAML_OPTIONS = { version: "1.1" } as const;

const show = (path: string) => JSON.stringify(path.length > 80 ? `${path.slice(0, 77)}...` : path);
const chars = (value: string) => [...value].length;
const utf8Bytes = (value: string) => new TextEncoder().encode(value).length;
const kb = (bytes: number) => `${Math.ceil(bytes / 1024)} KB`;

export type PathCheck = { ok: true; path: string } | { ok: false; error: string };

export function checkSkillPath(path: string): PathCheck {
  const fail = (reason: string): PathCheck => ({ ok: false, error: `${show(path)}: ${reason}` });
  if (!path) return { ok: false, error: "A file path is empty" };
  if (path.length > SKILL_LIMITS.pathChars) return fail(`path is longer than ${SKILL_LIMITS.pathChars} characters`);
  if (path.includes("\\")) return fail("use forward slashes (/) in paths");
  if (path.startsWith("/") || /^[A-Za-z]:/.test(path)) return fail("absolute paths are not allowed");
  const segments = path.split("/");
  if (segments.includes("..")) return fail("'..' is not allowed in paths");
  if (segments.some((s) => s === "" || s === ".")) return fail("path has an empty or '.' segment");
  if (path === "SKILL.md") return { ok: true, path };
  if (segments.length < 2 || !(SKILL_FOLDERS as readonly string[]).includes(segments[0])) {
    return fail("files must be SKILL.md or inside references/, scripts/ or assets/");
  }
  if (segments.some((s) => NOT_PACKAGED.has(s)) || path.endsWith(".pyc")) {
    return fail("__pycache__, node_modules, .pyc and .DS_Store files are not packaged");
  }
  if (segments.includes("SKILL.md")) return fail("a skill has only one SKILL.md, at its root");
  if (!segments.every((s) => SEGMENT.test(s))) return fail("use letters, digits, dots, dashes and underscores, and don't start a name with a dot");
  return { ok: true, path };
}

export function validateSkillMd(content: string, expectedName: string): string[] {
  if (!content.startsWith("---")) return ["SKILL.md: no YAML frontmatter found (it must start with ---)"];
  const parts = splitFrontmatter(content);
  if (!parts) return ["SKILL.md: frontmatter must be closed with a --- line"];
  let data: unknown;
  try {
    data = parse(parts.frontmatter, YAML_OPTIONS);
  } catch (error) {
    return [`SKILL.md: invalid YAML in frontmatter (${(error as Error).message.split("\n")[0]})`];
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return ["SKILL.md: frontmatter must be a YAML mapping of keys to values"];
  const fm = data as Record<string, unknown>;
  const errors: string[] = [];

  const unexpected = Object.keys(fm).filter((key) => !ALLOWED_KEYS.includes(key)).sort();
  if (unexpected.length) errors.push(`SKILL.md: unexpected frontmatter key(s): ${unexpected.join(", ")}. Allowed: ${ALLOWED_KEYS.join(", ")}`);

  if (!("name" in fm)) errors.push("SKILL.md: missing name");
  else if (typeof fm.name !== "string") errors.push("SKILL.md: name must be text");
  else {
    const name = fm.name.trim();
    if (!/^[a-z0-9-]+$/.test(name)) errors.push(`SKILL.md: name ${show(name)} must be kebab-case (lowercase letters, digits and hyphens)`);
    else if (name.startsWith("-") || name.endsWith("-") || name.includes("--")) {
      errors.push(`SKILL.md: name ${show(name)} cannot start or end with a hyphen or contain "--"`);
    }
    if (chars(name) > SKILL_LIMITS.nameChars) errors.push(`SKILL.md: name is longer than ${SKILL_LIMITS.nameChars} characters`);
    if (name !== expectedName) errors.push(`SKILL.md: name must be "${expectedName}" to match the skill folder`);
  }

  if (!("description" in fm)) errors.push("SKILL.md: missing description");
  else if (typeof fm.description !== "string") errors.push("SKILL.md: description must be text");
  else {
    const description = fm.description.trim();
    if (!description) errors.push("SKILL.md: description is empty");
    if (/[<>]/.test(description)) errors.push("SKILL.md: description cannot contain < or >");
    if (chars(description) > SKILL_LIMITS.descriptionChars) {
      errors.push(`SKILL.md: description is ${chars(description)} characters; the limit is ${SKILL_LIMITS.descriptionChars}`);
    }
  }

  const compatibility = fm.compatibility;
  if (compatibility !== undefined && compatibility !== null && compatibility !== "") {
    if (typeof compatibility !== "string") errors.push("SKILL.md: compatibility must be text");
    else if (chars(compatibility) > SKILL_LIMITS.compatibilityChars) {
      errors.push(`SKILL.md: compatibility is longer than ${SKILL_LIMITS.compatibilityChars} characters`);
    }
  }

  if (!parts.body.trim()) errors.push("SKILL.md: add instructions below the frontmatter");
  return errors;
}

/** Every rule in the Target Format section. An empty result means the skill can be packaged. */
export function validateSkillFiles(files: SkillFile[], expectedName: string): string[] {
  const errors: string[] = [];
  if (files.length > SKILL_LIMITS.files) errors.push(`A skill can have at most ${SKILL_LIMITS.files} files (this one has ${files.length})`);
  const seen = new Set<string>();
  let total = 0;
  for (const file of files) {
    const check = checkSkillPath(file.path);
    if (!check.ok) errors.push(check.error);
    const key = file.path.toLowerCase();
    if (seen.has(key)) errors.push(`${show(file.path)}: duplicate path`);
    seen.add(key);
    const bytes = utf8Bytes(file.content);
    total += bytes;
    if (bytes > SKILL_LIMITS.fileBytes) errors.push(`${show(file.path)}: ${kb(bytes)} is over the 200 KB file limit`);
  }
  if (total > SKILL_LIMITS.skillBytes) errors.push(`The skill is ${kb(total)}, over the 1 MB limit`);
  const skillMd = files.find((f) => f.path === "SKILL.md");
  if (!skillMd) errors.push("SKILL.md is missing");
  else errors.push(...validateSkillMd(skillMd.content, expectedName));
  return errors;
}

/** Sets the frontmatter `name` (the item name owns it); leaves unparseable content unchanged for the validator to report. */
export function withSkillName(content: string, name: string): string {
  const parts = splitFrontmatter(content);
  if (!parts) return content;
  const doc = parseDocument(parts.frontmatter, YAML_OPTIONS);
  if (doc.errors.length > 0 || !isMap(doc.contents)) return content;
  doc.set("name", name);
  return `---\n${doc.toString({ lineWidth: 0 }).replace(/\n+$/, "")}\n---${parts.rest}`;
}
```

- [ ] **Step 5: Run it and watch it pass, then commit**

Run: `npx vitest run src/lib/skills/format.test.ts && npx tsc --noEmit` → PASS.
```bash
cd "/Users/tharunkumarl/Full Stack/lms"
git add apps/web/package.json package-lock.json apps/web/src/lib/skills/types.ts apps/web/src/lib/skills/frontmatter.ts apps/web/src/lib/skills/format.ts apps/web/src/lib/skills/format.test.ts
git commit -m "feat(skills-builder): Agent Skills validator, path sanitiser and size limits"
```

---

### Task 6: Skill assembly from the model's draft

**Files:**
- Create: `apps/web/src/lib/skills/assemble.ts`
- Test: `apps/web/src/lib/skills/assemble.test.ts`

**Interfaces:**
- Consumes: `SkillFile` (Task 5), `oneLine` (Task 4), `validateSkillFiles`, `validateSkillMd` (Task 5, in tests).
- Produces:
  - `SkillDraft = { name: string; description: string; compatibility: string; body: string; references: { path: string; content: string }[]; scripts: { path: string; content: string; purpose: string }[]; assets: { path: string; content: string }[] }` (the model's structured reply)
  - `buildSkillMd(name: string, description: string, compatibility: string, body: string): string`
  - `assembleSkillFiles(name: string, draft: SkillDraft): SkillFile[]` — `SKILL.md` first; `name` always comes from the item, never from `draft.name`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/skills/assemble.test.ts
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { assembleSkillFiles, buildSkillMd, type SkillDraft } from "./assemble";
import { splitFrontmatter } from "./frontmatter";
import { validateSkillFiles } from "./format";

const DRAFT: SkillDraft = {
  name: "Something Else Entirely",
  description: 'Writes the "board" update: numbers first.\n# Use when asked for the monthly update',
  compatibility: "",
  body: "# Board update\n\nRead `references/context.md` first.",
  references: [{ path: "context.md", content: "[Add your company context here]" }],
  scripts: [{ path: "./scripts/count_words.py", content: "print(1)", purpose: "Counts words in the draft." }],
  assets: [{ path: "assets/template.md", content: "## Template" }],
};

describe("assembleSkillFiles", () => {
  it("writes SKILL.md first with the item's name, and places files in their folders", () => {
    const files = assembleSkillFiles("board-update", DRAFT);
    expect(files.map((f) => f.path)).toEqual(["SKILL.md", "references/context.md", "scripts/count_words.py", "assets/template.md"]);
    expect(files[0].content.startsWith("---\nname: board-update\n")).toBe(true);
    expect(validateSkillFiles(files, "board-update")).toEqual([]);
  });

  it("keeps quotes, colons and # in the description as valid YAML 1.1", () => {
    const front = splitFrontmatter(assembleSkillFiles("board-update", DRAFT)[0].content)!.frontmatter;
    expect(parse(front, { version: "1.1" })).toEqual({
      name: "board-update",
      description: 'Writes the "board" update: numbers first. # Use when asked for the monthly update',
    });
  });

  it("lists scripts the body does not mention, with their purpose and a review reminder", () => {
    const skillMd = assembleSkillFiles("board-update", DRAFT)[0].content;
    expect(skillMd).toContain("## Scripts");
    expect(skillMd).toContain("- `scripts/count_words.py`: Counts words in the draft.");
    const mentioned = assembleSkillFiles("board-update", { ...DRAFT, body: "Run `scripts/count_words.py` on the draft." })[0].content;
    expect(mentioned).not.toContain("## Scripts");
  });

  it("writes compatibility only when there is one", () => {
    expect(buildSkillMd("x", "d", "", "b")).not.toContain("compatibility");
    expect(buildSkillMd("x", "d", "Needs Python 3", "b")).toContain('compatibility: "Needs Python 3"');
  });

  it("assembles a hostile model path so the validator reports it", () => {
    const files = assembleSkillFiles("board-update", { ...DRAFT, scripts: [{ path: "../../evil.sh", content: "x", purpose: "x" }] });
    expect(files.map((f) => f.path)).toContain("scripts/../../evil.sh");
    expect(validateSkillFiles(files, "board-update")).toEqual([expect.stringMatching(/'\.\.'/)]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/skills/assemble.test.ts` → FAIL, "Failed to resolve import ./assemble".

- [ ] **Step 3: Implement**

```ts
// apps/web/src/lib/skills/assemble.ts
import { oneLine } from "./names";
import type { SkillFile } from "./types";

/** The generation model's structured reply (spec, Generate). The server, not the model, writes the files. */
export type SkillDraft = {
  name: string;
  description: string;
  compatibility: string;
  body: string;
  references: { path: string; content: string }[];
  scripts: { path: string; content: string; purpose: string }[];
  assets: { path: string; content: string }[];
};

/** A JSON string literal is a valid YAML double-quoted scalar, so any text is safe here. */
const yamlString = (value: string) => JSON.stringify(value);

function inFolder(folder: string, path: string): string {
  const clean = path.trim().replace(/^(\.\/)+/, "");
  return clean.startsWith(`${folder}/`) ? clean : `${folder}/${clean}`;
}

export function buildSkillMd(name: string, description: string, compatibility: string, body: string): string {
  const lines = ["---", `name: ${name}`, `description: ${yamlString(oneLine(description))}`];
  const compat = oneLine(compatibility);
  if (compat) lines.push(`compatibility: ${yamlString(compat)}`);
  lines.push("---", "", body.trim(), "");
  return lines.join("\n");
}

/** Turns a draft into files. `name` is the item's name, which owns the folder and the frontmatter name. */
export function assembleSkillFiles(name: string, draft: SkillDraft): SkillFile[] {
  const scripts = draft.scripts.map((s) => ({ path: inFolder("scripts", s.path), content: s.content, purpose: oneLine(s.purpose) }));
  const unlisted = scripts.filter((s) => !draft.body.includes(s.path));
  const body = unlisted.length
    ? `${draft.body.trim()}\n\n## Scripts\n\nReview each script before running it.\n\n${unlisted.map((s) => `- \`${s.path}\`: ${s.purpose}`).join("\n")}`
    : draft.body;
  return [
    { path: "SKILL.md", content: buildSkillMd(name, draft.description, draft.compatibility, body) },
    ...draft.references.map((r) => ({ path: inFolder("references", r.path), content: r.content })),
    ...scripts.map((s) => ({ path: s.path, content: s.content })),
    ...draft.assets.map((a) => ({ path: inFolder("assets", a.path), content: a.content })),
  ];
}
```

- [ ] **Step 4: Run it and watch it pass, then commit**

Run: `npx vitest run src/lib/skills/assemble.test.ts` → PASS.
```bash
cd "/Users/tharunkumarl/Full Stack/lms"
git add apps/web/src/lib/skills/assemble.ts apps/web/src/lib/skills/assemble.test.ts
git commit -m "feat(skills-builder): assemble Agent Skills files from the model's draft"
```

---

### Task 7: Pack docs and zips

**Files:**
- Modify: `apps/web/package.json` (via npm: `fflate`)
- Create: `apps/web/src/lib/skills/pack-docs.ts`
- Create: `apps/web/src/lib/skills/zip.ts`
- Test: `apps/web/src/lib/skills/pack-docs.test.ts`, `apps/web/src/lib/skills/zip.test.ts`

**Interfaces:**
- Consumes: `checkSkillPath` (Task 5), `isValidSkillName` (Task 2/4), `SkillFile` (Task 5).
- Produces:
  - `Recommendation = { name: string; why: string; sourceUrl: string; license: string; installNotes: string }`
  - `PackDocInput = { title: string; description: string; role: string | null; skills: { name: string; purpose: string }[]; recommendations: Recommendation[] }`
  - `renderReadme(input: PackDocInput): string`, `renderRecommended(recommendations: Recommendation[]): string`
  - `ZipSkill = { name: string; purpose: string; files: SkillFile[] }`
  - `buildSkillZip(skill: ZipSkill): Uint8Array` (folder `<name>/` at the zip root)
  - `buildPackZip(input: { slug: string; title: string; description: string; role: string | null; skills: ZipSkill[]; recommendations: Recommendation[] }): Uint8Array`
  - `zipResponse(bytes: Uint8Array, filename: string): Response` (`application/zip`, attachment, `no-store`)

- [ ] **Step 1: Install fflate**

```bash
cd "/Users/tharunkumarl/Full Stack/lms"
npm install fflate --workspace=apps/web
```

- [ ] **Step 2: Write the failing tests**

```ts
// apps/web/src/lib/skills/pack-docs.test.ts
import { describe, expect, it } from "vitest";
import { renderReadme, renderRecommended } from "./pack-docs";

const REC = {
  name: "Impeccable",
  why: "Polishes the dashboards you review.",
  sourceUrl: "https://github.com/pbakaus/impeccable",
  license: "Apache-2.0",
  installNotes: "Follow the README.",
};

describe("renderReadme", () => {
  const readme = renderReadme({
    title: "My week",
    description: "I plan the week and write board updates.",
    role: "CTO",
    skills: [{ name: "board-update", purpose: "Writes the board update." }],
    recommendations: [REC],
  });

  it("says what is inside", () => {
    expect(readme.startsWith("# My week\n")).toBe(true);
    expect(readme).toContain("I plan the week and write board updates.");
    expect(readme).toContain("- `board-update`: Writes the board update.");
  });

  it("gives the install steps for each tool", () => {
    expect(readme).toContain("### Claude.ai / Claude Desktop");
    expect(readme).toContain("Settings → Capabilities → Skills");
    expect(readme).toContain("`upload-to-claude/`");
    expect(readme).toContain("### Claude Code");
    expect(readme).toContain("`~/.claude/skills/`");
    expect(readme).toContain("`.claude/skills/`");
    expect(readme).toContain("### Other tools that support Agent Skills");
    expect(readme).toContain("`recommended-skills.md`");
    expect(readme).toContain("Review any files in `scripts/` before running them.");
  });
});

describe("renderRecommended", () => {
  it("lists each match with why, source, license and install notes", () => {
    const md = renderRecommended([REC]);
    expect(md).toContain("## Impeccable");
    expect(md).toContain("Polishes the dashboards you review.");
    expect(md).toContain("- Source: https://github.com/pbakaus/impeccable");
    expect(md).toContain("- License: Apache-2.0");
    expect(md).toContain("- Install: Follow the README.");
  });

  it("says so when nothing was recommended", () => {
    expect(renderRecommended([])).toContain("No existing skills were recommended for this pack.");
  });
});
```

```ts
// apps/web/src/lib/skills/zip.test.ts
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { buildPackZip, buildSkillZip, zipResponse } from "./zip";

const SKILL = {
  name: "board-update",
  purpose: "Writes the board update.",
  files: [
    { path: "SKILL.md", content: "---\nname: board-update\ndescription: \"x\"\n---\n\nBody\n" },
    { path: "references/context.md", content: "Context" },
  ],
};

describe("buildSkillZip", () => {
  it("puts the skill folder at the zip root", () => {
    const entries = unzipSync(buildSkillZip(SKILL));
    expect(Object.keys(entries).sort()).toEqual(["board-update/SKILL.md", "board-update/references/context.md"]);
    expect(strFromU8(entries["board-update/references/context.md"])).toBe("Context");
  });

  it("refuses an unsafe path or name instead of zipping it", () => {
    expect(() => buildSkillZip({ ...SKILL, files: [{ path: "../evil", content: "x" }] })).toThrow(/unsafe/);
    expect(() => buildSkillZip({ ...SKILL, name: "../x" })).toThrow(/unsafe/);
  });
});

describe("buildPackZip", () => {
  const entries = unzipSync(
    buildPackZip({ slug: "my-week", title: "My week", description: "d", role: null, skills: [SKILL], recommendations: [] }),
  );

  it("uses the spec's pack layout", () => {
    expect(Object.keys(entries).sort()).toEqual([
      "my-week/README.md",
      "my-week/recommended-skills.md",
      "my-week/skills/board-update/SKILL.md",
      "my-week/skills/board-update/references/context.md",
      "my-week/upload-to-claude/board-update.zip",
    ]);
  });

  it("includes one upload-ready zip per skill with the folder at its root", () => {
    const inner = unzipSync(entries["my-week/upload-to-claude/board-update.zip"]);
    expect(Object.keys(inner).sort()).toEqual(["board-update/SKILL.md", "board-update/references/context.md"]);
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

- [ ] **Step 3: Run them and watch them fail**

Run: `npx vitest run src/lib/skills/pack-docs.test.ts src/lib/skills/zip.test.ts` → FAIL, "Failed to resolve import ./pack-docs" and "./zip".

- [ ] **Step 4: Implement**

```ts
// apps/web/src/lib/skills/pack-docs.ts
export type Recommendation = { name: string; why: string; sourceUrl: string; license: string; installNotes: string };
export type PackDocInput = {
  title: string;
  description: string;
  role: string | null;
  skills: { name: string; purpose: string }[];
  recommendations: Recommendation[];
};

export function renderReadme(input: PackDocInput): string {
  return [
    `# ${input.title}`,
    "",
    "Reusable AI skills built with Prompt Bot's Skills Builder.",
    "",
    "## What this pack is for",
    "",
    input.description.trim(),
    ...(input.role ? ["", `Role: ${input.role}`] : []),
    "",
    "## Skills in this pack",
    "",
    ...input.skills.map((s) => `- \`${s.name}\`: ${s.purpose}`),
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
    "## Recommended existing skills",
    "",
    input.recommendations.length
      ? "Existing public skills that fit this work are listed in `recommended-skills.md`. Install them from their own sources."
      : "No existing skills were recommended for this pack (see `recommended-skills.md`).",
    "",
    "## Before you run anything",
    "",
    "Review any files in `scripts/` before running them.",
    "",
  ].join("\n");
}

export function renderRecommended(recommendations: Recommendation[]): string {
  const header = [
    "# Recommended existing skills",
    "",
    "These public skills were matched to your work. They are not included in this pack: install each one from its source.",
    "",
  ];
  if (recommendations.length === 0) return [...header, "No existing skills were recommended for this pack.", ""].join("\n");
  return [
    ...header,
    ...recommendations.flatMap((r) => [
      `## ${r.name}`,
      "",
      r.why,
      "",
      `- Source: ${r.sourceUrl}`,
      `- License: ${r.license}`,
      `- Install: ${r.installNotes || "See the source repository."}`,
      "",
    ]),
  ].join("\n");
}
```

```ts
// apps/web/src/lib/skills/zip.ts
import { strToU8, zipSync, type Zippable } from "fflate";
import { checkSkillPath } from "./format";
import { isValidSkillName } from "./names";
import { renderReadme, renderRecommended, type Recommendation } from "./pack-docs";
import type { SkillFile } from "./types";

export type ZipSkill = { name: string; purpose: string; files: SkillFile[] };

/** Every entry path is built here from a validated name and a re-checked path; nothing raw reaches the archive. */
function skillEntries(prefix: string, skill: ZipSkill): Zippable {
  if (!isValidSkillName(skill.name)) throw new Error("unsafe skill name");
  const entries: Zippable = {};
  for (const file of skill.files) {
    const check = checkSkillPath(file.path);
    if (!check.ok) throw new Error("unsafe skill file path");
    entries[`${prefix}${skill.name}/${check.path}`] = strToU8(file.content);
  }
  return entries;
}

export function buildSkillZip(skill: ZipSkill): Uint8Array {
  return zipSync(skillEntries("", skill));
}

export function buildPackZip(input: {
  slug: string;
  title: string;
  description: string;
  role: string | null;
  skills: ZipSkill[];
  recommendations: Recommendation[];
}): Uint8Array {
  if (!isValidSkillName(input.slug)) throw new Error("unsafe pack slug");
  const root = `${input.slug}/`;
  const entries: Zippable = {
    [`${root}README.md`]: strToU8(renderReadme({ ...input, skills: input.skills.map((s) => ({ name: s.name, purpose: s.purpose })) })),
    [`${root}recommended-skills.md`]: strToU8(renderRecommended(input.recommendations)),
  };
  for (const skill of input.skills) {
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

- [ ] **Step 5: Run them and watch them pass, then commit**

Run: `npx vitest run src/lib/skills/pack-docs.test.ts src/lib/skills/zip.test.ts && npx tsc --noEmit` → PASS.
```bash
cd "/Users/tharunkumarl/Full Stack/lms"
git add apps/web/package.json package-lock.json apps/web/src/lib/skills/pack-docs.ts apps/web/src/lib/skills/pack-docs.test.ts apps/web/src/lib/skills/zip.ts apps/web/src/lib/skills/zip.test.ts
git commit -m "feat(skills-builder): pack README, recommended skills and zip layout"
```

---

### Task 8: Skills instructions and Claude calls

**Files:**
- Create: `apps/web/src/lib/skills/instructions.ts`
- Modify: `apps/web/src/lib/ai/claude.ts` (extend `structured`; add `splitWork`, `generateSkillDraft`)
- Modify: `apps/web/src/lib/ai/claude.test.ts` (mock `beta.messages.create`; new tests)
- Test: `apps/web/src/lib/skills/instructions.test.ts`

**Interfaces:**
- Consumes: `PromptQuestionContext` (`src/lib/prompt-bot/instructions.ts`), `SkillDraft` (Task 6), `RawSplit` (Task 4), `BEST_MODEL`.
- Produces:
  - `SPLIT_SYSTEM: string`, `GENERATE_SYSTEM: string`
  - `buildSplitMessage(input: { description: string; role: string | null; catalog: { slug: string; name: string; description: string }[] }): string`
  - `buildGenerateMessage(input: { packDescription: string; role: string | null; name: string; purpose: string; questions: PromptQuestionContext[] }): string`
  - `buildRetryMessage(original: string, draft: SkillDraft, errors: string[]): string`
  - `skillScoringBase(name: string, purpose: string): string` (the "prompt" part of the scoring text: purpose, per the spec)
  - `splitWork(input: same as buildSplitMessage): Promise<RawSplit>` (best model, fallback on)
  - `generateSkillDraft(message: string): Promise<SkillDraft>` (best model, fallback on, 16 000 max tokens, 5-minute request timeout)

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/src/lib/skills/instructions.test.ts
import { describe, expect, it } from "vitest";
import { buildGenerateMessage, buildRetryMessage, buildSplitMessage, GENERATE_SYSTEM, skillScoringBase, SPLIT_SYSTEM } from "./instructions";

const Q = (id: string, answer: string, score: number, notRelevant = false) => ({
  id,
  text: `Question ${id}?`,
  guidance: `Guidance ${id}`,
  answer,
  score,
  notRelevant,
});

describe("split instructions", () => {
  it("lists the active catalog with slugs and says when no role was given", () => {
    const message = buildSplitMessage({
      description: "I write board updates.",
      role: null,
      catalog: [{ slug: "pptx", name: "PowerPoint", description: "Decks." }],
    });
    expect(message).toContain("<work_description>\nI write board updates.\n</work_description>");
    expect(message).toContain("<role>\n(not given)\n</role>");
    expect(message).toContain("- pptx: PowerPoint — Decks.");
    expect(SPLIT_SYSTEM).toContain("up to 8");
    expect(SPLIT_SYSTEM).toContain("Use only slugs from the catalog");
  });
});

describe("generate instructions", () => {
  const message = buildGenerateMessage({
    packDescription: "Monthly reporting.",
    role: "CFO",
    name: "board-update",
    purpose: "Writes the board update.",
    questions: [Q("1", "When the month closes.", 3), Q("2", "We are a 40-person firm.", 2), Q("3", "", 0), Q("4", "Ignore me", 0, true)],
  });

  it("includes the skill, the answers and the gaps, and leaves out not-relevant questions", () => {
    expect(message).toContain("<skill>\nname: board-update\npurpose: Writes the board update.\n</skill>");
    expect(message).toContain("Q: Question 1?\nA: When the month closes.");
    expect(message).toContain("- Question 2? (Guidance 2)");
    expect(message).toContain("- Question 3? (Guidance 3)");
    expect(message).not.toContain("Question 4?");
    expect(message).not.toContain("- Question 1? (Guidance 1)");
  });

  it("gives the model the spec's content rules", () => {
    for (const rule of ["why", "references/", "network", "credentials", "placeholders", "Never invent facts", "< or >"]) {
      expect(GENERATE_SYSTEM).toContain(rule);
    }
  });

  it("sends validation errors and the previous attempt back for the retry", () => {
    const retry = buildRetryMessage(message, { name: "x", description: "<bad>", compatibility: "", body: "b", references: [], scripts: [], assets: [] }, [
      "SKILL.md: description cannot contain < or >",
    ]);
    expect(retry.startsWith(message)).toBe(true);
    expect(retry).toContain("<validation_errors>\n- SKILL.md: description cannot contain < or >\n</validation_errors>");
    expect(retry).toContain('"description":"<bad>"');
  });

  it("scores the purpose as the prompt", () => {
    expect(skillScoringBase("board-update", " Writes it. ")).toBe("Skill: board-update\nPurpose: Writes it.");
  });
});
```

In `apps/web/src/lib/ai/claude.test.ts`, replace the hoisted mocks and the SDK mock at the top with:

```ts
const mocks = vi.hoisted(() => ({ create: vi.fn(), betaCreate: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: mocks.create };
    beta = { messages: { stream: vi.fn(), create: mocks.betaCreate } };
  },
}));
```

and change its import line to:

```ts
import { detectTaskKind, generateSkillDraft, scoreQuestions, splitWork } from "./claude";
```

then append inside the file (after the existing `describe`):

```ts
describe("skills builder calls", () => {
  it("splits with Opus 5.5, structured output and the server-side fallback", async () => {
    mocks.betaCreate.mockResolvedValue(reply({ customSkills: [{ name: "a", purpose: "b" }], catalogMatches: [] }));
    const result = await splitWork({ description: "I write reports.", role: null, catalog: [] });
    expect(result).toEqual({ customSkills: [{ name: "a", purpose: "b" }], catalogMatches: [] });
    const [args] = mocks.betaCreate.mock.calls[0];
    expect(args.model).toBe("claude-opus-5-5");
    expect(args.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(args.fallbacks).toBe("default");
    expect(args.output_config.format.type).toBe("json_schema");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("generates a draft and rejects a reply that does not match the schema", async () => {
    const draft = { name: "x", description: "d", compatibility: "", body: "b", references: [], scripts: [], assets: [] };
    mocks.betaCreate.mockResolvedValueOnce(reply(draft));
    await expect(generateSkillDraft("message")).resolves.toEqual(draft);
    expect(mocks.betaCreate.mock.calls[0][1]).toEqual({ timeout: 300000 });
    mocks.betaCreate.mockResolvedValueOnce(reply({ name: "x" }));
    await expect(generateSkillDraft("message")).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/lib/skills/instructions.test.ts src/lib/ai/claude.test.ts`
Expected: FAIL, "Failed to resolve import ./instructions"; in `claude.test.ts`, `splitWork is not a function`. The three existing claude tests still pass.

- [ ] **Step 3: Write the instructions**

```ts
// apps/web/src/lib/skills/instructions.ts
/** Skills Builder's instructions to Claude (spec, Flow and Contracts). */
import type { PromptQuestionContext } from "@/lib/prompt-bot/instructions";
import type { SkillDraft } from "./assemble";

export const SPLIT_SYSTEM = `You help a professional turn their work into reusable AI skills. A skill is a packaged set of context and instructions that an AI assistant loads when a matching task comes up, so the person never has to re-explain it.

From the work description (and the role, if given), return:
1. customSkills: up to 8 distinct, reusable skills worth building for this person. Each has a short kebab-case name (for example board-update-writer) and a one-sentence purpose that says what it produces and when it is used. Prefer one skill per recurring job. Do not split one job into its steps, and do not propose skills for one-off tasks.
2. catalogMatches: existing public skills from the catalog that would genuinely help, as a slug and a one-sentence why tied to their work. Use only slugs from the catalog list. Return an empty list when none fit.

Use only what the person wrote. Never invent facts about them, their company or their numbers.`;

export const GENERATE_SYSTEM = `You write Agent Skills: folders that AI assistants such as Claude, Cursor and Codex load when a task matches. Return the skill as structured fields; the server writes the files.

- description: what the skill does and when to use it, in one paragraph of at most 1000 characters, phrased so the assistant reliably picks it up. Name the situations, requests and phrases that should trigger it. Never use the characters < or >.
- body: the SKILL.md instructions in Markdown, in the imperative, ideally under 500 lines. Explain why each instruction matters rather than writing rigid ALWAYS or NEVER rules. Point to every reference, script and asset by its path and say when to read or use it.
- references: stable context (background about the person, team, company or domain, style guides, worked examples) as Markdown files under references/, which are loaded only when needed. Put stable context here, not in the body.
- scripts: include a script only when a deterministic, repeatable helper is clearly useful. Scripts must not make network calls and must not read credentials, keys, tokens or environment secrets. Give each script a one-line purpose.
- assets: templates or files used in the output, under assets/. Usually empty.
- compatibility: tools or runtimes the skill needs, or an empty string.
- Paths are relative to the skill folder, for example references/company-context.md, using letters, digits, dots, dashes and underscores only.

Never invent facts about the person, their company or their numbers. Where context is missing (the gaps list), write clearly marked placeholders such as [Add your company's tone of voice here] in a references/ file, and tell the reader in the body to fill them in.`;

export function buildSplitMessage(input: { description: string; role: string | null; catalog: { slug: string; name: string; description: string }[] }): string {
  const catalog = input.catalog.map((c) => `- ${c.slug}: ${c.name} — ${c.description}`).join("\n");
  return [
    `<work_description>\n${input.description.trim()}\n</work_description>`,
    `<role>\n${input.role?.trim() || "(not given)"}\n</role>`,
    `<catalog>\n${catalog || "(empty)"}\n</catalog>`,
  ].join("\n\n");
}

/** What the scorer reads as the "prompt" for a skill item: its purpose (spec: purpose plus all answers). */
export function skillScoringBase(name: string, purpose: string): string {
  return `Skill: ${name}\nPurpose: ${purpose.trim()}`;
}

export function buildGenerateMessage(input: {
  packDescription: string;
  role: string | null;
  name: string;
  purpose: string;
  questions: PromptQuestionContext[];
}): string {
  const relevant = input.questions.filter((q) => !q.notRelevant);
  const answered = relevant
    .filter((q) => q.answer.trim())
    .map((q) => `Q: ${q.text}\nA: ${q.answer.trim()}`)
    .join("\n\n");
  const gaps = relevant
    .filter((q) => q.score < 3)
    .map((q) => `- ${q.text} (${q.guidance})`)
    .join("\n");
  return [
    `<work_description>\n${input.packDescription.trim()}\n</work_description>`,
    `<role>\n${input.role?.trim() || "(not given)"}\n</role>`,
    `<skill>\nname: ${input.name}\npurpose: ${input.purpose.trim()}\n</skill>`,
    `<answers>\n${answered || "(none)"}\n</answers>`,
    `<gaps>\n${gaps || "(none)"}\n</gaps>`,
  ].join("\n\n");
}

export function buildRetryMessage(original: string, draft: SkillDraft, errors: string[]): string {
  return [
    original,
    `<previous_attempt>\n${JSON.stringify(draft)}\n</previous_attempt>`,
    `<validation_errors>\n${errors.map((e) => `- ${e}`).join("\n")}\n</validation_errors>`,
    "Your previous attempt failed the checks above. Return the complete skill again with every error fixed.",
  ].join("\n\n");
}
```

- [ ] **Step 4: Extend the Claude client**

In `apps/web/src/lib/ai/claude.ts`, add to the imports:

```ts
import type { SkillDraft } from "@/lib/skills/assemble";
import { buildSplitMessage, GENERATE_SYSTEM, SPLIT_SYSTEM } from "@/lib/skills/instructions";
import type { RawSplit } from "@/lib/skills/split";
```

Replace the whole `structured` function with:

```ts
/** One structured-output call: the JSON schema constrains the reply; zod validates it again. */
async function structured<T>(args: {
  model: string;
  system: string;
  user: string;
  schema: Record<string, unknown>;
  parse: z.ZodType<T>;
  maxTokens: number;
  /** Opus requests enable Anthropic's server-side refusal fallback (spec, AI Foundation). */
  fallback?: boolean;
  timeoutMs?: number;
}): Promise<T> {
  const request = {
    model: args.model,
    max_tokens: args.maxTokens,
    system: args.system,
    messages: [{ role: "user" as const, content: args.user }],
    output_config: { format: { type: "json_schema" as const, schema: args.schema } },
  };
  const options = args.timeoutMs ? { timeout: args.timeoutMs } : undefined;
  const content = args.fallback
    ? (await getClient().beta.messages.create({ ...request, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" }, options)).content
    : (await getClient().messages.create(request, options)).content;
  const block = (content as ReadonlyArray<{ type: string }>).find((b) => b.type === "text") as { type: "text"; text: string } | undefined;
  if (!block) throw new Error("Claude returned no text");
  return args.parse.parse(JSON.parse(block.text));
}
```

Append at the end of the file:

```ts
const SplitReply = z.object({
  customSkills: z.array(z.object({ name: z.string(), purpose: z.string() })),
  catalogMatches: z.array(z.object({ slug: z.string(), why: z.string() })),
});

const object = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const STRING = { type: "string" };

/** Proposes custom skills and catalog matches (spec, Split). The caller applies cleanSplit. */
export async function splitWork(input: {
  description: string;
  role: string | null;
  catalog: { slug: string; name: string; description: string }[];
}): Promise<RawSplit> {
  return structured({
    model: BEST_MODEL,
    fallback: true,
    system: SPLIT_SYSTEM,
    user: buildSplitMessage(input),
    schema: object({
      customSkills: { type: "array", items: object({ name: STRING, purpose: STRING }) },
      catalogMatches: { type: "array", items: object({ slug: STRING, why: STRING }) },
    }),
    parse: SplitReply,
    maxTokens: 4000,
  });
}

const DraftFile = z.object({ path: z.string(), content: z.string() });
const DraftReply = z.object({
  name: z.string(),
  description: z.string(),
  compatibility: z.string(),
  body: z.string(),
  references: z.array(DraftFile),
  scripts: z.array(DraftFile.extend({ purpose: z.string() })),
  assets: z.array(DraftFile),
});

/** Writes one skill as structured fields (spec, Generate). The server assembles and validates the files. */
export async function generateSkillDraft(message: string): Promise<SkillDraft> {
  const file = object({ path: STRING, content: STRING });
  return structured({
    model: BEST_MODEL,
    fallback: true,
    system: GENERATE_SYSTEM,
    user: message,
    schema: object({
      name: STRING,
      description: STRING,
      compatibility: STRING,
      body: STRING,
      references: { type: "array", items: file },
      scripts: { type: "array", items: object({ path: STRING, content: STRING, purpose: STRING }) },
      assets: { type: "array", items: file },
    }),
    parse: DraftReply,
    maxTokens: 16000,
    timeoutMs: 5 * 60 * 1000,
  });
}
```

- [ ] **Step 5: Run the tests and the type check, then commit**

Run: `npx vitest run src/lib/skills/instructions.test.ts src/lib/ai/claude.test.ts && npx tsc --noEmit` → PASS (all five claude tests, including the three existing ones).
```bash
cd "/Users/tharunkumarl/Full Stack/lms"
git add apps/web/src/lib/skills/instructions.ts apps/web/src/lib/skills/instructions.test.ts apps/web/src/lib/ai/claude.ts apps/web/src/lib/ai/claude.test.ts
git commit -m "feat(skills-builder): split and generate calls with structured output and fallback"
```

---

### Task 9: Pack data layer and item scoring

**Files:**
- Create: `apps/web/src/lib/skills/packs.ts`
- Test: `apps/web/src/lib/skills/packs.test.ts`

**Interfaces:**
- Consumes: `scoreQuestions` (`src/lib/ai/claude.ts`), `consumeAiUsage`, `buildScoringText`, `PromptQuestionContext`, `shouldApplyRevision`, `AnswerView`; `SKILL_MATRIX_SLUG` (Task 1); `skillScoringBase` (Task 8); `SplitResult` (Task 4); types (Task 5).
- Produces:
  - `GENERATION_STALE_MS = 900000`, `INTERRUPTED_MESSAGE`, `UNREADABLE_FILES_MESSAGE`
  - `generationCutoff(now?: Date): Date`, `isGenerating(status: string, updatedAt: Date, now?: Date): boolean` (true only for a `GENERATING` row newer than the cutoff)
  - `parseStoredFiles(value: unknown): SkillFile[] | null`, `toStoredFiles(files: SkillFile[]): Prisma.InputJsonValue`
  - `loadSkillMatrix(): Promise<SkillMatrixView>`
  - `toItemView(row, activeQuestionIds: ReadonlySet<string>, now?: Date): SkillItemView` (a stale `GENERATING` row reads as `FAILED` with `INTERRUPTED_MESSAGE`; unreadable stored files read as `FAILED` with `UNREADABLE_FILES_MESSAGE`)
  - `loadPackView(packId: string, userId: string, now?: Date): Promise<SkillPackView | null>`
  - `loadItemView(packId: string, itemId: string, userId: string): Promise<SkillItemView | null>`
  - `findOwnedCustomItem(packId, itemId, userId)` → the Prisma row with `answers` and `pack: { description, role }`, or `null`
  - `questionContext(matrix: SkillMatrixView, answers: { questionId; answer; score; notRelevant }[]): PromptQuestionContext[]`
  - `createPackFromSplit(input: { userId; title; description; role: string | null; split: SplitResult; catalog: { id: string; slug: string }[] }): Promise<string>` (pack id)
  - `ensureItemAnswerRows(itemId: string, questionIds: string[]): Promise<void>`
  - `runItemScoring(packId, itemId, userId, revision: number): Promise<{ applied: boolean; revision: number; answers: AnswerView[] }>`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/skills/packs.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  packFindFirst: vi.fn(),
  packCreate: vi.fn(),
  itemFindFirst: vi.fn(),
  itemUpdate: vi.fn(),
  answerCreateMany: vi.fn(),
  answerUpdate: vi.fn(),
  matrixFindFirst: vi.fn(),
  transaction: vi.fn(),
  scoreQuestions: vi.fn(),
  consumeAiUsage: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    skillPack: { findFirst: mocks.packFindFirst, create: mocks.packCreate },
    skillPackItem: { findFirst: mocks.itemFindFirst, update: mocks.itemUpdate },
    skillItemAnswer: { createMany: mocks.answerCreateMany, update: mocks.answerUpdate },
    promptMatrix: { findFirst: mocks.matrixFindFirst },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/ai/claude", () => ({ scoreQuestions: mocks.scoreQuestions }));
vi.mock("@/lib/ai/usage", () => ({ consumeAiUsage: mocks.consumeAiUsage }));

import { createPackFromSplit, INTERRUPTED_MESSAGE, loadPackView, runItemScoring, toItemView, UNREADABLE_FILES_MESSAGE } from "./packs";

const NOW = new Date("2026-11-24T12:00:00Z");
const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60_000);
const MATRIX_ROW = {
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
  catalogEntryId: null,
  name: "board-update",
  purpose: "Writes the board update.",
  status: "DRAFT",
  files: null,
  validationErrors: [],
  scoreRevision: 0,
  createdAt: NOW,
  updatedAt: NOW,
  answers: [] as ReturnType<typeof answer>[],
  catalogEntry: null,
  pack: { description: "Monthly reporting.", role: null },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.matrixFindFirst.mockResolvedValue(MATRIX_ROW);
  mocks.transaction.mockImplementation(async (ops: unknown[]) => ops);
});

describe("loadPackView", () => {
  it("returns null for a pack the user does not own", async () => {
    mocks.packFindFirst.mockResolvedValue(null);
    expect(await loadPackView("p1", "u2")).toBeNull();
    expect(mocks.packFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "p1", userId: "u2" } }));
  });

  it("maps items with files, active answers only and catalog cards", async () => {
    const files = [{ path: "SKILL.md", content: "x" }];
    mocks.packFindFirst.mockResolvedValue({
      id: "p1",
      title: "My week",
      description: "d",
      role: "CTO",
      items: [
        row({ status: "READY", files, answers: [answer("pbq_skill_1", { answer: "Monthly", score: 2 }), answer("retired_question")] }),
        row({
          id: "i2",
          order: 1,
          kind: "CATALOG",
          name: "pptx",
          purpose: "Decks.",
          catalogEntry: { id: "scat_pptx", slug: "pptx", name: "PowerPoint", sourceUrl: "https://github.com/x", license: "source-available", bundlable: false, installNotes: "n" },
        }),
      ],
    });
    const view = (await loadPackView("p1", "u1", NOW))!;
    expect(view.matrix.questions.map((q) => q.id)).toEqual(["pbq_skill_1", "pbq_skill_2"]);
    expect(view.items[0]).toMatchObject({ status: "READY", files, answers: [{ questionId: "pbq_skill_1", answer: "Monthly", score: 2 }] });
    expect(view.items[0].answers).toHaveLength(1);
    expect(view.items[1].catalog).toEqual({
      id: "scat_pptx",
      slug: "pptx",
      name: "PowerPoint",
      sourceUrl: "https://github.com/x",
      license: "source-available",
      bundlable: false,
      installNotes: "n",
    });
  });
});

describe("toItemView", () => {
  it("reports an interrupted generation as FAILED after 15 minutes, and a recent one as GENERATING", () => {
    expect(toItemView(row({ status: "GENERATING", updatedAt: minutesAgo(16) }) as never, ACTIVE, NOW)).toMatchObject({
      status: "FAILED",
      validationErrors: [INTERRUPTED_MESSAGE],
    });
    expect(toItemView(row({ status: "GENERATING", updatedAt: minutesAgo(5) }) as never, ACTIVE, NOW).status).toBe("GENERATING");
  });

  it("reports stored files it cannot read as FAILED", () => {
    expect(toItemView(row({ status: "READY", files: { not: "an array" } }) as never, ACTIVE, NOW)).toMatchObject({
      status: "FAILED",
      files: null,
      validationErrors: [UNREADABLE_FILES_MESSAGE],
    });
  });
});

describe("runItemScoring", () => {
  const owned = row({ answers: [answer("pbq_skill_1", { answer: "On month close" }), answer("pbq_skill_2", { notRelevant: true })] });

  it("scores the purpose plus answers and applies a fresh revision", async () => {
    mocks.itemFindFirst
      .mockResolvedValueOnce(owned)
      .mockResolvedValueOnce({ scoreRevision: 2 })
      .mockResolvedValueOnce(row({ answers: [answer("pbq_skill_1", { answer: "On month close", score: 3, reason: "Clear" })] }));
    mocks.scoreQuestions.mockResolvedValue([{ questionId: "pbq_skill_1", score: 3, reason: "Clear" }]);

    const result = await runItemScoring("p1", "i1", "u1", 3);

    expect(mocks.consumeAiUsage).toHaveBeenCalledWith("u1", "score");
    expect(mocks.answerCreateMany).toHaveBeenCalledWith({
      data: [
        { itemId: "i1", questionId: "pbq_skill_1" },
        { itemId: "i1", questionId: "pbq_skill_2" },
      ],
      skipDuplicates: true,
    });
    const [text, questions] = mocks.scoreQuestions.mock.calls[0];
    expect(text).toContain("Skill: board-update\nPurpose: Writes the board update.");
    expect(text).toContain("When should this skill be used?\nOn month close");
    expect(questions.map((q: { id: string }) => q.id)).toEqual(["pbq_skill_1"]);
    expect(mocks.answerUpdate).toHaveBeenCalledWith({
      where: { itemId_questionId: { itemId: "i1", questionId: "pbq_skill_1" } },
      data: expect.objectContaining({ score: 3, reason: "Clear" }),
    });
    expect(mocks.itemUpdate).toHaveBeenCalledWith({ where: { id: "i1" }, data: { scoreRevision: 3 } });
    expect(result).toMatchObject({ applied: true, revision: 3, answers: [{ questionId: "pbq_skill_1", score: 3 }] });
  });

  it("discards a result computed for an older revision", async () => {
    mocks.itemFindFirst.mockResolvedValueOnce(owned).mockResolvedValueOnce({ scoreRevision: 5 });
    mocks.scoreQuestions.mockResolvedValue([{ questionId: "pbq_skill_1", score: 3, reason: "Clear" }]);
    const result = await runItemScoring("p1", "i1", "u1", 3);
    expect(result.applied).toBe(false);
    expect(result.revision).toBe(5);
    expect(mocks.answerUpdate).not.toHaveBeenCalled();
  });
});

describe("createPackFromSplit", () => {
  it("creates custom items first, then catalog items linked by slug", async () => {
    mocks.packCreate.mockResolvedValue({ id: "p1" });
    const id = await createPackFromSplit({
      userId: "u1",
      title: "My week",
      description: "d",
      role: null,
      split: { customSkills: [{ name: "board-update", purpose: "Writes it." }], catalogMatches: [{ slug: "pptx", why: "Decks." }] },
      catalog: [{ id: "scat_pptx", slug: "pptx" }],
    });
    expect(id).toBe("p1");
    expect(mocks.packCreate).toHaveBeenCalledWith({
      data: {
        userId: "u1",
        title: "My week",
        description: "d",
        role: null,
        items: {
          create: [
            { order: 0, kind: "CUSTOM", name: "board-update", purpose: "Writes it." },
            { order: 1, kind: "CATALOG", catalogEntryId: "scat_pptx", name: "pptx", purpose: "Decks." },
          ],
        },
      },
      select: { id: true },
    });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/skills/packs.test.ts` → FAIL, "Failed to resolve import ./packs".

- [ ] **Step 3: Implement**

```ts
// apps/web/src/lib/skills/packs.ts
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { scoreQuestions } from "@/lib/ai/claude";
import { consumeAiUsage } from "@/lib/ai/usage";
import { buildScoringText, type PromptQuestionContext } from "@/lib/prompt-bot/instructions";
import { shouldApplyRevision } from "@/lib/prompt-bot/scoring";
import type { AnswerView } from "@/lib/prompt-bot/sessions";
import { SKILL_MATRIX_SLUG } from "./builtin-skill-matrix";
import { skillScoringBase } from "./instructions";
import type { SplitResult } from "./split";
import type { SkillFile, SkillItemStatus, SkillItemView, SkillMatrixView, SkillPackView } from "./types";

/** A GENERATING item older than this was interrupted (for example by a deploy) and may be generated again. */
export const GENERATION_STALE_MS = 15 * 60 * 1000;
export const INTERRUPTED_MESSAGE = "Writing this skill was interrupted. Generate it again.";
export const UNREADABLE_FILES_MESSAGE = "The saved files couldn't be read. Generate this skill again.";

export const generationCutoff = (now = new Date()) => new Date(now.getTime() - GENERATION_STALE_MS);

export function isGenerating(status: string, updatedAt: Date, now = new Date()): boolean {
  return status === "GENERATING" && updatedAt > generationCutoff(now);
}

const StoredFiles = z.array(z.object({ path: z.string(), content: z.string() }));

export function parseStoredFiles(value: unknown): SkillFile[] | null {
  if (value === null || value === undefined) return null;
  const parsed = StoredFiles.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export const toStoredFiles = (files: SkillFile[]): Prisma.InputJsonValue => files.map((f) => ({ path: f.path, content: f.content }));

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

const itemInclude = { answers: true, catalogEntry: true } as const satisfies Prisma.SkillPackItemInclude;
type ItemRow = Prisma.SkillPackItemGetPayload<{ include: typeof itemInclude }>;
type AnswerRow = { questionId: string; answer: string; score: number; reason: string | null; notRelevant: boolean };

const toAnswerView = (a: AnswerRow): AnswerView => ({
  questionId: a.questionId,
  answer: a.answer,
  score: a.score,
  reason: a.reason,
  notRelevant: a.notRelevant,
});

export function toItemView(row: ItemRow, activeQuestionIds: ReadonlySet<string>, now = new Date()): SkillItemView {
  const files = parseStoredFiles(row.files);
  let status = row.status as SkillItemStatus;
  let validationErrors = row.validationErrors;
  if (status === "GENERATING" && !isGenerating(status, row.updatedAt, now)) {
    status = "FAILED";
    validationErrors = [INTERRUPTED_MESSAGE];
  } else if (row.files !== null && files === null) {
    status = "FAILED";
    validationErrors = [UNREADABLE_FILES_MESSAGE];
  }
  const entry = row.catalogEntry;
  return {
    id: row.id,
    order: row.order,
    kind: row.kind,
    name: row.name,
    purpose: row.purpose,
    status,
    files,
    validationErrors,
    scoreRevision: row.scoreRevision,
    answers: row.answers.filter((a) => activeQuestionIds.has(a.questionId)).map(toAnswerView),
    catalog: entry
      ? { id: entry.id, slug: entry.slug, name: entry.name, sourceUrl: entry.sourceUrl, license: entry.license, bundlable: entry.bundlable, installNotes: entry.installNotes }
      : null,
  };
}

export async function loadPackView(packId: string, userId: string, now = new Date()): Promise<SkillPackView | null> {
  const pack = await prisma.skillPack.findFirst({
    where: { id: packId, userId },
    include: { items: { include: itemInclude, orderBy: { order: "asc" } } },
  });
  if (!pack) return null;
  const matrix = await loadSkillMatrix();
  const active = new Set(matrix.questions.map((q) => q.id));
  return {
    id: pack.id,
    title: pack.title,
    description: pack.description,
    role: pack.role,
    matrix,
    items: pack.items.map((item) => toItemView(item, active, now)),
  };
}

export async function loadItemView(packId: string, itemId: string, userId: string): Promise<SkillItemView | null> {
  const row = await prisma.skillPackItem.findFirst({ where: { id: itemId, packId, pack: { userId } }, include: itemInclude });
  if (!row) return null;
  const matrix = await loadSkillMatrix();
  return toItemView(row, new Set(matrix.questions.map((q) => q.id)));
}

export function findOwnedCustomItem(packId: string, itemId: string, userId: string) {
  return prisma.skillPackItem.findFirst({
    where: { id: itemId, packId, kind: "CUSTOM", pack: { userId } },
    include: { answers: true, pack: { select: { description: true, role: true } } },
  });
}

export function questionContext(
  matrix: SkillMatrixView,
  answers: { questionId: string; answer: string; score: number; notRelevant: boolean }[],
): PromptQuestionContext[] {
  const byId = new Map(answers.map((a) => [a.questionId, a]));
  return matrix.questions.map((q) => {
    const a = byId.get(q.id);
    return { id: q.id, text: q.text, guidance: q.guidance, answer: a?.answer ?? "", score: a?.score ?? 0, notRelevant: a?.notRelevant ?? false };
  });
}

export async function createPackFromSplit(input: {
  userId: string;
  title: string;
  description: string;
  role: string | null;
  split: SplitResult;
  catalog: { id: string; slug: string }[];
}): Promise<string> {
  const idBySlug = new Map(input.catalog.map((c) => [c.slug, c.id]));
  const custom: Prisma.SkillPackItemUncheckedCreateWithoutPackInput[] = input.split.customSkills.map((s, order) => ({
    order,
    kind: "CUSTOM" as const,
    name: s.name,
    purpose: s.purpose,
  }));
  const catalog: Prisma.SkillPackItemUncheckedCreateWithoutPackInput[] = input.split.catalogMatches.flatMap((m, i) => {
    const catalogEntryId = idBySlug.get(m.slug);
    return catalogEntryId ? [{ order: custom.length + i, kind: "CATALOG" as const, catalogEntryId, name: m.slug, purpose: m.why }] : [];
  });
  const pack = await prisma.skillPack.create({
    data: { userId: input.userId, title: input.title, description: input.description, role: input.role, items: { create: [...custom, ...catalog] } },
    select: { id: true },
  });
  return pack.id;
}

export async function ensureItemAnswerRows(itemId: string, questionIds: string[]) {
  if (questionIds.length === 0) return;
  await prisma.skillItemAnswer.createMany({ data: questionIds.map((questionId) => ({ itemId, questionId })), skipDuplicates: true });
}

/** The enhancer's scoring contract for one skill item: purpose plus answers, applied only if `revision` is not stale. */
export async function runItemScoring(packId: string, itemId: string, userId: string, revision: number) {
  const item = await findOwnedCustomItem(packId, itemId, userId);
  if (!item) throw new Error("skill not found");
  const matrix = await loadSkillMatrix();
  await ensureItemAnswerRows(itemId, matrix.questions.map((q) => q.id));
  const context = questionContext(matrix, item.answers);

  await consumeAiUsage(userId, "score");
  const results = await scoreQuestions(
    buildScoringText(skillScoringBase(item.name, item.purpose), context),
    context.filter((q) => !q.notRelevant),
  );

  const current = await prisma.skillPackItem.findFirst({ where: { id: itemId, packId, pack: { userId } }, select: { scoreRevision: true } });
  const active = new Set(matrix.questions.map((q) => q.id));
  if (!current || !shouldApplyRevision(revision, current.scoreRevision)) {
    return {
      applied: false,
      revision: current?.scoreRevision ?? revision,
      answers: item.answers.filter((a) => active.has(a.questionId)).map(toAnswerView),
    };
  }
  const scoredAt = new Date();
  await prisma.$transaction([
    ...results.map((r) =>
      prisma.skillItemAnswer.update({
        where: { itemId_questionId: { itemId, questionId: r.questionId } },
        data: { score: r.score, reason: r.reason, scoredAt },
      }),
    ),
    prisma.skillPackItem.update({ where: { id: itemId }, data: { scoreRevision: revision } }),
  ]);
  const fresh = await loadItemView(packId, itemId, userId);
  return { applied: true, revision, answers: fresh?.answers ?? [] };
}
```

- [ ] **Step 4: Run it and watch it pass, then commit**

Run: `npx vitest run src/lib/skills/packs.test.ts && npx tsc --noEmit` → PASS.
```bash
cd "/Users/tharunkumarl/Full Stack/lms"
git add apps/web/src/lib/skills/packs.ts apps/web/src/lib/skills/packs.test.ts
git commit -m "feat(skills-builder): pack views, ownership lookups and item scoring"
```

---

### Task 10: Pack and item routes

**Files:**
- Modify: `apps/web/src/lib/prompt-bot/sessions.ts:28-31` (`titleFrom` gains a fallback parameter) and `apps/web/src/lib/prompt-bot/sessions.test.ts`
- Create: `apps/web/src/app/api/v1/prompt-bot/skill-packs/route.ts` (POST: split)
- Create: `apps/web/src/app/api/v1/prompt-bot/skill-packs/[id]/route.ts` (GET, PATCH title)
- Create: `apps/web/src/app/api/v1/prompt-bot/skill-packs/[id]/items/route.ts` (POST: add custom skill)
- Create: `apps/web/src/app/api/v1/prompt-bot/skill-packs/[id]/items/[itemId]/route.ts` (GET, PATCH, DELETE)
- Test: `apps/web/src/app/api/v1/prompt-bot/skill-packs/pack-routes.test.ts`

**Interfaces:**
- Consumes: `splitWork` (Task 8), `cleanSplit`, `PURPOSE_MAX` (Task 4), `uniqueSkillName`, `oneLine` (Task 4), `withSkillName` (Task 5), `loadPackView`, `loadItemView`, `createPackFromSplit`, `isGenerating`, `parseStoredFiles`, `toStoredFiles` (Task 9), `aiErrorResponse` (`src/lib/prompt-bot/http.ts`).
- Produces (HTTP, all JSON envelopes):
  - `POST /api/v1/prompt-bot/skill-packs` `{ description, role? }` → 201 `SkillPackView`
  - `GET /api/v1/prompt-bot/skill-packs/:id` → `SkillPackView`; `PATCH` `{ title }` → `SkillPackView`
  - `POST /api/v1/prompt-bot/skill-packs/:id/items` `{ name, purpose }` → 201 `SkillItemView`
  - `GET|PATCH|DELETE /api/v1/prompt-bot/skill-packs/:id/items/:itemId` (`PATCH` `{ name?, purpose?, order? }` → `SkillItemView`; `DELETE` → `{ deleted: true }`)
  - `titleFrom(text: string, fallback = "Untitled prompt"): string`

- [ ] **Step 1: Write the failing tests**

Add to the `titleFrom` test in `apps/web/src/lib/prompt-bot/sessions.test.ts`:

```ts
  it("uses the caller's fallback for blank text", () => {
    expect(titleFrom("   ", "My skills")).toBe("My skills");
  });
```

```ts
// apps/web/src/app/api/v1/prompt-bot/skill-packs/pack-routes.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { validateSkillFiles } from "@/lib/skills/format";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  isAiConfigured: vi.fn(),
  consumeAiUsage: vi.fn(),
  splitWork: vi.fn(),
  catalogFindMany: vi.fn(),
  packFindFirst: vi.fn(),
  packUpdate: vi.fn(),
  itemFindFirst: vi.fn(),
  itemCreate: vi.fn(),
  itemUpdate: vi.fn(),
  itemDelete: vi.fn(),
  loadPackView: vi.fn(),
  loadItemView: vi.fn(),
  createPackFromSplit: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/ai/config", async (orig) => ({ ...(await orig<typeof import("@/lib/ai/config")>()), isAiConfigured: mocks.isAiConfigured }));
vi.mock("@/lib/ai/usage", async (orig) => ({ ...(await orig<typeof import("@/lib/ai/usage")>()), consumeAiUsage: mocks.consumeAiUsage }));
vi.mock("@/lib/ai/claude", () => ({ splitWork: mocks.splitWork, scoreQuestions: vi.fn(), detectTaskKind: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    skillCatalogEntry: { findMany: mocks.catalogFindMany },
    skillPack: { findFirst: mocks.packFindFirst, update: mocks.packUpdate },
    skillPackItem: { findFirst: mocks.itemFindFirst, create: mocks.itemCreate, update: mocks.itemUpdate, delete: mocks.itemDelete },
  },
}));
vi.mock("@/lib/skills/packs", async (orig) => ({
  ...(await orig<typeof import("@/lib/skills/packs")>()),
  loadPackView: mocks.loadPackView,
  loadItemView: mocks.loadItemView,
  createPackFromSplit: mocks.createPackFromSplit,
}));

import * as collection from "./route";
import * as pack from "./[id]/route";
import * as items from "./[id]/items/route";
import * as item from "./[id]/items/[itemId]/route";

const json = (method: string, body?: unknown) =>
  new NextRequest("http://localhost/x", { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const packCtx = { params: Promise.resolve({ id: "p1" }) };
const itemCtx = { params: Promise.resolve({ id: "p1", itemId: "i1" }) };
const CATALOG = [{ id: "scat_impeccable", slug: "impeccable", name: "Impeccable", description: "UI polish." }];
const SKILL_MD = '---\nname: board-update\ndescription: "Writes the board update. Use for monthly reporting."\n---\n\nWrite it.\n';
const ownedItem = (over: Record<string, unknown> = {}) => ({
  id: "i1",
  kind: "CUSTOM",
  name: "board-update",
  status: "READY",
  updatedAt: new Date(),
  files: [
    { path: "SKILL.md", content: SKILL_MD },
    { path: "references/context.md", content: "Context" },
  ],
  pack: { items: [{ id: "i1", name: "board-update", kind: "CUSTOM" }] },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "u1", role: "MENTEE" });
  mocks.isAiConfigured.mockReturnValue(true);
  mocks.catalogFindMany.mockResolvedValue(CATALOG);
  mocks.loadItemView.mockResolvedValue({ id: "i1" });
});

describe("POST /skill-packs (split)", () => {
  it("splits with the active catalog, cleans the result and creates the pack", async () => {
    mocks.splitWork.mockResolvedValue({
      customSkills: [{ name: "Weekly Planner", purpose: "Plans my week." }, { name: "weekly planner", purpose: "Duplicate." }],
      catalogMatches: [{ slug: "impeccable", why: "UI polish." }, { slug: "ghost", why: "Not in the catalog." }],
    });
    mocks.createPackFromSplit.mockResolvedValue("p1");
    mocks.loadPackView.mockResolvedValue({ id: "p1" });

    const res = await collection.POST(json("POST", { description: "Plan my week\nand prep board updates", role: "  " }));

    expect(res.status).toBe(201);
    expect(mocks.consumeAiUsage).toHaveBeenCalledWith("u1", "skill_split");
    expect(mocks.splitWork).toHaveBeenCalledWith({ description: "Plan my week\nand prep board updates", role: null, catalog: CATALOG });
    expect(mocks.createPackFromSplit).toHaveBeenCalledWith({
      userId: "u1",
      title: "Plan my week",
      description: "Plan my week\nand prep board updates",
      role: null,
      split: {
        customSkills: [
          { name: "weekly-planner", purpose: "Plans my week." },
          { name: "weekly-planner-2", purpose: "Duplicate." },
        ],
        catalogMatches: [{ slug: "impeccable", why: "UI polish." }],
      },
      catalog: CATALOG,
    });
  });

  it("returns 503 without spending usage when the AI is not configured", async () => {
    mocks.isAiConfigured.mockReturnValue(false);
    const res = await collection.POST(json("POST", { description: "x" }));
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("AI_NOT_CONFIGURED");
    expect(mocks.consumeAiUsage).not.toHaveBeenCalled();
  });

  it("returns 429 at the daily split limit and creates nothing", async () => {
    const { LimitReachedError } = await import("@/lib/ai/usage");
    mocks.consumeAiUsage.mockRejectedValue(new LimitReachedError("skill_split", new Date("2026-11-25T00:00:00Z")));
    const res = await collection.POST(json("POST", { description: "x" }));
    expect(res.status).toBe(429);
    expect((await res.json()).error.code).toBe("LIMIT_REACHED");
    expect(mocks.createPackFromSplit).not.toHaveBeenCalled();
  });

  it("rejects an empty description", async () => {
    expect((await collection.POST(json("POST", { description: "  " }))).status).toBe(400);
  });

  it("requires sign-in", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    expect((await collection.POST(json("POST", { description: "x" }))).status).toBe(401);
  });
});

describe("/skill-packs/:id", () => {
  it("returns 404 for someone else's pack", async () => {
    mocks.loadPackView.mockResolvedValue(null);
    expect((await pack.GET(json("GET"), packCtx)).status).toBe(404);
    expect(mocks.loadPackView).toHaveBeenCalledWith("p1", "u1");
  });

  it("does not rename someone else's pack", async () => {
    mocks.packFindFirst.mockResolvedValue(null);
    expect((await pack.PATCH(json("PATCH", { title: "Mine now" }), packCtx)).status).toBe(404);
    expect(mocks.packUpdate).not.toHaveBeenCalled();
  });
});

describe("POST /skill-packs/:id/items", () => {
  it("adds a custom skill with a name unique among the pack's custom skills", async () => {
    mocks.packFindFirst.mockResolvedValue({
      id: "p1",
      items: [
        { name: "board-update", kind: "CUSTOM", order: 0 },
        { name: "pptx", kind: "CATALOG", order: 1 },
      ],
    });
    mocks.itemCreate.mockResolvedValue({ id: "i2" });
    const res = await items.POST(json("POST", { name: "Board Update", purpose: "Writes the\nupdate." }), packCtx);
    expect(res.status).toBe(201);
    expect(mocks.itemCreate).toHaveBeenCalledWith({
      data: { packId: "p1", kind: "CUSTOM", order: 2, name: "board-update-2", purpose: "Writes the update." },
      select: { id: true },
    });
  });
});

describe("PATCH /skill-packs/:id/items/:itemId", () => {
  it("renames a ready skill and rewrites the SKILL.md name so the files stay valid", async () => {
    mocks.itemFindFirst.mockResolvedValue(ownedItem());
    const res = await item.PATCH(json("PATCH", { name: "Weekly Report" }), itemCtx);
    expect(res.status).toBe(200);
    const { data } = mocks.itemUpdate.mock.calls[0][0];
    expect(data.name).toBe("weekly-report");
    expect(data.files[0].content).toContain("\nname: weekly-report\n");
    expect(validateSkillFiles(data.files, "weekly-report")).toEqual([]);
  });

  it("suffixes a rename that matches a sibling's name", async () => {
    mocks.itemFindFirst.mockResolvedValue(
      ownedItem({ pack: { items: [{ id: "i1", name: "board-update", kind: "CUSTOM" }, { id: "i2", name: "weekly-report", kind: "CUSTOM" }] } }),
    );
    await item.PATCH(json("PATCH", { name: "Weekly report" }), itemCtx);
    expect(mocks.itemUpdate.mock.calls[0][0].data.name).toBe("weekly-report-2");
  });

  it("refuses to rename while the skill is being written", async () => {
    mocks.itemFindFirst.mockResolvedValue(ownedItem({ status: "GENERATING" }));
    const res = await item.PATCH(json("PATCH", { name: "Other" }), itemCtx);
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("ALREADY_GENERATING");
    expect(mocks.itemUpdate).not.toHaveBeenCalled();
  });

  it("refuses to rename a catalog recommendation", async () => {
    mocks.itemFindFirst.mockResolvedValue(ownedItem({ kind: "CATALOG", files: null }));
    expect((await item.PATCH(json("PATCH", { name: "Other" }), itemCtx)).status).toBe(400);
  });

  it("returns 404 for someone else's item, for PATCH and DELETE", async () => {
    mocks.itemFindFirst.mockResolvedValue(null);
    expect((await item.PATCH(json("PATCH", { purpose: "x" }), itemCtx)).status).toBe(404);
    expect((await item.DELETE(json("DELETE"), itemCtx)).status).toBe(404);
    expect(mocks.itemDelete).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/lib/prompt-bot/sessions.test.ts src/app/api/v1/prompt-bot/skill-packs/pack-routes.test.ts`
Expected: FAIL — `titleFrom("   ", "My skills")` returns "Untitled prompt"; the route test fails to resolve `./route`.

- [ ] **Step 3: Implement**

In `apps/web/src/lib/prompt-bot/sessions.ts`, replace `titleFrom` with:

```ts
export function titleFrom(basePrompt: string, fallback = "Untitled prompt"): string {
  const first = basePrompt.trim().split("\n")[0]?.trim() ?? "";
  return first ? first.slice(0, 80) : fallback;
}
```

```ts
// apps/web/src/app/api/v1/prompt-bot/skill-packs/route.ts
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse, successResponse, validationErrorResponse } from "@/lib/api/response";
import { AiNotConfiguredError, isAiConfigured } from "@/lib/ai/config";
import { splitWork } from "@/lib/ai/claude";
import { consumeAiUsage } from "@/lib/ai/usage";
import { aiErrorResponse } from "@/lib/prompt-bot/http";
import { titleFrom } from "@/lib/prompt-bot/sessions";
import { createPackFromSplit, loadPackView } from "@/lib/skills/packs";
import { cleanSplit, type SplitResult } from "@/lib/skills/split";

const CreateBody = z.object({
  description: z.string().trim().min(1).max(20000),
  role: z.string().trim().max(200).optional(),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  if (!isAiConfigured()) return aiErrorResponse(new AiNotConfiguredError());
  const parsed = CreateBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return validationErrorResponse(parsed.error);
  const { description } = parsed.data;
  const role = parsed.data.role || null;

  const catalog = await prisma.skillCatalogEntry.findMany({
    where: { isActive: true },
    select: { id: true, slug: true, name: true, description: true },
    orderBy: { name: "asc" },
  });
  let split: SplitResult;
  try {
    await consumeAiUsage(user.id, "skill_split");
    split = cleanSplit(await splitWork({ description, role, catalog }), new Set(catalog.map((c) => c.slug)));
  } catch (error) {
    return aiErrorResponse(error);
  }
  const id = await createPackFromSplit({ userId: user.id, title: titleFrom(description, "My skills"), description, role, split, catalog });
  return successResponse(await loadPackView(id, user.id), undefined, 201);
}
```

```ts
// apps/web/src/app/api/v1/prompt-bot/skill-packs/[id]/route.ts
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse, successResponse, validationErrorResponse } from "@/lib/api/response";
import { loadPackView } from "@/lib/skills/packs";

type Ctx = { params: Promise<{ id: string }> };
const PatchBody = z.object({ title: z.string().trim().min(1).max(120) });

export async function GET(_req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  const { id } = await params;
  const view = await loadPackView(id, user.id);
  return view ? successResponse(view) : errorResponse("Skill pack not found", "NOT_FOUND", 404);
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  const { id } = await params;
  const parsed = PatchBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return validationErrorResponse(parsed.error);
  const owned = await prisma.skillPack.findFirst({ where: { id, userId: user.id }, select: { id: true } });
  if (!owned) return errorResponse("Skill pack not found", "NOT_FOUND", 404);
  await prisma.skillPack.update({ where: { id }, data: { title: parsed.data.title } });
  return successResponse(await loadPackView(id, user.id));
}
```

```ts
// apps/web/src/app/api/v1/prompt-bot/skill-packs/[id]/items/route.ts
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse, successResponse, validationErrorResponse } from "@/lib/api/response";
import { oneLine, uniqueSkillName } from "@/lib/skills/names";
import { loadItemView } from "@/lib/skills/packs";
import { PURPOSE_MAX } from "@/lib/skills/split";

const Body = z.object({ name: z.string().trim().min(1).max(120), purpose: z.string().trim().min(1).max(PURPOSE_MAX) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return validationErrorResponse(parsed.error);
  const pack = await prisma.skillPack.findFirst({
    where: { id, userId: user.id },
    select: { id: true, items: { select: { name: true, kind: true, order: true } } },
  });
  if (!pack) return errorResponse("Skill pack not found", "NOT_FOUND", 404);
  const taken = pack.items.filter((i) => i.kind === "CUSTOM").map((i) => i.name);
  const order = Math.max(-1, ...pack.items.map((i) => i.order)) + 1;
  const created = await prisma.skillPackItem.create({
    data: { packId: id, kind: "CUSTOM", order, name: uniqueSkillName(parsed.data.name, taken), purpose: oneLine(parsed.data.purpose, PURPOSE_MAX) },
    select: { id: true },
  });
  return successResponse(await loadItemView(id, created.id, user.id), undefined, 201);
}
```

```ts
// apps/web/src/app/api/v1/prompt-bot/skill-packs/[id]/items/[itemId]/route.ts
import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse, successResponse, validationErrorResponse } from "@/lib/api/response";
import { withSkillName } from "@/lib/skills/format";
import { oneLine, uniqueSkillName } from "@/lib/skills/names";
import { isGenerating, loadItemView, parseStoredFiles, toStoredFiles } from "@/lib/skills/packs";
import { PURPOSE_MAX } from "@/lib/skills/split";

type Ctx = { params: Promise<{ id: string; itemId: string }> };
const PatchBody = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    purpose: z.string().trim().min(1).max(PURPOSE_MAX).optional(),
    order: z.number().int().min(0).max(1000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

const notFound = () => errorResponse("Skill not found", "NOT_FOUND", 404);

export async function GET(_req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  const { id, itemId } = await params;
  const view = await loadItemView(id, itemId, user.id);
  return view ? successResponse(view) : notFound();
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  const { id, itemId } = await params;
  const parsed = PatchBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return validationErrorResponse(parsed.error);
  const item = await prisma.skillPackItem.findFirst({
    where: { id: itemId, packId: id, pack: { userId: user.id } },
    select: { id: true, kind: true, name: true, status: true, updatedAt: true, files: true, pack: { select: { items: { select: { id: true, name: true, kind: true } } } } },
  });
  if (!item) return notFound();

  const data: Prisma.SkillPackItemUpdateInput = {};
  if (parsed.data.purpose !== undefined) data.purpose = oneLine(parsed.data.purpose, PURPOSE_MAX);
  if (parsed.data.order !== undefined) data.order = parsed.data.order;
  if (parsed.data.name !== undefined) {
    if (item.kind !== "CUSTOM") return errorResponse("Only custom skills can be renamed", "VALIDATION_ERROR", 400);
    if (isGenerating(item.status, item.updatedAt)) {
      return errorResponse("Wait until the skill has been written before renaming it.", "ALREADY_GENERATING", 409);
    }
    const taken = item.pack.items.filter((i) => i.kind === "CUSTOM" && i.id !== item.id).map((i) => i.name);
    const name = uniqueSkillName(parsed.data.name, taken);
    if (name !== item.name) {
      data.name = name;
      // The item name owns the folder and the SKILL.md name; keep them identical.
      const files = parseStoredFiles(item.files);
      if (files) data.files = toStoredFiles(files.map((f) => (f.path === "SKILL.md" ? { ...f, content: withSkillName(f.content, name) } : f)));
    }
  }
  if (Object.keys(data).length > 0) await prisma.skillPackItem.update({ where: { id: itemId }, data });
  return successResponse(await loadItemView(id, itemId, user.id));
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  const { id, itemId } = await params;
  const item = await prisma.skillPackItem.findFirst({ where: { id: itemId, packId: id, pack: { userId: user.id } }, select: { id: true } });
  if (!item) return notFound();
  await prisma.skillPackItem.delete({ where: { id: itemId } });
  return successResponse({ deleted: true });
}
```

- [ ] **Step 4: Run them and watch them pass, then commit**

Run: `npx vitest run src/lib/prompt-bot/sessions.test.ts src/app/api/v1/prompt-bot/skill-packs/pack-routes.test.ts && npx tsc --noEmit` → PASS.
```bash
cd "/Users/tharunkumarl/Full Stack/lms"
git add apps/web/src/lib/prompt-bot/sessions.ts apps/web/src/lib/prompt-bot/sessions.test.ts "apps/web/src/app/api/v1/prompt-bot/skill-packs"
git commit -m "feat(skills-builder): split, pack and skill list routes"
```

---

### Task 11: Refine routes (answers and scoring)

**Files:**
- Create: `apps/web/src/app/api/v1/prompt-bot/skill-packs/[id]/items/[itemId]/answers/[questionId]/route.ts`
- Create: `apps/web/src/app/api/v1/prompt-bot/skill-packs/[id]/items/[itemId]/score/route.ts`
- Test: `apps/web/src/app/api/v1/prompt-bot/skill-packs/refine-routes.test.ts`

**Interfaces:**
- Consumes: `findOwnedCustomItem`, `loadSkillMatrix`, `runItemScoring` (Task 9), `aiErrorResponse`.
- Produces:
  - `PUT …/items/:itemId/answers/:questionId` `{ answer?, notRelevant? }` → `{ saved: true }`
  - `POST …/items/:itemId/score` `{ revision }` → `{ applied, revision, answers }` (same shape as the enhancer's score route)

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/app/api/v1/prompt-bot/skill-packs/refine-routes.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  findOwnedCustomItem: vi.fn(),
  loadSkillMatrix: vi.fn(),
  runItemScoring: vi.fn(),
  answerUpsert: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/skills/packs", () => ({
  findOwnedCustomItem: mocks.findOwnedCustomItem,
  loadSkillMatrix: mocks.loadSkillMatrix,
  runItemScoring: mocks.runItemScoring,
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { skillItemAnswer: { upsert: mocks.answerUpsert } } }));

import * as answers from "./[id]/items/[itemId]/answers/[questionId]/route";
import * as score from "./[id]/items/[itemId]/score/route";

const req = (method: string, body?: unknown) =>
  new NextRequest("http://localhost/x", { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const answerCtx = (questionId = "pbq_skill_1") => ({ params: Promise.resolve({ id: "p1", itemId: "i1", questionId }) });
const itemCtx = { params: Promise.resolve({ id: "p1", itemId: "i1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "u1", role: "MENTEE" });
  mocks.findOwnedCustomItem.mockResolvedValue({ id: "i1" });
  mocks.loadSkillMatrix.mockResolvedValue({ id: "m", name: "Skill definition", questions: [{ id: "pbq_skill_1", text: "When?", guidance: "g", order: 0 }] });
});

describe("answer route", () => {
  it("upserts one answer for an owned custom skill", async () => {
    const res = await answers.PUT(req("PUT", { answer: "When the month closes." }), answerCtx());
    expect(res.status).toBe(200);
    expect(mocks.findOwnedCustomItem).toHaveBeenCalledWith("p1", "i1", "u1");
    expect(mocks.answerUpsert).toHaveBeenCalledWith({
      where: { itemId_questionId: { itemId: "i1", questionId: "pbq_skill_1" } },
      create: { itemId: "i1", questionId: "pbq_skill_1", answer: "When the month closes." },
      update: { answer: "When the month closes." },
    });
  });

  it("returns 404 for someone else's skill and for a question outside the skill matrix", async () => {
    mocks.findOwnedCustomItem.mockResolvedValueOnce(null);
    expect((await answers.PUT(req("PUT", { answer: "x" }), answerCtx())).status).toBe(404);
    expect((await answers.PUT(req("PUT", { answer: "x" }), answerCtx("pbq_core_1"))).status).toBe(404);
    expect(mocks.answerUpsert).not.toHaveBeenCalled();
  });

  it("rejects an empty update", async () => {
    expect((await answers.PUT(req("PUT", {}), answerCtx())).status).toBe(400);
  });
});

describe("score route", () => {
  it("passes the client revision through", async () => {
    mocks.runItemScoring.mockResolvedValue({ applied: true, revision: 4, answers: [] });
    const res = await score.POST(req("POST", { revision: 4 }), itemCtx);
    expect(res.status).toBe(200);
    expect(mocks.runItemScoring).toHaveBeenCalledWith("p1", "i1", "u1", 4);
    expect((await res.json()).data).toEqual({ applied: true, revision: 4, answers: [] });
  });

  it("returns 404 for someone else's skill before scoring", async () => {
    mocks.findOwnedCustomItem.mockResolvedValue(null);
    expect((await score.POST(req("POST", { revision: 1 }), itemCtx)).status).toBe(404);
    expect(mocks.runItemScoring).not.toHaveBeenCalled();
  });

  it("maps the daily limit to 429 and a missing key to 503", async () => {
    const { LimitReachedError } = await import("@/lib/ai/usage");
    const { AiNotConfiguredError } = await import("@/lib/ai/config");
    mocks.runItemScoring.mockRejectedValueOnce(new LimitReachedError("score", new Date("2026-11-25T00:00:00Z")));
    expect((await score.POST(req("POST", { revision: 1 }), itemCtx)).status).toBe(429);
    mocks.runItemScoring.mockRejectedValueOnce(new AiNotConfiguredError());
    expect((await score.POST(req("POST", { revision: 1 }), itemCtx)).status).toBe(503);
  });

  it("rejects a missing revision", async () => {
    expect((await score.POST(req("POST", {}), itemCtx)).status).toBe(400);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/app/api/v1/prompt-bot/skill-packs/refine-routes.test.ts` → FAIL, failed to resolve the route imports.

- [ ] **Step 3: Implement**

```ts
// apps/web/src/app/api/v1/prompt-bot/skill-packs/[id]/items/[itemId]/answers/[questionId]/route.ts
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse, successResponse, validationErrorResponse } from "@/lib/api/response";
import { findOwnedCustomItem, loadSkillMatrix } from "@/lib/skills/packs";

type Ctx = { params: Promise<{ id: string; itemId: string; questionId: string }> };
const Body = z
  .object({ answer: z.string().max(4000).optional(), notRelevant: z.boolean().optional() })
  .refine((v) => v.answer !== undefined || v.notRelevant !== undefined, "Nothing to update");

export async function PUT(req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  const { id, itemId, questionId } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return validationErrorResponse(parsed.error);
  if (!(await findOwnedCustomItem(id, itemId, user.id))) return errorResponse("Skill not found", "NOT_FOUND", 404);
  const matrix = await loadSkillMatrix();
  if (!matrix.questions.some((q) => q.id === questionId)) return errorResponse("Question not found", "NOT_FOUND", 404);

  const fields = {
    ...(parsed.data.answer !== undefined ? { answer: parsed.data.answer } : {}),
    ...(parsed.data.notRelevant !== undefined ? { notRelevant: parsed.data.notRelevant } : {}),
  };
  await prisma.skillItemAnswer.upsert({
    where: { itemId_questionId: { itemId, questionId } },
    create: { itemId, questionId, ...fields },
    update: fields,
  });
  return successResponse({ saved: true });
}
```

```ts
// apps/web/src/app/api/v1/prompt-bot/skill-packs/[id]/items/[itemId]/score/route.ts
import { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse, successResponse, validationErrorResponse } from "@/lib/api/response";
import { aiErrorResponse } from "@/lib/prompt-bot/http";
import { findOwnedCustomItem, runItemScoring } from "@/lib/skills/packs";

const Body = z.object({ revision: z.number().int().min(0) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  const { id, itemId } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return validationErrorResponse(parsed.error);
  if (!(await findOwnedCustomItem(id, itemId, user.id))) return errorResponse("Skill not found", "NOT_FOUND", 404);
  try {
    return successResponse(await runItemScoring(id, itemId, user.id, parsed.data.revision));
  } catch (error) {
    return aiErrorResponse(error);
  }
}
```

- [ ] **Step 4: Run it and watch it pass, then commit**

Run: `npx vitest run src/app/api/v1/prompt-bot/skill-packs/refine-routes.test.ts` → PASS.
```bash
cd "/Users/tharunkumarl/Full Stack/lms"
git add "apps/web/src/app/api/v1/prompt-bot/skill-packs/[id]/items/[itemId]/answers" "apps/web/src/app/api/v1/prompt-bot/skill-packs/[id]/items/[itemId]/score" apps/web/src/app/api/v1/prompt-bot/skill-packs/refine-routes.test.ts
git commit -m "feat(skills-builder): answer and live scoring routes for custom skills"
```

---

### Task 12: Generation and file edits

**Files:**
- Create: `apps/web/src/lib/skills/generate.ts`
- Create: `apps/web/src/app/api/v1/prompt-bot/skill-packs/[id]/items/[itemId]/generate/route.ts`
- Create: `apps/web/src/app/api/v1/prompt-bot/skill-packs/[id]/items/[itemId]/files/route.ts`
- Test: `apps/web/src/lib/skills/generate.test.ts`, `apps/web/src/app/api/v1/prompt-bot/skill-packs/generate-routes.test.ts`

**Interfaces:**
- Consumes: `generateSkillDraft` (Task 8), `consumeAiUsage`, `assembleSkillFiles` (Task 6), `validateSkillFiles`, `SKILL_LIMITS` (Task 5), `buildGenerateMessage`, `buildRetryMessage` (Task 8), `findOwnedCustomItem`, `generationCutoff`, `isGenerating`, `loadItemView`, `loadSkillMatrix`, `questionContext`, `toStoredFiles` (Task 9), `after` from `next/server`.
- Produces:
  - `GENERATION_FAILED_MESSAGE`, `SkillNotFoundError`, `AlreadyGeneratingError`
  - `startGeneration(packId, itemId, userId, now?: Date): Promise<SkillItemView>` — checks ownership and in-flight state, counts `skill_generate`, claims the item as `GENERATING` (a stale claim older than 15 minutes may be taken over)
  - `runGeneration(packId, itemId, userId): Promise<void>` — one model call, validation, one retry with the errors, then `READY` (files, no errors) or `FAILED` (files and errors); an AI failure becomes `FAILED` with `GENERATION_FAILED_MESSAGE`; never throws
  - `POST …/items/:itemId/generate` → 202 `SkillItemView` (status `GENERATING`); the writing continues in `after()`
  - `PATCH …/items/:itemId/files` `{ files: SkillFile[] }` → `SkillItemView` (`READY`) or 400 `VALIDATION_ERROR` with `details.files: string[]`

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/src/lib/skills/generate.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findOwnedCustomItem: vi.fn(),
  loadSkillMatrix: vi.fn(),
  loadItemView: vi.fn(),
  updateMany: vi.fn(),
  update: vi.fn(),
  consumeAiUsage: vi.fn(),
  generateSkillDraft: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { skillPackItem: { updateMany: mocks.updateMany, update: mocks.update } } }));
vi.mock("@/lib/ai/claude", () => ({ generateSkillDraft: mocks.generateSkillDraft, scoreQuestions: vi.fn() }));
vi.mock("@/lib/ai/usage", async (orig) => ({ ...(await orig<typeof import("@/lib/ai/usage")>()), consumeAiUsage: mocks.consumeAiUsage }));
vi.mock("./packs", async (orig) => ({
  ...(await orig<typeof import("./packs")>()),
  findOwnedCustomItem: mocks.findOwnedCustomItem,
  loadSkillMatrix: mocks.loadSkillMatrix,
  loadItemView: mocks.loadItemView,
}));

import { AlreadyGeneratingError, GENERATION_FAILED_MESSAGE, runGeneration, SkillNotFoundError, startGeneration } from "./generate";

const NOW = new Date("2026-11-24T12:00:00Z");
const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60_000);
const ITEM = {
  id: "i1",
  packId: "p1",
  kind: "CUSTOM",
  name: "board-update",
  purpose: "Writes the board update.",
  status: "DRAFT",
  updatedAt: NOW,
  files: null,
  answers: [{ questionId: "pbq_skill_1", answer: "When the month closes.", score: 3, notRelevant: false }],
  pack: { description: "Monthly reporting.", role: "CFO" },
};
const MATRIX = { id: "m", name: "Skill definition", questions: [{ id: "pbq_skill_1", text: "When should this skill be used?", guidance: "Triggers", order: 0 }] };
const GOOD = {
  name: "ignored",
  description: "Writes the monthly board update. Use when the month closes.",
  compatibility: "",
  body: "Write the update.",
  references: [],
  scripts: [],
  assets: [],
};
const BAD = { ...GOOD, description: "Use <this>" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findOwnedCustomItem.mockResolvedValue(ITEM);
  mocks.loadSkillMatrix.mockResolvedValue(MATRIX);
  mocks.loadItemView.mockResolvedValue({ id: "i1", status: "GENERATING" });
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.update.mockResolvedValue({});
});

describe("startGeneration", () => {
  it("returns not found for someone else's skill without spending usage", async () => {
    mocks.findOwnedCustomItem.mockResolvedValue(null);
    await expect(startGeneration("p1", "i1", "u2", NOW)).rejects.toBeInstanceOf(SkillNotFoundError);
    expect(mocks.consumeAiUsage).not.toHaveBeenCalled();
  });

  it("refuses a skill that is being written, before spending usage", async () => {
    mocks.findOwnedCustomItem.mockResolvedValue({ ...ITEM, status: "GENERATING", updatedAt: minutesAgo(1) });
    await expect(startGeneration("p1", "i1", "u1", NOW)).rejects.toBeInstanceOf(AlreadyGeneratingError);
    expect(mocks.consumeAiUsage).not.toHaveBeenCalled();
  });

  it("takes over an interrupted generation and counts one skill_generate use", async () => {
    mocks.findOwnedCustomItem.mockResolvedValue({ ...ITEM, status: "GENERATING", updatedAt: minutesAgo(20) });
    await expect(startGeneration("p1", "i1", "u1", NOW)).resolves.toEqual({ id: "i1", status: "GENERATING" });
    expect(mocks.consumeAiUsage).toHaveBeenCalledWith("u1", "skill_generate");
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "i1", OR: [{ status: { not: "GENERATING" } }, { updatedAt: { lt: minutesAgo(15) } }] },
      data: { status: "GENERATING", validationErrors: [], updatedAt: NOW },
    });
  });

  it("loses the claim to a concurrent request", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    await expect(startGeneration("p1", "i1", "u1", NOW)).rejects.toBeInstanceOf(AlreadyGeneratingError);
  });
});

describe("runGeneration", () => {
  it("writes a valid skill as READY", async () => {
    mocks.generateSkillDraft.mockResolvedValue(GOOD);
    await runGeneration("p1", "i1", "u1");
    expect(mocks.generateSkillDraft).toHaveBeenCalledTimes(1);
    expect(mocks.generateSkillDraft.mock.calls[0][0]).toContain("When the month closes.");
    const { where, data } = mocks.update.mock.calls[0][0];
    expect(where).toEqual({ id: "i1" });
    expect(data.status).toBe("READY");
    expect(data.validationErrors).toEqual([]);
    expect(data.files[0]).toMatchObject({ path: "SKILL.md" });
    expect(data.files[0].content).toContain("name: board-update");
  });

  it("retries once with the validation errors, then marks the skill FAILED", async () => {
    mocks.generateSkillDraft.mockResolvedValue(BAD);
    await runGeneration("p1", "i1", "u1");
    expect(mocks.generateSkillDraft).toHaveBeenCalledTimes(2);
    const retry = mocks.generateSkillDraft.mock.calls[1][0] as string;
    expect(retry).toContain("<validation_errors>");
    expect(retry).toContain("description cannot contain < or >");
    const { data } = mocks.update.mock.calls[0][0];
    expect(data.status).toBe("FAILED");
    expect(data.validationErrors).toEqual(["SKILL.md: description cannot contain < or >"]);
  });

  it("is READY when the retry fixes the problem", async () => {
    mocks.generateSkillDraft.mockResolvedValueOnce(BAD).mockResolvedValueOnce(GOOD);
    await runGeneration("p1", "i1", "u1");
    expect(mocks.update.mock.calls[0][0].data.status).toBe("READY");
  });

  it("turns an AI failure into FAILED with a readable message, without throwing", async () => {
    mocks.generateSkillDraft.mockRejectedValue(new Error("overloaded"));
    await expect(runGeneration("p1", "i1", "u1")).resolves.toBeUndefined();
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "i1" }, data: { status: "FAILED", validationErrors: [GENERATION_FAILED_MESSAGE] } });
  });
});
```

```ts
// apps/web/src/app/api/v1/prompt-bot/skill-packs/generate-routes.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  isAiConfigured: vi.fn(),
  startGeneration: vi.fn(),
  runGeneration: vi.fn(),
  after: vi.fn(),
  findOwnedCustomItem: vi.fn(),
  loadItemView: vi.fn(),
  itemUpdate: vi.fn(),
}));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: mocks.after }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/ai/config", async (orig) => ({ ...(await orig<typeof import("@/lib/ai/config")>()), isAiConfigured: mocks.isAiConfigured }));
vi.mock("@/lib/ai/claude", () => ({ generateSkillDraft: vi.fn(), scoreQuestions: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { skillPackItem: { update: mocks.itemUpdate } } }));
vi.mock("@/lib/skills/packs", async (orig) => ({
  ...(await orig<typeof import("@/lib/skills/packs")>()),
  findOwnedCustomItem: mocks.findOwnedCustomItem,
  loadItemView: mocks.loadItemView,
}));
vi.mock("@/lib/skills/generate", async (orig) => ({
  ...(await orig<typeof import("@/lib/skills/generate")>()),
  startGeneration: mocks.startGeneration,
  runGeneration: mocks.runGeneration,
}));

import { AlreadyGeneratingError, SkillNotFoundError } from "@/lib/skills/generate";
import * as generate from "./[id]/items/[itemId]/generate/route";
import * as files from "./[id]/items/[itemId]/files/route";

const req = (method: string, body?: unknown) =>
  new NextRequest("http://localhost/x", { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = { params: Promise.resolve({ id: "p1", itemId: "i1" }) };
const SKILL_MD = '---\nname: board-update\ndescription: "Writes the board update. Use for monthly reporting."\n---\n\nWrite it.\n';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "u1", role: "MENTEE" });
  mocks.isAiConfigured.mockReturnValue(true);
  mocks.findOwnedCustomItem.mockResolvedValue({ id: "i1", name: "board-update", status: "READY", updatedAt: new Date() });
  mocks.loadItemView.mockResolvedValue({ id: "i1", status: "READY" });
});

describe("generate route", () => {
  it("claims the skill, answers 202 and writes it after the response", async () => {
    mocks.startGeneration.mockResolvedValue({ id: "i1", status: "GENERATING" });
    const res = await generate.POST(req("POST"), ctx);
    expect(res.status).toBe(202);
    expect((await res.json()).data.status).toBe("GENERATING");
    expect(mocks.startGeneration).toHaveBeenCalledWith("p1", "i1", "u1");
    expect(mocks.after).toHaveBeenCalledTimes(1);
    expect(mocks.runGeneration).not.toHaveBeenCalled();
    await mocks.after.mock.calls[0][0]();
    expect(mocks.runGeneration).toHaveBeenCalledWith("p1", "i1", "u1");
  });

  it("maps not found, already generating, the daily limit and a missing key", async () => {
    const { LimitReachedError } = await import("@/lib/ai/usage");
    mocks.startGeneration.mockRejectedValueOnce(new SkillNotFoundError());
    expect((await generate.POST(req("POST"), ctx)).status).toBe(404);
    mocks.startGeneration.mockRejectedValueOnce(new AlreadyGeneratingError());
    const busy = await generate.POST(req("POST"), ctx);
    expect(busy.status).toBe(409);
    expect((await busy.json()).error.code).toBe("ALREADY_GENERATING");
    mocks.startGeneration.mockRejectedValueOnce(new LimitReachedError("skill_generate", new Date("2026-11-25T00:00:00Z")));
    expect((await generate.POST(req("POST"), ctx)).status).toBe(429);
    mocks.isAiConfigured.mockReturnValue(false);
    expect((await generate.POST(req("POST"), ctx)).status).toBe(503);
    expect(mocks.after).not.toHaveBeenCalled();
  });
});

describe("files route", () => {
  it("saves valid edits as READY", async () => {
    const edited = [{ path: "SKILL.md", content: SKILL_MD }, { path: "references/context.md", content: "Edited" }];
    const res = await files.PATCH(req("PATCH", { files: edited }), ctx);
    expect(res.status).toBe(200);
    expect(mocks.itemUpdate).toHaveBeenCalledWith({ where: { id: "i1" }, data: { files: edited, status: "READY", validationErrors: [] } });
  });

  it("rejects invalid edits with readable errors and saves nothing", async () => {
    const res = await files.PATCH(req("PATCH", { files: [{ path: "SKILL.md", content: SKILL_MD }, { path: "../evil.sh", content: "x" }] }), ctx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details.files).toEqual([expect.stringMatching(/'\.\.'/)]);
    expect(mocks.itemUpdate).not.toHaveBeenCalled();
  });

  it("returns 404 for someone else's skill and 409 while it is being written", async () => {
    mocks.findOwnedCustomItem.mockResolvedValueOnce(null);
    expect((await files.PATCH(req("PATCH", { files: [] }), ctx)).status).toBe(404);
    mocks.findOwnedCustomItem.mockResolvedValueOnce({ id: "i1", name: "board-update", status: "GENERATING", updatedAt: new Date() });
    expect((await files.PATCH(req("PATCH", { files: [] }), ctx)).status).toBe(409);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/lib/skills/generate.test.ts src/app/api/v1/prompt-bot/skill-packs/generate-routes.test.ts`
Expected: FAIL, "Failed to resolve import ./generate" and the route imports.

- [ ] **Step 3: Implement the generation service**

```ts
// apps/web/src/lib/skills/generate.ts
import { prisma } from "@/lib/db/prisma";
import { generateSkillDraft } from "@/lib/ai/claude";
import { consumeAiUsage } from "@/lib/ai/usage";
import { assembleSkillFiles } from "./assemble";
import { validateSkillFiles } from "./format";
import { buildGenerateMessage, buildRetryMessage } from "./instructions";
import { findOwnedCustomItem, generationCutoff, isGenerating, loadItemView, loadSkillMatrix, questionContext, toStoredFiles } from "./packs";
import type { SkillItemView } from "./types";

export const GENERATION_FAILED_MESSAGE = "The AI couldn't finish writing this skill. Try again.";

export class SkillNotFoundError extends Error {
  constructor() {
    super("Skill not found");
    this.name = "SkillNotFoundError";
  }
}

export class AlreadyGeneratingError extends Error {
  constructor() {
    super("This skill is already being written");
    this.name = "AlreadyGeneratingError";
  }
}

/** Checks ownership, counts one skill_generate use and claims the item. runGeneration does the writing. */
export async function startGeneration(packId: string, itemId: string, userId: string, now = new Date()): Promise<SkillItemView> {
  const item = await findOwnedCustomItem(packId, itemId, userId);
  if (!item) throw new SkillNotFoundError();
  if (isGenerating(item.status, item.updatedAt, now)) throw new AlreadyGeneratingError();
  await consumeAiUsage(userId, "skill_generate");
  const claimed = await prisma.skillPackItem.updateMany({
    where: { id: itemId, OR: [{ status: { not: "GENERATING" } }, { updatedAt: { lt: generationCutoff(now) } }] },
    data: { status: "GENERATING", validationErrors: [], updatedAt: now },
  });
  if (claimed.count === 0) throw new AlreadyGeneratingError();
  const view = await loadItemView(packId, itemId, userId);
  if (!view) throw new SkillNotFoundError();
  return view;
}

/** One model call, validation, one retry with the errors, then READY or FAILED. Runs after the response; never throws. */
export async function runGeneration(packId: string, itemId: string, userId: string): Promise<void> {
  try {
    const item = await findOwnedCustomItem(packId, itemId, userId);
    if (!item) return;
    const matrix = await loadSkillMatrix();
    const message = buildGenerateMessage({
      packDescription: item.pack.description,
      role: item.pack.role,
      name: item.name,
      purpose: item.purpose,
      questions: questionContext(matrix, item.answers),
    });
    let draft = await generateSkillDraft(message);
    let files = assembleSkillFiles(item.name, draft);
    let errors = validateSkillFiles(files, item.name);
    if (errors.length > 0) {
      draft = await generateSkillDraft(buildRetryMessage(message, draft, errors));
      files = assembleSkillFiles(item.name, draft);
      errors = validateSkillFiles(files, item.name);
    }
    await prisma.skillPackItem.update({
      where: { id: itemId },
      data: { status: errors.length > 0 ? "FAILED" : "READY", files: toStoredFiles(files), validationErrors: errors },
    });
  } catch (error) {
    console.error("[skills-builder] generation failed:", error instanceof Error ? error.name : "unknown");
    await prisma.skillPackItem
      .update({ where: { id: itemId }, data: { status: "FAILED", validationErrors: [GENERATION_FAILED_MESSAGE] } })
      .catch(() => undefined);
  }
}
```

- [ ] **Step 4: Implement the routes**

```ts
// apps/web/src/app/api/v1/prompt-bot/skill-packs/[id]/items/[itemId]/generate/route.ts
import { after, NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse, successResponse } from "@/lib/api/response";
import { AiNotConfiguredError, isAiConfigured } from "@/lib/ai/config";
import { aiErrorResponse } from "@/lib/prompt-bot/http";
import { AlreadyGeneratingError, runGeneration, SkillNotFoundError, startGeneration } from "@/lib/skills/generate";

/**
 * Claims the skill and answers 202 at once; the writing runs in after() because an Opus
 * skill can take longer than App Runner's 120-second request limit. The page polls the item.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  if (!isAiConfigured()) return aiErrorResponse(new AiNotConfiguredError());
  const { id, itemId } = await params;
  try {
    const view = await startGeneration(id, itemId, user.id);
    after(() => runGeneration(id, itemId, user.id));
    return successResponse(view, undefined, 202);
  } catch (error) {
    if (error instanceof SkillNotFoundError) return errorResponse("Skill not found", "NOT_FOUND", 404);
    if (error instanceof AlreadyGeneratingError) {
      return errorResponse("This skill is already being written. Wait for it to finish.", "ALREADY_GENERATING", 409);
    }
    return aiErrorResponse(error);
  }
}
```

```ts
// apps/web/src/app/api/v1/prompt-bot/skill-packs/[id]/items/[itemId]/files/route.ts
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse, successResponse, validationErrorResponse } from "@/lib/api/response";
import { SKILL_LIMITS, validateSkillFiles } from "@/lib/skills/format";
import { findOwnedCustomItem, isGenerating, loadItemView, toStoredFiles } from "@/lib/skills/packs";

const Body = z.object({
  files: z.array(z.object({ path: z.string().max(500), content: z.string().max(SKILL_LIMITS.fileBytes) })).max(SKILL_LIMITS.files * 2),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  const { id, itemId } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return validationErrorResponse(parsed.error);
  const item = await findOwnedCustomItem(id, itemId, user.id);
  if (!item) return errorResponse("Skill not found", "NOT_FOUND", 404);
  if (isGenerating(item.status, item.updatedAt)) {
    return errorResponse("This skill is being written. Wait for it to finish before editing.", "ALREADY_GENERATING", 409);
  }
  const errors = validateSkillFiles(parsed.data.files, item.name);
  if (errors.length > 0) return errorResponse("Fix these problems before saving the skill.", "VALIDATION_ERROR", 400, { files: errors });
  await prisma.skillPackItem.update({
    where: { id: itemId },
    data: { files: toStoredFiles(parsed.data.files), status: "READY", validationErrors: [] },
  });
  return successResponse(await loadItemView(id, itemId, user.id));
}
```

- [ ] **Step 5: Run them and watch them pass, then commit**

Run: `npx vitest run src/lib/skills/generate.test.ts src/app/api/v1/prompt-bot/skill-packs/generate-routes.test.ts && npx tsc --noEmit` → PASS.
```bash
cd "/Users/tharunkumarl/Full Stack/lms"
git add apps/web/src/lib/skills/generate.ts apps/web/src/lib/skills/generate.test.ts "apps/web/src/app/api/v1/prompt-bot/skill-packs/[id]/items/[itemId]/generate" "apps/web/src/app/api/v1/prompt-bot/skill-packs/[id]/items/[itemId]/files" apps/web/src/app/api/v1/prompt-bot/skill-packs/generate-routes.test.ts
git commit -m "feat(skills-builder): background skill generation with one validated retry, and file edits"
```

---

### Task 13: Download routes

**Files:**
- Create: `apps/web/src/app/api/v1/prompt-bot/skill-packs/[id]/download/route.ts`
- Create: `apps/web/src/app/api/v1/prompt-bot/skill-packs/[id]/items/[itemId]/download/route.ts`
- Test: `apps/web/src/app/api/v1/prompt-bot/skill-packs/download-routes.test.ts`

**Interfaces:**
- Consumes: `loadPackView`, `loadItemView` (Task 9), `buildPackZip`, `buildSkillZip`, `zipResponse` (Task 7), `normalizeSkillName` (Task 4).
- Produces:
  - `GET …/skill-packs/:id/download` → `application/zip` named `<pack-slug>.zip` (only `READY` custom skills; catalog matches in `recommended-skills.md`), or 409 `NOTHING_TO_DOWNLOAD`
  - `GET …/items/:itemId/download` → `application/zip` named `<skill>.zip`, or 409 `NOTHING_TO_DOWNLOAD`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/app/api/v1/prompt-bot/skill-packs/download-routes.test.ts
import { strFromU8, unzipSync } from "fflate";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), loadPackView: vi.fn(), loadItemView: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/skills/packs", () => ({ loadPackView: mocks.loadPackView, loadItemView: mocks.loadItemView }));

import * as packDownload from "./[id]/download/route";
import * as itemDownload from "./[id]/items/[itemId]/download/route";

const get = () => new NextRequest("http://localhost/x");
const packCtx = { params: Promise.resolve({ id: "p1" }) };
const itemCtx = { params: Promise.resolve({ id: "p1", itemId: "i1" }) };
const FILES = [{ path: "SKILL.md", content: "---\nname: board-update\ndescription: \"x\"\n---\n\nBody\n" }];
const custom = (over: Record<string, unknown>) => ({ kind: "CUSTOM", purpose: "Writes it.", files: FILES, catalog: null, ...over });
const PACK = {
  id: "p1",
  title: "My Week!",
  description: "Weekly work.",
  role: null,
  items: [
    custom({ id: "i1", name: "board-update", status: "READY" }),
    custom({ id: "i2", name: "draft-skill", status: "DRAFT", files: null }),
    custom({ id: "i3", name: "broken-skill", status: "FAILED" }),
    {
      id: "i4",
      kind: "CATALOG",
      name: "pptx",
      purpose: "Decks for the board.",
      status: "DRAFT",
      files: null,
      catalog: { id: "c", slug: "pptx", name: "PowerPoint", sourceUrl: "https://github.com/anthropics/skills", license: "source-available", bundlable: false, installNotes: "n" },
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "u1", role: "MENTEE" });
});

describe("pack download", () => {
  it("zips only ready custom skills and lists catalog matches as recommendations", async () => {
    mocks.loadPackView.mockResolvedValue(PACK);
    const res = await packDownload.GET(get(), packCtx);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/zip");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="my-week.zip"');
    const entries = unzipSync(new Uint8Array(await res.arrayBuffer()));
    expect(Object.keys(entries).sort()).toEqual([
      "my-week/README.md",
      "my-week/recommended-skills.md",
      "my-week/skills/board-update/SKILL.md",
      "my-week/upload-to-claude/board-update.zip",
    ]);
    const recommended = strFromU8(entries["my-week/recommended-skills.md"]);
    expect(recommended).toContain("## PowerPoint");
    expect(recommended).toContain("Decks for the board.");
    expect(recommended).toContain("- License: source-available");
  });

  it("returns 409 NOTHING_TO_DOWNLOAD when no skill is ready", async () => {
    mocks.loadPackView.mockResolvedValue({ ...PACK, items: PACK.items.filter((i) => i.status !== "READY") });
    const res = await packDownload.GET(get(), packCtx);
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("NOTHING_TO_DOWNLOAD");
  });

  it("returns 404 for someone else's pack", async () => {
    mocks.loadPackView.mockResolvedValue(null);
    expect((await packDownload.GET(get(), packCtx)).status).toBe(404);
  });
});

describe("single skill download", () => {
  it("returns an upload-ready zip with the folder at its root", async () => {
    mocks.loadItemView.mockResolvedValue(PACK.items[0]);
    const res = await itemDownload.GET(get(), itemCtx);
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="board-update.zip"');
    expect(Object.keys(unzipSync(new Uint8Array(await res.arrayBuffer())))).toEqual(["board-update/SKILL.md"]);
  });

  it("returns 409 for a skill that is not ready and 404 for a catalog item", async () => {
    mocks.loadItemView.mockResolvedValueOnce(PACK.items[2]);
    expect((await itemDownload.GET(get(), itemCtx)).status).toBe(409);
    mocks.loadItemView.mockResolvedValueOnce(PACK.items[3]);
    expect((await itemDownload.GET(get(), itemCtx)).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/app/api/v1/prompt-bot/skill-packs/download-routes.test.ts` → FAIL, failed to resolve the route imports.

- [ ] **Step 3: Implement**

```ts
// apps/web/src/app/api/v1/prompt-bot/skill-packs/[id]/download/route.ts
import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse } from "@/lib/api/response";
import { normalizeSkillName } from "@/lib/skills/names";
import { loadPackView } from "@/lib/skills/packs";
import { buildPackZip, zipResponse } from "@/lib/skills/zip";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  const { id } = await params;
  const pack = await loadPackView(id, user.id);
  if (!pack) return errorResponse("Skill pack not found", "NOT_FOUND", 404);
  const skills = pack.items.flatMap((item) =>
    item.kind === "CUSTOM" && item.status === "READY" && item.files ? [{ name: item.name, purpose: item.purpose, files: item.files }] : [],
  );
  if (skills.length === 0) return errorResponse("Generate at least one skill before downloading the pack.", "NOTHING_TO_DOWNLOAD", 409);
  const recommendations = pack.items.flatMap((item) =>
    item.kind === "CATALOG" && item.catalog
      ? [{ name: item.catalog.name, why: item.purpose, sourceUrl: item.catalog.sourceUrl, license: item.catalog.license, installNotes: item.catalog.installNotes }]
      : [],
  );
  const slug = normalizeSkillName(pack.title, "skill-pack");
  return zipResponse(
    buildPackZip({ slug, title: pack.title, description: pack.description, role: pack.role, skills, recommendations }),
    `${slug}.zip`,
  );
}
```

```ts
// apps/web/src/app/api/v1/prompt-bot/skill-packs/[id]/items/[itemId]/download/route.ts
import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse } from "@/lib/api/response";
import { loadItemView } from "@/lib/skills/packs";
import { buildSkillZip, zipResponse } from "@/lib/skills/zip";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  const { id, itemId } = await params;
  const item = await loadItemView(id, itemId, user.id);
  if (!item || item.kind !== "CUSTOM") return errorResponse("Skill not found", "NOT_FOUND", 404);
  if (item.status !== "READY" || !item.files) return errorResponse("This skill isn't ready to download yet.", "NOTHING_TO_DOWNLOAD", 409);
  return zipResponse(buildSkillZip({ name: item.name, purpose: item.purpose, files: item.files }), `${item.name}.zip`);
}
```

- [ ] **Step 4: Run it and watch it pass, then commit**

Run: `npx vitest run src/app/api/v1/prompt-bot/skill-packs/download-routes.test.ts` → PASS.
```bash
cd "/Users/tharunkumarl/Full Stack/lms"
git add "apps/web/src/app/api/v1/prompt-bot/skill-packs/[id]/download" "apps/web/src/app/api/v1/prompt-bot/skill-packs/[id]/items/[itemId]/download" apps/web/src/app/api/v1/prompt-bot/skill-packs/download-routes.test.ts
git commit -m "feat(skills-builder): pack and single-skill zip downloads"
```

---

### Task 14: Catalog routes

**Files:**
- Create: `apps/web/src/lib/skills/catalog-input.ts`
- Create: `apps/web/src/app/api/v1/prompt-bot/skill-catalog/route.ts` (GET, POST)
- Create: `apps/web/src/app/api/v1/prompt-bot/skill-catalog/[id]/route.ts` (PATCH)
- Test: `apps/web/src/app/api/v1/prompt-bot/skill-catalog/catalog-routes.test.ts`

**Interfaces:**
- Consumes: `canEditMatrices` (`src/lib/prompt-bot/matrix-input.ts`), `isPermissiveLicense`, `PERMISSIVE_LICENSES` (Task 2), `isValidSkillName` (Task 2), `CatalogEntryView` (Task 5).
- Produces:
  - `CatalogCreate` (zod; `slug`, `name`, `description`, `sourceUrl` https, `license`, `bundlable` default false, `installNotes` default "", `tags` default [], `isActive` default true), `CatalogPatch` (all but `slug`, partial, non-empty)
  - `BUNDLABLE_MESSAGE`, `bundlableAllowed(license: string, bundlable: boolean): boolean`
  - `toCatalogEntryView(row): CatalogEntryView`
  - `GET /api/v1/prompt-bot/skill-catalog` (everyone; editors also see inactive), `POST` (ADMIN/MENTOR) → 201, `PATCH /api/v1/prompt-bot/skill-catalog/:id` (ADMIN/MENTOR)

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/app/api/v1/prompt-bot/skill-catalog/catalog-routes.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), findMany: vi.fn(), create: vi.fn(), findUnique: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { skillCatalogEntry: { findMany: mocks.findMany, create: mocks.create, findUnique: mocks.findUnique, update: mocks.update } },
}));

import * as collection from "./route";
import * as entry from "./[id]/route";

const json = (method: string, body?: unknown) =>
  new NextRequest("http://localhost/x", { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = { params: Promise.resolve({ id: "scat_x" }) };
const ROW = {
  id: "scat_x",
  slug: "x-skill",
  name: "X skill",
  description: "Does x things very well.",
  sourceUrl: "https://github.com/a/b",
  license: "MIT",
  bundlable: true,
  installNotes: "",
  tags: [],
  isActive: true,
  createdById: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};
const NEW = { slug: "x-skill", name: "X skill", description: "Does x things very well.", sourceUrl: "https://github.com/a/b", license: "source-available" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findMany.mockResolvedValue([ROW]);
  mocks.create.mockResolvedValue(ROW);
  mocks.findUnique.mockResolvedValue(ROW);
  mocks.update.mockResolvedValue(ROW);
});

describe("skill catalog routes", () => {
  it("lets participants read active entries only, and not edit", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "p1", role: "MENTEE" });
    const res = await collection.GET();
    expect(res.status).toBe(200);
    expect(mocks.findMany).toHaveBeenCalledWith({ where: { isActive: true }, orderBy: { name: "asc" } });
    expect((await res.json()).data[0]).not.toHaveProperty("createdById");
    expect((await collection.POST(json("POST", NEW))).status).toBe(403);
    expect((await entry.PATCH(json("PATCH", { isActive: false }), ctx)).status).toBe(403);
  });

  it("shows coaches inactive entries too", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "c1", role: "MENTOR" });
    await collection.GET();
    expect(mocks.findMany).toHaveBeenCalledWith({ where: {}, orderBy: { name: "asc" } });
  });

  it("lets a coach add a link-only entry", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "c1", role: "MENTOR" });
    const res = await collection.POST(json("POST", NEW));
    expect(res.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith({
      data: { ...NEW, bundlable: false, installNotes: "", tags: [], isActive: true, createdById: "c1" },
    });
  });

  it("allows bundlable only for a permissive license", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "a1", role: "ADMIN" });
    const refused = await collection.POST(json("POST", { ...NEW, bundlable: true }));
    expect(refused.status).toBe(400);
    expect((await refused.json()).error.message).toMatch(/permissive/);
    expect((await collection.POST(json("POST", { ...NEW, license: "MIT", bundlable: true }))).status).toBe(201);
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

  it("refuses a license change that would leave a non-permissive entry bundlable", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "a1", role: "ADMIN" });
    expect((await entry.PATCH(json("PATCH", { license: "source-available" }), ctx)).status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("deactivates an entry", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "c1", role: "MENTOR" });
    expect((await entry.PATCH(json("PATCH", { isActive: false }), ctx)).status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "scat_x" }, data: { isActive: false } });
  });

  it("reports a duplicate slug and an unknown entry", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "c1", role: "MENTOR" });
    mocks.create.mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "P2002" }));
    expect((await collection.POST(json("POST", NEW))).status).toBe(400);
    mocks.findUnique.mockResolvedValueOnce(null);
    expect((await entry.PATCH(json("PATCH", { isActive: false }), ctx)).status).toBe(404);
  });

  it("rejects a non-https source and a non-kebab slug", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "c1", role: "MENTOR" });
    expect((await collection.POST(json("POST", { ...NEW, sourceUrl: "http://github.com/a/b" }))).status).toBe(400);
    expect((await collection.POST(json("POST", { ...NEW, slug: "X Skill" }))).status).toBe(400);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/app/api/v1/prompt-bot/skill-catalog/catalog-routes.test.ts` → FAIL, failed to resolve `./route`.

- [ ] **Step 3: Implement**

```ts
// apps/web/src/lib/skills/catalog-input.ts
import { z } from "zod";
import { isPermissiveLicense, PERMISSIVE_LICENSES } from "./license";
import { isValidSkillName } from "./names";
import type { CatalogEntryView } from "./types";

const name = z.string().trim().min(2).max(80);
const description = z.string().trim().min(10).max(600);
const sourceUrl = z.string().trim().max(500).url().refine((v) => v.startsWith("https://"), "Use an https:// link");
const license = z.string().trim().min(1).max(64);
const installNotes = z.string().trim().max(1000);
const tags = z.array(z.string().trim().min(1).max(30)).max(10);

export const CatalogCreate = z.object({
  slug: z.string().trim().refine(isValidSkillName, "Use a kebab-case slug of at most 64 characters"),
  name,
  description,
  sourceUrl,
  license,
  bundlable: z.boolean().default(false),
  installNotes: installNotes.default(""),
  tags: tags.default([]),
  isActive: z.boolean().default(true),
});

export const CatalogPatch = z
  .object({ name, description, sourceUrl, license, bundlable: z.boolean(), installNotes, tags, isActive: z.boolean() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

export const BUNDLABLE_MESSAGE = `Only skills under a verified permissive license (${PERMISSIVE_LICENSES.join(", ")}) can be marked bundlable.`;

export const bundlableAllowed = (license: string, bundlable: boolean) => !bundlable || isPermissiveLicense(license);

/** Picks the client-facing fields from a catalog row (drops createdById and timestamps). */
export function toCatalogEntryView(row: CatalogEntryView): CatalogEntryView {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    sourceUrl: row.sourceUrl,
    license: row.license,
    bundlable: row.bundlable,
    installNotes: row.installNotes,
    tags: row.tags,
    isActive: row.isActive,
  };
}
```

```ts
// apps/web/src/app/api/v1/prompt-bot/skill-catalog/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse, successResponse, validationErrorResponse } from "@/lib/api/response";
import { canEditMatrices } from "@/lib/prompt-bot/matrix-input";
import { BUNDLABLE_MESSAGE, bundlableAllowed, CatalogCreate, toCatalogEntryView } from "@/lib/skills/catalog-input";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  const rows = await prisma.skillCatalogEntry.findMany({ where: canEditMatrices(user.role) ? {} : { isActive: true }, orderBy: { name: "asc" } });
  return successResponse(rows.map(toCatalogEntryView));
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  if (!canEditMatrices(user.role)) return errorResponse("Only coaches and admins can edit the skill catalog", "FORBIDDEN", 403);
  const parsed = CatalogCreate.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return validationErrorResponse(parsed.error);
  if (!bundlableAllowed(parsed.data.license, parsed.data.bundlable)) return errorResponse(BUNDLABLE_MESSAGE, "VALIDATION_ERROR", 400);
  try {
    const row = await prisma.skillCatalogEntry.create({ data: { ...parsed.data, createdById: user.id } });
    return successResponse(toCatalogEntryView(row), undefined, 201);
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return errorResponse("That slug is already in the catalog.", "VALIDATION_ERROR", 400);
    throw error;
  }
}
```

```ts
// apps/web/src/app/api/v1/prompt-bot/skill-catalog/[id]/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse, successResponse, validationErrorResponse } from "@/lib/api/response";
import { canEditMatrices } from "@/lib/prompt-bot/matrix-input";
import { BUNDLABLE_MESSAGE, bundlableAllowed, CatalogPatch, toCatalogEntryView } from "@/lib/skills/catalog-input";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  if (!canEditMatrices(user.role)) return errorResponse("Only coaches and admins can edit the skill catalog", "FORBIDDEN", 403);
  const { id } = await params;
  const parsed = CatalogPatch.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return validationErrorResponse(parsed.error);
  const existing = await prisma.skillCatalogEntry.findUnique({ where: { id } });
  if (!existing) return errorResponse("Catalog entry not found", "NOT_FOUND", 404);
  const license = parsed.data.license ?? existing.license;
  const bundlable = parsed.data.bundlable ?? existing.bundlable;
  if (!bundlableAllowed(license, bundlable)) return errorResponse(BUNDLABLE_MESSAGE, "VALIDATION_ERROR", 400);
  const row = await prisma.skillCatalogEntry.update({ where: { id }, data: parsed.data });
  return successResponse(toCatalogEntryView(row));
}
```

- [ ] **Step 4: Run it and watch it pass, then commit**

Run: `npx vitest run src/app/api/v1/prompt-bot/skill-catalog/catalog-routes.test.ts && npx tsc --noEmit` → PASS.
```bash
cd "/Users/tharunkumarl/Full Stack/lms"
git add apps/web/src/lib/skills/catalog-input.ts apps/web/src/app/api/v1/prompt-bot/skill-catalog
git commit -m "feat(skills-builder): skill catalog routes with role checks and the bundlable rule"
```

---

### Task 15: Shared matrix-answers hook and panel (refactor)

Before writing UI code in this task, invoke the `impeccable` skill (Global Constraints). This task moves code; it must not change what the enhancer workspace looks like or does.

**Files:**
- Modify: `apps/web/src/lib/prompt-bot/client.ts` (export `call` and `CallResult`, carry error `details`, add `ScoreReply`)
- Create: `apps/web/src/components/prompt-bot/use-matrix-answers.ts`
- Create: `apps/web/src/components/prompt-bot/matrix-panel.tsx`
- Modify: `apps/web/src/app/(app)/prompt-bot/[sessionId]/workspace.tsx` (use the hook and panel)
- Test: `apps/web/src/components/prompt-bot/use-matrix-answers.test.ts`, `apps/web/src/components/prompt-bot/matrix-panel.test.ts`, `apps/web/src/lib/prompt-bot/client.test.ts` (one new case); `apps/web/src/app/(app)/prompt-bot/[sessionId]/workspace.test.ts` stays unchanged and must pass

**Interfaces:**
- Consumes: `debounce`, `saveAnswer`, `scoreSession`, `patchSession`, `readEnhanceStream` (client), `QuestionRow`, `ReadinessMeter`, `readiness`, `unansweredQuestionIds`, `AnswerView`.
- Produces:
  - `CallResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string; details?: Record<string, string[]> }`, `call<T>(url: string, init?: RequestInit): Promise<CallResult<T>>`, `ScoreReply = { applied: boolean; revision: number; answers: AnswerView[] }`
  - `SAVE_DELAY_MS = 600`, `SCORE_DELAY_MS = 1500`, `AnswerPatch`, `ScoreState = "idle" | "scoring" | "failed"`, `emptyAnswer(questionId): AnswerView`
  - `useMatrixAnswers({ initialAnswers, initialRevision, saveAnswer(questionId, patch), score(revision) })` → `{ answers, answerFor(id), scoreState, updateAnswer(id, patch), mergeAnswers(rows), queueSave(key, run), flushSaves(), bumpRevision(), scheduleScore() }`
  - `useActiveQuestion(initialId: string | null)` → `{ activeId, answerRef, selectQuestion(id) }` (focuses the answer box on a row click, never on mount)
  - `MatrixGroup = { id: string; title: string; questions: { id: string; text: string }[] }`
  - `MatrixPanel({ heading, headingLevel?: "h1" | "h2", groups, answerFor, activeId, scoreState, onSelect, onToggleRelevant, children? })`

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/src/components/prompt-bot/use-matrix-answers.test.ts
/** @vitest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import { useMatrixAnswers } from "./use-matrix-answers";

const ok = <T>(data: T) => Promise.resolve({ ok: true as const, data });
const tick = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});
afterEach(() => vi.useRealTimers());

describe("useMatrixAnswers", () => {
  it("saves through the caller's endpoint, then scores the current revision and takes only score and reason", async () => {
    const saveAnswer = vi.fn(() => ok({ saved: true }));
    const score = vi.fn(() =>
      ok({ applied: true, revision: 5, answers: [{ questionId: "q1", answer: "server", score: 2, reason: "Partly", notRelevant: false }] }),
    );
    const { result } = renderHook(() => useMatrixAnswers({ initialAnswers: [], initialRevision: 4, saveAnswer, score }));

    act(() => result.current.updateAnswer("q1", { answer: "draft" }));
    expect(result.current.answerFor("q1").answer).toBe("draft");
    await tick(600);
    expect(saveAnswer).toHaveBeenCalledWith("q1", { answer: "draft" });
    await tick(1500);
    expect(score).toHaveBeenCalledWith(5);
    expect(result.current.answerFor("q1")).toEqual({ questionId: "q1", answer: "draft", score: 2, reason: "Partly", notRelevant: false });
  });

  it("sends a pending save at once on flushSaves", async () => {
    const saveAnswer = vi.fn(() => ok({ saved: true }));
    const { result } = renderHook(() =>
      useMatrixAnswers({ initialAnswers: [], initialRevision: 0, saveAnswer, score: vi.fn(() => ok({ applied: false, revision: 0, answers: [] })) }),
    );
    act(() => result.current.updateAnswer("q1", { notRelevant: true }));
    await act(async () => {
      await result.current.flushSaves();
    });
    expect(saveAnswer).toHaveBeenCalledWith("q1", { notRelevant: true });
  });

  it("keeps local edits over incoming rows when merging", () => {
    const { result } = renderHook(() =>
      useMatrixAnswers({
        initialAnswers: [{ questionId: "q1", answer: "local", score: 1, reason: null, notRelevant: false }],
        initialRevision: 0,
        saveAnswer: vi.fn(),
        score: vi.fn(),
      }),
    );
    act(() =>
      result.current.mergeAnswers([
        { questionId: "q1", answer: "server", score: 0, reason: null, notRelevant: false },
        { questionId: "q2", answer: "new", score: 0, reason: null, notRelevant: false },
      ]),
    );
    expect(result.current.answerFor("q1").answer).toBe("local");
    expect(result.current.answerFor("q2").answer).toBe("new");
  });

  it("reports a failed score", async () => {
    const score = vi.fn(() => Promise.resolve({ ok: false as const, code: "AI_FAILED", message: "x" }));
    const { result } = renderHook(() => useMatrixAnswers({ initialAnswers: [], initialRevision: 0, saveAnswer: vi.fn(() => ok({})), score }));
    act(() => result.current.scheduleScore());
    await tick(1500);
    expect(result.current.scoreState).toBe("failed");
  });
});
```

```ts
// apps/web/src/components/prompt-bot/matrix-panel.test.ts
/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnswerView } from "@/lib/prompt-bot/sessions";
import { MatrixPanel } from "./matrix-panel";

afterEach(cleanup);

const ANSWERS: Record<string, AnswerView> = {
  q1: { questionId: "q1", answer: "", score: 3, reason: "Clear", notRelevant: false },
  q2: { questionId: "q2", answer: "", score: 1, reason: null, notRelevant: false },
};
const props = {
  heading: "Skill definition",
  headingLevel: "h2" as const,
  groups: [{ id: "g1", title: "Questions", questions: [{ id: "q1", text: "When?" }, { id: "q2", text: "Context?" }] }],
  answerFor: (id: string) => ANSWERS[id],
  activeId: "q1",
  scoreState: "idle" as const,
  onSelect: vi.fn(),
  onToggleRelevant: vi.fn(),
};

describe("MatrixPanel", () => {
  it("uses the requested heading level, numbers the questions and shows readiness", () => {
    render(createElement(MatrixPanel, props));
    expect(screen.getByRole("heading", { level: 2, name: "Skill definition" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: "Questions" })).toBeTruthy();
    expect(screen.getByText("1 of 2 answered")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^2\.\s*Context\?/ })).toBeTruthy();
    expect(screen.getAllByRole("meter")).toHaveLength(2);
  });

  it("says when the bars could not update", () => {
    render(createElement(MatrixPanel, { ...props, scoreState: "failed" as const }));
    expect(screen.getByText(/Couldn't update the bars/)).toBeTruthy();
  });
});
```

Append to `apps/web/src/lib/prompt-bot/client.test.ts` (and add `call` to its import from `./client`):

```ts
describe("call", () => {
  it("returns the error code, message and field details of a failed request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ success: false, error: { code: "VALIDATION_ERROR", message: "Fix these", details: { files: ["bad path"] } } }), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    expect(await call("/x")).toEqual({ ok: false, code: "VALIDATION_ERROR", message: "Fix these", details: { files: ["bad path"] } });
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/components/prompt-bot/use-matrix-answers.test.ts src/components/prompt-bot/matrix-panel.test.ts src/lib/prompt-bot/client.test.ts`
Expected: FAIL, "Failed to resolve import ./use-matrix-answers", "./matrix-panel", and `call` is not exported.

- [ ] **Step 3: Export the request helper**

In `apps/web/src/lib/prompt-bot/client.ts`, replace the `CallResult` type and the `call` function with:

```ts
export type CallResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string; details?: Record<string, string[]> };

export type ScoreReply = { applied: boolean; revision: number; answers: AnswerView[] };

export async function call<T>(url: string, init?: RequestInit): Promise<CallResult<T>> {
  try {
    const res = await fetch(url, { credentials: "include", headers: { "content-type": "application/json" }, ...init });
    const body = await res.json().catch(() => null);
    if (res.ok && body?.success) return { ok: true, data: body.data as T };
    return {
      ok: false,
      code: body?.error?.code ?? "REQUEST_FAILED",
      message: body?.error?.message ?? "Something went wrong.",
      ...(body?.error?.details ? { details: body.error.details as Record<string, string[]> } : {}),
    };
  } catch {
    return { ok: false, code: "NETWORK_ERROR", message: "Couldn't reach the server. Check your connection." };
  }
}
```

and change `scoreSession` to use the shared reply type:

```ts
export const scoreSession = (id: string, revision: number) =>
  call<ScoreReply>(`/api/v1/prompt-bot/sessions/${id}/score`, { method: "POST", body: JSON.stringify({ revision }) });
```

- [ ] **Step 4: Move the answer, save and score logic into the hook**

```ts
// apps/web/src/components/prompt-bot/use-matrix-answers.ts
"use client";
import * as React from "react";
import { toast } from "sonner";
import { debounce, type CallResult, type ScoreReply } from "@/lib/prompt-bot/client";
import type { AnswerView } from "@/lib/prompt-bot/sessions";

export const SAVE_DELAY_MS = 600;
export const SCORE_DELAY_MS = 1500;

export type AnswerPatch = Partial<Pick<AnswerView, "answer" | "notRelevant">>;
export type ScoreState = "idle" | "scoring" | "failed";

export const emptyAnswer = (questionId: string): AnswerView => ({ questionId, answer: "", score: 0, reason: null, notRelevant: false });

type Options = {
  initialAnswers: AnswerView[];
  initialRevision: number;
  saveAnswer(questionId: string, patch: AnswerPatch): Promise<CallResult<unknown>>;
  score(revision: number): Promise<CallResult<ScoreReply>>;
};

/**
 * Answer state for a question matrix, shared by the Prompt Bot workspace and the Skills Builder.
 * Edits update state at once. Saves are debounced per field and run one after another, so a slow
 * earlier save can't land last. Scoring is debounced; the revision is bumped on every edit and a
 * score reply is applied only if no edit happened after it was requested.
 */
export function useMatrixAnswers({ initialAnswers, initialRevision, saveAnswer, score }: Options) {
  const [answers, setAnswers] = React.useState<Record<string, AnswerView>>(() =>
    Object.fromEntries(initialAnswers.map((a) => [a.questionId, a])),
  );
  const [scoreState, setScoreState] = React.useState<ScoreState>("idle");
  const calls = React.useRef({ saveAnswer, score });
  React.useEffect(() => {
    calls.current = { saveAnswer, score };
  });
  const revision = React.useRef(initialRevision);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = React.useRef(new Map<string, () => Promise<void>>());
  const tails = React.useRef(new Map<string, Promise<void>>());
  const debouncers = React.useRef(new Map<string, (key: string) => void>());

  const scheduleScore = React.useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const sent = revision.current;
      setScoreState("scoring");
      const result = await calls.current.score(sent);
      if (!result.ok) {
        setScoreState("failed");
        if (result.code === "LIMIT_REACHED") toast.error(result.message);
        return;
      }
      setScoreState("idle");
      if (result.data.applied && sent === revision.current) {
        setAnswers((prev) => {
          const next = { ...prev };
          for (const a of result.data.answers) {
            const local = prev[a.questionId];
            next[a.questionId] = local ? { ...local, score: a.score, reason: a.reason } : a;
          }
          return next;
        });
      }
    }, SCORE_DELAY_MS);
  }, []);

  const bumpRevision = React.useCallback(() => {
    revision.current += 1;
  }, []);

  const runPending = React.useCallback((key: string) => {
    const run = pending.current.get(key);
    if (!run) return;
    pending.current.delete(key);
    const tail = (tails.current.get(key) ?? Promise.resolve()).then(run);
    tails.current.set(key, tail);
    void tail.finally(() => {
      if (tails.current.get(key) === tail) tails.current.delete(key);
    });
  }, []);

  const queueSave = React.useCallback(
    (key: string, run: () => Promise<void>) => {
      pending.current.set(key, run);
      let d = debouncers.current.get(key);
      if (!d) {
        d = debounce(runPending, SAVE_DELAY_MS);
        debouncers.current.set(key, d);
      }
      d(key);
    },
    [runPending],
  );

  const flushSaves = React.useCallback(async () => {
    for (const key of [...pending.current.keys()]) runPending(key);
    await Promise.all([...tails.current.values()]);
  }, [runPending]);

  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      for (const key of [...pending.current.keys()]) runPending(key);
    },
    [runPending],
  );

  const answerFor = React.useCallback((id: string): AnswerView => answers[id] ?? emptyAnswer(id), [answers]);

  const updateAnswer = React.useCallback(
    (questionId: string, patch: AnswerPatch) => {
      bumpRevision();
      setAnswers((prev) => ({ ...prev, [questionId]: { ...(prev[questionId] ?? emptyAnswer(questionId)), ...patch } }));
      const field = "answer" in patch ? "answer" : "notRelevant";
      queueSave(`answer:${questionId}:${field}`, async () => {
        const saved = await calls.current.saveAnswer(questionId, patch);
        if (!saved.ok) toast.error(saved.message);
        scheduleScore();
      });
    },
    [bumpRevision, queueSave, scheduleScore],
  );

  const mergeAnswers = React.useCallback((incoming: AnswerView[]) => {
    setAnswers((prev) => ({ ...Object.fromEntries(incoming.map((a) => [a.questionId, a])), ...prev }));
  }, []);

  return { answers, answerFor, scoreState, updateAnswer, mergeAnswers, queueSave, flushSaves, bumpRevision, scheduleScore };
}

/** Which question's answer box is open. Clicking a row focuses the box; mounting does not. */
export function useActiveQuestion(initialId: string | null) {
  const [activeId, setActiveId] = React.useState<string | null>(initialId);
  const answerRef = React.useRef<HTMLTextAreaElement>(null);
  const focusAnswer = React.useRef(false);

  React.useEffect(() => {
    if (focusAnswer.current) {
      focusAnswer.current = false;
      answerRef.current?.focus();
    }
  }, [activeId]);

  function selectQuestion(id: string) {
    if (id === activeId) answerRef.current?.focus();
    else {
      focusAnswer.current = true;
      setActiveId(id);
    }
  }

  return { activeId, answerRef, selectQuestion };
}
```

```tsx
// apps/web/src/components/prompt-bot/matrix-panel.tsx
"use client";
import * as React from "react";
import { readiness } from "@/lib/prompt-bot/scoring";
import type { AnswerView } from "@/lib/prompt-bot/sessions";
import { QuestionRow } from "./question-row";
import { ReadinessMeter } from "./readiness-meter";
import type { ScoreState } from "./use-matrix-answers";

export type MatrixGroup = { id: string; title: string; questions: { id: string; text: string }[] };

type Props = {
  heading: string;
  headingLevel?: "h1" | "h2";
  groups: MatrixGroup[];
  answerFor(id: string): AnswerView;
  activeId: string | null;
  scoreState: ScoreState;
  onSelect(id: string): void;
  onToggleRelevant(id: string): void;
  children?: React.ReactNode;
};

/** The left column of a matrix workspace: readiness, then numbered question rows with 3-slice bars. */
export function MatrixPanel({ heading, headingLevel = "h1", groups, answerFor, activeId, scoreState, onSelect, onToggleRelevant, children }: Props) {
  const headingId = React.useId();
  const Heading = headingLevel;
  const GroupHeading = headingLevel === "h1" ? "h2" : "h3";
  const ready = readiness(groups.flatMap((g) => g.questions.map((q) => answerFor(q.id))));
  const offsets = groups.map((_, i) => groups.slice(0, i).reduce((sum, g) => sum + g.questions.length, 0));

  return (
    <aside className="glass h-fit rounded-[1.75rem] p-5 lg:sticky lg:top-24" aria-labelledby={headingId}>
      <Heading id={headingId} className="text-lg font-semibold">
        {heading}
      </Heading>
      <div className="mt-3">
        <ReadinessMeter {...ready} />
      </div>
      <p className="mt-2 h-4 text-xs text-muted-foreground" aria-live="polite">
        {scoreState === "scoring" ? "Updating…" : scoreState === "failed" ? "Couldn't update the bars — keep typing to retry." : ""}
      </p>
      {groups.map((group, gi) => (
        <section key={group.id} className="mt-4" aria-labelledby={`${headingId}-${group.id}`}>
          <GroupHeading id={`${headingId}-${group.id}`} className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {group.title}
          </GroupHeading>
          <ul className="mt-2 flex flex-col gap-1">
            {group.questions.map((q, qi) => {
              const a = answerFor(q.id);
              return (
                <QuestionRow
                  key={q.id}
                  index={offsets[gi] + qi + 1}
                  text={q.text}
                  score={a.score}
                  reason={a.reason}
                  notRelevant={a.notRelevant}
                  active={q.id === activeId}
                  onSelect={() => onSelect(q.id)}
                  onToggleRelevant={() => onToggleRelevant(q.id)}
                />
              );
            })}
          </ul>
        </section>
      ))}
      {children}
    </aside>
  );
}
```

- [ ] **Step 5: Rewrite the enhancer workspace on top of them**

Replace the whole of `apps/web/src/app/(app)/prompt-bot/[sessionId]/workspace.tsx` with:

```tsx
"use client";
import * as React from "react";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { EnhancePanel } from "@/components/prompt-bot/enhance-panel";
import { MatrixPanel } from "@/components/prompt-bot/matrix-panel";
import { useActiveQuestion, useMatrixAnswers } from "@/components/prompt-bot/use-matrix-answers";
import { unansweredQuestionIds } from "@/lib/prompt-bot/scoring";
import { patchSession, readEnhanceStream, saveAnswer, scoreSession } from "@/lib/prompt-bot/client";
import type { SessionView } from "@/lib/prompt-bot/sessions";

export function Workspace({ initial, taskMatrices }: { initial: SessionView; taskMatrices: { id: string; name: string }[] }) {
  const [view, setView] = React.useState(initial);
  const [basePrompt, setBasePrompt] = React.useState(initial.basePrompt);
  const matrix = useMatrixAnswers({
    initialAnswers: initial.answers,
    initialRevision: initial.scoreRevision,
    saveAnswer: (questionId, patch) => saveAnswer(view.id, questionId, patch),
    score: (revision) => scoreSession(view.id, revision),
  });
  const { activeId, answerRef, selectQuestion } = useActiveQuestion(initial.matrices[0]?.questions[0]?.id ?? null);
  const [enhanced, setEnhanced] = React.useState(initial.latestEnhancement?.content ?? "");
  const [version, setVersion] = React.useState<number | null>(initial.latestEnhancement?.version ?? null);
  const [history, setHistory] = React.useState<{ version: number; content: string }[]>(() =>
    initial.latestEnhancement ? [{ version: initial.latestEnhancement.version, content: initial.latestEnhancement.content }] : [],
  );
  const lastGood = React.useRef<{ content: string; version: number | null }>({
    content: initial.latestEnhancement?.content ?? "",
    version: initial.latestEnhancement?.version ?? null,
  });
  const [streaming, setStreaming] = React.useState(false);
  const [enhanceError, setEnhanceError] = React.useState<string | null>(null);

  const questions = view.matrices.flatMap((m) => m.questions);
  const gaps = unansweredQuestionIds(questions.map((q) => matrix.answerFor(q.id)));

  function updateBasePrompt(value: string) {
    matrix.bumpRevision();
    setBasePrompt(value);
    if (!value.trim()) return;
    matrix.queueSave("basePrompt", async () => {
      const saved = await patchSession(view.id, { basePrompt: value });
      if (!saved.ok) toast.error(saved.message);
      matrix.scheduleScore();
    });
  }

  async function switchTask(taskMatrixId: string | null) {
    await matrix.flushSaves();
    const result = await patchSession(view.id, { taskMatrixId });
    if (!result.ok) return toast.error(result.message);
    matrix.bumpRevision();
    setView(result.data);
    matrix.mergeAnswers(result.data.answers);
    matrix.scheduleScore();
  }

  async function enhance() {
    if (gaps.length > 0 && !window.confirm(`${gaps.length} questions not answered yet — the enhanced prompt will be higher-level. Continue?`)) return;
    setStreaming(true);
    setEnhanceError(null);
    setEnhanced("");
    await matrix.flushSaves();
    let streamed = "";
    const restore = () => {
      setEnhanced(lastGood.current.content);
      setVersion(lastGood.current.version);
    };
    try {
      const res = await fetch(`/api/v1/prompt-bot/sessions/${view.id}/enhance`, { method: "POST", credentials: "include" });
      const result = await readEnhanceStream(res, (text) => {
        streamed += text;
        setEnhanced((prev) => prev + text);
      });
      if ("error" in result) {
        setEnhanceError(result.error);
        restore();
      } else {
        lastGood.current = { content: streamed, version: result.version };
        setVersion(result.version);
        setHistory((prev) => [{ version: result.version, content: streamed }, ...prev.filter((h) => h.version !== result.version)]);
      }
    } catch {
      setEnhanceError("Couldn't reach the server. Check your connection.");
      restore();
    } finally {
      setStreaming(false);
    }
  }

  function selectVersion(next: number) {
    const entry = history.find((h) => h.version === next);
    if (!entry || streaming) return;
    lastGood.current = { content: entry.content, version: entry.version };
    setEnhanced(entry.content);
    setVersion(entry.version);
  }

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/v1/prompt-bot/sessions/${initial.id}/enhancements`, { credentials: "include" });
        const body = await res.json().catch(() => null);
        if (cancelled || !res.ok || !body?.success || !Array.isArray(body.data)) return;
        const loaded = (body.data as { version: number; content: string }[]).map((e) => ({ version: e.version, content: e.content }));
        setHistory((prev) => {
          const seen = new Set(prev.map((h) => h.version));
          return [...prev, ...loaded.filter((e) => !seen.has(e.version))].sort((x, y) => y.version - x.version);
        });
      } catch {
        // The switcher is a convenience; the latest version is already shown.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initial.id]);

  const active = questions.find((q) => q.id === activeId) ?? null;
  const task = view.matrices.find((m) => m.kind === "TASK") ?? null;
  const groups = view.matrices.map((m) => ({ id: m.id, title: m.kind === "CORE" ? "Core" : m.name, questions: m.questions }));

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <MatrixPanel
        heading="Design Think"
        groups={groups}
        answerFor={matrix.answerFor}
        activeId={activeId}
        scoreState={matrix.scoreState}
        onSelect={selectQuestion}
        onToggleRelevant={(id) => matrix.updateAnswer(id, { notRelevant: !matrix.answerFor(id).notRelevant })}
      >
        <label className="mt-5 flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Task type</span>
          <span className="relative">
            <select
              value={task?.id ?? ""}
              onChange={(e) => void switchTask(e.target.value || null)}
              className="appearance-none rounded-xl border border-border bg-white/60 py-1.5 pl-3 pr-8 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 dark:bg-white/5"
            >
              <option value="">Core only</option>
              {taskMatrices.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-2 size-4 text-muted-foreground" aria-hidden />
          </span>
        </label>
      </MatrixPanel>

      <div className="flex min-w-0 flex-col gap-5">
        <section className="glass rounded-[1.75rem] p-5">
          <label htmlFor="base-prompt" className="text-sm font-medium">Your prompt</label>
          <Textarea id="base-prompt" value={basePrompt} onChange={(e) => updateBasePrompt(e.target.value)} className="mt-2 min-h-28 bg-white/60 dark:bg-white/5" />
          {active && (
            <div className="mt-5">
              <label htmlFor="answer" className="text-sm font-medium">{active.text}</label>
              <Textarea
                id="answer"
                ref={answerRef}
                value={matrix.answerFor(active.id).answer}
                onChange={(e) => matrix.updateAnswer(active.id, { answer: e.target.value })}
                placeholder={active.guidance}
                className="mt-2 min-h-24 bg-white/60 dark:bg-white/5"
              />
            </div>
          )}
        </section>
        <EnhancePanel
          content={enhanced}
          streaming={streaming}
          version={version}
          versions={history.map((h) => h.version)}
          onSelectVersion={selectVersion}
          error={enhanceError}
          onEnhance={() => void enhance()}
          unansweredCount={gaps.length}
        />
        <p className="text-center text-xs text-muted-foreground">
          Your prompts are stored in the LMS and sent to Anthropic&apos;s API to analyse them.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Run the new tests and the unchanged enhancer tests**

```bash
cd "/Users/tharunkumarl/Full Stack/lms/apps/web"
git diff --stat -- "src/app/(app)/prompt-bot/[sessionId]/workspace.test.ts"
npx vitest run src/components/prompt-bot "src/app/(app)/prompt-bot" src/lib/prompt-bot
npx tsc --noEmit && npx eslint src/components/prompt-bot "src/app/(app)/prompt-bot" src/lib/prompt-bot
```
Expected: the `git diff` prints nothing (the workspace test is untouched); every test passes, including all nine workspace tests and the status component tests; no type or lint errors.

- [ ] **Step 7: Commit**

```bash
cd "/Users/tharunkumarl/Full Stack/lms"
git add apps/web/src/lib/prompt-bot/client.ts apps/web/src/lib/prompt-bot/client.test.ts apps/web/src/components/prompt-bot/use-matrix-answers.ts apps/web/src/components/prompt-bot/use-matrix-answers.test.ts apps/web/src/components/prompt-bot/matrix-panel.tsx apps/web/src/components/prompt-bot/matrix-panel.test.ts "apps/web/src/app/(app)/prompt-bot/[sessionId]/workspace.tsx"
git commit -m "refactor(prompt-bot): share matrix answer state and the matrix panel"
```

---

### Task 16: Tabs, skills client and the Skills Builder start page

Before writing UI code in this task, invoke the `impeccable` skill.

**Files:**
- Create: `apps/web/src/lib/skills/client.ts`
- Create: `apps/web/src/components/prompt-bot/prompt-bot-tabs.tsx`
- Create: `apps/web/src/app/(app)/prompt-bot/layout.tsx`
- Create: `apps/web/src/app/(app)/prompt-bot/skills/page.tsx`
- Create: `apps/web/src/app/(app)/prompt-bot/skills/new-pack-form.tsx`
- Test: `apps/web/src/lib/skills/client.test.ts`, `apps/web/src/components/prompt-bot/prompt-bot-tabs.test.ts`, `apps/web/src/app/(app)/prompt-bot/skills/skills-page.test.ts`

**Interfaces:**
- Consumes: `call`, `ScoreReply` (Task 15), the HTTP routes of Tasks 10–13, `NotConfigured`, `canEditMatrices`, `isAiConfigured`.
- Produces:
  - `skillPackUrl(packId): string`, `createPack(description, role)`, `patchPack(packId, { title })`, `addItem(packId, { name, purpose })`, `getItem(packId, itemId)`, `patchItem(packId, itemId, { name?, purpose?, order? })`, `deleteItem(packId, itemId)`, `saveItemAnswer(packId, itemId, questionId, patch)`, `scoreItem(packId, itemId, revision)`, `requestGenerate(packId, itemId)`, `saveItemFiles(packId, itemId, files)` — all return `Promise<CallResult<…>>`
  - `downloadZip(url: string): Promise<{ ok: true } | { ok: false; message: string }>` (fetches, saves the file under the server's filename, reports the server's error message)
  - `isSkillsPath(pathname: string): boolean`, `PromptBotTabs()` ("Prompt Bot" and "Skills Builder" links with `aria-current="page"`)
  - `NewPackForm()`; page `/prompt-bot/skills`

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/src/lib/skills/client.test.ts
/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPack, downloadZip } from "./client";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("skills client", () => {
  it("leaves out a blank role", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, data: { id: "p1" } }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    await createPack("I write reports.", "   ");
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ description: "I write reports." });
  });

  it("reports the server's message when a download is refused", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ success: false, error: { code: "NOTHING_TO_DOWNLOAD", message: "Generate a skill first." } }), { status: 409 })),
    );
    expect(await downloadZip("/x")).toEqual({ ok: false, message: "Generate a skill first." });
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
    expect(await downloadZip("/x")).toEqual({ ok: true });
    expect(click).toHaveBeenCalledTimes(1);
  });
});
```

```ts
// apps/web/src/components/prompt-bot/prompt-bot-tabs.test.ts
/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/prompt-bot" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));
afterEach(cleanup);

import { PromptBotTabs } from "./prompt-bot-tabs";

describe("PromptBotTabs", () => {
  it.each([
    ["/prompt-bot", "Prompt Bot"],
    ["/prompt-bot/cm123abc", "Prompt Bot"],
    ["/prompt-bot/matrices", "Prompt Bot"],
    ["/prompt-bot/skills", "Skills Builder"],
    ["/prompt-bot/skills/p1", "Skills Builder"],
    ["/prompt-bot/catalog", "Skills Builder"],
  ])("marks the current area for %s", (pathname, current) => {
    nav.pathname = pathname;
    render(createElement(PromptBotTabs));
    for (const name of ["Prompt Bot", "Skills Builder"]) {
      expect(screen.getByRole("link", { name }).getAttribute("aria-current")).toBe(name === current ? "page" : null);
    }
  });

  it("links to both areas", () => {
    render(createElement(PromptBotTabs));
    expect(screen.getByRole("link", { name: "Prompt Bot" }).getAttribute("href")).toBe("/prompt-bot");
    expect(screen.getByRole("link", { name: "Skills Builder" }).getAttribute("href")).toBe("/prompt-bot/skills");
  });
});
```

```ts
// apps/web/src/app/(app)/prompt-bot/skills/skills-page.test.ts
/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), isAiConfigured: vi.fn(), findMany: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/ai/config", () => ({ isAiConfigured: mocks.isAiConfigured }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { skillPack: { findMany: mocks.findMany } } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), redirect: mocks.redirect }));
afterEach(cleanup);

import SkillsBuilderPage from "./page";

const PACK = {
  id: "p1",
  title: "Board pack",
  updatedAt: new Date("2026-11-24T10:00:00Z"),
  items: [
    { kind: "CUSTOM", status: "READY" },
    { kind: "CUSTOM", status: "DRAFT" },
    { kind: "CATALOG", status: "DRAFT" },
  ],
};

describe("Skills Builder start page", () => {
  it("shows the new-pack form and the user's own packs", async () => {
    mocks.isAiConfigured.mockReturnValue(true);
    mocks.getCurrentUser.mockResolvedValue({ id: "p1user", role: "MENTEE" });
    mocks.findMany.mockResolvedValue([PACK]);
    render(await SkillsBuilderPage());
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "p1user" } }));
    expect(screen.getByRole("heading", { name: "Skills Builder" })).toBeTruthy();
    expect(screen.getByLabelText("Describe a task or your day-to-day work")).toBeTruthy();
    expect(screen.getByLabelText(/Your role/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Board pack/ }).getAttribute("href")).toBe("/prompt-bot/skills/p1");
    expect(screen.getByText("2 skills · 1 ready")).toBeTruthy();
    expect(screen.getByText(/sent to Anthropic's API to build your skills/)).toBeTruthy();
  });

  it("shows the not-configured panel, with the variable name only for admins", async () => {
    mocks.isAiConfigured.mockReturnValue(false);
    mocks.findMany.mockResolvedValue([]);
    mocks.getCurrentUser.mockResolvedValue({ id: "a1", role: "ADMIN" });
    render(await SkillsBuilderPage());
    expect(screen.getByText("Prompt Bot isn't configured yet")).toBeTruthy();
    expect(screen.getByText(/ANTHROPIC_API_KEY/)).toBeTruthy();
    expect(screen.queryByLabelText("Describe a task or your day-to-day work")).toBeNull();
  });

  it("links to the catalog only for coaches and admins", async () => {
    mocks.isAiConfigured.mockReturnValue(true);
    mocks.findMany.mockResolvedValue([]);
    mocks.getCurrentUser.mockResolvedValue({ id: "c1", role: "MENTOR" });
    render(await SkillsBuilderPage());
    expect(screen.getByRole("link", { name: /Manage skill catalog/ }).getAttribute("href")).toBe("/prompt-bot/catalog");
    cleanup();
    mocks.getCurrentUser.mockResolvedValue({ id: "p1user", role: "MENTEE" });
    render(await SkillsBuilderPage());
    expect(screen.queryByRole("link", { name: /Manage skill catalog/ })).toBeNull();
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/lib/skills/client.test.ts src/components/prompt-bot/prompt-bot-tabs.test.ts "src/app/(app)/prompt-bot/skills/skills-page.test.ts"`
Expected: FAIL, failed to resolve `./client`, `./prompt-bot-tabs` and `./page`.

- [ ] **Step 3: Write the client helpers**

```ts
// apps/web/src/lib/skills/client.ts
import { call, type ScoreReply } from "@/lib/prompt-bot/client";
import type { SkillFile, SkillItemView, SkillPackView } from "./types";

export const skillPackUrl = (packId: string) => `/api/v1/prompt-bot/skill-packs/${packId}`;
const itemUrl = (packId: string, itemId: string) => `${skillPackUrl(packId)}/items/${itemId}`;
const send = (method: string, body?: unknown): RequestInit => ({ method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

export const createPack = (description: string, role: string) =>
  call<SkillPackView>("/api/v1/prompt-bot/skill-packs", send("POST", { description, ...(role.trim() ? { role: role.trim() } : {}) }));
export const patchPack = (packId: string, patch: { title: string }) => call<SkillPackView>(skillPackUrl(packId), send("PATCH", patch));
export const addItem = (packId: string, input: { name: string; purpose: string }) =>
  call<SkillItemView>(`${skillPackUrl(packId)}/items`, send("POST", input));
export const getItem = (packId: string, itemId: string) => call<SkillItemView>(itemUrl(packId, itemId));
export const patchItem = (packId: string, itemId: string, patch: { name?: string; purpose?: string; order?: number }) =>
  call<SkillItemView>(itemUrl(packId, itemId), send("PATCH", patch));
export const deleteItem = (packId: string, itemId: string) => call<{ deleted: true }>(itemUrl(packId, itemId), send("DELETE"));
export const saveItemAnswer = (packId: string, itemId: string, questionId: string, patch: { answer?: string; notRelevant?: boolean }) =>
  call<{ saved: true }>(`${itemUrl(packId, itemId)}/answers/${questionId}`, send("PUT", patch));
export const scoreItem = (packId: string, itemId: string, revision: number) =>
  call<ScoreReply>(`${itemUrl(packId, itemId)}/score`, send("POST", { revision }));
export const requestGenerate = (packId: string, itemId: string) => call<SkillItemView>(`${itemUrl(packId, itemId)}/generate`, send("POST"));
export const saveItemFiles = (packId: string, itemId: string, files: SkillFile[]) =>
  call<SkillItemView>(`${itemUrl(packId, itemId)}/files`, send("PATCH", { files }));

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

- [ ] **Step 4: Write the tabs and the layout**

```tsx
// apps/web/src/components/prompt-bot/prompt-bot-tabs.tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function isSkillsPath(pathname: string): boolean {
  return pathname === "/prompt-bot/skills" || pathname.startsWith("/prompt-bot/skills/") || pathname === "/prompt-bot/catalog";
}

const TABS = [
  { href: "/prompt-bot", label: "Prompt Bot", skills: false },
  { href: "/prompt-bot/skills", label: "Skills Builder", skills: true },
];

export function PromptBotTabs() {
  const inSkills = isSkillsPath(usePathname() ?? "");
  return (
    <nav
      aria-label="Prompt Bot sections"
      className="mx-auto mb-6 flex w-fit items-center gap-1 rounded-xl bg-white/35 p-1 text-sm shadow-[inset_0_1px_rgba(255,255,255,.72)] dark:bg-white/5"
    >
      {TABS.map((tab) => {
        const current = tab.skills === inSkills;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={current ? "page" : undefined}
            className={cn(
              "rounded-lg px-3 py-2 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
              current ? "bg-white/85 text-primary shadow-sm dark:bg-white/10" : "text-muted-foreground hover:bg-white/65 hover:text-primary dark:hover:bg-white/10",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
```

```tsx
// apps/web/src/app/(app)/prompt-bot/layout.tsx
import type { ReactNode } from "react";
import { PromptBotTabs } from "@/components/prompt-bot/prompt-bot-tabs";

export default function PromptBotLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <PromptBotTabs />
      {children}
    </>
  );
}
```

- [ ] **Step 5: Write the start page and the form**

```tsx
// apps/web/src/app/(app)/prompt-bot/skills/new-pack-form.tsx
"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createPack } from "@/lib/skills/client";

export function NewPackForm() {
  const router = useRouter();
  const [description, setDescription] = React.useState("");
  const [role, setRole] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!description.trim() || busy) return;
    setBusy(true);
    const result = await createPack(description, role);
    if (result.ok) router.push(`/prompt-bot/skills/${result.data.id}`);
    else {
      toast.error(result.message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="glass rounded-[1.75rem] p-5">
      <label htmlFor="skills-description" className="text-sm font-medium">
        Describe a task or your day-to-day work
      </label>
      <Textarea
        id="skills-description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit(e);
        }}
        placeholder="e.g. Every Monday I review the sales numbers, write a board update and plan the team's week"
        className="mt-2 min-h-32 resize-y bg-white/60 dark:bg-white/5"
      />
      <label htmlFor="skills-role" className="mt-4 block text-sm font-medium">
        Your role <span className="font-normal text-muted-foreground">(optional)</span>
      </label>
      <Input
        id="skills-role"
        value={role}
        maxLength={200}
        onChange={(e) => setRole(e.target.value)}
        placeholder="e.g. CTO of a 200-person SaaS company"
        className="mt-2 bg-white/60 dark:bg-white/5"
      />
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">We&apos;ll propose skills to build and existing ones to use.</span>
        <Button type="submit" disabled={!description.trim() || busy}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
          {busy ? "Building your list…" : "Build skill list"}
        </Button>
      </div>
    </form>
  );
}
```

```tsx
// apps/web/src/app/(app)/prompt-bot/skills/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { Clock3, Library } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { isAiConfigured } from "@/lib/ai/config";
import { prisma } from "@/lib/db/prisma";
import { canEditMatrices } from "@/lib/prompt-bot/matrix-input";
import { NotConfigured } from "@/components/prompt-bot/not-configured";
import { NewPackForm } from "./new-pack-form";

export default async function SkillsBuilderPage() {
  const user = await getCurrentUser();
  if (!user) return redirect("/login");
  const packs = await prisma.skillPack.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    take: 20,
    select: { id: true, title: true, updatedAt: true, items: { select: { kind: true, status: true } } },
  });
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Skills Builder</h1>
        <p className="mt-2 text-muted-foreground">
          Turn a task or your day-to-day work into reusable AI skills for Claude, Cursor, Codex and other tools.
        </p>
      </header>
      {canEditMatrices(user.role) && (
        <div className="flex justify-center">
          <Link
            href="/prompt-bot/catalog"
            className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <Library className="size-4" aria-hidden /> Manage skill catalog
          </Link>
        </div>
      )}
      {isAiConfigured() ? <NewPackForm /> : <NotConfigured isAdmin={user.role === "ADMIN"} />}
      {packs.length > 0 && (
        <section className="glass rounded-[1.75rem] p-5" aria-labelledby="your-packs">
          <h2 id="your-packs" className="text-sm font-medium text-muted-foreground">Your skill packs</h2>
          <ul className="mt-3 divide-y divide-border/60">
            {packs.map((pack) => {
              const custom = pack.items.filter((i) => i.kind === "CUSTOM");
              const ready = custom.filter((i) => i.status === "READY").length;
              return (
                <li key={pack.id}>
                  <Link
                    href={`/prompt-bot/skills/${pack.id}`}
                    className="flex items-center justify-between gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-white/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 dark:hover:bg-white/5"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{pack.title}</span>
                      <span className="block text-xs text-muted-foreground">
                        {custom.length} {custom.length === 1 ? "skill" : "skills"} · {ready} ready
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                      <Clock3 className="size-3.5" aria-hidden />
                      {pack.updatedAt.toLocaleDateString()}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <p className="text-center text-xs text-muted-foreground">
        Your descriptions and answers are stored in the LMS and sent to Anthropic&apos;s API to build your skills.
      </p>
    </div>
  );
}
```

- [ ] **Step 6: Run the tests and the enhancer page tests, then commit**

Run: `npx vitest run src/lib/skills/client.test.ts src/components/prompt-bot "src/app/(app)/prompt-bot" && npx tsc --noEmit` → PASS (the enhancer's page tests still pass with the new layout).
```bash
cd "/Users/tharunkumarl/Full Stack/lms"
git add apps/web/src/lib/skills/client.ts apps/web/src/lib/skills/client.test.ts apps/web/src/components/prompt-bot/prompt-bot-tabs.tsx apps/web/src/components/prompt-bot/prompt-bot-tabs.test.ts "apps/web/src/app/(app)/prompt-bot/layout.tsx" "apps/web/src/app/(app)/prompt-bot/skills/page.tsx" "apps/web/src/app/(app)/prompt-bot/skills/new-pack-form.tsx" "apps/web/src/app/(app)/prompt-bot/skills/skills-page.test.ts"
git commit -m "feat(skills-builder): Skills Builder tab, start page and new-pack form"
```

---

### Task 17: Skill preview (file tree, rendered SKILL.md, editor, downloads)

Before writing UI code in this task, invoke the `impeccable` skill.

**Files:**
- Modify: `apps/web/package.json` (via npm: `react-markdown`)
- Create: `apps/web/src/components/prompt-bot/skills/file-tree.tsx`
- Create: `apps/web/src/components/prompt-bot/skills/skill-markdown.tsx`
- Create: `apps/web/src/app/(app)/prompt-bot/skills/[packId]/skill-preview.tsx`
- Test: `apps/web/src/components/prompt-bot/skills/file-tree.test.ts`, `apps/web/src/app/(app)/prompt-bot/skills/[packId]/skill-preview.test.ts`

**Interfaces:**
- Consumes: `splitFrontmatter` (Task 5), `downloadZip`, `getItem`, `requestGenerate`, `saveItemFiles`, `skillPackUrl` (Task 16), types (Task 5).
- Produces:
  - `FileGroup = { folder: string | null; files: SkillFile[] }`, `groupFiles(files): FileGroup[]` (root first with `SKILL.md` on top, then `references`, `scripts`, `assets`, then anything else; sorted by path inside a group)
  - `FileTree({ files, selected, onSelect })`
  - `SkillMarkdown({ content })` (frontmatter in a labelled block, body rendered as Markdown with no raw HTML)
  - `POLL_MS = 3000`, `SkillPreview({ packId, item, readyCount, onItemChange, onRefine, onDirtyChange })`

- [ ] **Step 1: Install the Markdown renderer**

```bash
cd "/Users/tharunkumarl/Full Stack/lms"
npm install react-markdown --workspace=apps/web
```

- [ ] **Step 2: Write the failing tests**

```ts
// apps/web/src/components/prompt-bot/skills/file-tree.test.ts
/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FileTree, groupFiles } from "./file-tree";

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
});
```

```ts
// apps/web/src/app/(app)/prompt-bot/skills/[packId]/skill-preview.test.ts
/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SkillItemView } from "@/lib/skills/types";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { SkillPreview } from "./skill-preview";

const SKILL_MD = '---\nname: board-update\ndescription: "Writes the board update."\n---\n\n# Board update\n\nRead the notes first.\n';
const item = (over: Partial<SkillItemView> = {}): SkillItemView => ({
  id: "i1",
  order: 0,
  kind: "CUSTOM",
  name: "board-update",
  purpose: "Writes the board update.",
  status: "READY",
  files: [
    { path: "SKILL.md", content: SKILL_MD },
    { path: "references/context.md", content: "Context" },
    { path: "scripts/count.py", content: "print(1)" },
  ],
  validationErrors: [],
  scoreRevision: 0,
  answers: [],
  catalog: null,
  ...over,
});

type Call = { url: string; method: string; body: string | null };
let calls: Call[];
let route: (call: Call) => Response;
const ok = (data: unknown, status = 200) => new Response(JSON.stringify({ success: true, data }), { status, headers: { "content-type": "application/json" } });

const mount = (it: SkillItemView = item(), extra: Record<string, unknown> = {}) => {
  const props = { packId: "p1", item: it, readyCount: 1, onItemChange: vi.fn(), onRefine: vi.fn(), onDirtyChange: vi.fn(), ...extra };
  render(createElement(SkillPreview, props));
  return props;
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  calls = [];
  route = () => ok({});
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const call = { url, method: init?.method ?? "GET", body: (init?.body as string) ?? null };
      calls.push(call);
      return route(call);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("SkillPreview", () => {
  it("renders SKILL.md first and lets the user switch to editing it", () => {
    mount();
    expect(screen.getByRole("heading", { name: "Board update" })).toBeTruthy();
    expect(screen.getByLabelText("Frontmatter").textContent).toContain("name: board-update");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect((screen.getByRole("textbox", { name: "Contents of SKILL.md" }) as HTMLTextAreaElement).value).toBe(SKILL_MD);
  });

  it("shows the script notice only for files in scripts/", () => {
    mount();
    expect(screen.queryByText(/Review scripts before running them/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "count.py" }));
    expect(screen.getByRole("note").textContent).toMatch(/Review scripts before running them/);
    fireEvent.click(screen.getByRole("button", { name: "context.md" }));
    expect(screen.queryByText(/Review scripts before running them/)).toBeNull();
  });

  it("saves every file and shows the server's validation errors", async () => {
    route = (call) =>
      call.url.endsWith("/files")
        ? new Response(
            JSON.stringify({ success: false, error: { code: "VALIDATION_ERROR", message: "Fix these problems before saving the skill.", details: { files: ['"references/context.md": example problem'] } } }),
            { status: 400, headers: { "content-type": "application/json" } },
          )
        : ok({});
    const props = mount();
    fireEvent.click(screen.getByRole("button", { name: "context.md" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Contents of references/context.md" }), { target: { value: "Edited" } });
    expect(props.onDirtyChange).toHaveBeenLastCalledWith(true);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Save and check/ }));
      await vi.advanceTimersByTimeAsync(0);
    });
    const patch = calls.find((c) => c.method === "PATCH")!;
    expect(patch.url).toBe("/api/v1/prompt-bot/skill-packs/p1/items/i1/files");
    expect(JSON.parse(patch.body!).files).toEqual([
      { path: "SKILL.md", content: SKILL_MD },
      { path: "references/context.md", content: "Edited" },
      { path: "scripts/count.py", content: "print(1)" },
    ]);
    expect(screen.getByRole("alert").textContent).toContain("example problem");
  });

  it("polls while the skill is being written and then shows its files", async () => {
    route = (call) => (call.url.endsWith("/items/i1") ? ok(item()) : ok({}));
    const props = mount(item({ status: "GENERATING", files: null }));
    expect(screen.getByRole("status").textContent).toMatch(/Writing your skill/);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(props.onItemChange).toHaveBeenCalledWith(expect.objectContaining({ status: "READY" }));
    expect(screen.getByRole("button", { name: "SKILL.md" })).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("offers Refine and generate for a skill without files, and blocks downloads until one is ready", () => {
    const props = mount(item({ status: "DRAFT", files: null }), { readyCount: 0 });
    fireEvent.click(screen.getByRole("button", { name: /Refine and generate/ }));
    expect(props.onRefine).toHaveBeenCalled();
    expect((screen.getByRole("button", { name: /Download skill/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: /Download pack/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});
```

- [ ] **Step 3: Run them and watch them fail**

Run: `npx vitest run src/components/prompt-bot/skills/file-tree.test.ts "src/app/(app)/prompt-bot/skills/[packId]/skill-preview.test.ts"`
Expected: FAIL, failed to resolve `./file-tree` and `./skill-preview`.

- [ ] **Step 4: Implement the file tree and the Markdown view**

```tsx
// apps/web/src/components/prompt-bot/skills/file-tree.tsx
"use client";
import { FileCode, FileText, Folder } from "lucide-react";
import type { SkillFile } from "@/lib/skills/types";
import { cn } from "@/lib/utils";

const FOLDER_ORDER = ["references", "scripts", "assets"];
const rank = (folder: string) => {
  const i = FOLDER_ORDER.indexOf(folder);
  return i === -1 ? FOLDER_ORDER.length : i;
};

export type FileGroup = { folder: string | null; files: SkillFile[] };

export function groupFiles(files: SkillFile[]): FileGroup[] {
  const root = files
    .filter((f) => !f.path.includes("/"))
    .sort((a, b) => (a.path === "SKILL.md" ? -1 : b.path === "SKILL.md" ? 1 : a.path.localeCompare(b.path)));
  const byFolder = new Map<string, SkillFile[]>();
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

export function FileTree({ files, selected, onSelect }: { files: SkillFile[]; selected: string | null; onSelect(path: string): void }) {
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
                const Icon = file.path.startsWith("scripts/") ? FileCode : FileText;
                const current = file.path === selected;
                return (
                  <li key={file.path}>
                    <button
                      type="button"
                      onClick={() => onSelect(file.path)}
                      aria-current={current ? "true" : undefined}
                      title={file.path}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left font-mono text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
                        group.folder && "pl-6",
                        current ? "bg-primary/10 text-primary" : "text-foreground hover:bg-white/60 dark:hover:bg-white/10",
                      )}
                    >
                      <Icon className="size-3.5 shrink-0" aria-hidden />
                      <span className="truncate">{label}</span>
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

```tsx
// apps/web/src/components/prompt-bot/skills/skill-markdown.tsx
import ReactMarkdown from "react-markdown";
import { splitFrontmatter } from "@/lib/skills/frontmatter";

const BODY =
  "text-sm leading-relaxed [&_a]:text-primary [&_a]:underline [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-xs dark:[&_code]:bg-white/10 [&_h1]:mt-4 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:mt-5 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mt-4 [&_h3]:font-semibold [&_li]:mt-1 [&_ol]:mt-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mt-2 [&_pre]:mt-3 [&_pre]:overflow-auto [&_pre]:rounded-xl [&_pre]:bg-muted [&_pre]:p-3 dark:[&_pre]:bg-white/5 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5";

/** SKILL.md as the reader sees it: the frontmatter as-is, the body as Markdown (react-markdown renders no raw HTML). */
export function SkillMarkdown({ content }: { content: string }) {
  const parts = splitFrontmatter(content);
  return (
    <div className="mt-3 rounded-2xl bg-white/60 p-4 dark:bg-white/5">
      {parts && (
        <pre aria-label="Frontmatter" className="overflow-auto whitespace-pre-wrap rounded-xl bg-muted px-3 py-2 font-mono text-xs dark:bg-white/10">
          {parts.frontmatter}
        </pre>
      )}
      <div className={BODY}>
        <ReactMarkdown>{parts ? parts.body : content}</ReactMarkdown>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Implement the preview**

```tsx
// apps/web/src/app/(app)/prompt-bot/skills/[packId]/skill-preview.tsx
"use client";
import * as React from "react";
import { AlertTriangle, Download, Loader2, PackageOpen, RotateCcw, Save, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FileTree } from "@/components/prompt-bot/skills/file-tree";
import { SkillMarkdown } from "@/components/prompt-bot/skills/skill-markdown";
import { downloadZip, getItem, requestGenerate, saveItemFiles, skillPackUrl } from "@/lib/skills/client";
import type { SkillFile, SkillItemStatus, SkillItemView } from "@/lib/skills/types";
import { cn } from "@/lib/utils";

export const POLL_MS = 3000;

type Props = {
  packId: string;
  item: SkillItemView;
  readyCount: number;
  onItemChange(item: SkillItemView): void;
  onRefine(): void;
  onDirtyChange(dirty: boolean): void;
};

const firstFile = (files: SkillFile[]) => files.find((f) => f.path === "SKILL.md")?.path ?? files[0]?.path ?? null;

export function SkillPreview({ packId, item, readyCount, onItemChange, onRefine, onDirtyChange }: Props) {
  const [status, setStatus] = React.useState<SkillItemStatus>(item.status);
  const [saved, setSaved] = React.useState<SkillFile[]>(item.files ?? []);
  const [files, setFiles] = React.useState<SkillFile[]>(item.files ?? []);
  const [errors, setErrors] = React.useState<string[]>(item.validationErrors);
  const [selected, setSelected] = React.useState<string | null>(() => firstFile(item.files ?? []));
  const [mode, setMode] = React.useState<"preview" | "edit">("preview");
  const [busy, setBusy] = React.useState<"save" | "retry" | null>(null);
  const generating = status === "GENERATING";
  const dirty = JSON.stringify(files) !== JSON.stringify(saved);
  const current = files.find((f) => f.path === selected) ?? null;

  React.useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  function adopt(next: SkillItemView) {
    onItemChange(next);
    const nextFiles = next.files ?? [];
    setStatus(next.status);
    setSaved(nextFiles);
    setFiles(nextFiles);
    setErrors(next.validationErrors);
    setSelected((path) => (path && nextFiles.some((f) => f.path === path) ? path : firstFile(nextFiles)));
  }
  const adoptRef = React.useRef(adopt);
  React.useEffect(() => {
    adoptRef.current = adopt;
  });

  // Generation runs after the request returns (App Runner's 120 s limit), so poll until it settles.
  React.useEffect(() => {
    if (!generating) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const result = await getItem(packId, item.id);
      if (cancelled) return;
      if (result.ok && result.data.status !== "GENERATING") adoptRef.current(result.data);
      else timer = setTimeout(poll, POLL_MS);
    };
    timer = setTimeout(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [generating, packId, item.id]);

  function updateFile(path: string, content: string) {
    setFiles((prev) => prev.map((f) => (f.path === path ? { ...f, content } : f)));
  }

  async function save() {
    setBusy("save");
    const result = await saveItemFiles(packId, item.id, files);
    setBusy(null);
    if (!result.ok) {
      setErrors(result.details?.files ?? [result.message]);
      return;
    }
    adopt(result.data);
    toast.success("Skill saved");
  }

  async function retry() {
    setBusy("retry");
    const result = await requestGenerate(packId, item.id);
    setBusy(null);
    if (!result.ok) return void toast.error(result.message);
    adopt(result.data);
  }

  async function download(url: string) {
    const result = await downloadZip(url);
    if (!result.ok) toast.error(result.message);
  }

  const toggle = (value: "preview" | "edit", label: string) => (
    <button
      type="button"
      aria-pressed={mode === value}
      onClick={() => setMode(value)}
      className={cn(
        "rounded-lg px-2.5 py-1 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
        mode === value ? "bg-white text-foreground shadow-sm dark:bg-white/15" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );

  return (
    <section className="glass rounded-[1.75rem] p-5" aria-labelledby="preview-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="preview-heading" className="truncate font-mono text-lg font-semibold">{item.name}</h2>
          <p className="text-sm text-muted-foreground">{item.purpose}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={status !== "READY" || dirty} onClick={() => void download(`${skillPackUrl(packId)}/items/${item.id}/download`)}>
            <Download className="size-4" aria-hidden />
            Download skill
          </Button>
          <Button size="sm" disabled={readyCount === 0 || dirty} onClick={() => void download(`${skillPackUrl(packId)}/download`)}>
            <PackageOpen className="size-4" aria-hidden />
            Download pack
          </Button>
        </div>
      </div>

      {generating && (
        <p role="status" className="mt-4 flex items-center gap-2 rounded-xl bg-primary/5 px-3 py-2 text-sm">
          <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
          Writing your skill. This can take a minute or two.
        </p>
      )}
      {!generating && errors.length > 0 && (
        <div role="alert" className="mt-4 rounded-2xl bg-destructive/10 p-4 text-sm text-destructive">
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="size-4" aria-hidden />
            This skill needs fixing before it can be downloaded
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void retry()} disabled={busy !== null}>
            {busy === "retry" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RotateCcw className="size-4" aria-hidden />}
            Retry generation
          </Button>
        </div>
      )}

      {files.length === 0 ? (
        !generating && (
          <div className="mt-6 flex flex-col items-center gap-3 py-6 text-center text-sm text-muted-foreground">
            <p>This skill hasn&apos;t been written yet.</p>
            <Button onClick={onRefine}>
              <Wand2 className="size-4" aria-hidden />
              Refine and generate
            </Button>
          </div>
        )
      ) : (
        <div className="mt-5 grid gap-4 md:grid-cols-[14rem_minmax(0,1fr)]">
          <FileTree
            files={files}
            selected={selected}
            onSelect={(path) => {
              setSelected(path);
              setMode("preview");
            }}
          />
          <div className="min-w-0">
            {current && (
              <>
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-mono text-sm">{current.path}</p>
                  {current.path === "SKILL.md" && (
                    <div role="group" aria-label="View" className="flex rounded-xl bg-muted p-0.5 text-xs dark:bg-white/5">
                      {toggle("preview", "Preview")}
                      {toggle("edit", "Edit")}
                    </div>
                  )}
                </div>
                {current.path.startsWith("scripts/") && (
                  <p role="note" className="mt-3 flex items-start gap-2 rounded-xl bg-amber-400/15 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                    Review scripts before running them. The LMS never runs them for you.
                  </p>
                )}
                {current.path === "SKILL.md" && mode === "preview" ? (
                  <SkillMarkdown content={current.content} />
                ) : (
                  <Textarea
                    aria-label={`Contents of ${current.path}`}
                    value={current.content}
                    disabled={generating}
                    spellCheck={false}
                    onChange={(e) => updateFile(current.path, e.target.value)}
                    className="mt-3 min-h-[26rem] bg-white/60 font-mono text-xs leading-relaxed dark:bg-white/5"
                  />
                )}
              </>
            )}
          </div>
        </div>
      )}

      {files.length > 0 && (
        <div className="mt-4 flex items-center justify-end gap-3">
          {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
          <Button onClick={() => void save()} disabled={generating || busy !== null || !(dirty || status === "FAILED")}>
            {busy === "save" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
            Save and check
          </Button>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 6: Run them and watch them pass, then commit**

Run: `npx vitest run src/components/prompt-bot/skills "src/app/(app)/prompt-bot/skills" && npx tsc --noEmit && npx eslint src/components/prompt-bot "src/app/(app)/prompt-bot/skills"` → PASS.
```bash
cd "/Users/tharunkumarl/Full Stack/lms"
git add apps/web/package.json package-lock.json apps/web/src/components/prompt-bot/skills "apps/web/src/app/(app)/prompt-bot/skills/[packId]/skill-preview.tsx" "apps/web/src/app/(app)/prompt-bot/skills/[packId]/skill-preview.test.ts"
git commit -m "feat(skills-builder): skill preview with file tree, rendered SKILL.md, editor and script notice"
```

---

### Task 18: Pack page (steps, skills list, refine)

Before writing UI code in this task, invoke the `impeccable` skill.

**Files:**
- Create: `apps/web/src/app/(app)/prompt-bot/skills/[packId]/page.tsx`
- Create: `apps/web/src/app/(app)/prompt-bot/skills/[packId]/pack-view.tsx`
- Create: `apps/web/src/app/(app)/prompt-bot/skills/[packId]/skills-list.tsx`
- Create: `apps/web/src/app/(app)/prompt-bot/skills/[packId]/skill-refine.tsx`
- Test: `apps/web/src/app/(app)/prompt-bot/skills/[packId]/pack-view.test.ts`

**Interfaces:**
- Consumes: `MatrixPanel`, `useMatrixAnswers`, `useActiveQuestion` (Task 15), `unansweredQuestionIds`, skills client (Task 16), `SkillPreview` (Task 17), `loadPackView` (Task 9), `NotConfigured`, `ConfirmDialog`, `Badge`.
- Produces:
  - `STATUS_BADGE: Record<SkillItemStatus, { label: string; variant: "secondary" | "warning" | "success" | "destructive" }>`
  - `SkillsList({ pack, onItemsChange, onRefine, onPreview })` — "Build custom" (rename, remove, add) and "Use existing" catalog cards
  - `SkillRefine({ packId, item, matrix, onItemChange, onGenerated })` — the enhancer's two-column layout for one custom skill, with the Generate warning
  - `PackView({ initial })` — three steps: Skills, Refine, Preview and download; refine panes stay mounted (hidden) once opened, so pending saves and scores are never dropped when switching steps
  - page `/prompt-bot/skills/[packId]`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/app/(app)/prompt-bot/skills/[packId]/pack-view.test.ts
/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SkillItemView, SkillPackView } from "@/lib/skills/types";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { PackView } from "./pack-view";

const MATRIX = {
  id: "pbm_skill_definition",
  name: "Skill definition",
  questions: [
    { id: "pbq_skill_1", text: "When should this skill be used?", guidance: "Triggers", order: 0 },
    { id: "pbq_skill_2", text: "What context does it need to know?", guidance: "Background", order: 1 },
  ],
};
const custom = (over: Partial<SkillItemView> = {}): SkillItemView => ({
  id: "i1",
  order: 0,
  kind: "CUSTOM",
  name: "board-update",
  purpose: "Writes the board update.",
  status: "DRAFT",
  files: null,
  validationErrors: [],
  scoreRevision: 0,
  answers: [],
  catalog: null,
  ...over,
});
const SOURCE = "https://github.com/anthropics/skills/tree/main/skills/pptx";
const catalogItem: SkillItemView = {
  ...custom({ id: "i2", order: 1, kind: "CATALOG", name: "pptx", purpose: "Decks for the board." }),
  catalog: { id: "scat_pptx", slug: "pptx", name: "PowerPoint", sourceUrl: SOURCE, license: "source-available", bundlable: false, installNotes: "n" },
};
const PACK: SkillPackView = { id: "p1", title: "My week", description: "Weekly work.", role: null, matrix: MATRIX, items: [custom(), catalogItem] };

type Call = { url: string; method: string; body: string | null };
let calls: Call[];
let route: (call: Call) => Response;
const ok = (data: unknown, status = 200) => new Response(JSON.stringify({ success: true, data }), { status, headers: { "content-type": "application/json" } });
const tick = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
const steps = () => within(screen.getByRole("navigation", { name: "Steps" }));
const mount = (initial: SkillPackView = PACK) => render(createElement(PackView, { initial }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  calls = [];
  route = (call) => {
    if (call.url.endsWith("/score")) return ok({ applied: true, revision: 0, answers: [] });
    if (call.url.endsWith("/generate")) return ok(custom({ status: "GENERATING" }), 202);
    return ok({});
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const call = { url, method: init?.method ?? "GET", body: (init?.body as string) ?? null };
      calls.push(call);
      return route(call);
    }),
  );
  vi.stubGlobal("confirm", vi.fn(() => true));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("PackView", () => {
  it("starts on the skills step with custom skills and existing skills (license and source link)", () => {
    mount();
    expect(screen.getByRole("heading", { level: 1, name: "My week" })).toBeTruthy();
    expect(steps().getByRole("button", { name: "Skills" }).getAttribute("aria-current")).toBe("step");
    expect(screen.getByRole("heading", { name: "Build custom" })).toBeTruthy();
    expect(screen.getByText("board-update")).toBeTruthy();
    expect(screen.getByText("Draft")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Use existing" })).toBeTruthy();
    expect(screen.getByText("PowerPoint")).toBeTruthy();
    expect(screen.getByText("Decks for the board.")).toBeTruthy();
    expect(screen.getByText("source-available")).toBeTruthy();
    expect(screen.getByRole("link", { name: /View source/ }).getAttribute("href")).toBe(SOURCE);
  });

  it("opens Refine with the skill-definition questions and bars, and scores a skill that was never scored", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Refine board-update" }));
    expect(steps().getByRole("button", { name: "Refine" }).getAttribute("aria-current")).toBe("step");
    expect(screen.getByRole("heading", { level: 2, name: "Skill definition" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^1\.\s*When should this skill be used\?/ })).toBeTruthy();
    expect(screen.getAllByRole("meter")).toHaveLength(2);
    expect((screen.getByRole("textbox", { name: "Purpose" }) as HTMLTextAreaElement).value).toBe("Writes the board update.");
    await tick(1500);
    expect(calls.some((c) => c.url === "/api/v1/prompt-bot/skill-packs/p1/items/i1/score" && c.method === "POST")).toBe(true);
  });

  it("warns about unanswered questions before generating, then shows the preview while the skill is written", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Refine board-update" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Generate skill/ }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("2 questions not answered yet"));
    expect(calls.find((c) => c.url.endsWith("/generate"))?.method).toBe("POST");
    expect(steps().getByRole("button", { name: "Preview and download" }).getAttribute("aria-current")).toBe("step");
    expect(screen.getByRole("status").textContent).toMatch(/Writing your skill/);
  });

  it("adds a custom skill to the list", async () => {
    route = (call) => (call.url.endsWith("/items") ? ok(custom({ id: "i3", order: 2, name: "weekly-plan", purpose: "Plans the week." }), 201) : ok({}));
    mount();
    fireEvent.change(screen.getByLabelText("Skill name"), { target: { value: "Weekly plan" } });
    fireEvent.change(screen.getByLabelText("What it does"), { target: { value: "Plans the week." } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Add skill/ }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(JSON.parse(calls.find((c) => c.url.endsWith("/items"))!.body!)).toEqual({ name: "Weekly plan", purpose: "Plans the week." });
    expect(screen.getByText("weekly-plan")).toBeTruthy();
  });

  it("disables Refine and Preview when there are no custom skills", () => {
    mount({ ...PACK, items: [catalogItem] });
    expect((steps().getByRole("button", { name: "Refine" }) as HTMLButtonElement).disabled).toBe(true);
    expect((steps().getByRole("button", { name: "Preview and download" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/No custom skills yet/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run "src/app/(app)/prompt-bot/skills/[packId]/pack-view.test.ts"` → FAIL, failed to resolve `./pack-view`.

- [ ] **Step 3: Implement the skills list**

```tsx
// apps/web/src/app/(app)/prompt-bot/skills/[packId]/skills-list.tsx
"use client";
import * as React from "react";
import { ExternalLink, Eye, Pencil, Plus, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, type ConfirmDialogHandle } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { addItem, deleteItem, patchItem } from "@/lib/skills/client";
import type { SkillItemStatus, SkillItemView, SkillPackView } from "@/lib/skills/types";

export const STATUS_BADGE: Record<SkillItemStatus, { label: string; variant: "secondary" | "warning" | "success" | "destructive" }> = {
  DRAFT: { label: "Draft", variant: "secondary" },
  GENERATING: { label: "Writing…", variant: "warning" },
  READY: { label: "Ready", variant: "success" },
  FAILED: { label: "Needs fixing", variant: "destructive" },
};

type Props = {
  pack: SkillPackView;
  onItemsChange(items: SkillItemView[]): void;
  onRefine(itemId: string): void;
  onPreview(itemId: string): void;
};

export function SkillsList({ pack, onItemsChange, onRefine, onPreview }: Props) {
  const custom = pack.items.filter((i) => i.kind === "CUSTOM");
  const catalog = pack.items.filter((i) => i.kind === "CATALOG");
  const [renaming, setRenaming] = React.useState<string | null>(null);
  const [nameDraft, setNameDraft] = React.useState("");
  const [newName, setNewName] = React.useState("");
  const [newPurpose, setNewPurpose] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const confirmRef = React.useRef<ConfirmDialogHandle>(null);

  async function rename(item: SkillItemView) {
    const name = nameDraft.trim();
    setRenaming(null);
    if (!name || name === item.name) return;
    const result = await patchItem(pack.id, item.id, { name });
    if (!result.ok) return void toast.error(result.message);
    onItemsChange(pack.items.map((i) => (i.id === item.id ? result.data : i)));
  }

  async function remove(item: SkillItemView) {
    const confirmed = await confirmRef.current?.open({
      title: `Remove "${item.name}"?`,
      description: "Its answers and generated files are deleted too. This cannot be undone.",
      confirmLabel: "Remove skill",
      destructive: true,
    });
    if (!confirmed) return;
    const result = await deleteItem(pack.id, item.id);
    if (!result.ok) return void toast.error(result.message);
    onItemsChange(pack.items.filter((i) => i.id !== item.id));
  }

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (adding || !newName.trim() || !newPurpose.trim()) return;
    setAdding(true);
    const result = await addItem(pack.id, { name: newName.trim(), purpose: newPurpose.trim() });
    setAdding(false);
    if (!result.ok) return void toast.error(result.message);
    onItemsChange([...pack.items, result.data]);
    setNewName("");
    setNewPurpose("");
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <section className="glass rounded-[1.75rem] p-5" aria-labelledby="custom-heading">
        <h2 id="custom-heading" className="font-semibold">Build custom</h2>
        <p className="mt-1 text-sm text-muted-foreground">Skills written for your work. Refine each one, then generate it.</p>
        {custom.length === 0 && <p className="mt-4 text-sm text-muted-foreground">No custom skills yet. Add one below.</p>}
        <ul className="mt-4 flex flex-col gap-2">
          {custom.map((item) => (
            <li key={item.id} className="rounded-2xl border border-border/60 bg-white/45 p-3 dark:bg-white/5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  {renaming === item.id ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void rename(item);
                      }}
                    >
                      <label htmlFor={`rename-${item.id}`} className="sr-only">New name for {item.name}</label>
                      <Input
                        id={`rename-${item.id}`}
                        autoFocus
                        value={nameDraft}
                        maxLength={120}
                        onChange={(e) => setNameDraft(e.target.value)}
                        onBlur={() => void rename(item)}
                        className="h-8 font-mono text-sm"
                      />
                    </form>
                  ) : (
                    <p className="truncate font-mono text-sm font-medium">{item.name}</p>
                  )}
                  <p className="mt-1 text-sm text-muted-foreground">{item.purpose}</p>
                </div>
                <Badge variant={STATUS_BADGE[item.status].variant}>{STATUS_BADGE[item.status].label}</Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Button size="sm" onClick={() => onRefine(item.id)} aria-label={`Refine ${item.name}`}>
                  <Wand2 className="size-4" aria-hidden />
                  Refine
                </Button>
                {(item.files || item.status === "GENERATING") && (
                  <Button size="sm" variant="outline" onClick={() => onPreview(item.id)} aria-label={`Preview ${item.name}`}>
                    <Eye className="size-4" aria-hidden />
                    Preview
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={item.status === "GENERATING"}
                  onClick={() => {
                    setRenaming(item.id);
                    setNameDraft(item.name);
                  }}
                  aria-label={`Rename ${item.name}`}
                >
                  <Pencil className="size-4" aria-hidden />
                  Rename
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void remove(item)} aria-label={`Remove ${item.name}`}>
                  <Trash2 className="size-4" aria-hidden />
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
        <form onSubmit={add} className="mt-4 grid gap-2 rounded-2xl border border-dashed border-border p-3 sm:grid-cols-[12rem_minmax(0,1fr)_auto]">
          <label htmlFor="new-skill-name" className="sr-only">Skill name</label>
          <Input id="new-skill-name" value={newName} maxLength={120} onChange={(e) => setNewName(e.target.value)} placeholder="Skill name" />
          <label htmlFor="new-skill-purpose" className="sr-only">What it does</label>
          <Input id="new-skill-purpose" value={newPurpose} maxLength={300} onChange={(e) => setNewPurpose(e.target.value)} placeholder="What it does, in one line" />
          <Button type="submit" variant="outline" disabled={adding || !newName.trim() || !newPurpose.trim()}>
            <Plus className="size-4" aria-hidden />
            Add skill
          </Button>
        </form>
      </section>

      <section className="glass h-fit rounded-[1.75rem] p-5" aria-labelledby="existing-heading">
        <h2 id="existing-heading" className="font-semibold">Use existing</h2>
        <p className="mt-1 text-sm text-muted-foreground">Public skills that fit your work. Install them from their source.</p>
        {catalog.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No existing skills matched this work.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {catalog.map((item) => (
              <li key={item.id} className="rounded-2xl bg-white/45 p-3 dark:bg-white/5">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">{item.catalog?.name ?? item.name}</p>
                  {item.catalog && <Badge variant="outline">{item.catalog.license}</Badge>}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{item.purpose}</p>
                {item.catalog && (
                  <a
                    href={item.catalog.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1 rounded text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                  >
                    View source
                    <ExternalLink className="size-3.5" aria-hidden />
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <ConfirmDialog ref={confirmRef} />
    </div>
  );
}
```

- [ ] **Step 4: Implement the refine pane**

```tsx
// apps/web/src/app/(app)/prompt-bot/skills/[packId]/skill-refine.tsx
"use client";
import * as React from "react";
import { Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MatrixPanel } from "@/components/prompt-bot/matrix-panel";
import { useActiveQuestion, useMatrixAnswers } from "@/components/prompt-bot/use-matrix-answers";
import { unansweredQuestionIds } from "@/lib/prompt-bot/scoring";
import { patchItem, requestGenerate, saveItemAnswer, scoreItem } from "@/lib/skills/client";
import type { SkillItemView, SkillMatrixView } from "@/lib/skills/types";

type Props = {
  packId: string;
  item: SkillItemView;
  matrix: SkillMatrixView;
  onItemChange(item: SkillItemView): void;
  onGenerated(item: SkillItemView): void;
};

export function SkillRefine({ packId, item, matrix, onItemChange, onGenerated }: Props) {
  const [purpose, setPurpose] = React.useState(item.purpose);
  const [starting, setStarting] = React.useState(false);
  const state = useMatrixAnswers({
    initialAnswers: item.answers,
    initialRevision: item.scoreRevision,
    saveAnswer: (questionId, patch) => saveItemAnswer(packId, item.id, questionId, patch),
    score: (revision) => scoreItem(packId, item.id, revision),
  });
  const { activeId, answerRef, selectQuestion } = useActiveQuestion(matrix.questions[0]?.id ?? null);
  const [neverScored] = React.useState(item.answers.length === 0);
  const { scheduleScore } = state;
  React.useEffect(() => {
    if (neverScored) scheduleScore();
  }, [neverScored, scheduleScore]);

  const gaps = unansweredQuestionIds(matrix.questions.map((q) => state.answerFor(q.id)));
  const active = matrix.questions.find((q) => q.id === activeId) ?? null;

  function updatePurpose(value: string) {
    state.bumpRevision();
    setPurpose(value);
    if (!value.trim()) return;
    state.queueSave("purpose", async () => {
      const saved = await patchItem(packId, item.id, { purpose: value });
      if (!saved.ok) toast.error(saved.message);
      else onItemChange(saved.data);
      state.scheduleScore();
    });
  }

  async function generate() {
    if (gaps.length > 0 && !window.confirm(`${gaps.length} questions not answered yet — the skill will be more general. Continue?`)) return;
    setStarting(true);
    await state.flushSaves();
    const result = await requestGenerate(packId, item.id);
    setStarting(false);
    if (!result.ok) return void toast.error(result.message);
    onGenerated(result.data);
  }

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
      />
      <div className="flex min-w-0 flex-col gap-5">
        <section className="glass rounded-[1.75rem] p-5">
          <label htmlFor={`purpose-${item.id}`} className="text-sm font-medium">Purpose</label>
          <Textarea
            id={`purpose-${item.id}`}
            value={purpose}
            maxLength={300}
            onChange={(e) => updatePurpose(e.target.value)}
            className="mt-2 min-h-20 bg-white/60 dark:bg-white/5"
          />
          {active && (
            <div className="mt-5">
              <label htmlFor={`answer-${item.id}`} className="text-sm font-medium">{active.text}</label>
              <Textarea
                id={`answer-${item.id}`}
                ref={answerRef}
                value={state.answerFor(active.id).answer}
                onChange={(e) => state.updateAnswer(active.id, { answer: e.target.value })}
                placeholder={active.guidance}
                className="mt-2 min-h-24 bg-white/60 dark:bg-white/5"
              />
            </div>
          )}
        </section>
        <section className="glass rounded-[1.75rem] p-5" aria-labelledby={`generate-${item.id}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 id={`generate-${item.id}`} className="font-semibold">Write the skill</h3>
              <p className="text-xs text-muted-foreground">
                {gaps.length > 0
                  ? `${gaps.length} question${gaps.length === 1 ? "" : "s"} not answered yet — the skill will be more general.`
                  : "Every question is answered."}
              </p>
            </div>
            <Button onClick={() => void generate()} disabled={starting || item.status === "GENERATING"}>
              {starting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Wand2 className="size-4" aria-hidden />}
              {item.status === "READY" ? "Generate again" : "Generate skill"}
            </Button>
          </div>
        </section>
        <p className="text-center text-xs text-muted-foreground">
          Your descriptions and answers are stored in the LMS and sent to Anthropic&apos;s API to build your skills.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Implement the pack view and the page**

```tsx
// apps/web/src/app/(app)/prompt-bot/skills/[packId]/pack-view.tsx
"use client";
import * as React from "react";
import { ChevronDown, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { patchPack } from "@/lib/skills/client";
import type { SkillItemView, SkillPackView } from "@/lib/skills/types";
import { cn } from "@/lib/utils";
import { SkillPreview } from "./skill-preview";
import { SkillRefine } from "./skill-refine";
import { SkillsList } from "./skills-list";

type Step = "skills" | "refine" | "preview";
const STEPS: { id: Step; label: string }[] = [
  { id: "skills", label: "Skills" },
  { id: "refine", label: "Refine" },
  { id: "preview", label: "Preview and download" },
];

export function PackView({ initial }: { initial: SkillPackView }) {
  const [pack, setPack] = React.useState(initial);
  const [step, setStep] = React.useState<Step>("skills");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [opened, setOpened] = React.useState<string[]>([]);
  const [editingTitle, setEditingTitle] = React.useState(false);
  const [title, setTitle] = React.useState(initial.title);
  const previewDirty = React.useRef(false);
  const onDirtyChange = React.useCallback((dirty: boolean) => {
    previewDirty.current = dirty;
  }, []);

  const custom = pack.items.filter((i) => i.kind === "CUSTOM");
  const selected = custom.find((i) => i.id === selectedId) ?? custom[0] ?? null;
  const readyCount = custom.filter((i) => i.status === "READY").length;

  const replaceItem = React.useCallback((item: SkillItemView) => {
    setPack((p) => ({ ...p, items: p.items.map((i) => (i.id === item.id ? item : i)) }));
  }, []);

  function go(next: Step, itemId?: string) {
    const leavingEdits = step === "preview" && previewDirty.current && (next !== "preview" || (itemId !== undefined && itemId !== selected?.id));
    if (leavingEdits) {
      if (!window.confirm("Discard your unsaved file changes?")) return;
      previewDirty.current = false;
    }
    const id = itemId ?? selected?.id;
    if (itemId) setSelectedId(itemId);
    if (next === "refine" && id) setOpened((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setStep(next);
  }

  async function saveTitle(event?: React.FormEvent) {
    event?.preventDefault();
    setEditingTitle(false);
    const value = title.trim();
    if (!value || value === pack.title) return setTitle(pack.title);
    const result = await patchPack(pack.id, { title: value });
    if (!result.ok) {
      toast.error(result.message);
      return setTitle(pack.title);
    }
    setPack((p) => ({ ...p, title: result.data.title }));
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <header className="min-w-0">
        {editingTitle ? (
          <form onSubmit={saveTitle} className="max-w-xl">
            <label htmlFor="pack-title" className="sr-only">Pack title</label>
            <Input id="pack-title" autoFocus value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} onBlur={() => void saveTitle()} className="text-lg font-semibold" />
          </form>
        ) : (
          <div className="flex items-center gap-1">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{pack.title}</h1>
            <Button variant="ghost" size="icon" aria-label="Rename pack" onClick={() => setEditingTitle(true)}>
              <Pencil className="size-4" aria-hidden />
            </Button>
          </div>
        )}
        <p className="mt-1 line-clamp-2 max-w-3xl text-sm text-muted-foreground">{pack.description}</p>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Steps">
          <ol className="flex flex-wrap gap-2">
            {STEPS.map((s, i) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => go(s.id)}
                  disabled={s.id !== "skills" && custom.length === 0}
                  aria-current={step === s.id ? "step" : undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:pointer-events-none disabled:opacity-50",
                    step === s.id ? "bg-primary text-primary-foreground" : "bg-white/55 text-muted-foreground hover:text-foreground dark:bg-white/5",
                  )}
                >
                  <span aria-hidden className="flex size-5 items-center justify-center rounded-full bg-black/5 text-xs tabular-nums dark:bg-white/10">
                    {i + 1}
                  </span>
                  {s.label}
                </button>
              </li>
            ))}
          </ol>
        </nav>
        {step !== "skills" && selected && (
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Skill</span>
            <span className="relative">
              <select
                value={selected.id}
                onChange={(e) => go(step, e.target.value)}
                className="appearance-none rounded-xl border border-border bg-white/60 py-1.5 pl-3 pr-8 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 dark:bg-white/5"
              >
                {custom.map((i) => (
                  <option key={i.id} value={i.id}>{i.name}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-2 size-4 text-muted-foreground" aria-hidden />
            </span>
          </label>
        )}
      </div>

      {step === "skills" && (
        <SkillsList
          pack={pack}
          onItemsChange={(items) => setPack((p) => ({ ...p, items }))}
          onRefine={(id) => go("refine", id)}
          onPreview={(id) => go("preview", id)}
        />
      )}

      {custom
        .filter((i) => opened.includes(i.id))
        .map((i) => (
          <div key={i.id} hidden={!(step === "refine" && i.id === selected?.id)}>
            <SkillRefine
              packId={pack.id}
              item={i}
              matrix={pack.matrix}
              onItemChange={replaceItem}
              onGenerated={(next) => {
                replaceItem(next);
                setSelectedId(next.id);
                setStep("preview");
              }}
            />
          </div>
        ))}

      {step === "preview" && selected && (
        <SkillPreview
          key={selected.id}
          packId={pack.id}
          item={selected}
          readyCount={readyCount}
          onItemChange={replaceItem}
          onRefine={() => go("refine")}
          onDirtyChange={onDirtyChange}
        />
      )}
    </div>
  );
}
```

```tsx
// apps/web/src/app/(app)/prompt-bot/skills/[packId]/page.tsx
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAiConfigured } from "@/lib/ai/config";
import { loadPackView } from "@/lib/skills/packs";
import { NotConfigured } from "@/components/prompt-bot/not-configured";
import { PackView } from "./pack-view";

export default async function SkillPackPage({ params }: { params: Promise<{ packId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return redirect("/login");
  const { packId } = await params;
  const view = await loadPackView(packId, user.id);
  if (!view) notFound();
  if (!isAiConfigured()) return <NotConfigured isAdmin={user.role === "ADMIN"} />;
  return <PackView initial={view} />;
}
```

- [ ] **Step 6: Run the tests and checks, then commit**

Run: `npx vitest run "src/app/(app)/prompt-bot" src/components/prompt-bot && npx tsc --noEmit && npx eslint "src/app/(app)/prompt-bot" src/components/prompt-bot` → PASS.
```bash
cd "/Users/tharunkumarl/Full Stack/lms"
git add "apps/web/src/app/(app)/prompt-bot/skills/[packId]"
git commit -m "feat(skills-builder): pack page with skills list, refine and preview steps"
```

---

### Task 19: Catalog admin page

Before writing UI code in this task, invoke the `impeccable` skill.

**Files:**
- Create: `apps/web/src/app/(app)/prompt-bot/catalog/page.tsx`
- Create: `apps/web/src/app/(app)/prompt-bot/catalog/catalog-editor.tsx`
- Test: `apps/web/src/app/(app)/prompt-bot/catalog/catalog-page.test.ts`

**Interfaces:**
- Consumes: `call` (Task 15), catalog routes (Task 14), `toCatalogEntryView` (Task 14), `isPermissiveLicense`, `PERMISSIVE_LICENSES` (Task 2), `canEditMatrices`.
- Produces: page `/prompt-bot/catalog` (ADMIN/MENTOR; others are sent to `/prompt-bot/skills`), `CatalogEditor({ initial: CatalogEntryView[] })`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/app/(app)/prompt-bot/catalog/catalog-page.test.ts
/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), redirect: vi.fn(), findMany: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { skillCatalogEntry: { findMany: mocks.findMany } } }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
afterEach(cleanup);

import SkillCatalogPage from "./page";

const row = (over: Record<string, unknown>) => ({
  id: "scat_x",
  slug: "x",
  name: "X",
  description: "Does x things very well.",
  sourceUrl: "https://github.com/a/b",
  license: "MIT",
  bundlable: false,
  installNotes: "",
  tags: [],
  isActive: true,
  createdById: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

describe("Skill catalog page", () => {
  it("sends participants back to the Skills Builder", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "p1", role: "MENTEE" });
    await SkillCatalogPage();
    expect(mocks.redirect).toHaveBeenCalledWith("/prompt-bot/skills");
  });

  it("lists entries and allows bundlable only for a permissive license", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "c1", role: "MENTOR" });
    mocks.findMany.mockResolvedValue([
      row({ id: "scat_impeccable", slug: "impeccable", name: "Impeccable", license: "Apache-2.0", bundlable: true }),
      row({ id: "scat_old", slug: "old-skill", name: "Old skill", isActive: false }),
      row({ id: "scat_pptx", slug: "pptx", name: "PowerPoint", license: "source-available" }),
    ]);
    render(await SkillCatalogPage());
    expect(screen.getByRole("heading", { name: "Skill catalog" })).toBeTruthy();
    expect(screen.getByText("Inactive")).toBeTruthy();
    const bundlable = () => screen.getByRole("switch", { name: "Bundlable" }) as HTMLButtonElement;
    expect(bundlable().disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: /PowerPoint/ }));
    expect((screen.getByLabelText("License") as HTMLInputElement).value).toBe("source-available");
    expect(bundlable().disabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run "src/app/(app)/prompt-bot/catalog/catalog-page.test.ts"` → FAIL, failed to resolve `./page`.

- [ ] **Step 3: Implement the editor and the page**

```tsx
// apps/web/src/app/(app)/prompt-bot/catalog/catalog-editor.tsx
"use client";
import * as React from "react";
import { Plus, Save } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { call } from "@/lib/prompt-bot/client";
import { isPermissiveLicense, PERMISSIVE_LICENSES } from "@/lib/skills/license";
import type { CatalogEntryView } from "@/lib/skills/types";
import { cn } from "@/lib/utils";

type Draft = Omit<CatalogEntryView, "id" | "tags"> & { tags: string };
const EMPTY: Draft = { slug: "", name: "", description: "", sourceUrl: "https://github.com/", license: "", bundlable: false, installNotes: "", tags: "", isActive: true };
const toDraft = (e: CatalogEntryView | null): Draft =>
  e
    ? { slug: e.slug, name: e.name, description: e.description, sourceUrl: e.sourceUrl, license: e.license, bundlable: e.bundlable, installNotes: e.installNotes, tags: e.tags.join(", "), isActive: e.isActive }
    : EMPTY;

export function CatalogEditor({ initial }: { initial: CatalogEntryView[] }) {
  const [entries, setEntries] = React.useState(initial);
  const [selectedId, setSelectedId] = React.useState<string | null>(initial[0]?.id ?? null);
  const selected = entries.find((e) => e.id === selectedId) ?? null;
  const [draft, setDraft] = React.useState<Draft>(() => toDraft(selected));
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const permissive = isPermissiveLicense(draft.license.trim());
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  function select(id: string | null) {
    setSelectedId(id);
    setDraft(toDraft(entries.find((e) => e.id === id) ?? null));
    setError(null);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    const body = {
      name: draft.name,
      description: draft.description,
      sourceUrl: draft.sourceUrl,
      license: draft.license.trim(),
      bundlable: permissive && draft.bundlable,
      installNotes: draft.installNotes,
      tags: draft.tags.split(",").map((t) => t.trim()).filter(Boolean),
      isActive: draft.isActive,
    };
    const result = selected
      ? await call<CatalogEntryView>(`/api/v1/prompt-bot/skill-catalog/${selected.id}`, { method: "PATCH", body: JSON.stringify(body) })
      : await call<CatalogEntryView>("/api/v1/prompt-bot/skill-catalog", { method: "POST", body: JSON.stringify({ ...body, slug: draft.slug.trim() }) });
    setSaving(false);
    if (!result.ok) {
      const message = (result.details && Object.values(result.details).flat()[0]) || result.message;
      setError(message);
      return void toast.error(message);
    }
    const next = selected ? entries.map((e) => (e.id === result.data.id ? result.data : e)) : [...entries, result.data];
    setEntries(next);
    setSelectedId(result.data.id);
    setDraft(toDraft(result.data));
    toast.success("Catalog entry saved");
  }

  const field = "mt-1.5 bg-white/60 dark:bg-white/5";
  return (
    <div className="grid gap-5 md:grid-cols-[16rem_minmax(0,1fr)]">
      <nav aria-label="Catalog entries" className="glass h-fit rounded-[1.75rem] p-3">
        <ul className="flex flex-col gap-1">
          {entries.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => select(e.id)}
                aria-current={e.id === selectedId ? "true" : undefined}
                className={cn(
                  "w-full rounded-xl px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
                  e.id === selectedId ? "bg-primary/10" : "hover:bg-white/55 dark:hover:bg-white/5",
                )}
              >
                <span className="block text-sm font-medium">{e.name}</span>
                <span className="mt-1 flex flex-wrap gap-1">
                  <Badge variant="outline">{e.license}</Badge>
                  {!e.isActive && <Badge variant="secondary">Inactive</Badge>}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => select(null)}>
          <Plus className="size-4" aria-hidden />
          Add entry
        </Button>
      </nav>

      <form onSubmit={save} className="glass flex flex-col gap-4 rounded-[1.75rem] p-5" aria-label={selected ? `Edit ${selected.name}` : "New catalog entry"}>
        {!selected && (
          <div>
            <label htmlFor="catalog-slug" className="text-sm font-medium">Slug</label>
            <Input id="catalog-slug" value={draft.slug} onChange={(e) => set("slug", e.target.value)} placeholder="kebab-case, e.g. frontend-design" className={field} />
          </div>
        )}
        <div>
          <label htmlFor="catalog-name" className="text-sm font-medium">Name</label>
          <Input id="catalog-name" value={draft.name} maxLength={80} onChange={(e) => set("name", e.target.value)} className={field} />
        </div>
        <div>
          <label htmlFor="catalog-description" className="text-sm font-medium">When it helps</label>
          <Textarea id="catalog-description" value={draft.description} maxLength={600} onChange={(e) => set("description", e.target.value)} className={cn(field, "min-h-20")} />
          <p className="mt-1 text-xs text-muted-foreground">The split step matches people's work against this text.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="catalog-source" className="text-sm font-medium">Source URL</label>
            <Input id="catalog-source" type="url" value={draft.sourceUrl} onChange={(e) => set("sourceUrl", e.target.value)} className={field} />
          </div>
          <div>
            <label htmlFor="catalog-license" className="text-sm font-medium">License</label>
            <Input id="catalog-license" value={draft.license} maxLength={64} onChange={(e) => set("license", e.target.value)} placeholder="SPDX id or source-available" className={field} />
          </div>
        </div>
        <div>
          <label htmlFor="catalog-install" className="text-sm font-medium">Install notes</label>
          <Textarea id="catalog-install" value={draft.installNotes} maxLength={1000} onChange={(e) => set("installNotes", e.target.value)} className={cn(field, "min-h-16")} />
        </div>
        <div>
          <label htmlFor="catalog-tags" className="text-sm font-medium">Tags</label>
          <Input id="catalog-tags" value={draft.tags} onChange={(e) => set("tags", e.target.value)} placeholder="Comma-separated, e.g. design, ui" className={field} />
        </div>
        <div className="flex flex-col gap-3 rounded-2xl bg-white/45 p-3 dark:bg-white/5">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="catalog-bundlable" className="text-sm font-medium">Bundlable</label>
            <Switch
              id="catalog-bundlable"
              checked={permissive && draft.bundlable}
              disabled={!permissive}
              onCheckedChange={(checked) => set("bundlable", checked)}
              aria-describedby="catalog-bundlable-help"
            />
          </div>
          <p id="catalog-bundlable-help" className="text-xs text-muted-foreground">
            Allowed only for a verified permissive license ({PERMISSIVE_LICENSES.join(", ")}), confirmed from the source repository&apos;s LICENSE file. Packs list catalog skills with a link to their source.
          </p>
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="catalog-active" className="text-sm font-medium">Active</label>
            <Switch id="catalog-active" checked={draft.isActive} onCheckedChange={(checked) => set("isActive", checked)} />
          </div>
        </div>
        {error && <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        <div className="flex justify-end">
          <Button type="submit" disabled={saving}>
            <Save className="size-4" aria-hidden />
            {selected ? "Save entry" : "Add to catalog"}
          </Button>
        </div>
      </form>
    </div>
  );
}
```

```tsx
// apps/web/src/app/(app)/prompt-bot/catalog/page.tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { canEditMatrices } from "@/lib/prompt-bot/matrix-input";
import { toCatalogEntryView } from "@/lib/skills/catalog-input";
import { CatalogEditor } from "./catalog-editor";

export default async function SkillCatalogPage() {
  const user = await getCurrentUser();
  if (!user) return redirect("/login");
  if (!canEditMatrices(user.role)) return redirect("/prompt-bot/skills");
  const rows = await prisma.skillCatalogEntry.findMany({ orderBy: { name: "asc" } });
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Skill catalog</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Public skills the Skills Builder can recommend. Packs list them with a link to their source.
        </p>
      </header>
      <CatalogEditor initial={rows.map(toCatalogEntryView)} />
    </div>
  );
}
```

- [ ] **Step 4: Run it and watch it pass, then commit**

Run: `npx vitest run "src/app/(app)/prompt-bot/catalog" && npx tsc --noEmit && npx eslint "src/app/(app)/prompt-bot/catalog"` → PASS.
```bash
cd "/Users/tharunkumarl/Full Stack/lms"
git add "apps/web/src/app/(app)/prompt-bot/catalog"
git commit -m "feat(skills-builder): skill catalog editor for coaches and admins"
```

---

### Task 20: End-to-end verification

Use the `agent-browser:agent-browser` skill for browser commands (an isolated session). Do not change production code in this task; if a step fails, fix it in the owning task's files with a failing test first, then re-run this task.

**Files:**
- Create: `apps/web/scripts/fake-anthropic-skills.mjs` (a local stand-in that speaks the Messages API JSON format and recognises each call by its JSON schema)

- [ ] **Step 1: Full suite and static checks**

```bash
cd "/Users/tharunkumarl/Full Stack/lms/apps/web"
npx vitest run && npx tsc --noEmit && npx eslint src/
```
Expected: all green.

- [ ] **Step 2: Write the fake API**

```js
// apps/web/scripts/fake-anthropic-skills.mjs
// Local stand-in for the Messages API used by the Skills Builder end-to-end run.
// Usage: node scripts/fake-anthropic-skills.mjs   (FAKE_FIRST_INVALID=1 makes the first draft fail validation)
// Logs only which kind of call arrived, never request text.
import http from "node:http";

const PORT = Number(process.env.PORT ?? 4011);
const VALID_DRAFT = {
  name: "ignored-by-the-server",
  description:
    'Drafts the monthly board update from rough notes: numbers first, "no surprises" tone. Use when asked for a board update, an investor update or a monthly summary.',
  compatibility: "",
  body:
    "# Board update writer\n\nRead `references/company-context.md` before writing, because the board expects the same framing every month.\n\n1. Ask for this month's numbers if they are missing.\n2. Run `scripts/word_count.py` on the draft and keep it under 400 words.\n",
  references: [{ path: "company-context.md", content: "# Company context\n\n[Add your company's tone of voice here]\n" }],
  scripts: [{ path: "scripts/word_count.py", content: "import sys\nprint(len(sys.stdin.read().split()))\n", purpose: "Counts the words in a draft read from standard input." }],
  assets: [],
};

function reply(res, payload) {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      id: "msg_fake",
      type: "message",
      role: "assistant",
      model: "claude-fake",
      content: [{ type: "text", text: JSON.stringify(payload) }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    }),
  );
}

http
  .createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    if (req.method !== "POST" || !req.url?.startsWith("/v1/messages")) {
      res.writeHead(404).end();
      return;
    }
    const body = JSON.parse(raw);
    const props = body.output_config?.format?.schema?.properties ?? {};
    const user = String(body.messages?.[0]?.content ?? "");
    if ("customSkills" in props) {
      console.log("[fake] split");
      return reply(res, {
        customSkills: [
          { name: "Board Update Writer", purpose: "Drafts the monthly board update from my notes." },
          { name: "board update writer", purpose: "A duplicate name, to check that names are made unique." },
        ],
        catalogMatches: [
          { slug: "impeccable", why: "Polishes the dashboards you review every week." },
          { slug: "not-in-the-catalog", why: "Must be dropped." },
        ],
      });
    }
    if ("scores" in props) {
      console.log("[fake] score");
      const ids = [...user.matchAll(/- id: (\S+)/g)].map((m) => m[1]);
      const answered = user.includes("Notes:");
      return reply(res, { scores: ids.map((questionId) => ({ questionId, score: answered ? 2 : 1, reason: answered ? "Partly specific" : "Touched on vaguely" })) });
    }
    if ("body" in props) {
      const retry = user.includes("<validation_errors>");
      console.log(`[fake] generate${retry ? " (retry)" : ""}`);
      return reply(res, process.env.FAKE_FIRST_INVALID && !retry ? { ...VALID_DRAFT, description: "Uses <angle> brackets" } : VALID_DRAFT);
    }
    if ("slug" in props) return reply(res, { slug: "none", confidence: 0 });
    res.writeHead(400).end();
  })
  .listen(PORT, "127.0.0.1", () => console.log(`[fake] listening on http://127.0.0.1:${PORT}`));
```

- [ ] **Step 3: Fake-API browser run**

```bash
cd "/Users/tharunkumarl/Full Stack/lms/apps/web"
FAKE_FIRST_INVALID=1 node scripts/fake-anthropic-skills.mjs &      # 127.0.0.1:4011
ANTHROPIC_BASE_URL=http://127.0.0.1:4011 ANTHROPIC_API_KEY=test npm run dev
```
In an isolated `agent-browser` session, signed in as a participant (MENTEE) account from your local database:
1. Open `/prompt-bot`: the "Prompt Bot" / "Skills Builder" tabs show, and the enhancer still starts a session and updates its bars.
2. Open the Skills Builder tab. Enter "Every month I turn my notes into a board update and review our dashboards", role "CFO", and press "Build skill list".
3. Expect the pack page: "Build custom" lists `board-update-writer` and `board-update-writer-2`; "Use existing" shows Impeccable with its license and a "View source" link; `not-in-the-catalog` does not appear.
4. Press "Refine board-update-writer": eight questions with 3-slice bars. Type an answer, wait about 2 s, and expect the bars and readiness to change. Mark one question not relevant and expect the "N questions not answered yet" count to drop.
5. Press "Generate skill", confirm the warning, and expect "Writing your skill…", then (within one 3 s poll) the file tree: `SKILL.md`, `references/company-context.md`, `scripts/word_count.py`. The fake log shows `generate` then `generate (retry)`, proving the one-retry path.
6. `SKILL.md` renders as Markdown; open `scripts/word_count.py` and expect "Review scripts before running them".
7. Edit `references/company-context.md`, press "Save and check" and expect "Skill saved". Then switch SKILL.md to Edit, add a line `version: 1` to the frontmatter, save, and expect the error about the unexpected key; remove the line and save again.
8. Rename the skill to "Monthly board update" from the Skills step and confirm the preview's `SKILL.md` now says `name: monthly-board-update`.
9. Press "Download skill" and "Download pack": no error toast. Check the browser console has no errors.
10. Fetch the pack zip for the external check: with `agent-browser eval`, run the snippet below on the pack page and save its output as `$TMPDIR/skills-e2e/pack.b64`:

```js
(async () => {
  const id = location.pathname.split("/").pop();
  const res = await fetch(`/api/v1/prompt-bot/skill-packs/${id}/download`, { credentials: "include" });
  const bytes = new Uint8Array(await res.arrayBuffer());
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
})()
```
11. As a coach or admin, open `/prompt-bot/catalog`: the seeded entries show their verified licenses; the Bundlable switch is disabled for any non-permissive entry. As the participant, `/prompt-bot/catalog` redirects to `/prompt-bot/skills`.

- [ ] **Step 4: Validate the pack with Anthropic's validator as an external oracle**

```bash
OUT="$TMPDIR/skills-e2e"
VALIDATOR="/Users/tharunkumarl/.claude/skills/synced/bfef6136-f152-4b96-834c-6925fa876c60_248f4955-89f1-4681-b216-9881dcea93ad/skill-creator/scripts/quick_validate.py"
base64 -d < "$OUT/pack.b64" > "$OUT/pack.zip"
rm -rf "$OUT/pack" "$OUT/upload" && unzip -q "$OUT/pack.zip" -d "$OUT/pack"
unzip -Z1 "$OUT/pack.zip" | grep -E '(^/|(^|/)\.\.(/|$))' && echo "UNSAFE PATH" || echo "paths ok"
ls "$OUT"/pack/*/README.md "$OUT"/pack/*/recommended-skills.md
grep -q "Impeccable" "$OUT"/pack/*/recommended-skills.md && echo "recommendations ok"
for dir in "$OUT"/pack/*/skills/*/; do python3 "$VALIDATOR" "$dir" || echo "INVALID: $dir"; done
for z in "$OUT"/pack/*/upload-to-claude/*.zip; do
  name=$(basename "$z" .zip)
  roots=$(unzip -Z1 "$z" | cut -d/ -f1 | sort -u)
  [ "$roots" = "$name" ] || echo "BAD ROOT in $z: $roots"
  mkdir -p "$OUT/upload/$name" && unzip -q "$z" -d "$OUT/upload/$name"
  python3 "$VALIDATOR" "$OUT/upload/$name/$name" || echo "INVALID upload zip: $z"
done
```
Expected: `paths ok`, `recommendations ok`, `Skill is valid!` for every skill folder and every upload zip, and no `INVALID`, `BAD ROOT` or `UNSAFE PATH` lines. Stop the fake server and the dev server afterwards.

- [ ] **Step 5: Real-API smoke test** (uses real usage; the key is in `apps/web/.env`)

Restart `npm run dev` without the fake overrides. Create one pack from a short description, refine one skill with two answers (bars update within about 3 s), generate it, and download the pack. Run Step 4's oracle on that zip. Expect every skill folder to pass, a description that says when to use the skill, and placeholders in `references/` where answers were missing.

- [ ] **Step 6: Production checklist** (report to the human partner; do not execute)

- No new environment variables. `ANTHROPIC_API_KEY` from the enhancer rollout is reused.
- Merge after the enhancer PR. `start.sh` applies `20261124120000_add_skills_builder` on deploy (tables, the skill-definition matrix and the verified catalog).
- Generation runs in `after()` on the long-running `next start` process; a deploy that interrupts it leaves the item retryable after 15 minutes.
- Coaches review catalog entries at `/prompt-bot/catalog`.
