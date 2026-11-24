/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnswerView } from "@/lib/prompt-bot/sessions";
import { MatrixPanel } from "./matrix-panel";

afterEach(cleanup);

const ANSWERS: Record<string, AnswerView> = {
  q1: { questionId: "q1", answer: "", score: 3, reason: "Clear", notRelevant: false },
  q2: { questionId: "q2", answer: "", score: 1, reason: null, notRelevant: false },
};
const props = {
  heading: "Skill definition",
  headingLevel: "h2" as const,
  groups: [{ id: "g1", title: "Questions", questions: [{ id: "q1", text: "When?" }, { id: "q2", text: "Context?" }] }],
  answerFor: (id: string) => ANSWERS[id],
  activeId: "q1",
  scoreState: "idle" as const,
  onSelect: vi.fn(),
  onToggleRelevant: vi.fn(),
};

describe("MatrixPanel", () => {
  it("uses the requested heading level, numbers the questions and shows readiness", () => {
    render(createElement(MatrixPanel, props));
    expect(screen.getByRole("heading", { level: 2, name: "Skill definition" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: "Questions" })).toBeTruthy();
    expect(screen.getByText(/of 2 ready/).textContent).toBe("1 of 2 ready");
    expect(screen.getByRole("button", { name: /^2\.\s*Context\?/ })).toBeTruthy();
    expect(screen.getAllByRole("meter")).toHaveLength(2);
  });

  it("says when the bars could not update", () => {
    render(createElement(MatrixPanel, { ...props, scoreState: "failed" as const }));
    expect(screen.getByText(/Couldn't update the bars/)).toBeTruthy();
  });
});
