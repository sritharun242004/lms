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

import { SkillCard, unansweredPhrase } from "./skill-card";

const FILES: JobFileView[] = [
  { id: "f1", fileName: "Q3 deck.pptx", assetName: "q3-deck.pptx", kind: "PPTX", size: 1000, createdAt: "2026-11-25T10:00:00.000Z", analysisStatus: "READY", analysis: "x", analysisEdited: false, analysisError: null, bundlable: true },
  { id: "f2", fileName: "numbers.xlsx", assetName: "numbers.xlsx", kind: "XLSX", size: 1000, createdAt: "2026-11-25T10:00:00.000Z", analysisStatus: "READY", analysis: "y", analysisEdited: false, analysisError: null, bundlable: true },
];
const skill = (over: Partial<JobSkillView> = {}): JobSkillView => ({
  id: "s1", order: 0, name: "board-update", purpose: "Writes the board update.", fileIds: ["f1"], status: "DRAFT", validationErrors: [], latestVersion: 0, versions: [], ...over,
});
const ok = <T,>(data: T) => ({ ok: true as const, data });
const settle = (ms = 0) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
const mount = async (over: Partial<JobSkillView> = {}, gaps = 0, aiConfigured = true) => {
  const props = { jobId: "j1", skill: skill(over), files: FILES, gaps, aiConfigured, flushSaves: vi.fn(async () => {}), onChange: vi.fn(), onRemoved: vi.fn() };
  render(createElement(SkillCard, props));
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
  it("counts questions in words", () => {
    expect(unansweredPhrase(1)).toBe("1 question unanswered");
    expect(unansweredPhrase(3)).toBe("3 questions unanswered");
  });
});

describe("SkillCard generate", () => {
  it("generates at once, with no dialog, when every question is answered", async () => {
    const props = await mount();
    await click(/^Generate$/);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(props.flushSaves).toHaveBeenCalledTimes(1);
    expect(props.flushSaves.mock.invocationCallOrder[0]).toBeLessThan(mocks.generateJobSkill.mock.invocationCallOrder[0]);
    expect(mocks.generateJobSkill).toHaveBeenCalledWith("j1", "s1");
    expect(props.onChange).toHaveBeenCalledWith(expect.objectContaining({ status: "GENERATING" }));
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it("asks exactly once when questions are unanswered, and does nothing on cancel", async () => {
    await mount({ latestVersion: 2, status: "READY" }, 3);
    await click(/^Generate v3$/);
    expect(screen.getAllByRole("alertdialog")).toHaveLength(1);
    expect(screen.getByRole("alertdialog").textContent).toContain("3 questions unanswered — the skill will be more general. Generate anyway?");
    await act(async () => {
      fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Cancel" }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mocks.generateJobSkill).not.toHaveBeenCalled();
    await click(/^Generate v3$/);
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
    await click(/^Generate$/);
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
    const input = screen.getByLabelText("Skill name") as HTMLInputElement;
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
    const input = screen.getByLabelText("Skill name");
    fireEvent.change(input, { target: { value: "weekly-report" } });
    await act(async () => {
      fireEvent.blur(input);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText('A skill named "weekly-report" is already in this job. Choose another name.')).toBeTruthy();
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it("autosaves the purpose after a pause, and before generating", async () => {
    await mount();
    fireEvent.change(screen.getByLabelText("Purpose"), { target: { value: "Writes the monthly board update." } });
    expect(mocks.patchJobSkill).not.toHaveBeenCalled();
    await settle(600);
    expect(mocks.patchJobSkill).toHaveBeenCalledWith("j1", "s1", { purpose: "Writes the monthly board update." }, {});
    fireEvent.change(screen.getByLabelText("Purpose"), { target: { value: "Writes it from the deck." } });
    await click(/^Generate$/);
    expect(mocks.patchJobSkill).toHaveBeenLastCalledWith("j1", "s1", { purpose: "Writes it from the deck." }, {});
    expect(mocks.patchJobSkill.mock.invocationCallOrder.at(-1)!).toBeLessThan(mocks.generateJobSkill.mock.invocationCallOrder[0]);
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
