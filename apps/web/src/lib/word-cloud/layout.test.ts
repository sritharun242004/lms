import { describe, expect, it } from "vitest";
import { computeWordCloudLayout, fontSizeForCount, rotationForWord } from "./layout";

const measureText = (text: string, fontSize: number) => text.length * fontSize * 0.6;

describe("fontSizeForCount", () => {
  it("maps the minimum reference count to minSize", () => {
    expect(fontSizeForCount(1, 24, 74)).toBe(24);
  });

  it("maps the maximum reference count to maxSize", () => {
    expect(fontSizeForCount(50, 24, 74)).toBe(74);
  });

  it("clamps counts above the reference max", () => {
    expect(fontSizeForCount(500, 24, 74)).toBe(74);
  });

  it("grows monotonically with count", () => {
    const sizes = [1, 5, 10, 25, 50].map((c) => fontSizeForCount(c, 24, 74));
    for (let i = 1; i < sizes.length; i++) {
      expect(sizes[i]).toBeGreaterThanOrEqual(sizes[i - 1]);
    }
  });
});

describe("rotationForWord", () => {
  it("is deterministic for the same text", () => {
    expect(rotationForWord("creative")).toBe(rotationForWord("creative"));
  });

  it("stays within roughly -6deg..+6deg", () => {
    for (const word of ["a", "creative", "innovative", "well-being"]) {
      const rotation = rotationForWord(word);
      expect(rotation).toBeGreaterThanOrEqual(-6);
      expect(rotation).toBeLessThanOrEqual(6);
    }
  });
});

describe("computeWordCloudLayout", () => {
  it("places every word exactly once", () => {
    const words = [
      { id: "1", text: "creative", count: 10 },
      { id: "2", text: "innovative", count: 5 },
      { id: "3", text: "teamwork", count: 20 },
    ];
    const placed = computeWordCloudLayout(words, {
      width: 400,
      height: 300,
      minFontSize: 16,
      maxFontSize: 60,
      measureText,
    });
    expect(placed).toHaveLength(3);
    expect(new Set(placed.map((p) => p.id))).toEqual(new Set(["1", "2", "3"]));
  });

  it("does not overlap placed words when the canvas has room", () => {
    const words = Array.from({ length: 5 }, (_, i) => ({
      id: String(i),
      text: `word${i}`,
      count: (i % 3) + 1,
    }));
    const placed = computeWordCloudLayout(words, {
      width: 600,
      height: 500,
      minFontSize: 14,
      maxFontSize: 32,
      measureText,
      padding: 4,
    });

    // x/y are each word's center (the canvas renders with textAnchor="middle"),
    // so convert to top-left bounds before checking for overlap.
    const bounds = placed.map((p) => ({
      left: p.x - p.width / 2,
      right: p.x + p.width / 2,
      top: p.y - p.height / 2,
      bottom: p.y + p.height / 2,
    }));

    for (let i = 0; i < bounds.length; i++) {
      for (let j = i + 1; j < bounds.length; j++) {
        const a = bounds[i];
        const b = bounds[j];
        const overlaps = !(
          a.right < b.left || b.right < a.left || a.bottom < b.top || b.bottom < a.top
        );
        expect(overlaps).toBe(false);
      }
    }
  });

  it("still places every word when the canvas is too crowded to avoid overlap", () => {
    const words = Array.from({ length: 12 }, (_, i) => ({
      id: String(i),
      text: `word${i}`,
      count: (i % 5) + 1,
    }));
    const placed = computeWordCloudLayout(words, {
      width: 500,
      height: 400,
      minFontSize: 14,
      maxFontSize: 48,
      measureText,
      padding: 4,
    });

    expect(placed).toHaveLength(words.length);
    expect(new Set(placed.map((p) => p.id)).size).toBe(words.length);
  });

  it("gives the highest-count word the largest font size", () => {
    const words = [
      { id: "small", text: "small", count: 1 },
      { id: "big", text: "big", count: 50 },
    ];
    const placed = computeWordCloudLayout(words, {
      width: 300,
      height: 300,
      minFontSize: 10,
      maxFontSize: 80,
      measureText,
    });
    const small = placed.find((p) => p.id === "small")!;
    const big = placed.find((p) => p.id === "big")!;
    expect(big.fontSize).toBeGreaterThan(small.fontSize);
  });

  it("keeps an unchanged word anchored near its previous position", () => {
    const words = [{ id: "1", text: "stable", count: 5 }];
    const previousPositions = new Map([["1", { x: 120, y: 80 }]]);
    const [placed] = computeWordCloudLayout(words, {
      width: 400,
      height: 300,
      minFontSize: 16,
      maxFontSize: 60,
      measureText,
      previousPositions,
    });
    expect(placed.x).toBe(120);
    expect(placed.y).toBe(80);
  });

  it("returns an empty layout for no words", () => {
    expect(
      computeWordCloudLayout([], { width: 200, height: 200, minFontSize: 10, maxFontSize: 40, measureText })
    ).toEqual([]);
  });
});
