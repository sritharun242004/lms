import { describe, expect, it, vi, beforeEach } from "vitest";

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { form: { findMany } } }));

import { getFeedbackWordCloud } from "./feedback-word-cloud";

beforeEach(() => {
  findMany.mockReset();
});

const formWithOpenAnswers = {
  id: "f1",
  sections: [{ questions: [{ id: "q1", type: "PARAGRAPH" }, { id: "q2", type: "STAR_RATING" }] }],
  responses: [
    { id: "r1", answers: [{ questionId: "q1", value: "The trainer was great and very clear" }] },
    { id: "r2", answers: [{ questionId: "q1", value: "Great session, the pace was great" }, { questionId: "q2", value: 5 }] },
  ],
};

describe("getFeedbackWordCloud", () => {
  it("rejects a MENTEE", async () => {
    await expect(getFeedbackWordCloud({ id: "u1", role: "MENTEE" }, {})).rejects.toThrow(/staff/i);
  });

  it("tokenizes open-text answers, drops stop words, and counts frequency", async () => {
    findMany.mockResolvedValue([formWithOpenAnswers]);
    const entries = await getFeedbackWordCloud({ id: "staff1", role: "MENTOR" }, {});

    const great = entries.find((e) => e.word === "great");
    expect(great?.count).toBe(3);
    expect(great?.responseIds.sort()).toEqual(["r1", "r2"]);

    // stop words never appear
    expect(entries.find((e) => e.word === "the")).toBeUndefined();
    expect(entries.find((e) => e.word === "was")).toBeUndefined();

    // a rating (non-string) answer never gets tokenized
    expect(entries.find((e) => e.word === "5")).toBeUndefined();
  });

  it("sorts entries by descending frequency", async () => {
    findMany.mockResolvedValue([formWithOpenAnswers]);
    const entries = await getFeedbackWordCloud({ id: "staff1", role: "MENTOR" }, {});
    for (let i = 1; i < entries.length; i += 1) {
      expect(entries[i - 1].count).toBeGreaterThanOrEqual(entries[i].count);
    }
  });
});
