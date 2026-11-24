import { beforeEach, describe, expect, it } from "vitest";
import { clearRateLimit, hitRateLimit, resetRateLimitsForTests } from "./rate-limit";

const rule = { limit: 3, windowMs: 60_000 };

beforeEach(resetRateLimitsForTests);

describe("hitRateLimit", () => {
  it("allows up to the limit, then reports seconds until the window resets", () => {
    expect([1, 2, 3].map(() => hitRateLimit("k", rule, 0))).toEqual([null, null, null]);
    expect(hitRateLimit("k", rule, 15_000)).toBe(45);
  });

  it("starts a fresh window once the old one has passed", () => {
    for (let i = 0; i < 4; i++) hitRateLimit("k", rule, 0);
    expect(hitRateLimit("k", rule, 60_000)).toBeNull();
  });

  it("counts keys independently and forgets a cleared key", () => {
    for (let i = 0; i < 4; i++) hitRateLimit("a", rule, 0);
    expect(hitRateLimit("b", rule, 0)).toBeNull();
    clearRateLimit("a");
    expect(hitRateLimit("a", rule, 0)).toBeNull();
  });
});
