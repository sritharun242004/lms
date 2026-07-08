import { describe, expect, it } from "vitest";
import { hueForWord, hslForHue } from "./color";

describe("hueForWord", () => {
  it("is deterministic for the same input", () => {
    expect(hueForWord("creative")).toBe(hueForWord("creative"));
  });

  it("stays within [0, 360)", () => {
    for (const word of ["a", "creative", "well-being", "", "team work"]) {
      const hue = hueForWord(word);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    }
  });

  it("differs for different words (no trivial collisions)", () => {
    expect(hueForWord("creative")).not.toBe(hueForWord("innovative"));
  });
});

describe("hslForHue", () => {
  it("uses a lighter lightness in dark mode than light mode", () => {
    const dark = hslForHue(200, true);
    const light = hslForHue(200, false);
    expect(dark).toBe("hsl(200deg 72% 68%)");
    expect(light).toBe("hsl(200deg 72% 40%)");
  });
});
