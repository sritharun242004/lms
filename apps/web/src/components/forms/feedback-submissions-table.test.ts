/** @vitest-environment jsdom */

import { createElement } from "react";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FeedbackSubmissionsTable } from "./feedback-submissions-table";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const SUBMISSION = {
  responseId: "r1",
  formId: "f1",
  formTitle: "Day 1 feedback",
  submittedAt: "2026-11-20T10:00:00Z",
  anonymous: false,
  respondentName: "Asha Rao",
  respondentEmail: "asha@example.com",
  answers: [{ questionId: "q1", questionTitle: "How was the session?", value: "Excellent" }],
};

function mockFetch(submissions = [SUBMISSION]) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ success: true, data: { submissions } }),
  });
}

describe("FeedbackSubmissionsTable", () => {
  it("lists submissions with submission date and participant name", async () => {
    global.fetch = mockFetch() as unknown as typeof fetch;
    render(createElement(FeedbackSubmissionsTable));
    await waitFor(() => expect(screen.getByText("Asha Rao")).toBeTruthy());
    expect(screen.getAllByText(/day 1 feedback/i).length).toBeGreaterThan(0);
  });

  it("shows Anonymous instead of a name for an anonymous submission", async () => {
    global.fetch = mockFetch([{ ...SUBMISSION, anonymous: true }]) as unknown as typeof fetch;
    render(createElement(FeedbackSubmissionsTable));
    await waitFor(() => expect(screen.getByText("Anonymous")).toBeTruthy());
  });

  it("opens a details dialog with the question and the actual submitted answer", async () => {
    global.fetch = mockFetch() as unknown as typeof fetch;
    render(createElement(FeedbackSubmissionsTable));
    await waitFor(() => expect(screen.getByText("Asha Rao")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /view/i }));
    expect(screen.getByText(/how was the session/i)).toBeTruthy();
    expect(screen.getByText("Excellent")).toBeTruthy();
  });

  it("filters the list by search", async () => {
    global.fetch = mockFetch([
      SUBMISSION,
      { ...SUBMISSION, responseId: "r2", respondentName: "Ravi Kumar", respondentEmail: "ravi@example.com" },
    ]) as unknown as typeof fetch;
    render(createElement(FeedbackSubmissionsTable));
    await waitFor(() => expect(screen.getByText("Asha Rao")).toBeTruthy());
    fireEvent.change(screen.getByPlaceholderText(/search by form, name, or email/i), { target: { value: "ravi" } });
    expect(screen.queryByText("Asha Rao")).toBeNull();
    expect(screen.getByText("Ravi Kumar")).toBeTruthy();
  });

  it("links the export buttons to the feedback export endpoint", async () => {
    global.fetch = mockFetch() as unknown as typeof fetch;
    render(createElement(FeedbackSubmissionsTable));
    await waitFor(() => expect(screen.getByText("Asha Rao")).toBeTruthy());
    const link = screen.getByRole("link", { name: /export csv/i });
    expect(link.getAttribute("href")).toBe("/api/v1/admin/feedback/export?format=csv");
  });
});
