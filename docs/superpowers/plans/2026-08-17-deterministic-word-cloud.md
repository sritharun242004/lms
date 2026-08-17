# Deterministic Frequency Word Cloud Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Replace the custom word-cloud renderer with a deterministic, horizontal, frequency-ranked cloud using the React 19-compatible @cp949/react-wordcloud package.

**Architecture:** A pure adapter converts CMS entries into stable descending-frequency package words and responsive options. A client-only wrapper renders them through the package while preserving colors, themes, accessibility, empty states, and live updates; the old placement engine is then removed.

**Tech Stack:** Next.js 16, React 19, TypeScript, @cp949/react-wordcloud 1.0.1, Vitest, next-themes.

## Global Constraints

- Use @cp949/react-wordcloud; do not force-install react-wordcloud 1.2.7.
- Set deterministic: true, randomSeed: "cms-word-cloud-v1", rotations: 1, and rotationAngles: [0, 0].
- Sort descending by count so large words claim the center and smaller words pack outward.
- Preserve entry colors, themes, count tooltips, empty state, dimensions, live updates, and reduced-motion behavior.
- Do not modify submissions, moderation, locking, sockets, APIs, database, or backend behavior.
- Keep s..jpg untracked and outside every commit.

---

## File Structure

- Create apps/web/src/lib/word-cloud/react-wordcloud.ts for data conversion and options.
- Create apps/web/src/lib/word-cloud/react-wordcloud.test.ts for adapter/configuration tests.
- Modify apps/web/src/components/chat/word-cloud-canvas.tsx for the package renderer.
- Modify apps/web/package.json and package-lock.json for the dependency.
- Delete apps/web/src/hooks/use-word-cloud-layout.ts.
- Delete apps/web/src/lib/word-cloud/layout.ts and layout.test.ts.

### Task 1: Deterministic Adapter and Configuration

**Files:**
- Create: apps/web/src/lib/word-cloud/react-wordcloud.ts
- Test: apps/web/src/lib/word-cloud/react-wordcloud.test.ts
- Modify: apps/web/package.json
- Modify: package-lock.json

**Interfaces:**
- Consumes: WordCloudEntryResult.
- Produces: CmsWordcloudWord, toWordcloudWords(entries), wordcloudValue(count), responsiveFontSizes(width), createWordcloudOptions(width, reduceMotion).

- [ ] **Step 1: Install the compatible dependency**

Run:

~~~powershell
npm.cmd install @cp949/react-wordcloud@1.0.1 --workspace @cms/web
~~~

Expected: dependency and lockfile update without --legacy-peer-deps.

- [ ] **Step 2: Write the failing adapter tests**

Create react-wordcloud.test.ts:

~~~ts
import { describe, expect, it } from "vitest";
import {
  createWordcloudOptions,
  responsiveFontSizes,
  toWordcloudWords,
  wordcloudValue,
} from "./react-wordcloud";

describe("toWordcloudWords", () => {
  it("sorts highest frequency first with stable text and id tie breakers", () => {
    const words = toWordcloudWords([
      { id: "z", text: "beta", count: 2, color: "20" },
      { id: "b", text: "Alpha", count: 5, color: "40" },
      { id: "a", text: "alpha", count: 5, color: "60" },
    ]);
    expect(words.map((word) => word.id)).toEqual(["a", "b", "z"]);
    expect(words[0]).toMatchObject({ text: "alpha", count: 5, color: "60" });
  });

  it("returns an empty array for an empty cloud", () => {
    expect(toWordcloudWords([])).toEqual([]);
  });
});

it("amplifies repeated word values", () => {
  expect(wordcloudValue(1)).toBe(1);
  expect(wordcloudValue(5)).toBeGreaterThan(5);
  expect(Number.isFinite(wordcloudValue(100))).toBe(true);
});

it("uses bounded responsive font sizes", () => {
  expect(responsiveFontSizes(320)).toEqual([12, 54]);
  expect(responsiveFontSizes(900)).toEqual([14, 96]);
  expect(responsiveFontSizes(2400)).toEqual([14, 96]);
});

it("uses deterministic horizontal center-out packing", () => {
  expect(createWordcloudOptions(900, false)).toMatchObject({
    deterministic: true,
    randomSeed: "cms-word-cloud-v1",
    rotations: 1,
    rotationAngles: [0, 0],
    fontStyle: "normal",
    fontWeight: "600",
    scale: "linear",
    spiral: "archimedean",
    transitionDuration: 350,
  });
  expect(createWordcloudOptions(900, true).transitionDuration).toBe(0);
});
~~~

- [ ] **Step 3: Verify RED**

Run:

~~~powershell
npm.cmd test --workspace @cms/web -- src/lib/word-cloud/react-wordcloud.test.ts
~~~

Expected: FAIL because ./react-wordcloud does not exist.

- [ ] **Step 4: Implement the adapter**

Create react-wordcloud.ts:

~~~ts
import type { OptionsProp } from "@cp949/react-wordcloud";
import type { WordCloudEntryResult } from "@/lib/api/services/message-service";

export interface CmsWordcloudWord {
  id: string;
  text: string;
  value: number;
  count: number;
  color: string;
}

export function wordcloudValue(count: number): number {
  return Math.pow(Math.max(1, count), 1.35);
}

export function toWordcloudWords(entries: WordCloudEntryResult[]): CmsWordcloudWord[] {
  return [...entries]
    .sort(
      (a, b) =>
        b.count - a.count ||
        a.text.localeCompare(b.text, undefined, { sensitivity: "base" }) ||
        a.id.localeCompare(b.id)
    )
    .map((entry) => ({
      id: entry.id,
      text: entry.text,
      value: wordcloudValue(entry.count),
      count: entry.count,
      color: entry.color,
    }));
}

export function responsiveFontSizes(width: number): [number, number] {
  if (width < 480) return [12, 54];
  return [14, Math.min(96, Math.max(64, Math.round(width * 0.12)))];
}

export function createWordcloudOptions(width: number, reduceMotion: boolean): OptionsProp {
  return {
    deterministic: true,
    randomSeed: "cms-word-cloud-v1",
    enableOptimizations: true,
    enableTooltip: true,
    fontFamily: "ui-sans-serif, system-ui, sans-serif",
    fontSizes: responsiveFontSizes(width),
    fontStyle: "normal",
    fontWeight: "600",
    padding: width < 480 ? 3 : 5,
    rotations: 1,
    rotationAngles: [0, 0],
    scale: "linear",
    spiral: "archimedean",
    transitionDuration: reduceMotion ? 0 : 350,
  };
}
~~~

If the installed declarations export Options instead of OptionsProp, use that exact type name without changing runtime behavior.

- [ ] **Step 5: Verify GREEN and commit**

~~~powershell
npm.cmd test --workspace @cms/web -- src/lib/word-cloud/react-wordcloud.test.ts
git add -- apps/web/package.json package-lock.json apps/web/src/lib/word-cloud/react-wordcloud.ts apps/web/src/lib/word-cloud/react-wordcloud.test.ts
git commit -m "Add deterministic word cloud adapter"
~~~

Expected: focused tests PASS; commit contains only these four paths.

---

### Task 2: Package Renderer Migration

**Files:**
- Modify: apps/web/src/components/chat/word-cloud-canvas.tsx
- Test: apps/web/src/lib/word-cloud/react-wordcloud.test.ts
- Delete: apps/web/src/hooks/use-word-cloud-layout.ts
- Delete: apps/web/src/lib/word-cloud/layout.ts
- Delete: apps/web/src/lib/word-cloud/layout.test.ts

**Interfaces:**
- Consumes: adapter exports, hslForHue, entries, theme, reduced-motion state, measured size.
- Produces: unchanged WordCloudCanvas({ entries, className }) signature.

- [ ] **Step 1: Write the failing renderer migration test**

Add:

~~~ts
import fs from "node:fs";
import path from "node:path";

it("renders through the compatible package without the custom hook", () => {
  const source = fs.readFileSync(
    path.resolve(process.cwd(), "src/components/chat/word-cloud-canvas.tsx"),
    "utf8"
  );
  expect(source).toContain('import("@cp949/react-wordcloud")');
  expect(source).toContain("toWordcloudWords");
  expect(source).not.toContain("useWordCloudLayout");
});
~~~

- [ ] **Step 2: Verify RED**

Run the focused test. Expected: FAIL because the component still uses useWordCloudLayout.

- [ ] **Step 3: Replace the renderer**

Keep useContainerSize and replace custom SVG/motion code with:

~~~tsx
const ReactWordcloud = dynamic(
  () => import("@cp949/react-wordcloud").then((module) => module.default),
  { ssr: false, loading: () => <div className="min-h-[220px] w-full" aria-hidden="true" /> }
);

const words = React.useMemo(() => toWordcloudWords(entries), [entries]);
const options = React.useMemo(
  () => createWordcloudOptions(size.width, Boolean(reduceMotion)),
  [size.width, reduceMotion]
);
const cloudSize = React.useMemo<[number, number]>(
  () => [Math.max(1, Math.round(size.width)), Math.max(1, Math.round(size.height))],
  [size.width, size.height]
);
const callbacks = React.useMemo<CallbacksProp>(
  () => ({
    getWordColor: (word) => {
      const entry = word as CmsWordcloudWord;
      return hslForHue(Number(entry.color), isDark);
    },
    getWordTooltip: (word) => {
      const entry = word as CmsWordcloudWord;
      const noun = entry.count === 1 ? "mention" : "mentions";
      return entry.text + " · " + entry.count + " " + noun;
    },
  }),
  [isDark]
);
~~~

For a non-empty measured container render:

~~~tsx
<div role="img" aria-label="Live word cloud" className="absolute inset-0">
  <ReactWordcloud
    words={words}
    options={options}
    callbacks={callbacks}
    size={cloudSize}
    maxWords={entries.length}
  />
</div>
~~~

Retain the existing empty-state paragraph and container classes. Remove AnimatePresence, PopcornBurst, custom motion.text, layout constants, and useWordCloudLayout.

- [ ] **Step 4: Delete the superseded layout files**

Delete only the three files listed for this task, then run:

~~~powershell
rg -n "useWordCloudLayout|computeWordCloudLayout|WORD_CLOUD_MAX_FONT_SIZE|WORD_CLOUD_MIN_FONT_SIZE" apps/web/src
~~~

Expected: no matches.

- [ ] **Step 5: Verify GREEN, types, and lint**

~~~powershell
npm.cmd test --workspace @cms/web -- src/lib/word-cloud/react-wordcloud.test.ts
npm.cmd run typecheck --workspace @cms/web
npx.cmd eslint src/components/chat/word-cloud-canvas.tsx src/lib/word-cloud/react-wordcloud.ts src/lib/word-cloud/react-wordcloud.test.ts
~~~

Expected: all commands exit 0; do not use any or disable TypeScript.

- [ ] **Step 6: Commit the migration**

~~~powershell
git add -- apps/web/src/components/chat/word-cloud-canvas.tsx apps/web/src/lib/word-cloud/react-wordcloud.test.ts apps/web/src/hooks/use-word-cloud-layout.ts apps/web/src/lib/word-cloud/layout.ts apps/web/src/lib/word-cloud/layout.test.ts
git commit -m "Render deterministic frequency word clouds"
~~~

---

### Task 3: Full and Visual Verification

**Files:** Modify only Task 1-2 files if verification exposes a defect.

- [ ] **Step 1: Run complete automated verification**

~~~powershell
npm.cmd test --workspace @cms/web
npm.cmd run typecheck --workspace @cms/web
npm.cmd run lint --workspace @cms/web
npm.cmd run build --workspace @cms/web
~~~

Expected: every command exits 0. If Windows locks the Prisma engine DLL, stop the running web process, rerun, and report the exact build result.

- [ ] **Step 2: Verify desktop and mobile behavior**

Start the app with npm.cmd run dev --workspace @cms/web and inspect:
1. Empty cloud keeps its instructional message.
2. One word is horizontal and near the core.
3. Counts 12, 7, 4, 2, 1 appear largest-to-smallest from core outward.
4. Tied counts keep the same order after refresh.
5. Long words and maximum entries remain readable, horizontal, and packed.
6. Light/dark colors remain readable.
7. Reduced-motion removes the transition.

- [ ] **Step 3: Confirm scope**

~~~powershell
git diff --check
git status --short
~~~

Expected: only planned package/word-cloud files differ; s..jpg remains excluded.

- [ ] **Step 4: Commit only if verification required a correction**

Stage the exact corrected word-cloud paths and commit with:

~~~powershell
git commit -m "Polish responsive word cloud rendering"
~~~

Skip this step when verification requires no correction.

