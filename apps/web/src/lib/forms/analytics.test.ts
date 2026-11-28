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
  invitations: [{ status: "SUBMITTED" }, { status: "SUBMITTED" }, { status: "SENT" }],
  responses: [
    {
      id: "r1",
      submittedAt: new Date("2026-11-20T10:00:00Z"),
      anonymous: false,
      respondentUserId: "u1",
      respondent: { name: "Asha Rao" },
      invitationId: "i1",
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
      respondent: null,
      invitationId: "i2",
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
    expect(lines[1]).toContain("Asha Rao");
    expect(lines[1]).not.toContain("u1");
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
          respondent: { name: "Ravi" },
          invitationId: null,
          answers: [{ questionId: "q3", value: 'Great, "really" great' }],
        },
      ],
    });
    const csv = await exportFormResponsesCsv({ id: "staff1", role: "MENTOR" }, "f1");
    expect(csv).toContain('"Great, ""really"" great"');
  });
});

describe("answers that are not plain text", () => {
  const form = {
    ...sampleForm,
    sections: [
      {
        questions: [
          { id: "f", type: "FILE_UPLOAD", title: "Photo" },
          { id: "g", type: "MULTIPLE_CHOICE_GRID", title: "Rate each day" },
        ],
      },
    ],
    invitations: [{ status: "SUBMITTED" }],
    responses: [
      {
        id: "r1",
        submittedAt: new Date("2026-11-20T10:00:00Z"),
        anonymous: false,
        respondentUserId: "u1",
        respondent: { name: "Asha Rao" },
        invitationId: "i1",
        answers: [
          { questionId: "f", value: { fileId: "file1", fileName: "photo.jpg", size: 10 } },
          { questionId: "g", value: { "Day 1": "Great", "Day 2": "Good" } },
        ],
      },
      {
        id: "r2",
        submittedAt: new Date("2026-11-20T11:00:00Z"),
        anonymous: true,
        respondentUserId: null,
        respondent: null,
        invitationId: null,
        answers: [{ questionId: "g", value: { "Day 1": "Good" } }],
      },
    ],
  };

  it("lists uploaded files and reads grid answers instead of dropping them", async () => {
    findUnique.mockResolvedValue(form);
    const analytics = await getFormAnalytics({ id: "staff1", role: "MENTOR" }, "f1");
    expect(analytics.questionSummaries.find((q) => q.questionId === "f")).toEqual({
      questionId: "f",
      title: "Photo",
      type: "FILES",
      files: [{ fileId: "file1", fileName: "photo.jpg" }],
    });
    expect(analytics.questionSummaries.find((q) => q.questionId === "g")).toMatchObject({
      type: "TEXT",
      answers: ["Day 1: Great, Day 2: Good", "Day 1: Good"],
    });
  });

  it("counts public-link responses apart from chat completion", async () => {
    findUnique.mockResolvedValue(form);
    const analytics = await getFormAnalytics({ id: "staff1", role: "MENTOR" }, "f1");
    expect(analytics.totalResponses).toBe(2);
    expect(analytics.completionRate).toBe(1);
    expect(analytics.publicLinkResponses).toBe(1);
  });

  it("exports a file as its name and a link, not raw data", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://www.thexintelligence.ai/");
    findUnique.mockResolvedValue(form);
    const csv = await exportFormResponsesCsv({ id: "staff1", role: "MENTOR" }, "f1");
    expect(csv).toContain("photo.jpg (https://www.thexintelligence.ai/api/v1/forms/answer-files/file1)");
    expect(csv).not.toContain("fileId");
    vi.unstubAllEnvs();
  });
});

describe("responseTable", () => {
  const form = {
    ...sampleForm,
    sections: [
      {
        questions: [
          { id: "name", type: "SHORT_ANSWER", title: "Name (for certificate)" },
          { id: "email", type: "SHORT_ANSWER", title: "Email" },
          { id: "role", type: "SHORT_ANSWER", title: "Designation / Role / Title" },
          { id: "stay", type: "CHECKBOXES", title: "Stay connected" },
          { id: "photo", type: "FILE_UPLOAD", title: "Photo" },
        ],
      },
    ],
    invitations: [],
    responses: [
      {
        id: "r1",
        submittedAt: new Date("2026-11-27T10:00:00Z"),
        anonymous: true,
        respondentUserId: null,
        respondent: null,
        invitationId: null,
        answers: [
          { questionId: "name", value: "S. Balakrishnan" },
          { questionId: "email", value: "bala@example.com" },
          { questionId: "role", value: "CEO" },
          { questionId: "stay", value: ["Updates", "Workshops"] },
        ],
      },
      {
        // Skipped email — every later field must still land on this row.
        id: "r2",
        submittedAt: new Date("2026-11-27T11:00:00Z"),
        anonymous: true,
        respondentUserId: null,
        respondent: null,
        invitationId: null,
        answers: [
          { questionId: "name", value: "Sidharth S" },
          { questionId: "role", value: "Technical Assistant" },
          { questionId: "photo", value: { fileId: "file9", fileName: "me.png" } },
        ],
      },
    ],
  };

  it("maps every answer to its own respondent's row, keyed by the name question", async () => {
    findUnique.mockResolvedValue(form);
    const { responseTable } = await getFormAnalytics({ id: "staff1", role: "MENTOR" }, "f1");

    expect(responseTable.identityTitle).toBe("Name (for certificate)");
    expect(responseTable.columns.map((c) => c.title)).toEqual([
      "Email",
      "Designation / Role / Title",
      "Stay connected",
      "Photo",
    ]);

    const [bala, sidharth] = responseTable.rows;
    expect(bala.name).toBe("S. Balakrishnan");
    expect(bala.cells).toEqual([
      { kind: "text", text: "bala@example.com" },
      { kind: "text", text: "CEO" },
      { kind: "text", text: "Updates; Workshops" },
      { kind: "empty" },
    ]);
    expect(sidharth.name).toBe("Sidharth S");
    expect(sidharth.cells).toEqual([
      { kind: "empty" },
      { kind: "text", text: "Technical Assistant" },
      { kind: "empty" },
      { kind: "files", files: [{ fileId: "file9", fileName: "me.png" }] },
    ]);
  });

  it("falls back to the account name, and never reveals an anonymous respondent", async () => {
    findUnique.mockResolvedValue(sampleForm);
    const { responseTable } = await getFormAnalytics({ id: "staff1", role: "MENTOR" }, "f1");

    expect(responseTable.identityTitle).toBe("Respondent");
    expect(responseTable.columns).toHaveLength(3);
    expect(responseTable.rows.map((r) => r.name)).toEqual(["Asha Rao", "Anonymous"]);
    expect(responseTable.rows[0].source).toBe("CHAT");
  });
});
