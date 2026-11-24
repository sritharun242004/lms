import { describe, expect, it } from "vitest";
import { CONTINUE_WINDOW_MS, splitRecent, updatedLabel } from "./recent";

const NOW = Date.parse("2026-11-24T12:00:00Z");
const at = (msAgo: number) => ({ updatedAt: new Date(NOW - msAgo) });

describe("splitRecent", () => {
  it("offers the newest session when it was edited within a week", () => {
    const a = at(60_000);
    const b = at(CONTINUE_WINDOW_MS * 2);
    expect(splitRecent([a, b], NOW)).toEqual({ resume: a, others: [b] });
  });

  it("offers nothing when the newest session is older than a week, or there is none", () => {
    const old = at(CONTINUE_WINDOW_MS + 1);
    expect(splitRecent([old], NOW)).toEqual({ resume: null, others: [old] });
    expect(splitRecent([], NOW)).toEqual({ resume: null, others: [] });
  });
});

describe("updatedLabel", () => {
  it("reads naturally from seconds to days", () => {
    expect(updatedLabel(new Date(NOW - 10_000), NOW)).toBe("Updated just now");
    expect(updatedLabel(new Date(NOW - 5 * 60_000), NOW)).toBe("Updated 5 minutes ago");
    expect(updatedLabel(new Date(NOW - 3 * 3_600_000), NOW)).toBe("Updated 3 hours ago");
    expect(updatedLabel(new Date(NOW - 26 * 3_600_000), NOW)).toBe("Updated yesterday");
  });
});
