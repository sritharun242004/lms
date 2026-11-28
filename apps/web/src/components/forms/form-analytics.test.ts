/** @vitest-environment jsdom */

import { createElement } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { FormAnalytics, type FormAnalyticsData } from "./form-analytics";

afterEach(cleanup);

const analytics: FormAnalyticsData = {
  formId: "f1",
  title: "Day 1 feedback",
  totalResponses: 2,
  invitationsSent: 3,
  completionRate: 2 / 3,
  publicLinkResponses: 0,
  questionSummaries: [
    { questionId: "q1", title: "Overall", type: "RATING", average: 4.5, distribution: { 4: 1, 5: 1 } },
    { questionId: "q2", title: "Recommend?", type: "CHOICE", counts: { Yes: 2 } },
    { questionId: "q3", title: "Comments", type: "TEXT", answers: ["Great session"] },
  ],
  responseTable: {
    identityTitle: "Name (for certificate)",
    columns: [
      { questionId: "role", title: "Designation", type: "SHORT_ANSWER" },
      { questionId: "city", title: "Home City", type: "SHORT_ANSWER" },
    ],
    rows: [
      {
        responseId: "r1",
        submittedAt: "2026-11-27T10:00:00.000Z",
        name: "S. Balakrishnan",
        source: "PUBLIC_LINK",
        cells: [{ kind: "text", text: "CEO" }, { kind: "text", text: "Sugar Land, TX" }],
      },
      {
        responseId: "r2",
        submittedAt: "2026-11-27T11:00:00.000Z",
        name: "Sidharth S",
        source: "PUBLIC_LINK",
        cells: [{ kind: "text", text: "Technical Assistant" }, { kind: "empty" }],
      },
    ],
  },
};

describe("FormAnalytics", () => {
  it("renders totals, completion rate, and per-question summaries", () => {
    render(createElement(FormAnalytics, { analytics }));
    expect(screen.getAllByText("2").length).toBeGreaterThan(0);
    expect(screen.getByText("67%")).toBeTruthy();
    expect(screen.getByText("4.5")).toBeTruthy();
    expect(screen.getByText("Great session")).toBeTruthy();
    expect(screen.getByRole("link", { name: /export csv/i }).getAttribute("href")).toBe(
      "/api/v1/forms/f1/responses/export"
    );
  });

  it("links each uploaded file and notes public-link responses", () => {
    render(
      createElement(FormAnalytics, {
        analytics: {
          ...analytics,
          publicLinkResponses: 1,
          questionSummaries: [{ questionId: "q9", title: "Photo", type: "FILES", files: [{ fileId: "file1", fileName: "photo.jpg" }] }],
        },
      })
    );
    expect(screen.getByRole("link", { name: "photo.jpg" }).getAttribute("href")).toBe("/api/v1/forms/answer-files/file1");
    expect(screen.getByText("1 via public link")).toBeTruthy();
  });

  it("shows each person's answers on their own row in the Responses table", async () => {
    const user = userEvent.setup();
    render(createElement(FormAnalytics, { analytics }));
    await user.click(screen.getByRole("tab", { name: /responses/i }));

    const table = screen.getByRole("table");
    expect(within(table).getByRole("columnheader", { name: /name \(for certificate\)/i })).toBeTruthy();
    const balaRow = within(table).getByText("S. Balakrishnan").closest("tr")!;
    expect(within(balaRow).getByText("CEO")).toBeTruthy();
    expect(within(balaRow).getByText("Sugar Land, TX")).toBeTruthy();
    const sidRow = within(table).getByText("Sidharth S").closest("tr")!;
    expect(within(sidRow).getByText("Technical Assistant")).toBeTruthy();
    expect(within(sidRow).getByLabelText("No answer")).toBeTruthy();

    await user.type(screen.getByRole("searchbox", { name: /search responses/i }), "ceo");
    expect(within(table).queryByText("Sidharth S")).toBeNull();
    expect(screen.getByText("1 of 2 responses")).toBeTruthy();
  });
});
