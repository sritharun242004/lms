import { describe, expect, it } from "vitest";
import { pollAxis } from "./poll-bar-scale";

describe("pollAxis", () => {
  it("renders an empty poll safely with a 0-1 axis", () => {
    expect(pollAxis(0)).toEqual({ max: 1, ticks: [0, 1] });
    expect(pollAxis(Number.NaN)).toEqual({ max: 1, ticks: [0, 1] });
  });

  it("uses every whole vote as a tick for small polls", () => {
    expect(pollAxis(1).ticks).toEqual([0, 1]);
    expect(pollAxis(3).ticks).toEqual([0, 1, 2, 3]);
    expect(pollAxis(5)).toEqual({ max: 5, ticks: [0, 1, 2, 3, 4, 5] });
  });

  it("steps by 2, 5, 10... and rounds the maximum up to a tick", () => {
    expect(pollAxis(7)).toEqual({ max: 8, ticks: [0, 2, 4, 6, 8] });
    expect(pollAxis(10)).toEqual({ max: 10, ticks: [0, 2, 4, 6, 8, 10] });
    expect(pollAxis(23)).toEqual({ max: 25, ticks: [0, 5, 10, 15, 20, 25] });
    expect(pollAxis(100)).toEqual({ max: 100, ticks: [0, 20, 40, 60, 80, 100] });
    expect(pollAxis(240)).toEqual({ max: 250, ticks: [0, 50, 100, 150, 200, 250] });
  });

  it("always covers the highest vote count with at most six ticks", () => {
    for (let votes = 0; votes <= 5000; votes += 1) {
      const axis = pollAxis(votes);
      expect(axis.max).toBeGreaterThanOrEqual(Math.max(1, votes));
      expect(axis.ticks.length).toBeLessThanOrEqual(6);
      expect(axis.ticks[0]).toBe(0);
      expect(axis.ticks[axis.ticks.length - 1]).toBe(axis.max);
    }
  });
});
