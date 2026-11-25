/** @vitest-environment jsdom */

import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
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
});
