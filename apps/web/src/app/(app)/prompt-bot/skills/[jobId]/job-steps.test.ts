import { describe, expect, it } from "vitest";
import type { AnswerView } from "@/lib/prompt-bot/sessions";
import type { JobFileView, JobSkillView, JobView } from "@/lib/skills/jobs/types";
import { jobSkill, jobView, pluginView } from "./plugin-fixtures";
import { canLeaveTask, fixedQuestions, JOB_STEPS, mergePolled, perUseQuestions, nextPollDelay, POLL_CAP_MS, POLL_FIRST_MS, pollKey, stepFromHash, unansweredCount } from "./job-steps";

const file = (over: Partial<JobFileView> = {}): JobFileView => ({
  id: "f1", fileName: "deck.pptx", assetName: "deck.pptx", kind: "PPTX", size: 1000, createdAt: "2026-11-25T10:00:00.000Z",
  analysisStatus: "PENDING", analysis: null, analysisEdited: false, analysisError: null, bundlable: true, questionId: null, ...over,
});
const skill = (over: Partial<JobSkillView> = {}): JobSkillView => jobSkill({ id: "s1", name: "board-update", fileIds: ["f1"], ...over });
const job = (over: Partial<JobView> = {}): JobView => jobView({ title: "Board", description: "d", ...over });

describe("steps", () => {
  it("lists the three task steps in order", () => {
    expect(JOB_STEPS.map((s) => [s.id, s.label])).toEqual([["task", "Task"], ["questions", "Questions"], ["skills", "Skills"]]);
  });

  it("reads the step from the URL hash, mapping the old job and files hashes", () => {
    expect(stepFromHash("#task")).toBe("task");
    expect(stepFromHash("#questions")).toBe("questions");
    expect(stepFromHash("skills")).toBe("skills");
    expect(stepFromHash("#job")).toBe("task");
    expect(stepFromHash("#files")).toBe("questions");
    expect(stepFromHash("")).toBe("task");
    expect(stepFromHash("#nope")).toBe("task");
  });
});

describe("leaving the task step", () => {
  it("needs 500 characters (trimmed) while the task has no questions", () => {
    expect(canLeaveTask("x".repeat(499), 0)).toBe(false);
    expect(canLeaveTask(`  ${"x".repeat(499)}  `, 0)).toBe(false);
    expect(canLeaveTask("x".repeat(500), 0)).toBe(true);
  });

  it("never locks out a task that already has questions, however short", () => {
    expect(canLeaveTask("Board update", 8)).toBe(true);
    expect(canLeaveTask("", 1)).toBe(true);
  });

  it("picks the fixed questions in order", () => {
    const q = (id: string, kind: "FIXED" | "PER_USE", order: number) => ({
      id, kind, order, text: id, guidance: "", required: true, wantsFiles: false, fileHint: null, fileNote: "", source: "AI" as const,
    });
    expect(fixedQuestions([q("b", "FIXED", 2), q("p", "PER_USE", 0), q("a", "FIXED", 1)]).map((x) => x.id)).toEqual(["a", "b"]);
    expect(perUseQuestions([q("b", "FIXED", 2), q("p", "PER_USE", 0)]).map((x) => x.id)).toEqual(["p"]);
  });
});

describe("polling", () => {
  it("backs off by half each time up to 15 s", () => {
    expect(POLL_FIRST_MS).toBe(3000);
    expect(nextPollDelay(3000)).toBe(4500);
    expect(nextPollDelay(12_000)).toBe(15_000);
    expect(nextPollDelay(15_000)).toBe(15_000);
    expect(POLL_CAP_MS).toBe(660_000);
  });

  it("keys on pending files and a generating plugin only", () => {
    expect(pollKey(job({ files: [file({ analysisStatus: "READY" })], skills: [skill({ status: "GENERATING" })] }))).toBe("");
    expect(pollKey(job({ files: [file()], plugin: pluginView({ status: "GENERATING", latestVersion: 2 }) }))).toBe("f:f1,p:2");
  });

  it("takes only the polled rows' status fields and reports a finished analysis", () => {
    const local = job({
      description: "typed locally",
      files: [file(), file({ id: "f2", analysisStatus: "READY", analysis: "mine" })],
      plugin: pluginView({ status: "GENERATING", displayName: "Typed name", displayNameIsDefault: false }),
      skills: [skill({ purpose: "typed purpose" })],
    });
    const versions = [{ version: 1, name: "acme-quarterly-deck", displayName: "Acme · Quarterly deck", createdAt: "2026-11-25T11:00:00.000Z", skills: 4, assets: 1 }];
    const fresh = job({
      description: "server",
      files: [file({ fileName: "SERVER", analysisStatus: "READY", analysis: "## Colours" }), file({ id: "f2", analysisStatus: "READY", analysis: "server copy" })],
      plugin: pluginView({ status: "READY", latestVersion: 1, versions }),
      skills: [skill({ purpose: "server purpose" })],
    });
    const { job: merged, analysed } = mergePolled(local, fresh);
    expect(analysed).toBe(true);
    expect(merged.description).toBe("typed locally");
    expect(merged.files[0]).toEqual({ ...local.files[0], analysisStatus: "READY", analysis: "## Colours" });
    expect(merged.files[1]).toBe(local.files[1]);
    expect(merged.skills).toBe(local.skills);
    expect(merged.plugin).toEqual({ ...local.plugin, status: "READY", latestVersion: 1, versions });
  });

  it("keeps the plugin while it is still generating, and a failure's errors when it ends", () => {
    const local = job({ plugin: pluginView({ status: "GENERATING" }) });
    expect(mergePolled(local, job({ plugin: pluginView({ status: "GENERATING" }) })).job.plugin).toBe(local.plugin);
    const failed = mergePolled(local, job({ plugin: pluginView({ status: "FAILED", validationErrors: ["deck-designer: description is too long"] }) })).job.plugin;
    expect(failed).toEqual({ ...local.plugin, status: "FAILED", validationErrors: ["deck-designer: description is too long"] });
  });

  it("reports no analysis when a pending file failed", () => {
    const { analysed, job: merged } = mergePolled(job({ files: [file()] }), job({ files: [file({ analysisStatus: "FAILED", analysisError: "We couldn't analyse this file." })] }));
    expect(analysed).toBe(false);
    expect(merged.files[0].analysisStatus).toBe("FAILED");
  });
});

describe("unansweredCount", () => {
  it("counts relevant questions below 3", () => {
    const answers: Record<string, AnswerView> = {
      a: { questionId: "a", answer: "", score: 3, reason: null, notRelevant: false },
      b: { questionId: "b", answer: "", score: 1, reason: null, notRelevant: false },
      c: { questionId: "c", answer: "", score: 0, reason: null, notRelevant: true },
    };
    expect(unansweredCount([{ id: "a" }, { id: "b" }, { id: "c" }], (id) => answers[id])).toBe(1);
  });
});
