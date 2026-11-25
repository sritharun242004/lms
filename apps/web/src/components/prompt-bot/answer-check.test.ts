/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement as h } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnswerView } from "@/lib/prompt-bot/sessions";
import { AnswerCheck, checkOnShortcut } from "./answer-check";
import type { MatrixAnswers } from "./use-matrix-answers";

afterEach(cleanup);

const QUESTION = "Why are we doing this?";
const answer = (over: Partial<AnswerView> = {}): AnswerView => ({ questionId: "q1", answer: "To keep the board informed", score: 2, reason: "Clear purpose; add the deadline", notRelevant: false, ...over });
const makeState = (over: Partial<MatrixAnswers> = {}, a = answer()) =>
  ({ answerFor: () => a, isChanged: () => true, contextStale: false, canCheck: true, checking: false, checkError: null, check: vi.fn(async () => {}), ...over }) as unknown as MatrixAnswers;

const mount = (state: MatrixAnswers) => {
  render(
    h("div", null,
      h("textarea", { "aria-label": "Answer", onKeyDown: checkOnShortcut(state, "q1") }),
      h(AnswerCheck, { state, questionId: "q1", question: QUESTION }),
    ),
  );
  return state;
};
const button = () => screen.getByRole("button", { name: /: Why are we doing this\?$/ }) as HTMLButtonElement;

describe("AnswerCheck", () => {
  it("names the question, announces the shortcut and checks on click", () => {
    const state = mount(makeState());
    expect(button().getAttribute("aria-label")).toBe(`Check answer: ${QUESTION}`);
    expect(button().getAttribute("aria-keyshortcuts")).toBe("Meta+Enter Control+Enter");
    expect(button().disabled).toBe(false);
    fireEvent.click(button());
    expect(state.check).toHaveBeenCalledTimes(1);
  });

  it("checks on Cmd or Ctrl+Enter in the answer box and keeps focus there", () => {
    const state = mount(makeState());
    const box = screen.getByRole("textbox", { name: "Answer" });
    box.focus();
    fireEvent.keyDown(box, { key: "Enter", metaKey: true });
    fireEvent.keyDown(box, { key: "Enter", ctrlKey: true });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(state.check).toHaveBeenCalledTimes(2);
    expect(document.activeElement).toBe(box);
  });

  it("is disabled and says Checked when the answer is unchanged since the last check", () => {
    const state = mount(makeState({ isChanged: () => false }));
    expect(button().disabled).toBe(true);
    expect(button().textContent).toContain("Checked");
    expect(button().getAttribute("aria-label")).toBe(`Checked: ${QUESTION}`);
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Answer" }), { key: "Enter", metaKey: true });
    expect(state.check).not.toHaveBeenCalled();
  });

  it("re-enables an unchanged answer when the prompt changed since the last check", () => {
    mount(makeState({ isChanged: () => false, contextStale: true }));
    expect(button().disabled).toBe(false);
  });

  it("is disabled when the answer is empty", () => {
    mount(makeState({}, answer({ answer: "  ", reason: null, score: 0 })));
    expect(button().disabled).toBe(true);
  });

  it("shows Checking… and announces it while a check runs", () => {
    mount(makeState({ checking: true }));
    expect(button().disabled).toBe(true);
    expect(button().textContent).toContain("Checking…");
    expect(screen.getByRole("status").textContent).toMatch(/Checking/);
  });

  it("shows the score and the reason under the answer, marked as the last check once edited", () => {
    mount(makeState({ isChanged: () => false }));
    expect(screen.getByText(/Clear purpose; add the deadline/, { selector: "p" }).textContent).toMatch(/^2\/3\s*—\s*Clear purpose/);
    cleanup();
    mount(makeState());
    expect(screen.getByText(/Last check/)).toBeTruthy();
  });

  it("shows an error inline with a retry", () => {
    const state = mount(makeState({ checkError: { code: "AI_FAILED", message: "The AI didn't answer." } }));
    expect(screen.getByText(/The AI didn't answer\./, { selector: "p" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry check" }));
    expect(state.check).toHaveBeenCalledTimes(1);
  });

  it.each(["LIMIT_REACHED", "AI_NOT_CONFIGURED"])("shows the %s message without a retry", (code) => {
    mount(makeState({ checkError: { code, message: "Server says why" } }));
    expect(screen.getByText(/Server says why/, { selector: "p" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Retry check" })).toBeNull();
  });

  it("offers nothing to check when the question is not relevant or there is no scorer", () => {
    mount(makeState({}, answer({ notRelevant: true })));
    expect(screen.queryByRole("button")).toBeNull();
    cleanup();
    mount(makeState({ canCheck: false }));
    expect(screen.queryByRole("button")).toBeNull();
  });
});
