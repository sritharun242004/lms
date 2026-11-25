/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JobFileView, JobSkillView } from "@/lib/skills/jobs/types";

const mocks = vi.hoisted(() => ({ patchJobSkill: vi.fn(), generateJobSkill: vi.fn(), removeJobSkill: vi.fn(), toastError: vi.fn() }));
vi.mock("@/lib/skills/jobs/client", () => ({
  patchJobSkill: mocks.patchJobSkill,
  generateJobSkill: mocks.generateJobSkill,
  removeJobSkill: mocks.removeJobSkill,
}));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }));
vi.mock("./version-preview", () => ({ VersionPreview: () => null }));

import { useMatrixAnswers } from "@/components/prompt-bot/use-matrix-answers";
import type { SaveOptions } from "@/lib/prompt-bot/client";
import { FILE_SAVE_FAILED_MESSAGE, SkillCard, unansweredPhrase } from "./skill-card";

const FILES: JobFileView[] = [
  { id: "f1", fileName: "Q3 deck.pptx", assetName: "q3-deck.pptx", kind: "PPTX", size: 1000, createdAt: "2026-11-25T10:00:00.000Z", analysisStatus: "READY", analysis: "x", analysisEdited: false, analysisError: null, bundlable: true, questionId: null },
  { id: "f2", fileName: "numbers.xlsx", assetName: "numbers.xlsx", kind: "XLSX", size: 1000, createdAt: "2026-11-25T10:00:00.000Z", analysisStatus: "READY", analysis: "y", analysisEdited: false, analysisError: null, bundlable: true, questionId: null },
];
const skill = (over: Partial<JobSkillView> = {}): JobSkillView => ({
  id: "s1", order: 0, name: "board-update", purpose: "Writes the board update.", fileIds: ["f1"], status: "DRAFT", validationErrors: [], latestVersion: 0, versions: [], ...over,
});
const ok = <T,>(data: T) => ({ ok: true as const, data });
const settle = (ms = 0) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
/** The card with the workspace's real save queue, so autosaves behave as on the page. */
const mount = async (over: Partial<JobSkillView> = {}, gaps = 0, aiConfigured = true, files: JobFileView[] = FILES) => {
  const saves = { current: null as null | ReturnType<typeof useMatrixAnswers> };
  const props = {
    jobId: "j1", skill: skill(over), files, gaps, aiConfigured,
    flushSaves: vi.fn(() => saves.current!.flushSaves()),
    queueSave: vi.fn((key: string, run: (options: SaveOptions) => Promise<void>) => saves.current!.queueSave(key, run)),
    onChange: vi.fn(), onRemoved: vi.fn(),
    registerFileSaves: vi.fn<(skillId: string, pending: () => Promise<void>) => () => void>(() => vi.fn()),
  };
  function Harness() {
    saves.current = useMatrixAnswers({ initialAnswers: [], initialRevision: 0, saveAnswer: async () => ok({}), score: null });
    return createElement(SkillCard, props);
  }
  render(createElement(Harness));
  await settle();
  return props;
};
const click = (name: RegExp | string) =>
  act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
    await vi.advanceTimersByTimeAsync(0);
  });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.clearAllMocks();
  vi.stubGlobal("confirm", vi.fn(() => true));
  mocks.generateJobSkill.mockResolvedValue(ok(skill({ status: "GENERATING" })));
  mocks.patchJobSkill.mockImplementation(async (_j: string, _s: string, patch: Partial<JobSkillView>) => ok(skill(patch)));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("unansweredPhrase", () => {
  it("points to the questions when the task has no files yet", async () => {
    await mount({}, 0, true, []);
    expect(screen.getByText("No files in this task yet. Add them to your questions.")).toBeTruthy();
  });

  it("counts questions in words", () => {
    expect(unansweredPhrase(1)).toBe("1 question unanswered");
    expect(unansweredPhrase(3)).toBe("3 questions unanswered");
  });
});

describe("SkillCard generate", () => {
  it("generates at once, with no dialog, when every question is answered", async () => {
    const props = await mount();
    await click(/^Generate: board-update$/);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(props.flushSaves).toHaveBeenCalledTimes(1);
    expect(props.flushSaves.mock.invocationCallOrder[0]).toBeLessThan(mocks.generateJobSkill.mock.invocationCallOrder[0]);
    expect(mocks.generateJobSkill).toHaveBeenCalledWith("j1", "s1");
    expect(props.onChange).toHaveBeenCalledWith(expect.objectContaining({ status: "GENERATING" }));
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it("asks exactly once when questions are unanswered, and does nothing on cancel", async () => {
    await mount({ latestVersion: 2, status: "READY" }, 3);
    await click(/^Generate v3: board-update$/);
    expect(screen.getAllByRole("alertdialog")).toHaveLength(1);
    expect(screen.getByRole("alertdialog").textContent).toContain("3 questions unanswered — the skill will be more general. Generate anyway?");
    await act(async () => {
      fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Cancel" }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mocks.generateJobSkill).not.toHaveBeenCalled();
    await click(/^Generate v3: board-update$/);
    await act(async () => {
      fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Generate anyway" }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mocks.generateJobSkill).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it("shows the server's refusal", async () => {
    mocks.generateJobSkill.mockResolvedValue({ ok: false, code: "FILES_ANALYSING", message: "Wait until your files have been analysed." });
    await mount();
    await click(/^Generate: board-update$/);
    expect(mocks.toastError).toHaveBeenCalledWith("Wait until your files have been analysed.");
  });

  it("is disabled while writing and without the AI", async () => {
    await mount({ status: "GENERATING" });
    expect((screen.getByRole("button", { name: /^Generate/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("status").textContent).toContain("Writing… (this can take a minute or two)");
    cleanup();
    await mount({}, 0, false);
    expect((screen.getByRole("button", { name: /^Generate/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("SkillCard status", () => {
  it("labels drafts and ready versions", async () => {
    await mount();
    expect(screen.getByText("Draft")).toBeTruthy();
    cleanup();
    await mount({ status: "READY", latestVersion: 2, versions: [{ version: 2, name: "board-update", createdAt: "2026-11-25T14:00:00.000Z", assets: 1 }] });
    expect(screen.getByText("v2 ready")).toBeTruthy();
    expect(screen.queryByText(/Renamed/)).toBeNull();
  });

  it("keeps older versions available after a failed attempt", async () => {
    await mount({ status: "FAILED", latestVersion: 1, validationErrors: ["SKILL.md: description cannot contain < or >"], versions: [{ version: 1, name: "board-update", createdAt: "2026-11-25T14:00:00.000Z", assets: 0 }] });
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Last attempt failed");
    expect(alert.textContent).toContain("SKILL.md: description cannot contain < or >");
    expect(alert.textContent).toContain("v1 is still available.");
  });

  it("says a rename takes effect in the next version", async () => {
    await mount({ name: "monthly-board-update", status: "READY", latestVersion: 1, versions: [{ version: 1, name: "board-update", createdAt: "2026-11-25T14:00:00.000Z", assets: 0 }] });
    expect(screen.getByText("Renamed — generate again to use the new name")).toBeTruthy();
  });
});

describe("SkillCard editing", () => {
  it("saves a rename on blur and shows the server's normalised name", async () => {
    mocks.patchJobSkill.mockResolvedValue(ok(skill({ name: "monthly-board-update" })));
    const props = await mount();
    const input = screen.getByLabelText("Skill name: board-update") as HTMLInputElement;
    expect(input.className).toContain("font-mono");
    fireEvent.change(input, { target: { value: "Monthly Board Update" } });
    await act(async () => {
      fireEvent.blur(input);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mocks.patchJobSkill).toHaveBeenCalledWith("j1", "s1", { name: "Monthly Board Update" });
    expect(input.value).toBe("monthly-board-update");
    expect(props.onChange).toHaveBeenCalledWith(expect.objectContaining({ name: "monthly-board-update" }));
  });

  it("shows a duplicate name inline", async () => {
    mocks.patchJobSkill.mockResolvedValue({ ok: false, code: "DUPLICATE_NAME", message: 'A skill named "weekly-report" is already in this job. Choose another name.' });
    await mount();
    const input = screen.getByLabelText("Skill name: board-update");
    fireEvent.change(input, { target: { value: "weekly-report" } });
    await act(async () => {
      fireEvent.blur(input);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText('A skill named "weekly-report" is already in this job. Choose another name.')).toBeTruthy();
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(mocks.toastError).not.toHaveBeenCalled();
    // A name the server refused can't be generated; fixing it re-enables Generate.
    expect((screen.getByRole("button", { name: /^Generate/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(input, { target: { value: "weekly-report-2" } });
    expect((screen.getByRole("button", { name: /^Generate/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("names the skill on its repeated controls for screen readers", async () => {
    await mount({ status: "READY", latestVersion: 1 });
    expect(screen.getByLabelText("Skill name: board-update")).toBeTruthy();
    expect(screen.getByLabelText("Purpose: board-update")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Generate v2: board-update" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove: board-update" })).toBeTruthy();
  });

  it("autosaves the purpose after a pause, and before generating", async () => {
    await mount();
    fireEvent.change(screen.getByLabelText("Purpose: board-update"), { target: { value: "Writes the monthly board update." } });
    expect(mocks.patchJobSkill).not.toHaveBeenCalled();
    await settle(600);
    expect(mocks.patchJobSkill).toHaveBeenCalledWith("j1", "s1", { purpose: "Writes the monthly board update." }, {});
    fireEvent.change(screen.getByLabelText("Purpose: board-update"), { target: { value: "Writes it from the deck." } });
    await click(/^Generate: board-update$/);
    expect(mocks.patchJobSkill).toHaveBeenLastCalledWith("j1", "s1", { purpose: "Writes it from the deck." }, {});
    expect(mocks.patchJobSkill.mock.invocationCallOrder.at(-1)!).toBeLessThan(mocks.generateJobSkill.mock.invocationCallOrder[0]);
  });

  it("sends a typed purpose as a keepalive save when the page is left", async () => {
    await mount();
    fireEvent.change(screen.getByLabelText("Purpose: board-update"), { target: { value: "Writes it from the deck." } });
    await act(async () => {
      window.dispatchEvent(new Event("pagehide"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mocks.patchJobSkill).toHaveBeenCalledTimes(1);
    expect(mocks.patchJobSkill).toHaveBeenCalledWith("j1", "s1", { purpose: "Writes it from the deck." }, { keepalive: true });
  });

  it("toggles which files the skill uses", async () => {
    const props = await mount();
    const deck = screen.getByRole("button", { name: "Q3 deck.pptx" });
    const sheet = screen.getByRole("button", { name: "numbers.xlsx" });
    expect(deck.getAttribute("aria-pressed")).toBe("true");
    expect(sheet.getAttribute("aria-pressed")).toBe("false");
    await act(async () => {
      fireEvent.click(sheet);
    });
    expect(mocks.patchJobSkill).toHaveBeenCalledWith("j1", "s1", { fileIds: ["f1", "f2"] });
    expect(props.onChange).toHaveBeenCalled();
  });

  it("keeps both of two quick file clicks, sending them one after another", async () => {
    const replies: ((value: unknown) => void)[] = [];
    mocks.patchJobSkill.mockImplementation(() => new Promise((resolve) => replies.push(resolve)));
    const props = await mount({ fileIds: [] });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Q3 deck.pptx" }));
      fireEvent.click(screen.getByRole("button", { name: "numbers.xlsx" }));
      await vi.advanceTimersByTimeAsync(0);
    });
    // Both chips show as chosen at once, and only the first PATCH is out.
    expect(screen.getByRole("button", { name: "Q3 deck.pptx" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "numbers.xlsx" }).getAttribute("aria-pressed")).toBe("true");
    expect(mocks.patchJobSkill).toHaveBeenCalledTimes(1);
    expect(mocks.patchJobSkill).toHaveBeenLastCalledWith("j1", "s1", { fileIds: ["f1"] });
    await act(async () => {
      replies[0](ok(skill({ fileIds: ["f1"] })));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mocks.patchJobSkill).toHaveBeenCalledTimes(2);
    expect(mocks.patchJobSkill).toHaveBeenLastCalledWith("j1", "s1", { fileIds: ["f1", "f2"] });
    expect(screen.getByRole("button", { name: "numbers.xlsx" }).getAttribute("aria-pressed")).toBe("true");
    await act(async () => {
      replies[1](ok(skill({ fileIds: ["f1", "f2"] })));
      await vi.advanceTimersByTimeAsync(0);
    });
    // The page takes the last server reply only.
    expect(props.onChange).toHaveBeenCalledTimes(1);
    expect(props.onChange).toHaveBeenCalledWith(expect.objectContaining({ fileIds: ["f1", "f2"] }));
  });

  it("goes back to the saved files when a file change is refused", async () => {
    mocks.patchJobSkill.mockResolvedValue({ ok: false, code: "VALIDATION_ERROR", message: "That file is not in this job." });
    await mount();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "numbers.xlsx" }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mocks.toastError).toHaveBeenCalledWith("That file is not in this job.");
    expect(screen.getByRole("button", { name: "numbers.xlsx" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("goes back to the saved files when a file save throws, and keeps saving and generating afterwards", async () => {
    mocks.patchJobSkill.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const props = await mount();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "numbers.xlsx" }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mocks.toastError).toHaveBeenCalledWith(FILE_SAVE_FAILED_MESSAGE);
    expect(screen.getByRole("button", { name: "numbers.xlsx" }).getAttribute("aria-pressed")).toBe("false");
    // The queue is not stuck: the next click is sent, and Generate (which waits for it) runs.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "numbers.xlsx" }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mocks.patchJobSkill).toHaveBeenCalledTimes(2);
    expect(props.onChange).toHaveBeenCalledWith(expect.objectContaining({ fileIds: ["f1", "f2"] }));
    await click(/^Generate/);
    expect(mocks.generateJobSkill).toHaveBeenCalledWith("j1", "s1");
  });

  it("lets the page wait for its file saves (Suggest does), and stops on unmount", async () => {
    const replies: ((value: unknown) => void)[] = [];
    mocks.patchJobSkill.mockImplementation(() => new Promise((resolve) => replies.push(resolve)));
    const props = await mount();
    expect(props.registerFileSaves).toHaveBeenCalledWith("s1", expect.any(Function));
    const pending = props.registerFileSaves.mock.calls[0][1];
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "numbers.xlsx" }));
      await vi.advanceTimersByTimeAsync(0);
    });
    let done = false;
    void pending().then(() => (done = true));
    await settle();
    expect(done).toBe(false);
    await act(async () => {
      replies[0](ok(skill({ fileIds: ["f1", "f2"] })));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(done).toBe(true);
    cleanup();
    expect(props.registerFileSaves.mock.results[0].value).toHaveBeenCalled();
  });

  it("removes the skill and its versions after a destructive confirm", async () => {
    mocks.removeJobSkill.mockResolvedValue(ok({ deleted: true }));
    const props = await mount();
    await click(/^Remove/);
    expect(screen.getByRole("alertdialog").textContent).toContain("This deletes all its versions.");
    await act(async () => {
      fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Remove" }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mocks.removeJobSkill).toHaveBeenCalledWith("j1", "s1");
    expect(props.onRemoved).toHaveBeenCalledWith("s1");
  });
});
