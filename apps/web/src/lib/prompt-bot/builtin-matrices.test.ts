import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { activeQuestions, BUILTIN_MATRICES, CORE_MATRIX_ID } from "./builtin-matrices";
import { retirementSql } from "./seed-sql";

const CORE_VERBATIM = [
  "Why are we doing this?",
  "What is going on in the background (Context)?",
  "Who is the target audience?",
  "What is needed to do this?",
  "What are the goals and objectives & How do we measure them?",
  "What are the different ways we can approach this?",
  "What does success look like?",
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
  it("asks exactly the seven Design Think questions, verbatim and in deck order", () => {
    const core = BUILTIN_MATRICES.find((m) => m.id === CORE_MATRIX_ID)!;
    expect(core.slug).toBe("core");
    expect(core.kind).toBe("CORE");
    expect(core.isActive).not.toBe(false);
    expect(activeQuestions(core).map((q) => q.text)).toEqual(CORE_VERBATIM);
  });

  it("keeps the retired plan question as an inactive row instead of deleting it", () => {
    const core = BUILTIN_MATRICES.find((m) => m.id === CORE_MATRIX_ID)!;
    const retired = core.questions.filter((q) => q.isActive === false);
    expect(retired.map((q) => q.id)).toEqual(["pbq_core_8"]);
  });

  it("keeps the task add-on matrices but switches every one of them off", () => {
    const tasks = BUILTIN_MATRICES.filter((m) => m.kind === "TASK");
    expect(tasks.length).toBeGreaterThan(0);
    for (const m of tasks) expect(m.isActive).toBe(false);
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

  it("is switched to the core seven by the follow-up data migration, with updates only", () => {
    const sql = readFileSync(
      path.join(__dirname, "../../../prisma/migrations/20261125090000_prompt_bot_core_seven/migration.sql"),
      "utf8",
    );
    for (const line of retirementSql(BUILTIN_MATRICES)) expect(sql).toContain(line);
    expect(sql).not.toMatch(/\b(DELETE|DROP|TRUNCATE|INSERT|ALTER)\b/i);
  });
});
