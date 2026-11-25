/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MatrixAnswers } from "@/components/prompt-bot/use-matrix-answers";
import type { JobFileView, JobSkillView, JobView, TaskQuestionView } from "@/lib/skills/jobs/types";

const mocks = vi.hoisted(() => ({
  getJob: vi.fn(),
  patchJob: vi.fn(),
  deleteJob: vi.fn(),
  saveJobAnswer: vi.fn(),
  scoreJob: vi.fn(),
  downloadZip: vi.fn(),
  generatePlugin: vi.fn(),
  patchJobSkill: vi.fn(),
  removeJobSkill: vi.fn(),
  addJobSkill: vi.fn(),
  suggestSkills: vi.fn(),
  push: vi.fn(),
  panels: {} as Record<string, Record<string, unknown>>,
}));
vi.mock("@/lib/skills/jobs/client", () => ({
  getJob: mocks.getJob,
  patchJob: mocks.patchJob,
  deleteJob: mocks.deleteJob,
  saveJobAnswer: mocks.saveJobAnswer,
  scoreJob: mocks.scoreJob,
  generatePlugin: mocks.generatePlugin,
  patchJobSkill: mocks.patchJobSkill,
  removeJobSkill: mocks.removeJobSkill,
  addJobSkill: mocks.addJobSkill,
  suggestSkills: mocks.suggestSkills,
  pluginDownloadUrl: (id: string, version: number, format: string) => `/dl/${id}/${version}/${format}`,
}));
vi.mock("@/lib/skills/client", () => ({ downloadZip: mocks.downloadZip }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("./task-panel", async () => {
  const { createElement: h } = await import("react");
  return {
    taskShortMessageId: (jobId: string) => `short-${jobId}`,
    TaskPanel: (props: Record<string, unknown>) => {
      mocks.panels.task = props;
      return h("p", { id: "short-j1" }, `description:${props.description as string}`);
    },
  };
});
vi.mock("./questions-panel", async () => {
  const { createElement: h } = await import("react");
  return {
    QuestionsPanel: (props: { job: JobView } & Record<string, unknown>) => {
      mocks.panels.questions = props;
      return h("ul", null, props.job.files.map((f) => h("li", { key: f.id }, `${f.fileName}:${f.analysisStatus}`)));
    },
  };
});
vi.mock("./skills-panel", async () => {
  const { createElement: h } = await import("react");
  return {
    SkillsPanel: (props: { job: JobView; gaps: number } & Record<string, unknown>) => {
      mocks.panels.skills = props;
      return h("p", null, `skills:${props.job.skills.map((s) => `${s.name}=${s.status}`).join("|")} plugin:${props.job.plugin.status} gaps:${props.gaps}`);
    },
  };
});

import { JobWorkspace } from "./job-workspace";
import { jobSkill, pluginView } from "./plugin-fixtures";

const file = (over: Partial<JobFileView> = {}): JobFileView => ({
  id: "f1", fileName: "deck.pptx", assetName: "deck.pptx", kind: "PPTX", size: 1000, createdAt: "2026-11-25T10:00:00.000Z",
  analysisStatus: "READY", analysis: "## Colours", analysisEdited: false, analysisError: null, bundlable: true, questionId: "q1", ...over,
});
const skill = (over: Partial<JobSkillView> = {}): JobSkillView => jobSkill({ id: "s1", role: "MAIN", name: "board-update", fileIds: ["f1"], ...over });
const question = (over: Partial<TaskQuestionView> = {}): TaskQuestionView => ({
  id: "q1", order: 0, kind: "FIXED", text: "When should this skill be used?", guidance: "Triggers", required: true,
  wantsFiles: false, fileHint: null, fileNote: "", source: "AI", ...over,
});
const QUESTIONS = [
  question(),
  question({ id: "q2", order: 1, text: "What context does it need to know?", guidance: "Background" }),
  question({ id: "p1", order: 2, kind: "PER_USE", text: "Month", guidance: "e.g. March" }),
];
const JOB: JobView = {
  id: "j1",
  title: "Monthly board update",
  description: "Every month I write the board update.",
  scoreRevision: 2,
  updatedAt: "2026-11-25T10:00:00.000Z",
  suggestedAt: null, questionsGeneratedAt: "2026-11-25T10:00:00.000Z", outputType: "board update", questions: QUESTIONS,
  matrix: {
    id: "m",
    name: "Skill definition",
    questions: [
      { id: "q1", text: "When should this skill be used?", guidance: "Triggers", order: 0 },
      { id: "q2", text: "What context does it need to know?", guidance: "Background", order: 1 },
    ],
  },
  answers: [
    { questionId: "q1", answer: "Monthly", score: 3, reason: "Clear", notRelevant: false },
    { questionId: "q2", answer: "", score: 1, reason: "Vague", notRelevant: false },
  ],
  files: [file()],
  company: "",
  plugin: pluginView({ name: "monthly-board-update", displayName: "Monthly board update" }),
  skills: [skill()],
};
const ok = <T,>(data: T) => ({ ok: true as const, data });
const settle = (ms = 0) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
const mount = async (initial: JobView = JOB, aiConfigured = true) => {
  render(createElement(JobWorkspace, { initial, aiConfigured, isAdmin: false }));
  await settle();
};
const questionsState = () => mocks.panels.questions.state as MatrixAnswers;
const steps = () => within(screen.getByRole("navigation", { name: "Steps" }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/prompt-bot/skills/j1");
  mocks.patchJob.mockResolvedValue(ok(JOB));
  mocks.saveJobAnswer.mockResolvedValue(ok({ saved: true }));
  mocks.scoreJob.mockResolvedValue(ok({ applied: false, revision: 0, answers: [] }));
  mocks.downloadZip.mockResolvedValue({ ok: true });
  vi.stubGlobal("confirm", vi.fn(() => true));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("JobWorkspace steps", () => {
  it("opens the step named in the URL hash and keeps the hash in sync", async () => {
    window.location.hash = "#questions";
    await mount();
    expect(steps().getByRole("button", { name: /Questions/ }).getAttribute("aria-current")).toBe("step");
    fireEvent.click(steps().getByRole("button", { name: /Skills/ }));
    expect(steps().getByRole("button", { name: /Skills/ }).getAttribute("aria-current")).toBe("step");
    expect(window.location.hash).toBe("#skills");
  });

  it("opens the old #job and #files links on Task and Questions", async () => {
    window.location.hash = "#job";
    await mount();
    expect(steps().getByRole("button", { name: /Task/ }).getAttribute("aria-current")).toBe("step");
    cleanup();
    window.location.hash = "#files";
    await mount();
    expect(steps().getByRole("button", { name: /Questions/ }).getAttribute("aria-current")).toBe("step");
    expect(steps().queryByRole("button", { name: /Files/ })).toBeNull();
  });

  it("moves between the three steps with Back and Next buttons at the bottom", async () => {
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
    window.matchMedia = vi.fn(() => ({ matches: false })) as unknown as typeof window.matchMedia;
    await mount();
    const nav = () => within(screen.getByRole("navigation", { name: "Step navigation" }));
    expect(nav().queryByRole("button", { name: /Back/ })).toBeNull();
    fireEvent.click(nav().getByRole("button", { name: "Next: Questions" }));
    expect(window.location.hash).toBe("#questions");
    expect(window.scrollTo).toHaveBeenCalled();
    fireEvent.click(nav().getByRole("button", { name: "Next: Skills" }));
    expect(window.location.hash).toBe("#skills");
    expect(nav().queryByRole("button", { name: /Next/ })).toBeNull();
    fireEvent.click(nav().getByRole("button", { name: "Back: Questions" }));
    expect(window.location.hash).toBe("#questions");
  });

  it("counts answer-now questions only on the step and for the skills panel", async () => {
    await mount();
    expect(steps().getByRole("button", { name: /Questions/ }).textContent).toContain("1 of 2");
    expect(screen.getByText(/gaps:1/)).toBeTruthy();
  });

  it("locks Questions and Skills while a new task's description is short", async () => {
    window.location.hash = "#skills";
    await mount({ ...JOB, questions: [], answers: [], files: [], questionsGeneratedAt: null });
    expect(steps().getByRole("button", { name: /Task/ }).getAttribute("aria-current")).toBe("step");
    for (const name of [/Questions/, /Skills/]) {
      const button = steps().getByRole("button", { name }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      expect(button.getAttribute("aria-describedby")).toBe("short-j1");
    }
    const next = screen.getByRole("button", { name: "Next: Questions" }) as HTMLButtonElement;
    expect(next.disabled).toBe(true);
    expect(next.getAttribute("aria-describedby")).toBe("short-j1");
    await act(async () => {
      (mocks.panels.task.onDescriptionChange as (v: string) => void)("x".repeat(500));
    });
    // Long enough now: the step in the URL opens.
    expect(steps().getByRole("button", { name: /Skills/ }).getAttribute("aria-current")).toBe("step");
    expect((steps().getByRole("button", { name: /Questions/ }) as HTMLButtonElement).disabled).toBe(false);
    await settle(600);
  });

  it("never locks an old task that already has questions, however short", async () => {
    await mount({ ...JOB, description: "Board" });
    expect((screen.getByRole("button", { name: "Next: Questions" }) as HTMLButtonElement).disabled).toBe(false);
    expect((steps().getByRole("button", { name: /Skills/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("never asks with window.confirm, even on the paths that ask", async () => {
    mocks.deleteJob.mockResolvedValue(ok({ deleted: true }));
    await mount();
    // Delete asks first; the answer comes from the in-app dialog.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Delete task" }));
    });
    await act(async () => {
      fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete task" }));
    });
    expect(mocks.deleteJob).toHaveBeenCalledWith("j1");
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it("never asks with window.confirm on the generate path either", async () => {
    mocks.generatePlugin.mockResolvedValue(ok(pluginView({ status: "GENERATING" })));
    const subs = [jobSkill({ id: "s2", order: 1, name: "board-figures" }), jobSkill({ id: "s3", order: 2, name: "board-check" })];
    await mount({ ...JOB, skills: [skill(), ...subs] });
    // Generate lives in the real skills panel; drive it with the props this workspace hands it (one question open).
    const { SkillsPanel: RealSkillsPanel } = await vi.importActual<typeof import("./skills-panel")>("./skills-panel");
    const props = mocks.panels.skills as unknown as Parameters<typeof RealSkillsPanel>[0];
    expect(props.gaps).toBe(1);
    const panel = render(createElement(RealSkillsPanel, props));
    await act(async () => {
      fireEvent.click(within(panel.container).getByRole("button", { name: /^Generate plugin$/ }));
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Generate anyway" }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mocks.generatePlugin).toHaveBeenCalledWith("j1");
    // The workspace took the GENERATING plugin back from the panel.
    expect(screen.getByText(/plugin:GENERATING/)).toBeTruthy();
    expect(window.confirm).not.toHaveBeenCalled();
  });
});

describe("JobWorkspace polling", () => {
  it("polls while a file is analysed, merges only its status, flags the bars for a check, then stops", async () => {
    const waiting = { ...JOB, files: [file({ analysisStatus: "PENDING", analysis: null })] };
    mocks.getJob.mockResolvedValue(ok({ ...JOB, description: "server copy", files: [file({ fileName: "SERVER", analysisStatus: "READY", analysis: "## Fonts" })] }));
    await mount(waiting);
    expect(screen.getByText("deck.pptx:PENDING")).toBeTruthy();
    await settle(3000);
    expect(mocks.getJob).toHaveBeenCalledWith("j1");
    expect(screen.getByText("deck.pptx:READY")).toBeTruthy();
    expect(screen.getByText("description:Every month I write the board update.")).toBeTruthy();
    await settle(1500);
    expect(mocks.scoreJob).not.toHaveBeenCalled();
    expect(questionsState().contextStale).toBe(true);
    await settle(60_000);
    expect(mocks.getJob).toHaveBeenCalledTimes(1);
  });

  it("polls while the plugin is written and shows the result", async () => {
    const ready = pluginView({ name: "monthly-board-update", status: "READY", latestVersion: 1 });
    mocks.getJob.mockResolvedValue(ok({ ...JOB, plugin: ready }));
    await mount({ ...JOB, plugin: pluginView({ status: "GENERATING" }) });
    expect(screen.getByText(/plugin:GENERATING/)).toBeTruthy();
    await settle(3000);
    expect(screen.getByText(/plugin:READY/)).toBeTruthy();
    await settle(60_000);
    expect(mocks.getJob).toHaveBeenCalledTimes(1);
  });

  it("starts polling when the panel reports a generating plugin", async () => {
    mocks.getJob.mockResolvedValue(ok({ ...JOB, plugin: pluginView({ status: "READY", latestVersion: 1 }) }));
    await mount();
    await settle(5000);
    expect(mocks.getJob).not.toHaveBeenCalled();
    await act(async () => {
      (mocks.panels.skills.onPluginChange as (p: JobView["plugin"]) => void)(pluginView({ status: "GENERATING" }));
    });
    expect(screen.getByText(/plugin:GENERATING/)).toBeTruthy();
    await settle(3000);
    expect(screen.getByText(/plugin:READY/)).toBeTruthy();
  });

  it("says it is still working once the cap passes", async () => {
    mocks.getJob.mockResolvedValue(ok({ ...JOB, plugin: pluginView({ status: "GENERATING" }) }));
    await mount({ ...JOB, plugin: pluginView({ status: "GENERATING" }) });
    await settle(12 * 60_000);
    expect(screen.getByRole("status").textContent).toMatch(/Still working/);
  });

  it("keeps a re-analysis that started while an older poll was in flight", async () => {
    let answer: (value: unknown) => void = () => {};
    mocks.getJob.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
    mocks.getJob.mockResolvedValue(ok({ ...JOB, files: [file({ analysisStatus: "PENDING", analysis: null }), file({ id: "f2", fileName: "brief.docx" })] }));
    await mount({ ...JOB, files: [file(), file({ id: "f2", fileName: "brief.docx", analysisStatus: "PENDING", analysis: null })] });
    await settle(3000);
    expect(mocks.getJob).toHaveBeenCalledTimes(1);
    // The user re-analyses deck.pptx; the in-flight reply still has it READY.
    await act(async () => {
      (mocks.panels.questions.onFileChange as (f: JobFileView) => void)(file({ analysisStatus: "PENDING", analysis: null }));
      answer(ok({ ...JOB, files: [file(), file({ id: "f2", fileName: "brief.docx" })] }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText("deck.pptx:PENDING")).toBeTruthy();
    await settle(3000);
    expect(mocks.getJob).toHaveBeenCalledTimes(2);
    expect(screen.getByText("deck.pptx:PENDING")).toBeTruthy();
    expect(screen.getByText("brief.docx:READY")).toBeTruthy();
  });

  it("stops polling and says so when the job was deleted elsewhere", async () => {
    mocks.getJob.mockResolvedValue({ ok: false, code: "NOT_FOUND", message: "Task not found" });
    await mount({ ...JOB, plugin: pluginView({ status: "GENERATING" }) });
    await settle(3000);
    expect(screen.getByRole("heading", { name: "This task was deleted" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Back to your tasks/ }).getAttribute("href")).toBe("/prompt-bot/skills");
    await settle(60_000);
    expect(mocks.getJob).toHaveBeenCalledTimes(1);
  });

  it("pauses while the page is hidden and resumes when it is shown", async () => {
    let visibility: DocumentVisibilityState = "hidden";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
    mocks.getJob.mockResolvedValue(ok({ ...JOB, plugin: pluginView({ status: "GENERATING" }) }));
    await mount({ ...JOB, plugin: pluginView({ status: "GENERATING" }) });
    await settle(60_000);
    expect(mocks.getJob).not.toHaveBeenCalled();
    visibility = "visible";
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mocks.getJob).toHaveBeenCalledTimes(1);
    await settle(4500);
    expect(mocks.getJob).toHaveBeenCalledTimes(2);
  });
});

describe("JobWorkspace description", () => {
  it("saves the description after the save delay and flags the bars for a check without scoring", async () => {
    await mount();
    await act(async () => {
      (mocks.panels.task.onDescriptionChange as (v: string) => void)("Weekly board update");
    });
    expect(screen.getByText("description:Weekly board update")).toBeTruthy();
    expect(mocks.patchJob).not.toHaveBeenCalled();
    await settle(600);
    expect(mocks.patchJob).toHaveBeenCalledWith("j1", { description: "Weekly board update" }, expect.anything());
    await settle(1500);
    expect(mocks.scoreJob).not.toHaveBeenCalled();
    expect(questionsState().contextStale).toBe(true);
  });

  it("autosaves the company and takes the plugin's default names from the reply", async () => {
    const renamed = pluginView({ name: "acme-monthly-board-update", displayName: "Acme · Monthly board update" });
    mocks.patchJob.mockResolvedValue(ok({ ...JOB, company: "Acme", plugin: renamed }));
    await mount();
    expect(mocks.panels.task.company).toBe("");
    await act(async () => {
      (mocks.panels.task.onCompanyChange as (v: string) => void)("Acme");
    });
    expect(mocks.panels.task.company).toBe("Acme");
    expect(mocks.patchJob).not.toHaveBeenCalled();
    await settle(600);
    expect(mocks.patchJob).toHaveBeenCalledWith("j1", { company: "Acme" }, expect.anything());
    expect((mocks.panels.skills.job as JobView).plugin.displayName).toBe("Acme · Monthly board update");
    expect(mocks.scoreJob).not.toHaveBeenCalled();
  });

  it("flags the bars when a file's analysis becomes ready or a file is removed, and drops a removed file from skills", async () => {
    await mount();
    await act(async () => {
      (mocks.panels.questions.onFileChange as (f: JobFileView) => void)(file({ id: "f2", fileName: "brief.docx", analysis: "## Tone" }));
    });
    expect(screen.getByText("brief.docx:READY")).toBeTruthy();
    await settle(1500);
    expect(questionsState().contextStale).toBe(true);
    mocks.scoreJob.mockResolvedValueOnce(ok({ applied: true, revision: 3, answers: [] }));
    await act(async () => {
      await questionsState().check();
    });
    expect(mocks.scoreJob).toHaveBeenCalledTimes(1);
    expect(questionsState().contextStale).toBe(false);
    await act(async () => {
      (mocks.panels.questions.onFileRemoved as (id: string) => void)("f1");
    });
    expect(screen.queryByText("deck.pptx:READY")).toBeNull();
    expect((mocks.panels.skills.job as JobView).skills[0].fileIds).toEqual([]);
    await settle(1500);
    expect(mocks.scoreJob).toHaveBeenCalledTimes(1);
    expect(questionsState().contextStale).toBe(true);
  });

  it("takes only skills and the plugin from a suggestion reply", async () => {
    await mount();
    await act(async () => {
      (mocks.panels.skills.onJobChange as (j: JobView) => void)({ ...JOB, description: "server", plugin: pluginView({ status: "FAILED" }), skills: [skill({ id: "s9", name: "weekly-report" })] });
    });
    expect(screen.getByText(/skills:weekly-report=DRAFT plugin:FAILED/)).toBeTruthy();
    expect(screen.getByText("description:Every month I write the board update.")).toBeTruthy();
  });
});

describe("JobWorkspace questions", () => {
  const fresh = { ...JOB, questions: [], answers: [], questionsGeneratedAt: null, outputType: null };
  const written = (over: Partial<JobView> = {}): JobView => ({ ...JOB, files: [file({ questionId: null })], ...over });

  it("never scores on open; the first questions written get their bars once", async () => {
    mocks.scoreJob.mockResolvedValue(ok({ applied: true, revision: 3, answers: [{ questionId: "q1", answer: "", score: 1, reason: "Hinted", notRelevant: false }] }));
    await mount(fresh);
    await settle(60_000);
    expect(mocks.scoreJob).not.toHaveBeenCalled();
    await act(async () => {
      (mocks.panels.questions.onQuestionsWritten as (v: JobView) => void)(written());
    });
    expect(mocks.scoreJob).toHaveBeenCalledTimes(1);
    expect(questionsState().answerFor("q1").reason).toBe("Hinted");
    const job = mocks.panels.questions.job as JobView;
    expect(job.outputType).toBe("board update");
    expect(job.questions).toHaveLength(3);
    expect(job.files[0].questionId).toBeNull();
    await act(async () => {
      (mocks.panels.questions.onQuestionsWritten as (v: JobView) => void)(written());
    });
    await settle(60_000);
    expect(mocks.scoreJob).toHaveBeenCalledTimes(1);
    expect(questionsState().contextStale).toBe(true);
  });

  it("makes a moved question's files general and flags the bars", async () => {
    await mount();
    await act(async () => {
      (mocks.panels.questions.onQuestionChange as (q: TaskQuestionView) => void)(question({ kind: "PER_USE" }));
    });
    const job = mocks.panels.questions.job as JobView;
    expect(job.questions.find((q) => q.id === "q1")?.kind).toBe("PER_USE");
    expect(job.files[0].questionId).toBeNull();
    expect(questionsState().contextStale).toBe(true);
    expect(steps().getByRole("button", { name: /Questions/ }).textContent).toContain("0 of 1");
  });

  it("adds a question and removes one, its files becoming general", async () => {
    await mount();
    await act(async () => {
      (mocks.panels.questions.onQuestionChange as (q: TaskQuestionView) => void)(question({ id: "q3", order: 3, text: "Who signs it off?", source: "USER" }));
    });
    expect((mocks.panels.questions.job as JobView).questions.map((q) => q.id)).toEqual(["q1", "q2", "p1", "q3"]);
    await act(async () => {
      (mocks.panels.questions.onQuestionRemoved as (id: string) => void)("q1");
    });
    const job = mocks.panels.questions.job as JobView;
    expect(job.questions.map((q) => q.id)).toEqual(["q2", "p1", "q3"]);
    expect(job.files[0].questionId).toBeNull();
  });
});

describe("JobWorkspace header", () => {
  it("gives the title a minimum width so the actions wrap below it on phones instead of truncating it", async () => {
    await mount();
    // jsdom has no layout: assert the flex basis that makes the header wrap at 360-390 px (seen in the e2e run as "M…").
    const titleBox = screen.getByRole("heading", { level: 1 }).closest("header > div");
    expect(titleBox?.className).toMatch(/\bbasis-/);
  });

  it("renames the job", async () => {
    mocks.patchJob.mockResolvedValue(ok({ ...JOB, title: "Board pack" }));
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "Rename task" }));
    const input = screen.getByLabelText("Task title");
    fireEvent.change(input, { target: { value: "Board pack" } });
    await act(async () => {
      fireEvent.submit(input.closest("form")!);
    });
    expect(mocks.patchJob).toHaveBeenCalledWith("j1", { title: "Board pack" });
    expect(screen.getByRole("heading", { level: 1, name: "Board pack" })).toBeTruthy();
  });

  it("saves a rename once when Enter is followed by blur", async () => {
    mocks.patchJob.mockResolvedValue(ok({ ...JOB, title: "Board pack" }));
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "Rename task" }));
    const input = screen.getByLabelText("Task title");
    fireEvent.change(input, { target: { value: "Board pack" } });
    // Both handlers run before React re-renders, as when Enter unmounts the focused input.
    await act(async () => {
      fireEvent.submit(input.closest("form")!);
      fireEvent.blur(input);
    });
    expect(mocks.patchJob).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { level: 1, name: "Board pack" })).toBeTruthy();
  });

  it("keeps the title and sends nothing when the rename is blank or unchanged", async () => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "Rename task" }));
    fireEvent.change(screen.getByLabelText("Task title"), { target: { value: "   " } });
    await act(async () => {
      fireEvent.blur(screen.getByLabelText("Task title"));
    });
    expect(mocks.patchJob).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { level: 1, name: "Monthly board update" })).toBeTruthy();
  });

  it("offers Download plugin once the plugin has a version, and downloads the latest plugin zip", async () => {
    await mount();
    expect(screen.queryByRole("button", { name: /Download/ })).toBeNull();
    cleanup();
    await mount({ ...JOB, plugin: pluginView({ status: "READY", latestVersion: 3 }) });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Download plugin/ }));
    });
    expect(mocks.downloadZip).toHaveBeenCalledWith("/dl/j1/3/plugin");
    expect(steps().getByRole("button", { name: /Skills/ }).textContent).toContain("(done)");
  });

  it("deletes the job only after a destructive confirm", async () => {
    mocks.deleteJob.mockResolvedValue(ok({ deleted: true }));
    await mount();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Delete task" }));
    });
    const dialog = screen.getByRole("alertdialog");
    expect(dialog.textContent).toContain("It can't be undone");
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    });
    expect(mocks.deleteJob).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Delete task" }));
    });
    await act(async () => {
      fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete task" }));
    });
    expect(mocks.deleteJob).toHaveBeenCalledWith("j1");
    expect(mocks.push).toHaveBeenCalledWith("/prompt-bot/skills");
  });

  it("shows the not-configured notice without the AI key", async () => {
    await mount(JOB, false);
    expect(screen.getByText("Prompt Bot isn't configured yet")).toBeTruthy();
  });

  it("never scores without the AI key, so the bars don't report a failure on each edit", async () => {
    await mount({ ...JOB, answers: [] }, false);
    for (const value of ["Weekly", "Weekly board"]) {
      await act(async () => {
        (mocks.panels.task.onDescriptionChange as (v: string) => void)(value);
      });
      await settle(600 + 1500);
    }
    await act(async () => {
      (mocks.panels.questions.onFileChange as (f: JobFileView) => void)(file({ id: "f2", analysis: "## Tone" }));
    });
    await settle(1500);
    expect(mocks.patchJob).toHaveBeenCalledTimes(2);
    expect(mocks.scoreJob).not.toHaveBeenCalled();
    expect(questionsState().canCheck).toBe(false);
    expect(questionsState().checkError).toBeNull();
    expect(screen.getAllByText("Prompt Bot isn't configured yet")).toHaveLength(1);
  });
});
