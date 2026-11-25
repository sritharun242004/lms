/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MatrixPanel } from "./matrix-panel";
import type { MatrixAnswers } from "./use-matrix-answers";

afterEach(cleanup);

const state = {
  answerFor: (id: string) => ({ questionId: id, answer: "", score: 0, reason: null, notRelevant: false }),
  canCheck: false, checking: false, checkError: null, pendingCount: 0, contextStale: false, check: vi.fn(),
} as unknown as MatrixAnswers;
const base = { heading: "Answer now (same every time)", headingLevel: "h2" as const, groups: [{ id: "g", title: "Questions", questions: [{ id: "q1", text: "When?" }] }], state, activeId: "q1", onSelect: vi.fn() };

describe("MatrixPanel subheading", () => {
  it("shows a quiet subheading under the heading, tied to the panel's name", () => {
    render(createElement(MatrixPanel, { ...base, subheading: "Questions for an Instagram carousel" }));
    const sub = screen.getByText("Questions for an Instagram carousel");
    expect(sub.tagName).toBe("P");
    expect(screen.getByRole("complementary").getAttribute("aria-describedby")).toBe(sub.id);
  });

  it("renders nothing extra without one", () => {
    render(createElement(MatrixPanel, base));
    expect(screen.getByRole("complementary").getAttribute("aria-describedby")).toBeNull();
  });
});
