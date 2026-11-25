/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TaskQuestionView } from "@/lib/skills/jobs/types";
import { QuestionEditor } from "./question-editor";

afterEach(cleanup);

const QUESTION: TaskQuestionView = {
  id: "q1", order: 0, kind: "FIXED", text: "Which template do you start from?", guidance: "Name the file.", required: true,
  wantsFiles: true, fileHint: "TEMPLATE", fileNote: "Upload your report template.", source: "AI",
};
const mount = (question?: TaskQuestionView, result: string | null = null) => {
  const props = { question, onSubmit: vi.fn(async () => result), onCancel: vi.fn() };
  render(createElement(QuestionEditor, props));
  return props;
};
const field = (name: string) => screen.getByLabelText(name) as HTMLInputElement;
const submit = async (name: string) => {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
};

describe("QuestionEditor", () => {
  it("adds a question without a highlighted upload", async () => {
    const props = mount();
    expect(screen.getByRole("form", { name: "Add a question" })).toBeTruthy();
    const save = screen.getByRole("button", { name: "Add question" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(field("Question").maxLength).toBe(300);
    fireEvent.change(field("Question"), { target: { value: "  Who signs it off?  " } });
    fireEvent.change(field("What a good answer includes"), { target: { value: "Name and role." } });
    expect(screen.queryByLabelText("Kind of file")).toBeNull();
    expect(screen.getByText(/Every question can take files/)).toBeTruthy();
    await submit("Add question");
    expect(props.onSubmit).toHaveBeenCalledWith({ text: "Who signs it off?", guidance: "Name and role.", wantsFiles: false, fileHint: null, fileNote: "" });
  });

  it("asks for the kind of file and what to upload when the upload is highlighted", async () => {
    const props = mount();
    fireEvent.change(field("Question"), { target: { value: "Which past reports should it match?" } });
    fireEvent.click(field("Highlight the upload for this question"));
    expect((field("Kind of file") as unknown as HTMLSelectElement).value).toBe("REFERENCE");
    fireEvent.change(field("Kind of file"), { target: { value: "INPUT" } });
    expect(field("What to upload").maxLength).toBe(120);
    fireEvent.change(field("What to upload"), { target: { value: "Upload last month's exports." } });
    await submit("Add question");
    expect(props.onSubmit).toHaveBeenCalledWith({
      text: "Which past reports should it match?", guidance: "", wantsFiles: true, fileHint: "INPUT", fileNote: "Upload last month's exports.",
    });
  });

  it("edits a question prefilled from its current values", async () => {
    const props = mount(QUESTION);
    expect(screen.getByRole("form", { name: "Edit question" })).toBeTruthy();
    expect(field("Question").value).toBe("Which template do you start from?");
    expect(field("What a good answer includes").value).toBe("Name the file.");
    expect(field("Highlight the upload for this question").checked).toBe(true);
    expect((field("Kind of file") as unknown as HTMLSelectElement).value).toBe("TEMPLATE");
    expect(field("What to upload").value).toBe("Upload your report template.");
    fireEvent.click(field("Highlight the upload for this question"));
    await submit("Save question");
    expect(props.onSubmit).toHaveBeenCalledWith({ text: "Which template do you start from?", guidance: "Name the file.", wantsFiles: false, fileHint: null, fileNote: "" });
  });

  it("cancels without saving", () => {
    const props = mount(QUESTION);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(props.onCancel).toHaveBeenCalled();
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it("shows the server's message and keeps the form", async () => {
    mount(undefined, "A task can have at most 12 questions to answer now. Remove one to add another.");
    fireEvent.change(field("Question"), { target: { value: "Who signs it off?" } });
    await submit("Add question");
    expect(screen.getByRole("alert").textContent).toBe("A task can have at most 12 questions to answer now. Remove one to add another.");
    expect(field("Question").value).toBe("Who signs it off?");
  });
});
