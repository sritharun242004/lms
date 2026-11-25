/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JobFileView, TaskQuestionView } from "@/lib/skills/jobs/types";

const mocks = vi.hoisted(() => ({ uploadJobFile: vi.fn(), saveAnalysis: vi.fn(), analyseAgain: vi.fn(), removeJobFile: vi.fn(), toastError: vi.fn() }));
vi.mock("@/lib/skills/jobs/client", () => ({
  uploadJobFile: mocks.uploadJobFile,
  saveAnalysis: mocks.saveAnalysis,
  analyseAgain: mocks.analyseAgain,
  removeJobFile: mocks.removeJobFile,
}));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError, success: vi.fn() } }));

import { FILE_ACCEPT } from "./file-card";
import { QuestionFiles } from "./question-files";

const file = (over: Partial<JobFileView> = {}): JobFileView => ({
  id: "f1", fileName: "Q3 deck.pptx", assetName: "q3-deck.pptx", kind: "PPTX", size: 4_404_019, createdAt: "2026-11-25T10:00:00.000Z",
  analysisStatus: "READY", analysis: "## Colours\n\nNavy #1F4E79 for titles.", analysisEdited: false, analysisError: null, bundlable: true, questionId: null, ...over,
});
const ok = <T,>(data: T) => ({ ok: true as const, data });
// The old Files step's cards and upload queue, now under one "Answer now" question.
const Q1: TaskQuestionView = {
  id: "q1", order: 0, kind: "FIXED", text: "Which deck do you start from?", guidance: "", required: true,
  wantsFiles: true, fileHint: "TEMPLATE", fileNote: "", source: "AI",
};
const mount = (files: JobFileView[], aiConfigured = true) => {
  const props = { jobId: "j1", question: Q1, files, aiConfigured, onFileChange: vi.fn(), onFileRemoved: vi.fn() };
  render(createElement(QuestionFiles, props));
  return props;
};
const flush = () => act(async () => {});
const dialog = () => within(screen.getByRole("alertdialog"));
const pick = async (files: File[]) => {
  await act(async () => {
    fireEvent.change(screen.getByLabelText("Choose files to upload"), { target: { files } });
  });
};

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("QuestionFiles cards", () => {
  it("shows the kind, size and an analysing state for a pending file", () => {
    mount([file({ analysisStatus: "PENDING", analysis: null })]);
    expect(screen.getByText("PowerPoint · 4.2 MB")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Analysing…");
    expect(screen.queryByRole("button", { name: /^Analyse again/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Edit/ })).toBeNull();
  });

  it("renders a ready analysis and saves an edit", async () => {
    mocks.saveAnalysis.mockResolvedValue(ok(file({ analysis: "## Colours\n\nNavy.", analysisEdited: true })));
    const props = mount([file()]);
    expect(screen.getByRole("heading", { name: "Colours" })).toBeTruthy();
    expect(screen.queryByText("Edited by you")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Edit/ }));
    const box = screen.getByLabelText("Style guide for Q3 deck.pptx") as HTMLTextAreaElement;
    expect(box.value).toBe("## Colours\n\nNavy #1F4E79 for titles.");
    expect(box.maxLength).toBe(12_000);
    fireEvent.change(box, { target: { value: "## Colours\n\nNavy." } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    });
    expect(mocks.saveAnalysis).toHaveBeenCalledWith("j1", "f1", "## Colours\n\nNavy.");
    expect(props.onFileChange).toHaveBeenCalledWith(expect.objectContaining({ analysisEdited: true }));
    expect(screen.queryByLabelText("Style guide for Q3 deck.pptx")).toBeNull();
  });

  it("cancels an edit without saving", () => {
    mount([file()]);
    fireEvent.click(screen.getByRole("button", { name: /^Edit/ }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Style guide for Q3 deck.pptx")).toBeNull();
    expect(mocks.saveAnalysis).not.toHaveBeenCalled();
  });

  it("re-analyses at once when the analysis was not edited", async () => {
    mocks.analyseAgain.mockResolvedValue(ok(file({ analysisStatus: "PENDING", analysis: null })));
    const props = mount([file()]);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Analyse again/ }));
    });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(mocks.analyseAgain).toHaveBeenCalledWith("j1", "f1");
    expect(props.onFileChange).toHaveBeenCalledWith(expect.objectContaining({ analysisStatus: "PENDING" }));
  });

  it("asks before replacing an edited analysis", async () => {
    mocks.analyseAgain.mockResolvedValue(ok(file({ analysisStatus: "PENDING" })));
    mount([file({ analysisEdited: true })]);
    expect(screen.getByText("Edited by you")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Analyse again/ }));
    });
    expect(dialog().getByText("Replace your edited style guide?")).toBeTruthy();
    await act(async () => {
      fireEvent.click(dialog().getByRole("button", { name: "Cancel" }));
    });
    expect(mocks.analyseAgain).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Analyse again/ }));
    });
    await act(async () => {
      fireEvent.click(dialog().getByRole("button", { name: "Analyse again" }));
    });
    expect(mocks.analyseAgain).toHaveBeenCalledTimes(1);
  });

  it("offers to write the style guide by hand when analysis failed", async () => {
    mount([file({ analysisStatus: "FAILED", analysis: null, analysisError: "We couldn't analyse this file. Try again, or write the style guide yourself." })]);
    expect(screen.getByText("We couldn't analyse this file. Try again, or write the style guide yourself.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Analyse again/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Write it yourself/ }));
    const box = screen.getByLabelText("Style guide for Q3 deck.pptx") as HTMLTextAreaElement;
    expect(box.value).toBe("");
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("says when a file is too large to bundle", () => {
    mount([file({ size: 14_000_000, bundlable: false })]);
    expect(screen.getByText("Too large to bundle — the skill will use the analysis only.")).toBeTruthy();
  });

  it("removes a file only after a destructive confirm", async () => {
    mocks.removeJobFile.mockResolvedValue(ok({ deleted: true }));
    const props = mount([file()]);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Remove/ }));
    });
    expect(dialog().getByText(/Versions you already generated keep their copy/)).toBeTruthy();
    await act(async () => {
      fireEvent.click(dialog().getByRole("button", { name: "Remove" }));
    });
    expect(mocks.removeJobFile).toHaveBeenCalledWith("j1", "f1");
    expect(props.onFileRemoved).toHaveBeenCalledWith("f1");
  });

  it("shows the server's refusal when a remove is not allowed", async () => {
    mocks.removeJobFile.mockResolvedValue({ ok: false, code: "ALREADY_GENERATING", message: "A skill is being written. Wait for it to finish." });
    const props = mount([file()]);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Remove/ }));
    });
    await act(async () => {
      fireEvent.click(dialog().getByRole("button", { name: "Remove" }));
    });
    expect(mocks.toastError).toHaveBeenCalledWith("A skill is being written. Wait for it to finish.");
    expect(props.onFileRemoved).not.toHaveBeenCalled();
  });
});

describe("QuestionFiles uploads", () => {
  it("accepts only the supported types and states the limits", () => {
    mount([]);
    expect((screen.getByLabelText("Choose files to upload") as HTMLInputElement).accept).toBe(FILE_ACCEPT);
    expect(FILE_ACCEPT).toBe(".pptx,.docx,.xlsx,.pdf,.png,.jpg,.jpeg");
    expect(screen.getByText(/PowerPoint, Word, Excel, PDF, PNG or JPG · up to 20 MB each · 10 files/)).toBeTruthy();
  });

  it("uploads one file at a time and shows a failure on its row", async () => {
    let finishFirst: (value: unknown) => void = () => {};
    mocks.uploadJobFile
      .mockImplementationOnce(() => new Promise((resolve) => (finishFirst = resolve)))
      .mockResolvedValueOnce({ ok: false, code: "FILE_ENCRYPTED", message: "This PDF is password-protected. Remove the password, then upload it again." });
    const props = mount([]);
    const deck = new File([new Uint8Array([80, 75, 3, 4])], "deck.pptx");
    const pdf = new File([new Uint8Array([37, 80, 68, 70])], "locked.pdf");
    await pick([deck, pdf]);
    expect(mocks.uploadJobFile).toHaveBeenCalledTimes(1);
    expect(mocks.uploadJobFile).toHaveBeenCalledWith("j1", deck, "q1");
    expect(screen.getByText("Uploading…")).toBeTruthy();
    expect(screen.getByText("Waiting…")).toBeTruthy();
    await act(async () => {
      finishFirst(ok(file({ id: "f9", fileName: "deck.pptx", analysisStatus: "PENDING" })));
    });
    await flush();
    expect(props.onFileChange).toHaveBeenCalledWith(expect.objectContaining({ id: "f9" }));
    expect(mocks.uploadJobFile).toHaveBeenCalledTimes(2);
    expect(mocks.uploadJobFile).toHaveBeenLastCalledWith("j1", pdf, "q1");
    const row = screen.getByText("locked.pdf").closest("li")!;
    expect(within(row).getByText("This PDF is password-protected. Remove the password, then upload it again.")).toBeTruthy();
    fireEvent.click(within(row).getByRole("button", { name: /Dismiss/ }));
    expect(screen.queryByText("locked.pdf")).toBeNull();
  });

  it("announces upload progress politely", async () => {
    mocks.uploadJobFile.mockImplementation(() => new Promise(() => {}));
    mount([]);
    await pick([new File(["a"], "deck.pptx"), new File(["b"], "brief.docx")]);
    const statuses = within(screen.getByRole("list", { name: "Uploads" })).getAllByRole("status");
    expect(statuses.map((s) => s.textContent)).toEqual(["Uploading…", "Waiting…"]);
  });

  it("keeps uploading the rest when one upload throws", async () => {
    mocks.uploadJobFile
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(ok(file({ id: "f9", fileName: "brief.docx", analysisStatus: "PENDING" })));
    const props = mount([]);
    const deck = new File(["a"], "deck.pptx");
    const brief = new File(["b"], "brief.docx");
    await pick([deck, brief]);
    await flush();
    expect(mocks.uploadJobFile).toHaveBeenCalledTimes(2);
    expect(mocks.uploadJobFile).toHaveBeenLastCalledWith("j1", brief, "q1");
    expect(props.onFileChange).toHaveBeenCalledWith(expect.objectContaining({ id: "f9" }));
    const row = screen.getByText("deck.pptx").closest("li")!;
    expect(within(row).getByRole("alert").textContent).toMatch(/couldn.t upload/i);
  });

  it("keeps uploading the rest when the page fails to take an upload", async () => {
    mocks.uploadJobFile.mockImplementation(async (_j: string, f: File) => ok(file({ id: f.name, fileName: f.name })));
    const props = mount([]);
    props.onFileChange.mockImplementationOnce(() => {
      throw new Error("render failed");
    });
    await pick([new File(["a"], "deck.pptx"), new File(["b"], "brief.docx")]);
    await flush();
    expect(props.onFileChange).toHaveBeenCalledTimes(2);
    expect(props.onFileChange).toHaveBeenLastCalledWith(expect.objectContaining({ id: "brief.docx" }));
  });

  it("refuses a file over 20 MB without sending it", async () => {
    mount([]);
    const big = new File([new Uint8Array([1])], "huge.pptx");
    Object.defineProperty(big, "size", { value: 21 * 1024 * 1024 });
    await pick([big]);
    expect(mocks.uploadJobFile).not.toHaveBeenCalled();
    expect(screen.getByText("This file is over 20 MB. Upload a smaller copy.")).toBeTruthy();
  });

  it("uploads dropped files", async () => {
    mocks.uploadJobFile.mockResolvedValue(ok(file({ id: "f2", analysisStatus: "PENDING" })));
    const props = mount([]);
    const dropped = new File([new Uint8Array([1])], "brief.docx");
    await act(async () => {
      fireEvent.drop(screen.getByTestId("file-drop-zone"), { dataTransfer: { files: [dropped] } });
    });
    await flush();
    expect(mocks.uploadJobFile).toHaveBeenCalledWith("j1", dropped, "q1");
    expect(props.onFileChange).toHaveBeenCalled();
  });

  it("disables uploads and re-analysis without the AI, but keeps editing", () => {
    mount([file()], false);
    expect((screen.getByRole("button", { name: /^Add files/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText("Choose files to upload") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: /^Analyse again/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: /^Edit/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows the server's message when another upload took the name", async () => {
    const message = 'Another file named "deck.pptx" was added at the same moment. Upload it again.';
    mocks.uploadJobFile.mockResolvedValue({ ok: false, code: "FILE_NAME_TAKEN", message });
    const props = mount([]);
    await pick([new File([new Uint8Array([1])], "deck.pptx")]);
    await flush();
    const row = screen.getByText("deck.pptx").closest("li")!;
    expect(within(row).getByText(message)).toBeTruthy();
    expect(props.onFileChange).not.toHaveBeenCalled();
  });
});

describe("QuestionFiles analysis states", () => {
  it("keeps a queued analysis calm and still lets the file be removed", () => {
    mount([file({ analysisStatus: "PENDING", analysis: null })]);
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("Analysing…");
    expect(status.textContent).not.toMatch(/fail|error/i);
    expect(screen.getByRole("button", { name: /^Remove/ })).toBeTruthy();
  });

  it("shows the unreadable-PDF failure and lets the user write the guide", () => {
    const message = "This PDF couldn't be read — add the analysis by hand.";
    mount([file({ kind: "PDF", fileName: "brand.pdf", analysisStatus: "FAILED", analysis: null, analysisError: message })]);
    expect(screen.getByText(message)).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Write it yourself/ })).toBeTruthy();
  });
});
