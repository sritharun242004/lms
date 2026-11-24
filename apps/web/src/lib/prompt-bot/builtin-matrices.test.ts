import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BUILTIN_MATRICES, CORE_MATRIX_ID } from "./builtin-matrices";

const CORE_VERBATIM = [
  "Why are we doing this?",
  "What is going on in the background (Context)?",
  "Who is the target audience?",
  "What is needed to do this?",
  "What are the goals and objectives & How do we measure them?",
  "What are the different ways we can approach this?",
  "What does success look like?",
  "What is the systematic plan to work on this?",
];
const IMAGE_VERBATIM = [
  "Why do we need this image?",
  "What is the full context?",
  "Who is the target audience?",
  "What are we trying to express/show using this image?",
  "What are we trying to get people to feel/take away when they see this image?",
  "Where will this image be published?",
];

describe("built-in matrices", () => {
  it("keeps the eight Design Think questions verbatim and in deck order", () => {
    const core = BUILTIN_MATRICES.find((m) => m.id === CORE_MATRIX_ID)!;
    expect(core.slug).toBe("core");
    expect(core.kind).toBe("CORE");
    expect(core.questions.map((q) => q.text)).toEqual(CORE_VERBATIM);
  });

  it("keeps the six image questions verbatim", () => {
    const image = BUILTIN_MATRICES.find((m) => m.slug === "image")!;
    expect(image.kind).toBe("TASK");
    expect(image.questions.map((q) => q.text)).toEqual(IMAGE_VERBATIM);
  });

  it("ships the draft task matrices from the spec", () => {
    expect(BUILTIN_MATRICES.map((m) => m.slug).sort()).toEqual(
      ["code", "core", "data", "image", "presentation", "research", "strategy", "writing"],
    );
    for (const matrix of BUILTIN_MATRICES) {
      expect(matrix.questions.length).toBeGreaterThanOrEqual(6);
      for (const q of matrix.questions) expect(q.guidance.length).toBeGreaterThan(20);
    }
  });

  it("uses unique stable ids", () => {
    const ids = BUILTIN_MATRICES.flatMap((m) => [m.id, ...m.questions.map((q) => q.id)]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("is seeded by the migration exactly as defined", () => {
    const sql = readFileSync(
      path.join(__dirname, "../../../prisma/migrations/20261124150000_add_prompt_bot/migration.sql"),
      "utf8",
    );
    for (const matrix of BUILTIN_MATRICES) {
      expect(sql).toContain(`'${matrix.id}'`);
      for (const q of matrix.questions) expect(sql).toContain(q.text.replace(/'/g, "''"));
    }
    expect(sql).toContain(`'singleton'`);
  });
});
