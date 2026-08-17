import { describe, expect, it } from "vitest";
import { computeWordCloudLayout, fontSizeForCount, rotationForWord } from "./layout";

const measureText = (text: string, fontSize: number) => text.length * fontSize * 0.6;

function expectNoOverlaps(placed: ReturnType<typeof computeWordCloudLayout>) {
  const bounds = placed.map((word) => ({
    left: word.x - word.width / 2,
    right: word.x + word.width / 2,
    top: word.y - word.height / 2,
    bottom: word.y + word.height / 2,
  }));

  for (let i = 0; i < bounds.length; i++) {
    for (let j = i + 1; j < bounds.length; j++) {
      const a = bounds[i];
      const b = bounds[j];
      expect(
        a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top
      ).toBe(true);
    }
  }
}

describe("fontSizeForCount", () => {
  it("uses a high-contrast default range for rare and repeated words", () => {
    expect(fontSizeForCount(1)).toBe(14);
    expect(fontSizeForCount(12)).toBe(220);
  });

  it("makes repeated words visibly larger after only a few mentions", () => {
    expect(fontSizeForCount(2)).toBeGreaterThanOrEqual(48);
    expect(fontSizeForCount(5)).toBeGreaterThanOrEqual(110);
    expect(fontSizeForCount(5) - fontSizeForCount(1)).toBeGreaterThanOrEqual(96);
  });

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
  it("keeps every word horizontal", () => {
    for (const word of ["a", "creative", "innovative", "well-being"]) {
      expect(rotationForWord(word)).toBe(0);
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

    expectNoOverlaps(placed);
  });

  it("shrinks a crowded cloud until every word fits without overlap", () => {
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
    expectNoOverlaps(placed);
  });

  it("scales an oversized repeated word down to remain inside the canvas", () => {
    const [placed] = computeWordCloudLayout(
      [{ id: "wide", text: "extraordinary", count: 12 }],
      {
        width: 300,
        height: 180,
        minFontSize: 14,
        maxFontSize: 220,
        measureText,
      }
    );
    expect(placed.x - placed.width / 2).toBeGreaterThanOrEqual(0);
    expect(placed.x + placed.width / 2).toBeLessThanOrEqual(300);
    expect(placed.y - placed.height / 2).toBeGreaterThanOrEqual(0);
    expect(placed.y + placed.height / 2).toBeLessThanOrEqual(180);
  });

  it("keeps every word inside the canvas when the cloud is crowded", () => {
    const words = Array.from({ length: 18 }, (_, index) => ({
      id: String(index),
      text: `response${index}`,
      count: Math.max(1, 12 - index),
    }));
    const placed = computeWordCloudLayout(words, {
      width: 420,
      height: 260,
      minFontSize: 14,
      maxFontSize: 120,
      measureText,
      padding: 4,
    });
    for (const word of placed) {
      expect(word.x - word.width / 2).toBeGreaterThanOrEqual(0);
      expect(word.x + word.width / 2).toBeLessThanOrEqual(420);
      expect(word.y - word.height / 2).toBeGreaterThanOrEqual(0);
      expect(word.y + word.height / 2).toBeLessThanOrEqual(260);
    }
    expectNoOverlaps(placed);
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

  it("anchors the highest-count word at the center when counts change", () => {
    const words = [
      { id: "high", text: "focus", count: 12 },
      { id: "low", text: "edge", count: 1 },
    ];
    const previousPositions = new Map([
      ["high", { x: 90, y: 70 }],
      ["low", { x: 300, y: 200 }],
    ]);
    const placed = computeWordCloudLayout(words, {
      width: 600,
      height: 400,
      minFontSize: 16,
      maxFontSize: 72,
      measureText,
      previousPositions,
    });
    const high = placed.find((word) => word.id === "high")!;
    expect(high.x).toBe(300);
    expect(high.y).toBe(200);
  });

  it("keeps positions fixed when counts grow without changing the dominant word", () => {
    const initial = computeWordCloudLayout(
      [
        { id: "core", text: "mohan", count: 8 },
        { id: "left", text: "design", count: 3 },
        { id: "right", text: "coach", count: 1 },
      ],
      { width: 700, height: 420, minFontSize: 14, maxFontSize: 100, measureText }
    );
    const previousPositions = new Map(initial.map(({ id, x, y }) => [id, { x, y }]));
    const updated = computeWordCloudLayout(
      [
        { id: "core", text: "mohan", count: 10 },
        { id: "left", text: "design", count: 5 },
        { id: "right", text: "coach", count: 2 },
      ],
      {
        width: 700,
        height: 420,
        minFontSize: 14,
        maxFontSize: 100,
        measureText,
        previousPositions,
      }
    );

    for (const word of updated) {
      expect({ x: word.x, y: word.y }).toEqual(previousPositions.get(word.id));
    }
    expectNoOverlaps(updated);
  });

  it("swaps a new dominant word into the center without moving other words", () => {
    const initial = computeWordCloudLayout(
      [
        { id: "old", text: "mohan", count: 8 },
        { id: "new", text: "logesh", count: 4 },
        { id: "other", text: "coach", count: 2 },
      ],
      { width: 700, height: 420, minFontSize: 14, maxFontSize: 100, measureText }
    );
    const prior = new Map(initial.map(({ id, x, y }) => [id, { x, y }]));
    const updated = computeWordCloudLayout(
      [
        { id: "old", text: "mohan", count: 8 },
        { id: "new", text: "logesh", count: 12 },
        { id: "other", text: "coach", count: 2 },
      ],
      {
        width: 700,
        height: 420,
        minFontSize: 14,
        maxFontSize: 100,
        measureText,
        previousPositions: prior,
      }
    );
    const byId = new Map(updated.map((word) => [word.id, word]));

    expect({ x: byId.get("new")!.x, y: byId.get("new")!.y }).toEqual({ x: 350, y: 210 });
    expect({ x: byId.get("old")!.x, y: byId.get("old")!.y }).toEqual(prior.get("new"));
    expect({ x: byId.get("other")!.x, y: byId.get("other")!.y }).toEqual(prior.get("other"));
    expectNoOverlaps(updated);
  });

  it("places lower-frequency words farther from the center", () => {
    const words = [
      { id: "high", text: "core", count: 12 },
      { id: "medium", text: "middle", count: 5 },
      { id: "low", text: "outer", count: 1 },
    ];
    const placed = computeWordCloudLayout(words, {
      width: 800,
      height: 600,
      minFontSize: 16,
      maxFontSize: 80,
      measureText,
    });
    const distance = (id: string) => {
      const word = placed.find((entry) => entry.id === id)!;
      return Math.hypot(word.x - 400, word.y - 300);
    };
    expect(distance("high")).toBe(0);
    expect(distance("medium")).toBeLessThanOrEqual(distance("low"));
  });

  it("returns an empty layout for no words", () => {
    expect(
      computeWordCloudLayout([], { width: 200, height: 200, minFontSize: 10, maxFontSize: 40, measureText })
    ).toEqual([]);
  });
});
