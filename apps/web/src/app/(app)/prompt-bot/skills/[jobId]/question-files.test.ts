/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JobFileView, TaskQuestionView } from "@/lib/skills/jobs/types";

const mocks = vi.hoisted(() => ({ uploadJobFile: vi.fn() }));
vi.mock("@/lib/skills/jobs/client", () => ({ uploadJobFile: mocks.uploadJobFile, saveAnalysis: vi.fn(), analyseAgain: vi.fn(), removeJobFile: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import { HINT_LABEL, QuestionFiles } from "./question-files";

const question = (over: Partial<TaskQuestionView> = {}): TaskQuestionView => ({
  id: "q1", order: 0, kind: "FIXED", text: "Which logo and colours do you use?", guidance: "", required: true,
  wantsFiles: true, fileHint: "BRAND", fileNote: "Upload your logo and brand colours.", source: "AI", ...over,
});
const file = (over: Partial<JobFileView> = {}): JobFileView => ({
  id: "f1", fileName: "logo.png", assetName: "logo.png", kind: "PNG", size: 2048, createdAt: "2026-11-25T10:00:00.000Z",
  analysisStatus: "READY", analysis: "## Colours\n\nTeal.", analysisEdited: false, analysisError: null, bundlable: true, questionId: "q1", ...over,
});
const mount = (q: TaskQuestionView | null, files: JobFileView[] = [], aiConfigured = true) => {
  const props = { jobId: "j1", question: q, files, aiConfigured, onFileChange: vi.fn(), onFileRemoved: vi.fn() };
  render(createElement(QuestionFiles, props));
  return props;
};
const addButton = () => screen.getByRole("button", { name: /^Add files/ }) as HTMLButtonElement;

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("QuestionFiles", () => {
  it("makes the upload prominent when the question asks for files", () => {
    mount(question());
    expect(screen.getByRole("heading", { name: "Files for this question" })).toBeTruthy();
    expect(addButton().textContent).toBe("Add files");
    expect(screen.getByText(HINT_LABEL.BRAND)).toBeTruthy();
    expect(screen.getByText("Upload your logo and brand colours.")).toBeTruthy();
    expect(screen.getByText("PowerPoint, Word, Excel, PDF, PNG or JPG · up to 20 MB each · 10 files per task")).toBeTruthy();
    expect(screen.getByTestId("file-drop-zone")).toBeTruthy();
  });

  it("falls back to a general note when the question has none", () => {
    mount(question({ fileNote: "" }));
    expect(screen.getByText("This question asks for a file. Add one if you have it.")).toBeTruthy();
  });

  it("still offers a quieter upload on every other question", () => {
    mount(question({ wantsFiles: false, fileHint: null, fileNote: "" }));
    expect(addButton().textContent).toBe("Add files (optional)");
    expect(screen.queryByText(HINT_LABEL.BRAND)).toBeNull();
  });

  it("labels each kind of file", () => {
    expect(HINT_LABEL).toEqual({
      TEMPLATE: "Template or design system",
      REFERENCE: "Reference or example",
      INPUT: "Input data",
      BRAND: "Brand assets",
    });
  });

  it("uploads to the question and lists its files", async () => {
    mocks.uploadJobFile.mockResolvedValue({ ok: true, data: file({ id: "f2", fileName: "colours.pdf", kind: "PDF" }) });
    const props = mount(question(), [file()]);
    expect(screen.getByRole("heading", { name: "logo.png" })).toBeTruthy();
    const picked = new File(["x"], "colours.pdf");
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Choose files to upload"), { target: { files: [picked] } });
    });
    expect(mocks.uploadJobFile).toHaveBeenCalledWith("j1", picked, "q1");
    expect(props.onFileChange).toHaveBeenCalledWith(expect.objectContaining({ id: "f2" }));
  });

  it("accepts dropped files on the question", async () => {
    mocks.uploadJobFile.mockResolvedValue({ ok: true, data: file() });
    mount(question({ wantsFiles: false, fileHint: null }));
    const dropped = new File(["x"], "past.pdf");
    await act(async () => {
      fireEvent.drop(screen.getByTestId("file-drop-zone"), { dataTransfer: { files: [dropped] } });
    });
    expect(mocks.uploadJobFile).toHaveBeenCalledWith("j1", dropped, "q1");
  });

  it("disables uploads without the AI", () => {
    mount(question(), [], false);
    expect(addButton().disabled).toBe(true);
    expect((screen.getByLabelText("Choose files to upload") as HTMLInputElement).disabled).toBe(true);
  });

  it("never offers uploads on a per-use input", () => {
    mount(question({ kind: "PER_USE", wantsFiles: false, fileHint: null }));
    expect(screen.queryByRole("button", { name: /^Add files/ })).toBeNull();
    expect(screen.queryByLabelText("Choose files to upload")).toBeNull();
  });

  it("shows General files without an upload", () => {
    mount(null, [file({ questionId: null, fileName: "old deck.pptx", kind: "PPTX" })]);
    expect(screen.getByRole("heading", { name: "General files" })).toBeTruthy();
    expect(screen.getByText(/Files added before questions had their own uploads, or from removed questions\. Your skills still use them\./)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "old deck.pptx" })).toBeTruthy();
    expect(screen.queryByLabelText("Choose files to upload")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Add files/ })).toBeNull();
  });
});
