import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  consumeAiUsage: vi.fn(),
  jobFindFirst: vi.fn(),
  jobUpdate: vi.fn(),
  qDeleteMany: vi.fn(),
  qUpdateMany: vi.fn(),
  qCreateMany: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/ai/config", async (orig) => ({ ...(await orig<typeof import("@/lib/ai/config")>()), isAiConfigured: () => true }));
vi.mock("@/lib/ai/usage", async (orig) => ({ ...(await orig<typeof import("@/lib/ai/usage")>()), consumeAiUsage: mocks.consumeAiUsage }));
vi.mock("@/lib/ai/claude", async (orig) => {
  const real = await orig<typeof import("@/lib/ai/claude")>();
  const shapes = await import("../../../../../../scripts/fake-anthropic-shapes.mjs");
  // The Claude call is answered by the fake API's canned replies, validated by the real schema.
  return { ...real, writeTaskQuestions: async (message: string) => real.TaskQuestionsReply.parse(shapes.questionsReply(message).reply) };
});
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    skillJob: { findFirst: mocks.jobFindFirst, update: mocks.jobUpdate },
    skillJobQuestion: { deleteMany: mocks.qDeleteMany, updateMany: mocks.qUpdateMany, createMany: mocks.qCreateMany },
    $transaction: mocks.transaction,
  },
}));

import { KINDS, TASK_DESCRIPTIONS } from "../../../../../../scripts/fake-anthropic-shapes.mjs";
import { FALLBACK_QUESTIONS } from "@/lib/skills/jobs/questions";
import type { JobView } from "@/lib/skills/jobs/types";
import * as generate from "./[id]/questions/generate/route";

const NOW = new Date("2026-11-25T12:00:00Z");
const EXPECTED = { carousel: "Instagram carousel", video: "explainer video", sla: "client SLA document", finance: "monthly financial report", other: "client dinner wine list" };

/** A tiny store: the transaction's writes become the rows loadJobView reads back. */
function store(description: string) {
  let created: Record<string, unknown>[] = [];
  let job: Record<string, unknown> = {};
  mocks.qCreateMany.mockImplementation((args: { data: Record<string, unknown>[] }) => ((created = args.data), args));
  mocks.jobUpdate.mockImplementation((args: { data: Record<string, unknown> }) => ((job = args.data), args));
  mocks.qDeleteMany.mockImplementation((args: unknown) => args);
  mocks.transaction.mockImplementation(async (ops: unknown[]) => ops);
  mocks.jobFindFirst.mockImplementation(async (args: { select?: unknown }) => {
    const base = { id: "j1", userId: "u1", title: "My task", description, scoreRevision: 0, suggestedAt: null, createdAt: NOW, updatedAt: NOW };
    if (args.select) return { ...base, questions: [] };
    return {
      ...base,
      questionsGeneratedAt: job.questionsGeneratedAt ?? null,
      outputType: job.outputType ?? null,
      questions: created.map((row, i) => ({
        id: `q${i}`, legacyQuestionId: null, answer: "", score: 0, reason: null, scoredAt: null, createdAt: NOW, updatedAt: NOW, ...row,
      })),
      files: [],
      skills: [],
    };
  });
  return () => ({ created, job });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "u1", role: "MENTEE" });
});

describe("POST /:id/questions/generate across task types", () => {
  it.each(KINDS)("writes questions for a %s task", async (kind) => {
    const written = store(TASK_DESCRIPTIONS[kind]);
    const res = await generate.POST(new NextRequest("http://localhost/x", { method: "POST" }), { params: Promise.resolve({ id: "j1" }) });
    expect(res.status).toBe(200);
    const view = (await res.json()).data as JobView;
    expect(mocks.consumeAiUsage).toHaveBeenCalledWith("u1", "skill_questions");
    expect(written().job.outputType).toBe(EXPECTED[kind]);
    expect(view.outputType).toBe(EXPECTED[kind]);
    expect(written().job.questionsGeneratedAt).toBeInstanceOf(Date);
    expect(view.questionsGeneratedAt).not.toBeNull();

    const fixed = view.questions.filter((q) => q.kind === "FIXED");
    const perUse = view.questions.filter((q) => q.kind === "PER_USE");
    expect(fixed.length).toBeGreaterThanOrEqual(5);
    expect(fixed.length).toBeLessThanOrEqual(8);
    expect(perUse.length).toBeGreaterThan(0);
    expect(perUse.every((q) => !q.wantsFiles && q.fileHint === null)).toBe(true);
    expect(fixed.some((q) => q.wantsFiles && q.fileHint)).toBe(true);
    expect(view.questions.filter((q) => q.fileHint).every((q) => q.wantsFiles)).toBe(true);
    expect(fixed.at(-1)?.text).toBe(FALLBACK_QUESTIONS.avoid.text);
    expect(view.answers.map((a) => a.questionId)).toEqual(fixed.map((q) => q.id));
    expect(view.questions.map((q) => q.order)).toEqual(view.questions.map((_, i) => i));
  });
});
