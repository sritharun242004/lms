import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { INTERACTIVE_CARD_WIDTH } from "./interactive-card";

const dir = resolve(process.cwd(), "src/components/chat");

describe("interactive card width", () => {
  it("keeps a small gutter on phones and fills the thread (capped) from sm up", () => {
    expect(INTERACTIVE_CARD_WIDTH).toContain("mx-3");
    expect(INTERACTIVE_CARD_WIDTH).toContain("sm:mx-auto");
    expect(INTERACTIVE_CARD_WIDTH).toContain("sm:w-full");
    // wider than the old 56rem (max-w-4xl) but bounded on huge monitors
    expect(INTERACTIVE_CARD_WIDTH).toContain("90rem");
    expect(INTERACTIVE_CARD_WIDTH).not.toContain("max-w-4xl");
  });

  it.each([
    "poll-message.tsx",
    "open-question-message.tsx",
    "word-cloud-message.tsx",
    "scale-message.tsx",
  ])("%s uses the shared width and no longer hard-codes max-w-4xl", (file) => {
    const source = readFileSync(resolve(dir, file), "utf8");
    expect(source).toContain("INTERACTIVE_CARD_WIDTH");
    expect(source).not.toContain("max-w-4xl");
  });
});
