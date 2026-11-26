/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JobFileView } from "@/lib/skills/jobs/types";

const mocks = vi.hoisted(() => ({ uploadJobFile: vi.fn() }));
vi.mock("@/lib/skills/jobs/client", () => ({
  uploadJobFile: mocks.uploadJobFile,
  RETRYABLE_UPLOAD_CODES: new Set(["NETWORK_ERROR", "UPLOAD_FAILED"]),
  saveAnalysis: vi.fn(),
  analyseAgain: vi.fn(),
  removeJobFile: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import { fileHelp, UploadRows, useUploadQueue } from "./file-card";

const landed = (over: Partial<JobFileView> = {}): JobFileView => ({
  id: "f1", fileName: "deck.pptx", assetName: "deck.pptx", kind: "PPTX", size: 10, createdAt: "2026-11-25T10:00:00.000Z",
  analysisStatus: "PENDING", analysis: null, analysisEdited: false, analysisError: null, bundlable: true, questionId: "q1", ...over,
});

type HarnessProps = { questionId?: string; enabled: boolean; maxBytes?: number; onFileChange(f: JobFileView): void };
function Harness({ questionId, enabled, maxBytes, onFileChange }: HarnessProps) {
  const { rows, enqueue, dismiss, retry } = useUploadQueue({ jobId: "j1", questionId, enabled, maxBytes, onFileChange });
  return createElement(
    "div",
    null,
    createElement("input", { type: "file", "aria-label": "pick", onChange: (e: { target: HTMLInputElement }) => enqueue(Array.from(e.target.files ?? [])) }),
    createElement(UploadRows, { rows, onDismiss: dismiss, onRetry: retry }),
  );
}
const mount = (props: { questionId?: string; enabled?: boolean; maxBytes?: number } = {}) => {
  const onFileChange = vi.fn();
  render(createElement(Harness, { enabled: true, ...props, onFileChange }));
  return onFileChange;
};
const pick = async (files: File[]) => {
  await act(async () => {
    fireEvent.change(screen.getByLabelText("pick"), { target: { files } });
  });
};
const doc = (name = "deck.pptx", size = 10) => {
  const f = new File(["x"], name);
  Object.defineProperty(f, "size", { value: size });
  return f;
};

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("useUploadQueue", () => {
  it("attaches each upload to the question it was added on", async () => {
    mocks.uploadJobFile.mockResolvedValue({ ok: true, data: landed() });
    const onFileChange = mount({ questionId: "q1" });
    const file = doc();
    await pick([file]);
    expect(mocks.uploadJobFile).toHaveBeenCalledWith("j1", file, expect.objectContaining({ questionId: "q1" }));
    expect(onFileChange).toHaveBeenCalledWith(expect.objectContaining({ questionId: "q1" }));
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("sends a general upload without a question", async () => {
    mocks.uploadJobFile.mockResolvedValue({ ok: true, data: landed({ questionId: null }) });
    mount();
    const file = doc();
    await pick([file]);
    expect(mocks.uploadJobFile.mock.calls[0][1]).toBe(file);
    expect(mocks.uploadJobFile.mock.calls[0][2]).not.toHaveProperty("questionId");
  });

  it("sends nothing while disabled", async () => {
    mount({ enabled: false, questionId: "q1" });
    await pick([doc()]);
    expect(mocks.uploadJobFile).not.toHaveBeenCalled();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("refuses a file over 20 MB on its own row without sending it", async () => {
    mount({ questionId: "q1" });
    await pick([doc("huge.pdf", 21 * 1024 * 1024)]);
    expect(mocks.uploadJobFile).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe("Files can be up to 20 MB. Upload a smaller copy.");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss huge.pdf" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps a failed upload's server message on its row", async () => {
    mocks.uploadJobFile.mockResolvedValue({ ok: false, code: "TOO_MANY_FILES", message: "A task can have at most 10 files." });
    mount({ questionId: "q1" });
    await pick([doc()]);
    expect(screen.getByRole("alert").textContent).toBe("A task can have at most 10 files.");
  });

  it("states the accepted types and the effective cap per mode", () => {
    expect(fileHelp(20 * 1024 * 1024)).toBe("PowerPoint, Word, Excel, PDF, PNG or JPG · up to 20 MB each · 10 files per task");
    expect(fileHelp(100 * 1024 * 1024)).toBe("PowerPoint, Word, Excel, PDF, PNG or JPG · up to 100 MB each · 10 files per task");
  });

  it("takes up to 100 MB when the server says so, and refuses more", async () => {
    mocks.uploadJobFile.mockResolvedValue({ ok: true, data: landed() });
    mount({ questionId: "q1", maxBytes: 100 * 1024 * 1024 });
    await pick([doc("big.pptx", 60 * 1024 * 1024), doc("huge.pptx", 101 * 1024 * 1024)]);
    expect(mocks.uploadJobFile).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert").textContent).toBe("Files can be up to 100 MB. Upload a smaller copy.");
  });

  it("shows the upload's progress as a bar, then checking", async () => {
    let finish: (v: unknown) => void = () => {};
    mocks.uploadJobFile.mockImplementation((_j: string, _f: File, options: { onProgress(p: number): void }) => {
      options.onProgress(0.42);
      return new Promise((resolve) => (finish = resolve));
    });
    const onFileChange = mount({ questionId: "q1" });
    await pick([doc()]);
    const bar = screen.getByRole("progressbar", { name: "Uploading deck.pptx" });
    expect(bar.getAttribute("aria-valuenow")).toBe("42");
    expect(screen.getByText("42%")).toBeTruthy();
    await act(async () => finish({ ok: true, data: landed() }));
    expect(onFileChange).toHaveBeenCalled();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("cancels a running upload through its signal and removes the row", async () => {
    let signal: AbortSignal | undefined;
    mocks.uploadJobFile.mockImplementation((_j: string, _f: File, options: { signal: AbortSignal }) => {
      signal = options.signal;
      return new Promise((resolve) => options.signal.addEventListener("abort", () => resolve({ ok: false, code: "UPLOAD_CANCELLED", message: "Upload cancelled." })));
    });
    const onFileChange = mount({ questionId: "q1" });
    await pick([doc()]);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Cancel upload of deck.pptx" })));
    expect(signal?.aborted).toBe(true);
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(onFileChange).not.toHaveBeenCalled();
  });

  it("offers Try again after a dropped connection, and sends the same file again", async () => {
    mocks.uploadJobFile
      .mockResolvedValueOnce({ ok: false, code: "NETWORK_ERROR", message: "The upload was interrupted. Check your connection and try again." })
      .mockResolvedValueOnce({ ok: true, data: landed() });
    const onFileChange = mount({ questionId: "q1" });
    const file = doc();
    await pick([file]);
    expect(screen.getByRole("alert").textContent).toBe("The upload was interrupted. Check your connection and try again.");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Try again" })));
    expect(mocks.uploadJobFile).toHaveBeenCalledTimes(2);
    expect(mocks.uploadJobFile.mock.calls[1][1]).toBe(file);
    expect(onFileChange).toHaveBeenCalled();
  });

  it("offers no Try again for a refusal trying again can't fix", async () => {
    mocks.uploadJobFile.mockResolvedValue({ ok: false, code: "TOO_MANY_FILES", message: "A task can have at most 10 files." });
    mount({ questionId: "q1" });
    await pick([doc()]);
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });
});
