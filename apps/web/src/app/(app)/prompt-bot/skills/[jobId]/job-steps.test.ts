import { describe, expect, it } from "vitest";
import type { AnswerView } from "@/lib/prompt-bot/sessions";
import type { JobFileView, JobSkillView, JobView } from "@/lib/skills/jobs/types";
import { JOB_STEPS, mergePolled, nextPollDelay, POLL_CAP_MS, POLL_FIRST_MS, pollKey, stepFromHash, unansweredCount } from "./job-steps";

const file = (over: Partial<JobFileView> = {}): JobFileView => ({
  id: "f1", fileName: "deck.pptx", assetName: "deck.pptx", kind: "PPTX", size: 1000, createdAt: "2026-11-25T10:00:00.000Z",
  analysisStatus: "PENDING", analysis: null, analysisEdited: false, analysisError: null, bundlable: true, questionId: null, ...over,
});
const skill = (over: Partial<JobSkillView> = {}): JobSkillView => ({
  id: "s1", order: 0, name: "board-update", purpose: "Writes it.", fileIds: ["f1"], status: "DRAFT", validationErrors: [], latestVersion: 0, versions: [], ...over,
});
const job = (over: Partial<JobView> = {}): JobView => ({
  id: "j1", title: "Board", description: "d", scoreRevision: 0, updatedAt: "2026-11-25T10:00:00.000Z", suggestedAt: null, questionsGeneratedAt: null, outputType: null, questions: [],
  matrix: { id: "m", name: "Skill definition", questions: [] }, answers: [], files: [], skills: [], ...over,
});

describe("steps", () => {
  it("lists the four steps in order", () => {
    expect(JOB_STEPS.map((s) => [s.id, s.label])).toEqual([["job", "Job"], ["files", "Files"], ["questions", "Questions"], ["skills", "Skills"]]);
  });

  it("reads the step from the URL hash, defaulting to job", () => {
    expect(stepFromHash("#files")).toBe("files");
    expect(stepFromHash("skills")).toBe("skills");
    expect(stepFromHash("")).toBe("job");
    expect(stepFromHash("#nope")).toBe("job");
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

  it("keys on pending files and generating skills only", () => {
    expect(pollKey(job({ files: [file({ analysisStatus: "READY" })], skills: [skill()] }))).toBe("");
    expect(pollKey(job({ files: [file()], skills: [skill({ status: "GENERATING" })] }))).toBe("f:f1,s:s1");
  });

  it("takes only the polled rows' status fields and reports a finished analysis", () => {
    const local = job({
      description: "typed locally",
      files: [file(), file({ id: "f2", analysisStatus: "READY", analysis: "mine" })],
      skills: [skill({ status: "GENERATING", purpose: "typed purpose" })],
    });
    const fresh = job({
      description: "server",
      files: [file({ fileName: "SERVER", analysisStatus: "READY", analysis: "## Colours" }), file({ id: "f2", analysisStatus: "READY", analysis: "server copy" })],
      skills: [skill({ status: "READY", purpose: "server purpose", latestVersion: 1, versions: [{ version: 1, name: "board-update", createdAt: "2026-11-25T11:00:00.000Z", assets: 1 }] })],
    });
    const { job: merged, analysed } = mergePolled(local, fresh);
    expect(analysed).toBe(true);
    expect(merged.description).toBe("typed locally");
    expect(merged.files[0]).toEqual({ ...local.files[0], analysisStatus: "READY", analysis: "## Colours" });
    expect(merged.files[1]).toBe(local.files[1]);
    expect(merged.skills[0]).toEqual({ ...local.skills[0], status: "READY", latestVersion: 1, versions: fresh.skills[0].versions });
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
