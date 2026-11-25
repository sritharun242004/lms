/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JobFileView } from "@/lib/skills/jobs/types";

const mocks = vi.hoisted(() => ({ uploadJobFile: vi.fn() }));
vi.mock("@/lib/skills/jobs/client", () => ({ uploadJobFile: mocks.uploadJobFile, saveAnalysis: vi.fn(), analyseAgain: vi.fn(), removeJobFile: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import { FILE_HELP, UploadRows, useUploadQueue } from "./file-card";

const landed = (over: Partial<JobFileView> = {}): JobFileView => ({
  id: "f1", fileName: "deck.pptx", assetName: "deck.pptx", kind: "PPTX", size: 10, createdAt: "2026-11-25T10:00:00.000Z",
  analysisStatus: "PENDING", analysis: null, analysisEdited: false, analysisError: null, bundlable: true, questionId: "q1", ...over,
});

function Harness({ questionId, enabled, onFileChange }: { questionId?: string; enabled: boolean; onFileChange(f: JobFileView): void }) {
  const { rows, enqueue, dismiss } = useUploadQueue({ jobId: "j1", questionId, enabled, onFileChange });
  return createElement(
    "div",
    null,
    createElement("input", { type: "file", "aria-label": "pick", onChange: (e: { target: HTMLInputElement }) => enqueue(Array.from(e.target.files ?? [])) }),
    createElement(UploadRows, { rows, onDismiss: dismiss }),
  );
}
const mount = (props: { questionId?: string; enabled?: boolean } = {}) => {
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
    expect(mocks.uploadJobFile).toHaveBeenCalledWith("j1", file, "q1");
    expect(onFileChange).toHaveBeenCalledWith(expect.objectContaining({ questionId: "q1" }));
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("sends a general upload with two arguments", async () => {
    mocks.uploadJobFile.mockResolvedValue({ ok: true, data: landed({ questionId: null }) });
    mount();
    const file = doc();
    await pick([file]);
    expect(mocks.uploadJobFile.mock.calls[0]).toEqual(["j1", file]);
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
    expect(screen.getByRole("alert").textContent).toBe("This file is over 20 MB. Upload a smaller copy.");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss huge.pdf" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps a failed upload's server message on its row", async () => {
    mocks.uploadJobFile.mockResolvedValue({ ok: false, code: "TOO_MANY_FILES", message: "A task can have at most 10 files." });
    mount({ questionId: "q1" });
    await pick([doc()]);
    expect(screen.getByRole("alert").textContent).toBe("A task can have at most 10 files.");
  });

  it("states the accepted types and caps per task", () => {
    expect(FILE_HELP).toBe("PowerPoint, Word, Excel, PDF, PNG or JPG · up to 20 MB each · 10 files per task");
  });
});
