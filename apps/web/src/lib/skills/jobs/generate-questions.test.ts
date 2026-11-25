import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  jobFindFirst: vi.fn(),
  jobUpdate: vi.fn((args: unknown) => ({ op: "job.update", args })),
  qDeleteMany: vi.fn((args: unknown) => ({ op: "q.deleteMany", args })),
  qUpdateMany: vi.fn((args: unknown) => ({ op: "q.updateMany", args })),
  qCreateMany: vi.fn((args: unknown) => ({ op: "q.createMany", args })),
  transaction: vi.fn(async (ops: unknown[]) => ops),
  consumeAiUsage: vi.fn(),
  writeTaskQuestions: vi.fn(),
  loadJobView: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    skillJob: { findFirst: mocks.jobFindFirst, update: mocks.jobUpdate },
    skillJobQuestion: { deleteMany: mocks.qDeleteMany, updateMany: mocks.qUpdateMany, createMany: mocks.qCreateMany },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/ai/usage", () => ({ consumeAiUsage: mocks.consumeAiUsage }));
vi.mock("@/lib/ai/claude", () => ({ writeTaskQuestions: mocks.writeTaskQuestions }));
vi.mock("./jobs", () => ({ loadJobView: mocks.loadJobView, questionOrder: [{ order: "asc" }, { createdAt: "asc" }] }));

import { AiResponseError } from "@/lib/ai/errors";
import { DescriptionTooShortError, JobNotFoundError } from "./errors";
import { generateQuestionsForTask } from "./task-questions";

const LONG = "I write a client SLA every time we sign a new client. ".repeat(12);
const fq = (text: string, covers: string[], over: Record<string, unknown> = {}) => ({
  text, guidance: "g", kind: "fixed", wantsFiles: false, fileHint: "NONE", fileNote: "", covers, ...over,
});
const REPLY = {
  outputType: "client SLA document",
  perUseInputs: [{ label: "Client name", hint: "e.g. Acme Ltd", required: true }],
  questions: [
    fq("Which SLA template do you start from?", ["inputs"], { wantsFiles: true, fileHint: "TEMPLATE", fileNote: "Upload your SLA template." }),
    fq("When is it used?", ["triggers"]),
    fq("What are the steps?", ["steps"]),
    fq("What does great look like?", ["output", "quality"]),
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadJobView.mockResolvedValue({ id: "j1" });
});

describe("generateQuestionsForTask", () => {
  it("refuses someone else's task and a short description before spending a unit", async () => {
    mocks.jobFindFirst.mockResolvedValueOnce(null);
    await expect(generateQuestionsForTask("j1", "u2")).rejects.toBeInstanceOf(JobNotFoundError);
    mocks.jobFindFirst.mockResolvedValueOnce({ id: "j1", title: "t", description: `  ${"x".repeat(312)}  `, questions: [] });
    const error = await generateQuestionsForTask("j1", "u1").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DescriptionTooShortError);
    expect((error as DescriptionTooShortError).length).toBe(312);
    expect(mocks.consumeAiUsage).not.toHaveBeenCalled();
    expect(mocks.writeTaskQuestions).not.toHaveBeenCalled();
  });

  it("spends one unit, writes the questions and stores them in one transaction", async () => {
    mocks.jobFindFirst.mockResolvedValue({ id: "j1", title: "Client SLA", description: LONG, questions: [] });
    mocks.writeTaskQuestions.mockImplementation(async (message: string) => {
      expect(mocks.consumeAiUsage).toHaveBeenCalledWith("u1", "skill_questions");
      expect(message).toContain("<task>\ntitle: Client SLA");
      expect(message).not.toContain("<existing_questions>");
      return REPLY;
    });
    expect(await generateQuestionsForTask("j1", "u1")).toEqual({ id: "j1" });
    expect(mocks.jobFindFirst.mock.calls[0][0].where).toEqual({ id: "j1", userId: "u1" });
    const ops = mocks.transaction.mock.calls[0][0] as { op: string; args: any }[];
    expect(ops.map((o) => o.op)).toEqual(["q.deleteMany", "q.createMany", "job.update"]);
    const rows = ops[1].args.data;
    expect(rows.map((r: any) => [r.order, r.kind, r.text])).toEqual([
      [0, "FIXED", "Which SLA template do you start from?"],
      [1, "FIXED", "When is it used?"],
      [2, "FIXED", "What are the steps?"],
      [3, "FIXED", "What does great look like?"],
      [4, "FIXED", "What should it never do?"],
      [5, "PER_USE", "Client name"],
    ]);
    expect(rows[0]).toMatchObject({ jobId: "j1", source: "AI", wantsFiles: true, fileHint: "TEMPLATE", fileNote: "Upload your SLA template.", required: true });
    expect(rows[5]).toMatchObject({ guidance: "e.g. Acme Ltd", wantsFiles: false, fileHint: null, fileNote: "" });
    expect(ops[2].args).toEqual({ where: { id: "j1" }, data: { questionsGeneratedAt: expect.any(Date), outputType: "client SLA document" } });
    expect(mocks.loadJobView).toHaveBeenCalledWith("j1", "u1");
  });

  it("sends the current questions on regenerate and keeps matching rows", async () => {
    mocks.jobFindFirst.mockResolvedValue({
      id: "j1", title: "Client SLA", description: LONG,
      questions: [
        { id: "q1", kind: "FIXED", text: "When is it used?", source: "AI", answer: "Each new client" },
        { id: "q2", kind: "FIXED", text: "Old?", source: "AI", answer: "" },
        { id: "u1", kind: "FIXED", text: "Mine?", source: "USER", answer: "" },
      ],
    });
    mocks.writeTaskQuestions.mockResolvedValue(REPLY);
    await generateQuestionsForTask("j1", "u1");
    expect(mocks.writeTaskQuestions.mock.calls[0][0]).toContain(
      "<existing_questions>\n- [fixed] When is it used? (answered)\n- [fixed] Old?\n- [fixed] Mine?\n</existing_questions>",
    );
    const ops = mocks.transaction.mock.calls[0][0] as { op: string; args: any }[];
    expect(ops.map((o) => o.op)).toEqual(["q.deleteMany", "q.updateMany", "q.updateMany", "q.createMany", "job.update"]);
    expect(ops[0].args).toEqual({ where: { jobId: "j1", id: { in: ["q2"] } } });
    expect(ops[1].args).toEqual({
      where: { id: "q1", jobId: "j1" },
      data: { order: 1, guidance: "g", wantsFiles: false, fileHint: null, fileNote: "" },
    });
    expect(ops[2].args).toEqual({ where: { id: "u1", jobId: "j1" }, data: { order: 6 } });
  });

  it("stores nothing when the AI call fails", async () => {
    mocks.jobFindFirst.mockResolvedValue({ id: "j1", title: "t", description: LONG, questions: [] });
    mocks.writeTaskQuestions.mockRejectedValue(new AiResponseError("bad"));
    await expect(generateQuestionsForTask("j1", "u1")).rejects.toBeInstanceOf(AiResponseError);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
