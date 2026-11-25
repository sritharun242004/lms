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
  removeJobSkill: vi.fn(),
  patchJob: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock("@/lib/skills/jobs/client", () => ({
  suggestSkills: mocks.suggestSkills,
  addJobSkill: mocks.addJobSkill,
  patchJobSkill: mocks.patchJobSkill,
  removeJobSkill: mocks.removeJobSkill,
  patchJob: mocks.patchJob,
}));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError, success: vi.fn() } }));
vi.mock("./legacy-versions", async () => {
  const { createElement: h } = await import("react");
  return {
    hasLegacyVersions: (skills: { latestVersion: number }[]) => skills.some((s) => s.latestVersion > 0),
    LegacyVersions: () => h("p", null, "legacy-versions"),
  };
});
vi.mock("./plugin-version-preview", async () => {
  const { createElement: h } = await import("react");
  return { PluginVersionPreview: ({ plugin }: { plugin: { latestVersion: number } }) => h("p", null, `versions:v${plugin.latestVersion}`) };
});

import { useMatrixAnswers } from "@/components/prompt-bot/use-matrix-answers";
import { FIXTURES, jobSkill, jobView, pluginView, SUBS } from "./plugin-fixtures";
import { SkillsPanel } from "./skills-panel";

const skill = (over: Partial<JobSkillView> = {}): JobSkillView => jobSkill({ id: "s1", role: "MAIN", name: "board-update", ...over });
const JOB: JobView = jobView({ title: "Board", description: "Every month…", company: "", plugin: pluginView({ name: "board", displayName: "Board" }) });
const ok = <T,>(data: T) => ({ ok: true as const, data });
const mount = (job: JobView = JOB, gaps = 0, aiConfigured = true) => {
  const props = { job, gaps, aiConfigured, flushSaves: vi.fn(async () => {}), queueSave: vi.fn(), onJobChange: vi.fn(), onPluginChange: vi.fn(), onSkillChange: vi.fn(), onSkillRemoved: vi.fn() };
  render(createElement(SkillsPanel, props));
  return props;
};
const press = (name: RegExp) =>
  act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
/** Redraft, answering its one question. */
const redraft = async () => {
  await press(/^Redraft my skills/);
  await act(async () => {
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Redraft" }));
  });
};

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
    expect(screen.getByText("Claude will suggest one plugin: a main skill for the whole job and a few sub-skills for its parts.")).toBeTruthy();
    await press(/^Create my skills/);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(props.flushSaves.mock.invocationCallOrder[0]).toBeLessThan(mocks.suggestSkills.mock.invocationCallOrder[0]);
    expect(mocks.suggestSkills).toHaveBeenCalledWith("j1");
    expect(props.onJobChange).toHaveBeenCalledWith(expect.objectContaining({ skills: [expect.objectContaining({ id: "s1" })] }));
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it("asks once when questions are unanswered", async () => {
    mount(JOB, 2);
    await press(/^Create my skills/);
    const dialog = screen.getByRole("alertdialog");
    expect(dialog.textContent).toContain("2 questions unanswered — your skills will be more general. Create them anyway?");
    expect(dialog.textContent).not.toContain("replaces");
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    });
    expect(mocks.suggestSkills).not.toHaveBeenCalled();
    await press(/^Create my skills/);
    await act(async () => {
      fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Create anyway" }));
    });
    expect(mocks.suggestSkills).toHaveBeenCalledTimes(1);
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it("asks before a redraft, saying names are replaced and past versions stay", async () => {
    mount(FIXTURES.readyV2, 0);
    expect(screen.getByText("Replaces the skills and names. Past versions stay downloadable.")).toBeTruthy();
    await press(/^Redraft my skills/);
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByRole("heading", { name: "Redraft your plugin?" })).toBeTruthy();
    expect(dialog.textContent).toContain("This replaces your plugin's skills and names. Past versions stay downloadable.");
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    });
    expect(mocks.suggestSkills).not.toHaveBeenCalled();
    await press(/^Redraft my skills/);
    await act(async () => {
      fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Redraft" }));
    });
    expect(mocks.suggestSkills).toHaveBeenCalledTimes(1);
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it("asks once with both notes when redrafting with questions open", async () => {
    mount(FIXTURES.draft, 1);
    await press(/^Redraft my skills/);
    const dialog = screen.getByRole("alertdialog");
    expect(dialog.textContent).toContain("1 question unanswered — your skills will be more general. Create them anyway?");
    expect(dialog.textContent).toContain("This replaces your plugin's skills and names.");
  });

  it("shows a failed suggestion", async () => {
    mocks.suggestSkills.mockResolvedValue({ ok: false, code: "LIMIT_REACHED", message: "You've reached today's limit." });
    const props = mount();
    await press(/^Create my skills/);
    expect(mocks.toastError).toHaveBeenCalledWith("You've reached today's limit.");
    expect(props.onJobChange).not.toHaveBeenCalled();
  });

  it("can't suggest without the AI", () => {
    mount(JOB, 0, false);
    expect((screen.getByRole("button", { name: /^Create my skills/ }) as HTMLButtonElement).disabled).toBe(true);
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
        onJobChange: vi.fn(), onPluginChange: vi.fn(), onSkillChange: vi.fn(), onSkillRemoved: vi.fn(),
      });
    }
    render(createElement(Harness));
    fireEvent.change(screen.getByLabelText(/^What it does: /), { target: { value: "Writes it from the deck." } });
    await redraft();
    expect(mocks.patchJobSkill).toHaveBeenCalledWith("j1", "s1", { purpose: "Writes it from the deck." }, {});
    expect(mocks.patchJobSkill.mock.invocationCallOrder[0]).toBeLessThan(mocks.suggestSkills.mock.invocationCallOrder[0]);
  });
});

describe("SkillsPanel file saves", () => {
  it("waits for a file choice still saving before suggesting", async () => {
    const replies: ((value: unknown) => void)[] = [];
    mocks.patchJobSkill.mockImplementation(() => new Promise((resolve) => replies.push(resolve)));
    const file = { id: "f1", fileName: "deck.pptx", assetName: "deck.pptx", kind: "PPTX" as const, size: 10, createdAt: JOB.updatedAt, analysisStatus: "READY" as const, analysis: "x", analysisEdited: false, analysisError: null, bundlable: true, questionId: null };
    mount({ ...JOB, files: [file], skills: [skill({ latestVersion: 1, status: "READY" as const })] });
    await press(/^deck\.pptx/);
    await redraft();
    expect(mocks.suggestSkills).not.toHaveBeenCalled();
    await act(async () => {
      replies[0](ok(skill({ fileIds: ["f1"], latestVersion: 1, status: "READY" as const })));
    });
    expect(mocks.suggestSkills).toHaveBeenCalledWith("j1");
    expect(mocks.patchJobSkill.mock.invocationCallOrder[0]).toBeLessThan(mocks.suggestSkills.mock.invocationCallOrder[0]);
  });
});

describe("SkillsPanel skills", () => {
  it("shows the plugin card and the hierarchy once there are skills", () => {
    mount(FIXTURES.draft);
    expect(screen.getByRole("heading", { name: "Your plugin" })).toBeTruthy();
    expect(screen.getByLabelText("Plugin ID")).toBeTruthy();
    expect((screen.getAllByLabelText(/^Skill name/) as HTMLInputElement[]).map((i) => i.value)).toEqual(["quarterly-deck", "deck-analyzer", "deck-designer", "deck-grammar-check"]);
  });

  it("shows the versions once the plugin has one", () => {
    mount(FIXTURES.draft);
    expect(screen.queryByText(/^versions:/)).toBeNull();
    cleanup();
    mount(FIXTURES.readyV2);
    expect(screen.getByText("versions:v2")).toBeTruthy();
  });

  it("keeps a migrated task's earlier single-skill versions in their own section", () => {
    mount(FIXTURES.migrated);
    expect(screen.getByText("legacy-versions")).toBeTruthy();
    cleanup();
    mount(FIXTURES.readyV2);
    expect(screen.queryByText("legacy-versions")).toBeNull();
  });

  it("adds a sub-skill by hand, last in the workflow", async () => {
    mocks.addJobSkill.mockResolvedValue(ok(jobSkill({ id: "s9", order: 4, name: "deck-formatter" })));
    const props = mount(FIXTURES.draft);
    fireEvent.click(screen.getByRole("button", { name: /^Add sub-skill/ }));
    expect(screen.getByText("It goes last in the main skill's workflow. Move it up or down after adding it.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("New sub-skill name"), { target: { value: "Deck formatter" } });
    fireEvent.change(screen.getByLabelText("Label (optional)"), { target: { value: "Formatter" } });
    fireEvent.change(screen.getByLabelText("What it does"), { target: { value: "Applies the template." } });
    fireEvent.change(screen.getByLabelText("Step in the workflow (optional)"), { target: { value: "Apply the template's formatting" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add" }));
    });
    expect(mocks.addJobSkill).toHaveBeenCalledWith("j1", { name: "Deck formatter", purpose: "Applies the template.", label: "Formatter", step: "Apply the template's formatting" });
    expect(props.onSkillChange).toHaveBeenCalledWith(expect.objectContaining({ id: "s9" }));
    expect(screen.queryByLabelText("New sub-skill name")).toBeNull();
  });

  it("shows a refused name inline when adding", async () => {
    mocks.addJobSkill.mockResolvedValue({ ok: false, code: "DUPLICATE_NAME", message: 'A skill named "deck-designer" is already in this job. Choose another name.' });
    mount(FIXTURES.draft);
    fireEvent.click(screen.getByRole("button", { name: /^Add sub-skill/ }));
    fireEvent.change(screen.getByLabelText("New sub-skill name"), { target: { value: "Deck designer" } });
    fireEvent.change(screen.getByLabelText("What it does"), { target: { value: "Again." } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add" }));
    });
    expect(mocks.addJobSkill).toHaveBeenCalledWith("j1", { name: "Deck designer", purpose: "Again." });
    expect(screen.getByText('A skill named "deck-designer" is already in this job. Choose another name.')).toBeTruthy();
  });

  it("stops offering Add sub-skill at six sub-skills", () => {
    const six = [1, 2, 3, 4, 5, 6].map((n) => jobSkill({ id: `s${n}`, order: n, name: `part-${n}` }));
    mount({ ...FIXTURES.draft, skills: [FIXTURES.draft.skills[0], ...six] });
    const add = screen.getByRole("button", { name: /^Add sub-skill/ }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    expect(screen.getByText("A plugin can have at most 6 sub-skills.")).toBeTruthy();
    expect(add.getAttribute("aria-describedby")).toBeTruthy();
  });

  it("disables Remove at two sub-skills with the reason, and never offers it on the main skill", () => {
    mount({ ...FIXTURES.draft, skills: [FIXTURES.draft.skills[0], SUBS[0], SUBS[1]] });
    const removes = screen.getAllByRole("button", { name: /^Remove/ }) as HTMLButtonElement[];
    expect(removes.map((b) => b.textContent)).toEqual(["Remove: deck-analyzer", "Remove: deck-designer"]);
    expect(removes.every((b) => b.disabled)).toBe(true);
    expect(screen.getAllByText("A plugin needs at least 2 sub-skills.")).toHaveLength(2);
    cleanup();
    mount(FIXTURES.draft);
    expect((screen.getAllByRole("button", { name: /^Remove/ }) as HTMLButtonElement[]).every((b) => !b.disabled)).toBe(true);
  });
});
