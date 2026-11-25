/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskQuestionView } from "@/lib/skills/jobs/types";

const mocks = vi.hoisted(() => ({ addQuestion: vi.fn(), patchQuestion: vi.fn(), deleteQuestion: vi.fn() }));
vi.mock("@/lib/skills/jobs/client", () => mocks);

import { PerUseList } from "./per-use-list";

const input = (over: Partial<TaskQuestionView> = {}): TaskQuestionView => ({
  id: "p1", order: 6, kind: "PER_USE", text: "Client name", guidance: "e.g. Acme Ltd", required: true,
  wantsFiles: false, fileHint: null, fileNote: "", source: "AI", ...over,
});
const ok = <T,>(data: T) => ({ ok: true as const, data });
const fail = { ok: false as const, code: "TOO_MANY_QUESTIONS", message: "A task can have at most 12 questions to answer now. Remove one to add another." };
const mount = (inputs: TaskQuestionView[] = [input()]) => {
  const props = { jobId: "j1", inputs, onQuestionChange: vi.fn(), onQuestionRemoved: vi.fn() };
  render(createElement(PerUseList, props));
  return props;
};
const flush = () => act(async () => {});
const name = () => screen.getByLabelText("Input name") as HTMLInputElement;
const hint = () => screen.getByPlaceholderText("Hint or example, optional") as HTMLInputElement;

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("PerUseList", () => {
  it("explains the list and shows each input", () => {
    mount();
    expect(screen.getByRole("heading", { name: "Claude will ask each time" })).toBeTruthy();
    expect(screen.getByText(/These change every time — client names, dates, figures\. Don't answer them here/)).toBeTruthy();
    expect(name().value).toBe("Client name");
    expect(hint().value).toBe("e.g. Acme Ltd");
    expect((screen.getByRole("checkbox", { name: /Required/ }) as HTMLInputElement).checked).toBe(true);
  });

  it("says when nothing varies yet", () => {
    mount([]);
    expect(screen.getByText("Nothing varies between uses yet. Add an input if Claude should ask for something each time.")).toBeTruthy();
  });

  it("renames on blur, and not when unchanged or blank", async () => {
    mocks.patchQuestion.mockResolvedValue(ok(input({ text: "Client company" })));
    const props = mount();
    fireEvent.blur(name());
    fireEvent.change(name(), { target: { value: "   " } });
    fireEvent.blur(name());
    expect(name().value).toBe("Client name");
    expect(mocks.patchQuestion).not.toHaveBeenCalled();
    fireEvent.change(name(), { target: { value: " Client company " } });
    fireEvent.blur(name());
    await flush();
    expect(mocks.patchQuestion).toHaveBeenCalledWith("j1", "p1", { text: "Client company" });
    expect(props.onQuestionChange).toHaveBeenCalledWith(expect.objectContaining({ text: "Client company" }));
  });

  it("saves the hint on blur", async () => {
    mocks.patchQuestion.mockResolvedValue(ok(input({ guidance: "Legal name" })));
    mount();
    fireEvent.change(hint(), { target: { value: "Legal name" } });
    fireEvent.blur(hint());
    await flush();
    expect(mocks.patchQuestion).toHaveBeenCalledWith("j1", "p1", { guidance: "Legal name" });
  });

  it("reverts and explains when a save fails", async () => {
    mocks.patchQuestion.mockResolvedValue({ ok: false, code: "NOT_FOUND", message: "Question not found" });
    mount();
    fireEvent.change(name(), { target: { value: "Client company" } });
    fireEvent.blur(name());
    await flush();
    expect(name().value).toBe("Client name");
    expect(screen.getByRole("alert").textContent).toBe("Question not found");
  });

  it("toggles Required", async () => {
    mocks.patchQuestion.mockResolvedValue(ok(input({ required: false })));
    const props = mount();
    await act(async () => {
      fireEvent.click(screen.getByRole("checkbox", { name: /Required/ }));
    });
    expect(mocks.patchQuestion).toHaveBeenCalledWith("j1", "p1", { required: false });
    expect(props.onQuestionChange).toHaveBeenCalledWith(expect.objectContaining({ required: false }));
  });

  it("moves an input to Answer now, and shows why when that list is full", async () => {
    mocks.patchQuestion.mockResolvedValueOnce(ok(input({ kind: "FIXED" }))).mockResolvedValueOnce(fail);
    const props = mount();
    const move = screen.getByRole("button", { name: 'Move Client name to "Answer now"' });
    await act(async () => {
      fireEvent.click(move);
    });
    expect(mocks.patchQuestion).toHaveBeenCalledWith("j1", "p1", { kind: "FIXED" });
    expect(props.onQuestionChange).toHaveBeenCalledWith(expect.objectContaining({ kind: "FIXED" }));
    await act(async () => {
      fireEvent.click(move);
    });
    expect(screen.getByRole("alert").textContent).toBe(fail.message);
  });

  it("removes an input without asking", async () => {
    mocks.deleteQuestion.mockResolvedValue(ok({ deleted: true }));
    const props = mount();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Remove Client name" }));
    });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(mocks.deleteQuestion).toHaveBeenCalledWith("j1", "p1");
    expect(props.onQuestionRemoved).toHaveBeenCalledWith("p1");
  });

  it("adds an input, required by default", async () => {
    mocks.addQuestion.mockResolvedValue(ok(input({ id: "p2", text: "Meeting date", guidance: "", source: "USER" })));
    const props = mount();
    fireEvent.click(screen.getByRole("button", { name: "Add input" }));
    fireEvent.change(screen.getByLabelText("New input name"), { target: { value: " Meeting date " } });
    expect((screen.getByRole("checkbox", { name: "Required for the new input" }) as HTMLInputElement).checked).toBe(true);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save input" }));
    });
    expect(mocks.addQuestion).toHaveBeenCalledWith("j1", { text: "Meeting date", guidance: "", kind: "PER_USE", required: true });
    expect(props.onQuestionChange).toHaveBeenCalledWith(expect.objectContaining({ id: "p2" }));
    expect(screen.queryByLabelText("New input name")).toBeNull();
  });

  it("stops adding at 15 inputs", () => {
    mount(Array.from({ length: 15 }, (_, i) => input({ id: `p${i}`, text: `Input ${i}` })));
    expect((screen.getByRole("button", { name: "Add input" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/at most 15 inputs/)).toBeTruthy();
  });
});
