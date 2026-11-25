/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MatrixAnswers } from "@/components/prompt-bot/use-matrix-answers";
import type { JobFileView, JobSkillView, JobView } from "@/lib/skills/jobs/types";

const mocks = vi.hoisted(() => ({
  getJob: vi.fn(),
  patchJob: vi.fn(),
  deleteJob: vi.fn(),
  saveJobAnswer: vi.fn(),
  scoreJob: vi.fn(),
  downloadZip: vi.fn(),
  generateJobSkill: vi.fn(),
  push: vi.fn(),
  panels: {} as Record<string, Record<string, unknown>>,
}));
vi.mock("@/lib/skills/jobs/client", () => ({
  getJob: mocks.getJob,
  patchJob: mocks.patchJob,
  deleteJob: mocks.deleteJob,
  saveJobAnswer: mocks.saveJobAnswer,
  scoreJob: mocks.scoreJob,
  generateJobSkill: mocks.generateJobSkill,
  jobDownloadUrl: (id: string) => `/dl/${id}`,
}));
vi.mock("@/lib/skills/client", () => ({ downloadZip: mocks.downloadZip }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("./describe-panel", async () => {
  const { createElement: h } = await import("react");
  return {
    DescribePanel: (props: Record<string, unknown>) => {
      mocks.panels.describe = props;
      return h("p", null, `description:${props.description as string}`);
    },
  };
});
vi.mock("./files-panel", async () => {
  const { createElement: h } = await import("react");
  return {
    FilesPanel: (props: { files: JobFileView[] } & Record<string, unknown>) => {
      mocks.panels.files = props;
      return h("ul", null, props.files.map((f) => h("li", { key: f.id }, `${f.fileName}:${f.analysisStatus}`)));
    },
  };
});
vi.mock("./questions-panel", () => ({
  QuestionsPanel: (props: Record<string, unknown>) => {
    mocks.panels.questions = props;
    return null;
  },
}));
vi.mock("./skills-panel", async () => {
  const { createElement: h } = await import("react");
  return {
    SkillsPanel: (props: { job: JobView; gaps: number } & Record<string, unknown>) => {
      mocks.panels.skills = props;
      return h("p", null, `skills:${props.job.skills.map((s) => `${s.name}=${s.status}`).join("|")} gaps:${props.gaps}`);
    },
  };
});

import { JobWorkspace } from "./job-workspace";

const file = (over: Partial<JobFileView> = {}): JobFileView => ({
  id: "f1", fileName: "deck.pptx", assetName: "deck.pptx", kind: "PPTX", size: 1000, createdAt: "2026-11-25T10:00:00.000Z",
  analysisStatus: "READY", analysis: "## Colours", analysisEdited: false, analysisError: null, bundlable: true, ...over,
});
const skill = (over: Partial<JobSkillView> = {}): JobSkillView => ({
  id: "s1", order: 0, name: "board-update", purpose: "Writes it.", fileIds: ["f1"], status: "DRAFT", validationErrors: [], latestVersion: 0, versions: [], ...over,
});
const JOB: JobView = {
  id: "j1",
  title: "Monthly board update",
  description: "Every month I write the board update.",
  scoreRevision: 2,
  updatedAt: "2026-11-25T10:00:00.000Z",
  suggestedAt: null,
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
    window.location.hash = "#files";
    await mount();
    expect(steps().getByRole("button", { name: /Files/ }).getAttribute("aria-current")).toBe("step");
    fireEvent.click(steps().getByRole("button", { name: /Skills/ }));
    expect(steps().getByRole("button", { name: /Skills/ }).getAttribute("aria-current")).toBe("step");
    expect(window.location.hash).toBe("#skills");
  });

  it("moves between steps with Back and Next buttons at the bottom", async () => {
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
    window.matchMedia = vi.fn(() => ({ matches: false })) as unknown as typeof window.matchMedia;
    await mount();
    const nav = () => within(screen.getByRole("navigation", { name: "Step navigation" }));
    expect(nav().queryByRole("button", { name: /Back/ })).toBeNull();
    fireEvent.click(nav().getByRole("button", { name: "Next: Files" }));
    expect(window.location.hash).toBe("#files");
    expect(window.scrollTo).toHaveBeenCalled();
    fireEvent.click(nav().getByRole("button", { name: "Next: Questions" }));
    fireEvent.click(nav().getByRole("button", { name: "Next: Skills" }));
    expect(window.location.hash).toBe("#skills");
    expect(nav().queryByRole("button", { name: /Next/ })).toBeNull();
    fireEvent.click(nav().getByRole("button", { name: "Back: Questions" }));
    expect(window.location.hash).toBe("#questions");
  });

  it("shows counts on the steps and the number of unanswered questions to the skills panel", async () => {
    await mount();
    expect(steps().getByRole("button", { name: /Files/ }).textContent).toContain("1");
    expect(steps().getByRole("button", { name: /Questions/ }).textContent).toContain("1 of 2");
    expect(screen.getByText(/gaps:1/)).toBeTruthy();
  });

  it("never asks with window.confirm, even on the paths that ask", async () => {
    mocks.deleteJob.mockResolvedValue(ok({ deleted: true }));
    await mount();
    // Delete asks first; the answer comes from the in-app dialog.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Delete job" }));
    });
    await act(async () => {
      fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete job" }));
    });
    expect(mocks.deleteJob).toHaveBeenCalledWith("j1");
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it("never asks with window.confirm on the generate path either", async () => {
    mocks.generateJobSkill.mockResolvedValue(ok(skill({ status: "GENERATING" })));
    await mount();
    // Generate lives in the real skills panel; drive it with the props this workspace hands it (one question open).
    const { SkillsPanel: RealSkillsPanel } = await vi.importActual<typeof import("./skills-panel")>("./skills-panel");
    const props = mocks.panels.skills as unknown as Parameters<typeof RealSkillsPanel>[0];
    expect(props.gaps).toBe(1);
    const panel = render(createElement(RealSkillsPanel, props));
    await act(async () => {
      fireEvent.click(within(panel.container).getByRole("button", { name: /^Generate: board-update$/ }));
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Generate anyway" }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mocks.generateJobSkill).toHaveBeenCalledWith("j1", "s1");
    // The workspace took the GENERATING skill back from the panel.
    expect(screen.getByText(/skills:board-update=GENERATING/)).toBeTruthy();
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

  it("polls while a skill is written and shows the result", async () => {
    mocks.getJob.mockResolvedValue(ok({ ...JOB, skills: [skill({ status: "READY", latestVersion: 1 })] }));
    await mount({ ...JOB, skills: [skill({ status: "GENERATING" })] });
    expect(screen.getByText(/board-update=GENERATING/)).toBeTruthy();
    await settle(3000);
    expect(screen.getByText(/board-update=READY/)).toBeTruthy();
  });

  it("says it is still working once the cap passes", async () => {
    mocks.getJob.mockResolvedValue(ok({ ...JOB, skills: [skill({ status: "GENERATING" })] }));
    await mount({ ...JOB, skills: [skill({ status: "GENERATING" })] });
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
      (mocks.panels.files.onFileChange as (f: JobFileView) => void)(file({ analysisStatus: "PENDING", analysis: null }));
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
    mocks.getJob.mockResolvedValue({ ok: false, code: "NOT_FOUND", message: "Job not found" });
    await mount({ ...JOB, skills: [skill({ status: "GENERATING" })] });
    await settle(3000);
    expect(screen.getByRole("heading", { name: "This job was deleted" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Back to your jobs/ }).getAttribute("href")).toBe("/prompt-bot/skills");
    await settle(60_000);
    expect(mocks.getJob).toHaveBeenCalledTimes(1);
  });

  it("pauses while the page is hidden and resumes when it is shown", async () => {
    let visibility: DocumentVisibilityState = "hidden";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
    mocks.getJob.mockResolvedValue(ok({ ...JOB, skills: [skill({ status: "GENERATING" })] }));
    await mount({ ...JOB, skills: [skill({ status: "GENERATING" })] });
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
      (mocks.panels.describe.onDescriptionChange as (v: string) => void)("Weekly board update");
    });
    expect(screen.getByText("description:Weekly board update")).toBeTruthy();
    expect(mocks.patchJob).not.toHaveBeenCalled();
    await settle(600);
    expect(mocks.patchJob).toHaveBeenCalledWith("j1", { description: "Weekly board update" }, expect.anything());
    await settle(1500);
    expect(mocks.scoreJob).not.toHaveBeenCalled();
    expect(questionsState().contextStale).toBe(true);
  });

  it("flags the bars when a file's analysis becomes ready or a file is removed, and drops a removed file from skills", async () => {
    await mount();
    await act(async () => {
      (mocks.panels.files.onFileChange as (f: JobFileView) => void)(file({ id: "f2", fileName: "brief.docx", analysis: "## Tone" }));
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
      (mocks.panels.files.onFileRemoved as (id: string) => void)("f1");
    });
    expect(screen.queryByText("deck.pptx:READY")).toBeNull();
    expect((mocks.panels.skills.job as JobView).skills[0].fileIds).toEqual([]);
    await settle(1500);
    expect(mocks.scoreJob).toHaveBeenCalledTimes(1);
    expect(questionsState().contextStale).toBe(true);
  });

  it("takes only skills from a suggestion reply", async () => {
    await mount();
    await act(async () => {
      (mocks.panels.skills.onJobChange as (j: JobView) => void)({ ...JOB, description: "server", skills: [skill({ id: "s9", name: "weekly-report" })] });
    });
    expect(screen.getByText(/skills:weekly-report=DRAFT/)).toBeTruthy();
    expect(screen.getByText("description:Every month I write the board update.")).toBeTruthy();
  });
});

describe("JobWorkspace checks", () => {
  it("scores a never-scored job once on open, then only when asked", async () => {
    mocks.scoreJob.mockResolvedValue(ok({ applied: true, revision: 3, answers: [{ questionId: "q1", answer: "", score: 1, reason: "Hinted", notRelevant: false }] }));
    await mount({ ...JOB, answers: [] });
    expect(mocks.scoreJob).toHaveBeenCalledTimes(1);
    expect(mocks.scoreJob).toHaveBeenCalledWith("j1", 3);
    expect(questionsState().answerFor("q1").reason).toBe("Hinted");
    expect(questionsState().contextStale).toBe(false);
    await settle(60_000);
    expect(mocks.scoreJob).toHaveBeenCalledTimes(1);
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
    fireEvent.click(screen.getByRole("button", { name: "Rename job" }));
    const input = screen.getByLabelText("Job title");
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
    fireEvent.click(screen.getByRole("button", { name: "Rename job" }));
    const input = screen.getByLabelText("Job title");
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
    fireEvent.click(screen.getByRole("button", { name: "Rename job" }));
    fireEvent.change(screen.getByLabelText("Job title"), { target: { value: "   " } });
    await act(async () => {
      fireEvent.blur(screen.getByLabelText("Job title"));
    });
    expect(mocks.patchJob).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { level: 1, name: "Monthly board update" })).toBeTruthy();
  });

  it("downloads all skills only when one has a version", async () => {
    await mount();
    expect((screen.getByRole("button", { name: /Download all skills/ }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    await mount({ ...JOB, skills: [skill({ status: "READY", latestVersion: 1 })] });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Download all skills/ }));
    });
    expect(mocks.downloadZip).toHaveBeenCalledWith("/dl/j1");
  });

  it("deletes the job only after a destructive confirm", async () => {
    mocks.deleteJob.mockResolvedValue(ok({ deleted: true }));
    await mount();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Delete job" }));
    });
    const dialog = screen.getByRole("alertdialog");
    expect(dialog.textContent).toContain("It can't be undone");
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    });
    expect(mocks.deleteJob).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Delete job" }));
    });
    await act(async () => {
      fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete job" }));
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
        (mocks.panels.describe.onDescriptionChange as (v: string) => void)(value);
      });
      await settle(600 + 1500);
    }
    await act(async () => {
      (mocks.panels.files.onFileChange as (f: JobFileView) => void)(file({ id: "f2", analysis: "## Tone" }));
    });
    await settle(1500);
    expect(mocks.patchJob).toHaveBeenCalledTimes(2);
    expect(mocks.scoreJob).not.toHaveBeenCalled();
    expect(questionsState().canCheck).toBe(false);
    expect(questionsState().checkError).toBeNull();
    expect(screen.getAllByText("Prompt Bot isn't configured yet")).toHaveLength(1);
  });
});
