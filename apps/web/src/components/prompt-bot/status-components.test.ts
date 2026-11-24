/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StatusBar } from "./status-bar";
import { QuestionRow } from "./question-row";
import { ReadinessMeter } from "./readiness-meter";

afterEach(cleanup);

describe("StatusBar", () => {
  it.each([0, 1, 2, 3])("fills %i of 3 slices and exposes it as a meter", (score) => {
    render(createElement(StatusBar, { score, label: "Why are we doing this?" }));
    const meter = screen.getByRole("meter", { name: "Why are we doing this?" });
    expect(meter.getAttribute("aria-valuenow")).toBe(String(score));
    expect(meter.getAttribute("aria-valuemax")).toBe("3");
    expect(meter.querySelectorAll("[data-filled='true']")).toHaveLength(score);
  });
});

describe("QuestionRow", () => {
  const base = { index: 1, text: "Who is the target audience?", reason: "Audience named but not specific", active: false, onSelect: vi.fn(), onToggleRelevant: vi.fn() };

  it("auto-ticks only at 3/3", () => {
    const { rerender } = render(createElement(QuestionRow, { ...base, score: 2, notRelevant: false }));
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
    rerender(createElement(QuestionRow, { ...base, score: 3, notRelevant: false }));
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText("3/3")).toBeTruthy();
  });

  it("collapses the note of a fully answered row until it is selected", () => {
    const note = () => screen.getByText(base.reason);
    const { rerender } = render(createElement(QuestionRow, { ...base, score: 2, notRelevant: false }));
    expect(note().getAttribute("data-collapsed")).toBe("false");
    rerender(createElement(QuestionRow, { ...base, score: 3, notRelevant: false }));
    expect(note().getAttribute("data-collapsed")).toBe("true");
    expect(note().getAttribute("title")).toBe(base.reason);
    rerender(createElement(QuestionRow, { ...base, score: 3, notRelevant: false, active: true }));
    expect(note().getAttribute("data-collapsed")).toBe("false");
  });

  it("shows not-relevant questions dimmed with a restore action", () => {
    const onToggleRelevant = vi.fn();
    render(createElement(QuestionRow, { ...base, score: 0, notRelevant: true, onToggleRelevant }));
    fireEvent.click(screen.getByRole("button", { name: /mark relevant again/i }));
    expect(onToggleRelevant).toHaveBeenCalled();
    expect(screen.getByText(/not relevant/i)).toBeTruthy();
  });
});

describe("ReadinessMeter", () => {
  it("reads 'N of M ready'", () => {
    render(createElement(ReadinessMeter, { answered: 3, relevant: 7, ratio: 0.4 }));
    expect(screen.getByText(/of 7 ready/).textContent).toBe("3 of 7 ready");
  });
});
