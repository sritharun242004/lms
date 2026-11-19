/** @vitest-environment jsdom */

import { createElement } from "react";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuestionRenderer } from "./question-renderer";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});

describe("QuestionRenderer", () => {
  it("renders a short-answer input and reports changes", () => {
    const onChange = vi.fn();
    render(
      createElement(QuestionRenderer, {
        question: { id: "q1", type: "SHORT_ANSWER", title: "Your name", required: true, config: {} },
        value: "",
        onChange,
      })
    );
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Asha" } });
    expect(onChange).toHaveBeenCalledWith("Asha");
  });

  it("renders multiple-choice options and selects one", () => {
    const onChange = vi.fn();
    render(
      createElement(QuestionRenderer, {
        question: { id: "q1", type: "MULTIPLE_CHOICE", title: "Pick one", required: false, config: { options: ["A", "B"] } },
        value: null,
        onChange,
      })
    );
    fireEvent.click(screen.getByLabelText("B"));
    expect(onChange).toHaveBeenCalledWith("B");
  });

  it("renders checkboxes and toggles a selection on", () => {
    const onChange = vi.fn();
    render(
      createElement(QuestionRenderer, {
        question: { id: "q1", type: "CHECKBOXES", title: "Pick any", required: false, config: { options: ["X", "Y"] } },
        value: [],
        onChange,
      })
    );
    fireEvent.click(screen.getByLabelText("X"));
    expect(onChange).toHaveBeenCalledWith(["X"]);
  });

  it("renders a linear scale and reports the chosen number", () => {
    const onChange = vi.fn();
    render(
      createElement(QuestionRenderer, {
        question: { id: "q1", type: "LINEAR_SCALE", title: "Rate it", required: false, config: { min: 1, max: 5 } },
        value: null,
        onChange,
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "3" }));
    expect(onChange).toHaveBeenCalledWith(3);
  });
});
