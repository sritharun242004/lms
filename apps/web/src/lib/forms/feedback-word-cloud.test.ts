import { describe, expect, it, vi, beforeEach } from "vitest";

const { findMany, answerFindMany } = vi.hoisted(() => ({ findMany: vi.fn(), answerFindMany: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { form: { findMany }, formAnswer: { findMany: answerFindMany } } }));

import { getFeedbackWordCloud, getOpenTextAnswersForResponses } from "./feedback-word-cloud";

beforeEach(() => {
  findMany.mockReset();
  answerFindMany.mockReset();
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

describe("getOpenTextAnswersForResponses", () => {
  it("returns only string-valued open-text answers for the given responses", async () => {
    answerFindMany.mockResolvedValue([
      { id: "a1", value: "Great session", responseId: "r1", question: { title: "Comments" } },
    ]);
    const answers = await getOpenTextAnswersForResponses({ id: "staff1", role: "MENTOR" }, ["r1"]);
    expect(answers).toEqual([{ responseId: "r1", questionTitle: "Comments", text: "Great session" }]);
  });
});
