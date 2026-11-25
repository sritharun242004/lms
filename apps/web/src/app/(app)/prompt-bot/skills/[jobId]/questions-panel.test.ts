/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnswerView } from "@/lib/prompt-bot/sessions";
import { QuestionsPanel } from "./questions-panel";

afterEach(cleanup);

type State = Parameters<typeof QuestionsPanel>[0]["state"];
const MATRIX = {
  id: "pbm_skill_definition",
  name: "Skill definition",
  questions: [
    { id: "q1", text: "When should this skill be used?", guidance: "Triggers and phrases.", order: 0 },
    { id: "q2", text: "What context does it need to know?", guidance: "Background that stays true.", order: 1 },
  ],
};
const ANSWERS: Record<string, AnswerView> = {
  q1: { questionId: "q1", answer: "Every month", score: 3, reason: "Clear trigger", notRelevant: false },
  q2: { questionId: "q2", answer: "", score: 1, reason: "Only hinted at", notRelevant: false },
};
const mount = (matrix = MATRIX) => {
  const state = { answerFor: (id: string) => ANSWERS[id], scoreState: "idle", updateAnswer: vi.fn() } as unknown as State;
  render(createElement(QuestionsPanel, { matrix, state }));
  return state;
};
// The StatusBar meters share each question's text as their label, so boxes are found by role.
const box = (name: string) => screen.getByRole("textbox", { name }) as HTMLTextAreaElement;

describe("QuestionsPanel", () => {
  it("shows the questions with bars, readiness and what they are scored against", () => {
    mount();
    expect(screen.getByRole("heading", { level: 2, name: "Skill definition" })).toBeTruthy();
    expect(screen.getAllByRole("meter")).toHaveLength(2);
    expect(screen.getByText(/of 2 ready/).textContent).toBe("1 of 2 ready");
    expect(screen.getByText("Scored against your job description, answers and files.")).toBeTruthy();
  });

  it("opens the first question without focusing it, then focuses the box of the one selected", () => {
    mount();
    expect(box("When should this skill be used?").value).toBe("Every month");
    expect(document.activeElement).not.toBe(box("When should this skill be used?"));
    fireEvent.click(screen.getByRole("button", { name: /^2\.\s*What context/ }));
    const second = box("What context does it need to know?");
    expect(document.activeElement).toBe(second);
    expect(second.placeholder).toBe("Background that stays true.");
    expect(second.maxLength).toBe(4000);
    const help = document.getElementById(second.getAttribute("aria-describedby") ?? "");
    expect(help?.textContent).toMatch(/^Short notes are fine/);
  });

  it("sends typing and relevance changes to the shared answer state", () => {
    const state = mount();
    fireEvent.change(box("When should this skill be used?"), { target: { value: "Monthly board meetings" } });
    expect(state.updateAnswer).toHaveBeenCalledWith("q1", { answer: "Monthly board meetings" });
    fireEvent.click(screen.getByRole("button", { name: "Mark not relevant: What context does it need to know?" }));
    expect(state.updateAnswer).toHaveBeenCalledWith("q2", { notRelevant: true });
  });

  it("says so when no questions are set up", () => {
    mount({ ...MATRIX, questions: [] });
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText("No questions are set up yet.")).toBeTruthy();
  });
});
