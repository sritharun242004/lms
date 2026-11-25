/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnswerView } from "@/lib/prompt-bot/sessions";
import { MatrixPanel } from "./matrix-panel";
import type { MatrixAnswers } from "./use-matrix-answers";

afterEach(cleanup);

const ANSWERS: Record<string, AnswerView> = {
  q1: { questionId: "q1", answer: "", score: 3, reason: "Clear", notRelevant: false },
  q2: { questionId: "q2", answer: "", score: 1, reason: null, notRelevant: false },
};
function makeState(over: Partial<MatrixAnswers> = {}): MatrixAnswers {
  return {
    answerFor: (id: string) => ANSWERS[id],
    canCheck: true,
    checking: false,
    checkError: null,
    pendingCount: 0,
    contextStale: false,
    check: vi.fn(async () => {}),
    ...over,
  } as unknown as MatrixAnswers;
}
const checkAll = () => screen.getByRole("button", { name: /^Check all/ }) as HTMLButtonElement;

const props = {
  heading: "Skill definition",
  headingLevel: "h2" as const,
  groups: [{ id: "g1", title: "Questions", questions: [{ id: "q1", text: "When?" }, { id: "q2", text: "Context?" }] }],
  state: makeState(),
  activeId: "q1",
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

  it("shows no lead-in unless the group asks for one", () => {
    render(createElement(MatrixPanel, props));
    expect(screen.queryByText(/Finally/)).toBeNull();
  });

  it("puts the group's closing lead-in before its last question only", () => {
    const groups = [{ ...props.groups[0], closingLead: "Finally" }];
    render(createElement(MatrixPanel, { ...props, groups }));
    expect(screen.getByRole("button", { name: /^2\.\s*Finally:\s*Context\?/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^1\.\s*When\?/ }).textContent).not.toContain("Finally");
  });

  it("offers Check all only when answers changed or the prompt did, and runs one check", () => {
    render(createElement(MatrixPanel, props));
    expect(checkAll().disabled).toBe(true);
    cleanup();
    const state = makeState({ pendingCount: 2 });
    render(createElement(MatrixPanel, { ...props, state }));
    expect(checkAll().disabled).toBe(false);
    expect(checkAll().textContent).toMatch(/Check all.*2/);
    expect(screen.getByText(/2 answers changed since the last check/)).toBeTruthy();
    fireEvent.click(checkAll());
    expect(state.check).toHaveBeenCalledTimes(1);
    cleanup();
    render(createElement(MatrixPanel, { ...props, state: makeState({ contextStale: true }) }));
    expect(checkAll().disabled).toBe(false);
  });

  it("shows Checking… on Check all while a check runs", () => {
    render(createElement(MatrixPanel, { ...props, state: makeState({ pendingCount: 1, checking: true }) }));
    expect((screen.getByRole("button", { name: /Checking…/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("says when a check failed, and hides Check all without a scorer", () => {
    render(createElement(MatrixPanel, { ...props, state: makeState({ checkError: { code: "AI_FAILED", message: "The AI didn't answer." } }) }));
    expect(screen.getByText(/Couldn't check: The AI didn't answer\./)).toBeTruthy();
    cleanup();
    render(createElement(MatrixPanel, { ...props, state: makeState({ canCheck: false }) }));
    expect(screen.queryByRole("button", { name: /^Check all/ })).toBeNull();
  });
});
