// apps/web/src/app/(app)/prompt-bot/skills/[jobId]/skills-panel.test.ts
/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JobSkillView, JobView } from "@/lib/skills/jobs/types";

const mocks = vi.hoisted(() => ({
  suggestSkills: vi.fn(),
  addJobSkill: vi.fn(),
  patchJobSkill: vi.fn(),
  generateJobSkill: vi.fn(),
  removeJobSkill: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock("@/lib/skills/jobs/client", () => ({
  suggestSkills: mocks.suggestSkills,
  addJobSkill: mocks.addJobSkill,
  patchJobSkill: mocks.patchJobSkill,
  generateJobSkill: mocks.generateJobSkill,
  removeJobSkill: mocks.removeJobSkill,
}));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }));
vi.mock("./version-preview", () => ({ VersionPreview: () => null }));

import { useMatrixAnswers } from "@/components/prompt-bot/use-matrix-answers";
import { SkillsPanel } from "./skills-panel";

const skill = (over: Partial<JobSkillView> = {}): JobSkillView => ({
  id: "s1", order: 0, name: "board-update", purpose: "Writes it.", fileIds: [], status: "DRAFT", validationErrors: [], latestVersion: 0, versions: [], ...over,
});
const JOB: JobView = {
  id: "j1", title: "Board", description: "Every month…", scoreRevision: 0, updatedAt: "2026-11-25T10:00:00.000Z", suggestedAt: null,
  matrix: { id: "m", name: "Skill definition", questions: [] }, answers: [], files: [], skills: [],
};
const ok = <T,>(data: T) => ({ ok: true as const, data });
const mount = (job: JobView = JOB, gaps = 0, aiConfigured = true) => {
  const props = { job, gaps, aiConfigured, flushSaves: vi.fn(async () => {}), queueSave: vi.fn(), onJobChange: vi.fn(), onSkillChange: vi.fn(), onSkillRemoved: vi.fn() };
  render(createElement(SkillsPanel, props));
  return props;
};
const press = (name: RegExp) =>
  act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("confirm", vi.fn(() => true));
  mocks.suggestSkills.mockResolvedValue(ok({ ...JOB, skills: [skill()] }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SkillsPanel suggest", () => {
  it("invites a suggestion when there are no skills, and suggests at once with no gaps", async () => {
    const props = mount();
    expect(screen.getByText("Let the AI suggest the skills for this job.")).toBeTruthy();
    await press(/^Suggest skills/);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(props.flushSaves.mock.invocationCallOrder[0]).toBeLessThan(mocks.suggestSkills.mock.invocationCallOrder[0]);
    expect(mocks.suggestSkills).toHaveBeenCalledWith("j1");
    expect(props.onJobChange).toHaveBeenCalledWith(expect.objectContaining({ skills: [expect.objectContaining({ id: "s1" })] }));
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it("asks once when questions are unanswered", async () => {
    mount(JOB, 2);
    await press(/^Suggest skills/);
    const dialog = screen.getByRole("alertdialog");
    expect(dialog.textContent).toContain("2 questions unanswered — suggestions will be more general. Suggest anyway?");
    expect(dialog.textContent).not.toContain("replaces");
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    });
    expect(mocks.suggestSkills).not.toHaveBeenCalled();
    await press(/^Suggest skills/);
    await act(async () => {
      fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Suggest anyway" }));
    });
    expect(mocks.suggestSkills).toHaveBeenCalledTimes(1);
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it("warns that drafts are replaced when suggesting again", async () => {
    mount({ ...JOB, skills: [skill(), skill({ id: "s2", name: "kept", latestVersion: 1, status: "READY" })] }, 1);
    expect(screen.getByText(/Keeps skills you've generated and replaces the drafts/)).toBeTruthy();
    await press(/^Suggest again/);
    expect(screen.getByRole("alertdialog").textContent).toContain("This replaces the skills you haven't generated yet.");
  });

  it("asks before replacing drafts even when every question is answered", async () => {
    mount({ ...JOB, skills: [skill(), skill({ id: "s2", name: "kept", latestVersion: 1, status: "READY" })] }, 0);
    await press(/^Suggest again/);
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByRole("heading", { name: "Replace your draft skills?" })).toBeTruthy();
    expect(dialog.textContent).toContain("This replaces the skills you haven't generated yet.");
    expect(dialog.textContent).not.toContain("unanswered");
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    });
    expect(mocks.suggestSkills).not.toHaveBeenCalled();
    await press(/^Suggest again/);
    await act(async () => {
      fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Replace drafts" }));
    });
    expect(mocks.suggestSkills).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it("suggests again at once when every skill has versions and no question is open", async () => {
    mount({ ...JOB, skills: [skill({ latestVersion: 2, status: "READY" })] }, 0);
    await press(/^Suggest again/);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(mocks.suggestSkills).toHaveBeenCalledWith("j1");
  });

  it("shows a failed suggestion", async () => {
    mocks.suggestSkills.mockResolvedValue({ ok: false, code: "LIMIT_REACHED", message: "You've reached today's limit." });
    const props = mount();
    await press(/^Suggest skills/);
    expect(mocks.toastError).toHaveBeenCalledWith("You've reached today's limit.");
    expect(props.onJobChange).not.toHaveBeenCalled();
  });

  it("can't suggest without the AI", () => {
    mount(JOB, 0, false);
    expect((screen.getByRole("button", { name: /^Suggest skills/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("SkillsPanel saves", () => {
  it("sends a purpose still waiting to save before suggesting", async () => {
    mocks.patchJobSkill.mockImplementation(async () => ok(skill({ purpose: "Writes it from the deck." })));
    const job = { ...JOB, skills: [skill({ latestVersion: 1, status: "READY" as const })] };
    function Harness() {
      const state = useMatrixAnswers({ initialAnswers: [], initialRevision: 0, saveAnswer: async () => ok({}), score: null });
      return createElement(SkillsPanel, {
        job, gaps: 0, aiConfigured: true, flushSaves: state.flushSaves, queueSave: state.queueSave,
        onJobChange: vi.fn(), onSkillChange: vi.fn(), onSkillRemoved: vi.fn(),
      });
    }
    render(createElement(Harness));
    fireEvent.change(screen.getByLabelText(/^Purpose/), { target: { value: "Writes it from the deck." } });
    await press(/^Suggest again/);
    expect(mocks.patchJobSkill).toHaveBeenCalledWith("j1", "s1", { purpose: "Writes it from the deck." }, {});
    expect(mocks.patchJobSkill.mock.invocationCallOrder[0]).toBeLessThan(mocks.suggestSkills.mock.invocationCallOrder[0]);
  });
});

describe("SkillsPanel skills", () => {
  it("lists a card per skill", () => {
    mount({ ...JOB, skills: [skill(), skill({ id: "s2", name: "weekly-report" })] });
    expect((screen.getAllByLabelText(/^Skill name/) as HTMLInputElement[]).map((i) => i.value)).toEqual(["board-update", "weekly-report"]);
  });

  it("adds a skill by hand", async () => {
    mocks.addJobSkill.mockResolvedValue(ok(skill({ id: "s3", name: "weekly-report" })));
    const props = mount({ ...JOB, skills: [skill()] });
    fireEvent.click(screen.getByRole("button", { name: /^Add skill/ }));
    fireEvent.change(screen.getByLabelText("New skill name"), { target: { value: "Weekly report" } });
    fireEvent.change(screen.getByLabelText("What it does"), { target: { value: "Writes the weekly report." } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add" }));
    });
    expect(mocks.addJobSkill).toHaveBeenCalledWith("j1", { name: "Weekly report", purpose: "Writes the weekly report." });
    expect(props.onSkillChange).toHaveBeenCalledWith(expect.objectContaining({ id: "s3" }));
    expect(screen.queryByLabelText("New skill name")).toBeNull();
  });

  it("shows a duplicate name inline when adding", async () => {
    mocks.addJobSkill.mockResolvedValue({ ok: false, code: "DUPLICATE_NAME", message: 'A skill named "board-update" is already in this job. Choose another name.' });
    mount({ ...JOB, skills: [skill()] });
    fireEvent.click(screen.getByRole("button", { name: /^Add skill/ }));
    fireEvent.change(screen.getByLabelText("New skill name"), { target: { value: "Board update" } });
    fireEvent.change(screen.getByLabelText("What it does"), { target: { value: "Again." } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add" }));
    });
    expect(screen.getByText('A skill named "board-update" is already in this job. Choose another name.')).toBeTruthy();
  });

  it("stops offering Add at five skills", () => {
    mount({ ...JOB, skills: [1, 2, 3, 4, 5].map((n) => skill({ id: `s${n}`, name: `skill-${n}` })) });
    expect((screen.getByRole("button", { name: /^Add skill/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("A job can have at most 5 skills.")).toBeTruthy();
  });
});
