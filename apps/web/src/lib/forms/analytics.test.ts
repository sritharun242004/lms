import { describe, expect, it, vi, beforeEach } from "vitest";

const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { form: { findUnique } } }));

import { getFormAnalytics, exportFormResponsesCsv } from "./analytics";

const sampleForm = {
  id: "f1",
  title: "Day 1 feedback",
  createdById: "staff1",
  sections: [
    {
      questions: [
        { id: "q1", type: "STAR_RATING", title: "Overall" },
        { id: "q2", type: "MULTIPLE_CHOICE", title: "Would you recommend?" },
        { id: "q3", type: "PARAGRAPH", title: "Comments" },
      ],
    },
  ],
  invitations: [{}, {}, {}],
  responses: [
    {
      id: "r1",
      submittedAt: new Date("2026-11-20T10:00:00Z"),
      anonymous: false,
      respondentUserId: "u1",
      answers: [
        { questionId: "q1", value: 5 },
        { questionId: "q2", value: "Yes" },
        { questionId: "q3", value: "Loved it" },
      ],
    },
    {
      id: "r2",
      submittedAt: new Date("2026-11-20T11:00:00Z"),
      anonymous: true,
      respondentUserId: null,
      answers: [
        { questionId: "q1", value: 3 },
        { questionId: "q2", value: "No" },
      ],
    },
  ],
};

beforeEach(() => {
  findUnique.mockReset();
});

describe("getFormAnalytics", () => {
  it("rejects a non-owner, non-admin staff member", async () => {
    findUnique.mockResolvedValue({ ...sampleForm, createdById: "someone-else" });
    await expect(getFormAnalytics({ id: "staff1", role: "MENTOR" }, "f1")).rejects.toThrow(/access/i);
  });

  it("computes completion rate, choice counts, and rating average", async () => {
    findUnique.mockResolvedValue(sampleForm);
    const analytics = await getFormAnalytics({ id: "staff1", role: "MENTOR" }, "f1");

    expect(analytics.totalResponses).toBe(2);
    expect(analytics.completionRate).toBeCloseTo(2 / 3);

    const rating = analytics.questionSummaries.find((q) => q.questionId === "q1");
    expect(rating).toMatchObject({ type: "RATING", average: 4 });

    const choice = analytics.questionSummaries.find((q) => q.questionId === "q2");
    expect(choice).toMatchObject({ type: "CHOICE", counts: { Yes: 1, No: 1 } });

    const text = analytics.questionSummaries.find((q) => q.questionId === "q3");
    expect(text).toMatchObject({ type: "TEXT", answers: ["Loved it"] });
  });
});

describe("exportFormResponsesCsv", () => {
  it("produces one header row and one row per response, anonymizing respondent when flagged", async () => {
    findUnique.mockResolvedValue(sampleForm);
    const csv = await exportFormResponsesCsv({ id: "staff1", role: "MENTOR" }, "f1");
    const lines = csv.split("\n");

    expect(lines[0]).toBe("Response ID,Submitted At,Respondent,Overall,Would you recommend?,Comments");
    expect(lines[1]).toContain("r1");
    expect(lines[1]).toContain("u1");
    expect(lines[2]).toContain("Anonymous");
    expect(lines[2]).not.toContain("null");
  });

  it("escapes commas and quotes in text answers", async () => {
    findUnique.mockResolvedValue({
      ...sampleForm,
      responses: [
        {
          id: "r3",
          submittedAt: new Date(),
          anonymous: false,
          respondentUserId: "u3",
          answers: [{ questionId: "q3", value: 'Great, "really" great' }],
        },
      ],
    });
    const csv = await exportFormResponsesCsv({ id: "staff1", role: "MENTOR" }, "f1");
    expect(csv).toContain('"Great, ""really"" great"');
  });
});
