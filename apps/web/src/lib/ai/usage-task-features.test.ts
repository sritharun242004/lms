import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

import { AI_FEATURES, DEFAULT_LIMITS, normalizeLimits } from "./usage";

describe("task usage features", () => {
  it("meters Enhance and Write questions with their own defaults", () => {
    expect(AI_FEATURES).toContain("skill_enhance");
    expect(AI_FEATURES).toContain("skill_questions");
    expect(DEFAULT_LIMITS.skill_enhance).toBe(30);
    expect(DEFAULT_LIMITS.skill_questions).toBe(20);
  });

  it("falls back to the defaults when the settings have no keys for them", () => {
    const limits = normalizeLimits({});
    expect(limits.skill_enhance).toBe(30);
    expect(limits.skill_questions).toBe(20);
    expect(normalizeLimits({ skill_questions: 3 }).skill_questions).toBe(3);
  });
});
