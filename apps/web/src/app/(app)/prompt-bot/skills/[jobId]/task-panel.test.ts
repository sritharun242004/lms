/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ enhanceTask: vi.fn() }));
vi.mock("@/lib/skills/jobs/client", () => ({ enhanceTask: mocks.enhanceTask }));

import { TaskPanel, taskShortMessageId } from "./task-panel";

const LONG = "Every month I turn the finance exports into the board report. ".repeat(10);
const BRIEF = "## Purpose\n\nI write the monthly board report.\n\n## Same every time\n\nThe template.";
const ok = <T,>(data: T) => ({ ok: true as const, data });

/** The workspace owns the description; this harness plays that part. */
function Harness({ initial, aiConfigured = true, onChange }: { initial: string; aiConfigured?: boolean; onChange?: (v: string) => void }) {
  const [description, setDescription] = useState(initial);
  return createElement(TaskPanel, {
    jobId: "j1",
    description,
    aiConfigured,
    onDescriptionChange: (v: string) => {
      onChange?.(v);
      setDescription(v);
    },
  });
}
const mount = (initial: string, aiConfigured = true) => {
  const onChange = vi.fn();
  render(createElement(Harness, { initial, aiConfigured, onChange }));
  return onChange;
};
const box = () => screen.getByLabelText("Describe the task") as HTMLTextAreaElement;
const enhance = () => screen.getByRole("button", { name: /^Enhanc/ }) as HTMLButtonElement;
const pressEnhance = async () => {
  await act(async () => {
    fireEvent.click(enhance());
  });
};

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("TaskPanel", () => {
  it("asks for 500 characters while short and points the box at the message", () => {
    mount("  Every month I write the board update.  ");
    expect(box().maxLength).toBe(20_000);
    expect(screen.getByText("37 / 500 minimum")).toBeTruthy();
    const message = document.getElementById(taskShortMessageId("j1"));
    expect(message?.textContent).toBe("Add a bit more detail — at least 500 characters (37/500)");
    expect(box().getAttribute("aria-describedby")).toContain(taskShortMessageId("j1"));
  });

  it("counts against the maximum once long enough and drops the message", () => {
    mount(LONG);
    expect(screen.getByText(`${LONG.length.toLocaleString("en-US")} / 20,000`)).toBeTruthy();
    expect(document.getElementById(taskShortMessageId("j1"))).toBeNull();
    expect(box().getAttribute("aria-describedby")).not.toContain(taskShortMessageId("j1"));
  });

  it("offers Enhance from five words, and never without the AI", () => {
    mount("one two three four");
    expect(enhance().disabled).toBe(true);
    fireEvent.change(box(), { target: { value: "one two three four five" } });
    expect(enhance().disabled).toBe(false);
    cleanup();
    mount(LONG, false);
    expect(enhance().disabled).toBe(true);
  });

  it("enhances the unsaved text, then Use this replaces it and Undo restores it", async () => {
    let finish: (v: unknown) => void = () => {};
    mocks.enhanceTask.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    const onChange = mount("Every month I write the board update");
    fireEvent.change(box(), { target: { value: "Every month I write the board update from exports" } });
    await pressEnhance();
    expect(mocks.enhanceTask).toHaveBeenCalledWith("j1", "Every month I write the board update from exports");
    expect(enhance().textContent).toContain("Enhancing…");
    expect(enhance().disabled).toBe(true);
    await act(async () => finish(ok({ brief: BRIEF })));
    expect(screen.getByRole("heading", { name: "Suggested brief" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Same every time" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Use this" }));
    expect(onChange).toHaveBeenLastCalledWith(BRIEF);
    expect(box().value).toBe(BRIEF);
    expect(screen.queryByRole("heading", { name: "Suggested brief" })).toBeNull();
    expect(screen.getByText("Replaced with the suggested brief.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(box().value).toBe("Every month I write the board update from exports");
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  it("ends the Undo offer on the next keystroke", async () => {
    mocks.enhanceTask.mockResolvedValue(ok({ brief: BRIEF }));
    mount("Every month I write the board update");
    await pressEnhance();
    fireEvent.click(screen.getByRole("button", { name: "Use this" }));
    fireEvent.change(box(), { target: { value: `${BRIEF} More.` } });
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  it("ends the Undo offer on the next Enhance", async () => {
    mocks.enhanceTask.mockResolvedValue(ok({ brief: BRIEF }));
    mount("Every month I write the board update");
    await pressEnhance();
    fireEvent.click(screen.getByRole("button", { name: "Use this" }));
    await pressEnhance();
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  it("keeps the text with Keep mine", async () => {
    mocks.enhanceTask.mockResolvedValue(ok({ brief: BRIEF }));
    const onChange = mount("Every month I write the board update");
    await pressEnhance();
    fireEvent.click(screen.getByRole("button", { name: "Keep mine" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(box().value).toBe("Every month I write the board update");
    expect(screen.queryByRole("heading", { name: "Suggested brief" })).toBeNull();
    expect(document.activeElement).toBe(box());
  });

  it("shows the server's message inline when Enhance fails", async () => {
    mocks.enhanceTask.mockResolvedValue({ ok: false, code: "LIMIT_REACHED", message: "You've used today's Enhance limit." });
    mount("Every month I write the board update");
    await pressEnhance();
    expect(screen.getByRole("alert").textContent).toBe("You've used today's Enhance limit.");
    expect(enhance().disabled).toBe(false);
  });

  it("lists what a good brief covers", () => {
    mount("");
    expect(screen.getByRole("heading", { name: "A good brief covers" })).toBeTruthy();
    for (const item of ["Purpose", "When it's used", "Same every time", "Varies each time", "Steps", "Quality bar", "Constraints"]) {
      expect(screen.getByText(item)).toBeTruthy();
    }
  });
});
