import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  jobFindFirst: vi.fn(),
  jobUpdate: vi.fn((args: unknown) => ({ op: "job.update", args })),
  qUpdateMany: vi.fn((args: unknown) => ({ op: "q.updateMany", args })),
  transaction: vi.fn(async (ops: unknown[]) => ops),
  scoreQuestions: vi.fn(),
  consumeAiUsage: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { skillJob: { findFirst: mocks.jobFindFirst, update: mocks.jobUpdate }, skillJobQuestion: { updateMany: mocks.qUpdateMany }, $transaction: mocks.transaction },
}));
vi.mock("@/lib/ai/claude", () => ({ scoreQuestions: mocks.scoreQuestions }));
vi.mock("@/lib/ai/usage", () => ({ consumeAiUsage: mocks.consumeAiUsage }));

import { JobNotFoundError } from "./errors";
import { jobScoringBase, questionOrder, runJobScoring } from "./jobs";

const NOW = new Date("2026-11-25T12:00:00Z");
const q = (id: string, text: string, over: Record<string, unknown> = {}) => ({
  id, jobId: "j1", order: 0, text, guidance: "g", wantsFiles: false, fileHint: null, fileNote: "", source: "AI", kind: "FIXED", required: true,
  legacyQuestionId: null, answer: "", score: 0, reason: null, scoredAt: null, createdAt: NOW, updatedAt: NOW, ...over,
});
const f = (fileName: string, questionId: string | null, analysis = `analysis of ${fileName}`, analysisStatus = "READY") => ({ fileName, questionId, analysis, analysisStatus });

beforeEach(() => vi.clearAllMocks());

describe("jobScoringBase", () => {
  it("groups each ready analysis under the question it answers, then the general files", () => {
    const base = jobScoringBase(
      { title: " Client SLA ", description: " I write SLAs. " },
      [{ id: "q1", text: "Which template?" }, { id: "q2", text: "Who reads it?" }],
      [f("sla.docx", "q1", "a".repeat(2000)), f("pending.png", "q1", "x", "PENDING"), f("old.pdf", null), f("orphan.pdf", "gone")],
    );
    expect(base).toBe(
      [
        "Task: Client SLA\nI write SLAs.",
        `Files for "Which template?":\nsla.docx\n${"a".repeat(1500)}`,
        "General files:\nold.pdf\nanalysis of old.pdf\n\norphan.pdf\nanalysis of orphan.pdf",
      ].join("\n\n"),
    );
  });

  it("leaves out empty groups and caps the base at 12 000 characters", () => {
    expect(jobScoringBase({ title: "t", description: "d" }, [{ id: "q1", text: "Q?" }], [])).toBe("Task: t\nd");
    const files = Array.from({ length: 10 }, (_, i) => f(`f${i}`, null, "b".repeat(1500)));
    expect(jobScoringBase({ title: "t", description: "c".repeat(5000) }, [], files)).toHaveLength(12_000);
  });
});

describe("runJobScoring", () => {
  const job = (over: Record<string, unknown> = {}) => ({
    id: "j1", title: "Client SLA", description: "I write SLAs.", scoreRevision: 3,
    questions: [q("q1", "Which template?", { answer: "The 2026 one" }), q("q2", "Who reads it?")],
    files: [f("sla.docx", "q1", "#1F4E79 headings")],
    ...over,
  });

  it("scores the FIXED questions with each question's files and writes the scores to their rows", async () => {
    mocks.jobFindFirst.mockResolvedValueOnce(job()).mockResolvedValueOnce({ scoreRevision: 3 }).mockResolvedValueOnce({ ...job(), questions: [], files: [], skills: [], updatedAt: NOW, suggestedAt: null, questionsGeneratedAt: null, outputType: null, company: "", pluginName: null, pluginDisplayName: null, pluginStatus: "DRAFT", pluginValidationErrors: [], pluginGenerationStartedAt: null, pluginLatestVersion: 0, pluginVersions: [], });
    mocks.scoreQuestions.mockResolvedValue([{ questionId: "q2", score: 2, reason: "Partly" }]);
    const result = await runJobScoring("j1", "u1", 3);
    const args = mocks.jobFindFirst.mock.calls[0][0];
    expect(args.include.questions).toEqual({ where: { kind: "FIXED" }, orderBy: questionOrder });
    expect(mocks.consumeAiUsage).toHaveBeenCalledWith("u1", "score");
    const [text, questions] = mocks.scoreQuestions.mock.calls[0];
    expect(text).toContain('Files for "Which template?":\nsla.docx\n#1F4E79 headings');
    expect(text).toContain("Which template?\nThe 2026 one");
    expect(questions.map((x: { id: string }) => x.id)).toEqual(["q1", "q2"]);
    const ops = mocks.transaction.mock.calls[0][0] as { args: unknown }[];
    expect(ops[0].args).toEqual({ where: { id: "q2", jobId: "j1", kind: "FIXED" }, data: { score: 2, reason: "Partly", scoredAt: expect.any(Date) } });
    expect(ops[1].args).toEqual({ where: { id: "j1" }, data: { scoreRevision: 3 } });
    expect(result.applied).toBe(true);
  });

  it("spends nothing on a task without fixed questions", async () => {
    mocks.jobFindFirst.mockResolvedValueOnce(job({ questions: [] }));
    expect(await runJobScoring("j1", "u1", 3)).toEqual({ applied: false, revision: 3, answers: [] });
    expect(mocks.consumeAiUsage).not.toHaveBeenCalled();
    expect(mocks.scoreQuestions).not.toHaveBeenCalled();
  });

  it("does not apply a stale revision, and refuses someone else's task before spending", async () => {
    mocks.jobFindFirst.mockResolvedValueOnce(job()).mockResolvedValueOnce({ scoreRevision: 7 });
    mocks.scoreQuestions.mockResolvedValue([]);
    expect(await runJobScoring("j1", "u1", 3)).toMatchObject({ applied: false, revision: 7 });
    expect(mocks.transaction).not.toHaveBeenCalled();
    mocks.consumeAiUsage.mockClear();
    mocks.jobFindFirst.mockResolvedValueOnce(null);
    await expect(runJobScoring("j1", "u2", 0)).rejects.toBeInstanceOf(JobNotFoundError);
    expect(mocks.consumeAiUsage).not.toHaveBeenCalled();
  });
});
