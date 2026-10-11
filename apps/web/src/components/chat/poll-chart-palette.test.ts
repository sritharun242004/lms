import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { pollColor } from "./poll-chart";

const OPTIONS = 10; // polls and quizzes allow up to 10 choices

describe("poll option colours", () => {
  it("gives each of the 10 possible options its own colour", () => {
    const colours = Array.from({ length: OPTIONS }, (_, i) => pollColor(i));
    expect(new Set(colours).size).toBe(OPTIONS);
  });

  it("defines every option colour token in both the light and dark themes", () => {
    const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
    const blocks = [...css.matchAll(/--chart-1:\s*#[0-9a-f]{3,8};[\s\S]*?\n\s*\}/gi)].map((m) => m[0]);
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    for (const block of blocks) {
      const values: string[] = [];
      for (let n = 1; n <= OPTIONS; n += 1) {
        const match = block.match(new RegExp(`--chart-${n}:\\s*(#[0-9a-f]{3,8});`, "i"));
        expect(match, `--chart-${n} missing in a theme block`).not.toBeNull();
        values.push(match![1].toLowerCase());
      }
      expect(new Set(values).size, "colours within a theme must be distinct").toBe(OPTIONS);
    }
  });
});
