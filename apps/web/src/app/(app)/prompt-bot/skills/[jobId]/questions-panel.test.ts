/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnswerView } from "@/lib/prompt-bot/sessions";
import type { JobFileView, JobView, TaskQuestionView } from "@/lib/skills/jobs/types";

const mocks = vi.hoisted(() => ({ generateQuestions: vi.fn(), addQuestion: vi.fn(), patchQuestion: vi.fn(), deleteQuestion: vi.fn(), toastError: vi.fn() }));
vi.mock("@/lib/skills/jobs/client", () => ({
  generateQuestions: mocks.generateQuestions,
  addQuestion: mocks.addQuestion,
  patchQuestion: mocks.patchQuestion,
  deleteQuestion: mocks.deleteQuestion,
}));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }));
vi.mock("./question-files", async () => {
  const { createElement: h } = await import("react");
  return {
    HINT_LABEL: { TEMPLATE: "Template or design system", REFERENCE: "Reference or example", INPUT: "Input data", BRAND: "Brand assets" },
    QuestionFiles: (p: { question: { id: string } | null; files: { fileName: string }[] }) =>
      h("p", { "data-testid": p.question ? `files-${p.question.id}` : "general-files" }, p.files.map((f) => f.fileName).join("|")),
  };
});
vi.mock("./per-use-list", async () => {
  const { createElement: h } = await import("react");
  return { PerUseList: (p: { inputs: { text: string }[] }) => h("p", { "data-testid": "per-use" }, p.inputs.map((q) => q.text).join("|")) };
});

import { QuestionsPanel } from "./questions-panel";

const q = (over: Partial<TaskQuestionView>): TaskQuestionView => ({
  id: "q1", order: 0, kind: "FIXED", text: "Which template do you start from?", guidance: "Name the file.", required: true,
  wantsFiles: true, fileHint: "TEMPLATE", fileNote: "", source: "AI", ...over,
});
const QUESTIONS = [
  q({}),
  q({ id: "q2", order: 1, text: "Which past reports should it match?", wantsFiles: false, fileHint: null }),
  q({ id: "p1", order: 2, kind: "PER_USE", text: "Client name", guidance: "e.g. Acme Ltd" }),
];
const file = (id: string, questionId: string | null): JobFileView => ({
  id, fileName: `${id}.pdf`, assetName: `${id}.pdf`, kind: "PDF", size: 10, createdAt: "2026-11-25T10:00:00.000Z",
  analysisStatus: "READY", analysis: "x", analysisEdited: false, analysisError: null, bundlable: true, questionId,
});
const LONG = "x".repeat(520);
const job = (over: Partial<JobView> = {}): JobView => ({
  id: "j1", title: "Board", description: LONG, scoreRevision: 0, updatedAt: "2026-11-25T10:00:00.000Z", suggestedAt: null,
  questionsGeneratedAt: "2026-11-25T11:00:00.000Z", outputType: "Instagram carousel", questions: QUESTIONS,
  matrix: { id: "m", name: "x", questions: [] }, answers: [], files: [], skills: [], ...over,
});
const ANSWERS: Record<string, AnswerView> = { q1: { questionId: "q1", answer: "Q3 deck", score: 3, reason: "Clear", notRelevant: false } };
const ok = <T,>(data: T) => ({ ok: true as const, data });
type Props = Parameters<typeof QuestionsPanel>[0];

const mount = (over: Partial<Props> = {}) => {
  const state = {
    answerFor: (id: string) => ANSWERS[id] ?? { questionId: id, answer: "", score: 0, reason: null, notRelevant: false },
    updateAnswer: vi.fn(), canCheck: true, checking: false, checkError: null, pendingCount: 0, contextStale: false,
    isChanged: () => false, check: vi.fn(async () => {}),
  } as unknown as Props["state"];
  const props: Props = {
    job: job(), state, aiConfigured: true, visible: true, description: LONG, flushSaves: vi.fn(async () => {}),
    onQuestionsWritten: vi.fn(), onQuestionChange: vi.fn(), onQuestionRemoved: vi.fn(), onFileChange: vi.fn(), onFileRemoved: vi.fn(), ...over,
  };
  const view = render(createElement(QuestionsPanel, props));
  return { props, rerender: (next: Partial<Props>) => view.rerender(createElement(QuestionsPanel, { ...props, ...next })) };
};
const runTimers = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const click = (name: string | RegExp) => act(async () => { fireEvent.click(screen.getByRole("button", { name })); });
const confirm = (name: string) => act(async () => { fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name })); });

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("QuestionsPanel without questions", () => {
  const empty = { questions: [], questionsGeneratedAt: null, outputType: null };

  it("writes questions once on first visit, after sending pending saves", async () => {
    mocks.generateQuestions.mockResolvedValue(ok(job()));
    const { props, rerender } = mount({ job: job(empty) });
    await runTimers();
    expect(props.flushSaves).toHaveBeenCalled();
    expect(mocks.generateQuestions).toHaveBeenCalledTimes(1);
    expect(props.onQuestionsWritten).toHaveBeenCalledWith(expect.objectContaining({ outputType: "Instagram carousel" }));
    rerender({ job: job(empty) });
    await runTimers();
    expect(mocks.generateQuestions).toHaveBeenCalledTimes(1);
  });

  it("waits until the step is shown", async () => {
    const { rerender } = mount({ job: job(empty), visible: false });
    await runTimers();
    expect(mocks.generateQuestions).not.toHaveBeenCalled();
    mocks.generateQuestions.mockResolvedValue(ok(job()));
    rerender({ job: job(empty), visible: true });
    await runTimers();
    expect(mocks.generateQuestions).toHaveBeenCalledTimes(1);
  });

  it("does not auto-write when short, when questions were written before, or without the AI", async () => {
    mount({ job: job({ ...empty, description: "short" }), description: "short" });
    await runTimers();
    const write = screen.getByRole("button", { name: "Start the questions" }) as HTMLButtonElement;
    expect(write.disabled).toBe(true);
    expect(document.getElementById(write.getAttribute("aria-describedby") ?? "")?.textContent).toBe("Add a bit more detail — at least 500 characters (5/500)");
    cleanup();
    mount({ job: job({ ...empty, questionsGeneratedAt: "2026-11-25T11:00:00.000Z" }) });
    await runTimers();
    cleanup();
    mount({ job: job(empty), aiConfigured: false });
    await runTimers();
    expect(mocks.generateQuestions).not.toHaveBeenCalled();
  });

  it("shows progress while writing and the server's message on failure", async () => {
    let finish: (v: unknown) => void = () => {};
    mocks.generateQuestions.mockImplementation(() => new Promise((r) => (finish = r)));
    mount({ job: job({ ...empty, questionsGeneratedAt: "2026-11-25T11:00:00.000Z" }) });
    await click("Start the questions");
    expect(screen.getAllByText("Preparing questions for your task…").length).toBeGreaterThan(0);
    await act(async () => finish({ ok: false, code: "AI_FAILED", message: "The AI didn't answer. Try again." }));
    expect(screen.getByRole("alert").textContent).toBe("The AI didn't answer. Try again.");
  });
});

describe("QuestionsPanel with questions", () => {
  it("heads the answer-now list with the output type and counts fixed questions only", () => {
    mount();
    expect(screen.getByRole("heading", { level: 2, name: "Answer now (same every time)" })).toBeTruthy();
    expect(screen.getByText("Questions for an Instagram carousel")).toBeTruthy();
    expect(screen.getByText(/of 2 ready/).textContent).toBe("1 of 2 ready");
    expect(screen.getAllByRole("meter")).toHaveLength(2);
    expect(screen.getByText("Scored against your task description, answers and each question's files.")).toBeTruthy();
    expect(screen.getByTestId("per-use").textContent).toBe("Client name");
  });

  it("has no subtitle when the output type is unknown", () => {
    mount({ job: job({ outputType: null }) });
    expect(screen.queryByText(/^Questions for/)).toBeNull();
  });

  it("routes files to the selected question and the rest to General files", () => {
    mount({ job: job({ files: [file("a", "q1"), file("b", "q2"), file("c", null), file("d", "p1")] }) });
    expect(screen.getByTestId("files-q1").textContent).toBe("a.pdf");
    expect(screen.getByTestId("general-files").textContent).toBe("c.pdf|d.pdf");
    fireEvent.click(screen.getByRole("button", { name: /^2\.\s*Which past reports/ }));
    expect(screen.getByTestId("files-q2").textContent).toBe("b.pdf");
  });

  it("hides General files when every file belongs to a question", () => {
    mount({ job: job({ files: [file("a", "q1")] }) });
    expect(screen.queryByTestId("general-files")).toBeNull();
  });

  it("asks before writing new questions", async () => {
    mocks.generateQuestions.mockResolvedValue(ok(job()));
    const { props } = mount();
    await click(/^Regenerate/);
    const dialog = within(screen.getByRole("alertdialog"));
    expect(dialog.getByText("Write new questions?")).toBeTruthy();
    expect(dialog.getByText(/Questions you added yourself, and answers to questions that come back with the same wording, are kept\./)).toBeTruthy();
    await confirm("Write new questions");
    expect(mocks.generateQuestions).toHaveBeenCalledWith("j1");
    expect(props.onQuestionsWritten).toHaveBeenCalled();
  });
});

describe("QuestionsPanel editing", () => {
  it("answers the selected question with its guidance as the placeholder", () => {
    const { props } = mount();
    const box = screen.getByRole("textbox", { name: "Which template do you start from?" }) as HTMLTextAreaElement;
    expect(box.value).toBe("Q3 deck");
    expect(box.placeholder).toBe("Name the file.");
    expect(box.maxLength).toBe(4000);
    fireEvent.change(box, { target: { value: "The Q4 deck" } });
    expect(props.state.updateAnswer).toHaveBeenCalledWith("q1", { answer: "The Q4 deck" });
  });

  it("adds a question to answer now", async () => {
    mocks.addQuestion.mockResolvedValue(ok(q({ id: "q3", order: 3, text: "Who signs it off?", source: "USER" })));
    const { props } = mount();
    await click("Add question");
    fireEvent.change(screen.getByLabelText("Question"), { target: { value: "Who signs it off?" } });
    await act(async () => {
      fireEvent.click(within(screen.getByRole("form", { name: "Add a question" })).getByRole("button", { name: "Add question" }));
    });
    expect(mocks.addQuestion).toHaveBeenCalledWith("j1", { text: "Who signs it off?", guidance: "", wantsFiles: false, fileHint: null, fileNote: "", kind: "FIXED" });
    expect(props.onQuestionChange).toHaveBeenCalledWith(expect.objectContaining({ id: "q3" }));
    expect(screen.queryByRole("form", { name: "Add a question" })).toBeNull();
  });

  it("edits the selected question", async () => {
    mocks.patchQuestion.mockResolvedValue(ok(q({ text: "Which deck template do you start from?" })));
    const { props } = mount();
    await click("Edit question: Which template do you start from?");
    fireEvent.change(screen.getByLabelText("Question"), { target: { value: "Which deck template do you start from?" } });
    await click("Save question");
    expect(mocks.patchQuestion).toHaveBeenCalledWith("j1", "q1", expect.objectContaining({ text: "Which deck template do you start from?", fileHint: "TEMPLATE" }));
    expect(props.onQuestionChange).toHaveBeenCalledWith(expect.objectContaining({ text: "Which deck template do you start from?" }));
  });

  it("offers no button to move a question to the ask-each-time list", () => {
    mount();
    expect(screen.queryByRole("button", { name: /Asked each time you use it/ })).toBeNull();
  });

  it("deletes the selected question after a destructive confirm", async () => {
    mocks.deleteQuestion.mockResolvedValue(ok({ deleted: true }));
    const { props } = mount();
    await click("Delete question: Which template do you start from?");
    const dialog = within(screen.getByRole("alertdialog"));
    expect(dialog.getByText("Delete this question?")).toBeTruthy();
    expect(dialog.getByText("Its answer is deleted. Its files move to General files.")).toBeTruthy();
    await confirm("Delete question");
    expect(mocks.deleteQuestion).toHaveBeenCalledWith("j1", "q1");
    expect(props.onQuestionRemoved).toHaveBeenCalledWith("q1");
  });
});
