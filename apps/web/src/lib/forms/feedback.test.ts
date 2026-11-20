import { describe, expect, it, vi, beforeEach } from "vitest";

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { form: { findMany } } }));

import { getFeedbackAggregates } from "./feedback";

beforeEach(() => {
  findMany.mockReset();
});

describe("getFeedbackAggregates", () => {
  it("rejects a MENTEE", async () => {
    await expect(getFeedbackAggregates({ id: "u1", role: "MENTEE" })).rejects.toThrow(/staff/i);
  });

  it("averages rating-question answers per feedback target", async () => {
    findMany.mockResolvedValue([
      {
        id: "f1",
        title: "Mehul session feedback",
        feedbackTargetType: "TRAINER",
        feedbackTargetLabel: "Mehul Nanavati",
        sections: [
          {
            questions: [
              { id: "q1", type: "STAR_RATING", title: "How was the session?" },
              { id: "q2", type: "SHORT_ANSWER", title: "Anything else?" },
            ],
          },
        ],
        responses: [
          { id: "r1", answers: [{ questionId: "q1", value: 5 }, { questionId: "q2", value: "great" }] },
          { id: "r2", answers: [{ questionId: "q1", value: 3 }] },
        ],
      },
    ]);

    const [aggregate] = await getFeedbackAggregates({ id: "staff1", role: "MENTOR" });

    expect(aggregate.targetType).toBe("TRAINER");
    expect(aggregate.targetLabel).toBe("Mehul Nanavati");
    expect(aggregate.responseCount).toBe(2);
    expect(aggregate.averagesByQuestion).toEqual([{ questionId: "q1", questionTitle: "How was the session?", average: 4 }]);
  });
});
