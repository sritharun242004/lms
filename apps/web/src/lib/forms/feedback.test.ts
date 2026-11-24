import { describe, expect, it, vi, beforeEach } from "vitest";

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { form: { findMany } } }));

import { formatAnswerValue, getFeedbackAggregates, listFeedbackSubmissions } from "./feedback";

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

describe("formatAnswerValue", () => {
  it("joins an array of checkbox choices", () => {
    expect(formatAnswerValue(["Great pace", "Loved the examples"])).toBe("Great pace, Loved the examples");
  });

  it("passes through a plain string or number unchanged", () => {
    expect(formatAnswerValue("Great session")).toBe("Great session");
    expect(formatAnswerValue(5)).toBe("5");
  });

  it("flattens a grid answer into row: value pairs", () => {
    expect(formatAnswerValue({ Pace: "Just right", Content: "Too advanced" })).toBe("Pace: Just right; Content: Too advanced");
  });

  it("summarizes a file-upload answer without the raw file reference", () => {
    expect(formatAnswerValue({ fileId: "file_123" })).toBe("[File uploaded]");
  });
});

describe("listFeedbackSubmissions", () => {
  it("rejects a MENTEE", async () => {
    await expect(listFeedbackSubmissions({ id: "u1", role: "MENTEE" })).rejects.toThrow(/staff/i);
  });

  it("flattens responses into one row per submission with readable answers", async () => {
    findMany.mockResolvedValue([
      {
        id: "f1",
        title: "Day 1 feedback",
        sections: [{ questions: [{ id: "q1", title: "How was the session?" }] }],
        responses: [
          {
            id: "r1",
            submittedAt: new Date("2026-11-20T10:00:00Z"),
            anonymous: false,
            respondent: { name: "Asha Rao", email: "asha@example.com" },
            answers: [{ questionId: "q1", value: "Excellent" }],
          },
        ],
      },
    ]);

    const [submission] = await listFeedbackSubmissions({ id: "staff1", role: "ADMIN" });

    expect(submission.formTitle).toBe("Day 1 feedback");
    expect(submission.respondentName).toBe("Asha Rao");
    expect(submission.answers).toEqual([{ questionId: "q1", questionTitle: "How was the session?", value: "Excellent" }]);
  });

  it("hides respondent details for an anonymous submission", async () => {
    findMany.mockResolvedValue([
      {
        id: "f1",
        title: "Day 1 feedback",
        sections: [{ questions: [] }],
        responses: [
          {
            id: "r1",
            submittedAt: new Date(),
            anonymous: true,
            respondent: { name: "Asha Rao", email: "asha@example.com" },
            answers: [],
          },
        ],
      },
    ]);

    const [submission] = await listFeedbackSubmissions({ id: "staff1", role: "ADMIN" });
    expect(submission.respondentName).toBeNull();
    expect(submission.respondentEmail).toBeNull();
  });

  it("filters by a search term across form title and respondent", async () => {
    findMany.mockResolvedValue([
      {
        id: "f1",
        title: "Day 1 feedback",
        sections: [{ questions: [] }],
        responses: [
          { id: "r1", submittedAt: new Date(), anonymous: false, respondent: { name: "Asha Rao", email: "asha@example.com" }, answers: [] },
          { id: "r2", submittedAt: new Date(), anonymous: false, respondent: { name: "Ravi Kumar", email: "ravi@example.com" }, answers: [] },
        ],
      },
    ]);

    const results = await listFeedbackSubmissions({ id: "staff1", role: "ADMIN" }, { q: "ravi" });
    expect(results).toHaveLength(1);
    expect(results[0].respondentName).toBe("Ravi Kumar");
  });
});
