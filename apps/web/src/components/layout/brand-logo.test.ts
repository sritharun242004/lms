import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("CMS brand logo", () => {
  it("publishes the supplied logo as a non-empty public asset", () => {
    const logoPath = resolve(process.cwd(), "public", "cms-logo.jpg");
    const wordmarkPath = resolve(process.cwd(), "public", "cms-logo-wordmark.jpg");

    expect(existsSync(logoPath)).toBe(true);
    expect(statSync(logoPath).size).toBeGreaterThan(100_000);
    expect(existsSync(wordmarkPath)).toBe(true);
    expect(statSync(wordmarkPath).size).toBeGreaterThan(50_000);
  });
});
