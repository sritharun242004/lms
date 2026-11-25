import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ create: vi.fn(), betaCreate: vi.fn() }));
vi.mock("@anthropic-ai/sdk", async (orig) => {
  const real = (await orig<typeof import("@anthropic-ai/sdk")>()).default;
  return {
    default: class {
      static AnthropicError = real.AnthropicError;
      static BadRequestError = real.BadRequestError;
      messages = { create: mocks.create };
      beta = { messages: { stream: vi.fn(), create: mocks.betaCreate } };
    },
  };
});

import { enhanceTaskBrief, writeTaskQuestions } from "./claude";
import { AiNotConfiguredError } from "./config";
import { AiResponseError } from "./errors";
import { ENHANCE_TASK_SYSTEM, QUESTIONS_SYSTEM } from "@/lib/skills/jobs/instructions";

const reply = (json: unknown, stop_reason = "end_turn") => ({ content: [{ type: "text", text: JSON.stringify(json) }], stop_reason });
const QUESTIONS = {
  outputType: "client SLA document",
  coveredByDescription: ["triggers"],
  perUseInputs: [{ label: "Client name", hint: "e.g. Acme Ltd", required: true }],
  questions: [
    { text: "Which template?", guidance: "Name it.", kind: "fixed", wantsFiles: true, fileHint: "TEMPLATE", fileNote: "Upload it.", covers: ["inputs"] },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ANTHROPIC_API_KEY = "sk-ant-test";
});

describe("enhanceTaskBrief", () => {
  it("asks Haiku 4.5 for a structured brief within 45 s and one retry", async () => {
    mocks.create.mockResolvedValue(reply({ brief: "  ## Purpose\nI write it.  " }));
    expect(await enhanceTaskBrief("<task>x</task>")).toBe("## Purpose\nI write it.");
    const [args, options] = mocks.create.mock.calls[0];
    expect(args.model).toBe("claude-haiku-4-5");
    expect(args.max_tokens).toBe(3000);
    expect(args.system).toBe(ENHANCE_TASK_SYSTEM);
    expect(args.messages).toEqual([{ role: "user", content: "<task>x</task>" }]);
    expect(args.output_config).toEqual({
      format: {
        type: "json_schema",
        schema: { type: "object", properties: { brief: { type: "string" } }, required: ["brief"], additionalProperties: false },
      },
    });
    expect(args.thinking).toBeUndefined();
    expect(options).toEqual({ timeout: 45_000, maxRetries: 1 });
    expect(mocks.betaCreate).not.toHaveBeenCalled();
  });

  it("refuses an empty brief and cuts a long one to 20 000 characters", async () => {
    mocks.create.mockResolvedValueOnce(reply({ brief: "   " }));
    await expect(enhanceTaskBrief("x")).rejects.toBeInstanceOf(AiResponseError);
    mocks.create.mockResolvedValueOnce(reply({ brief: "a".repeat(25_000) }));
    expect(await enhanceTaskBrief("x")).toHaveLength(20_000);
  });

  it("treats bad JSON and a cut-off reply as AI failures", async () => {
    mocks.create.mockResolvedValueOnce({ content: [{ type: "text", text: "{" }], stop_reason: "end_turn" });
    await expect(enhanceTaskBrief("x")).rejects.toBeInstanceOf(AiResponseError);
    mocks.create.mockResolvedValueOnce(reply({ brief: "x" }, "max_tokens"));
    await expect(enhanceTaskBrief("x")).rejects.toBeInstanceOf(AiResponseError);
    mocks.create.mockResolvedValueOnce(reply({ nope: 1 }));
    await expect(enhanceTaskBrief("x")).rejects.toBeInstanceOf(AiResponseError);
  });

  it("needs the key", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(enhanceTaskBrief("x")).rejects.toBeInstanceOf(AiNotConfiguredError);
  });
});

describe("writeTaskQuestions", () => {
  it("asks Opus 5.5 at low effort with the refusal fallback, one 90 s attempt", async () => {
    mocks.betaCreate.mockResolvedValue(reply(QUESTIONS));
    expect(await writeTaskQuestions("<task>x</task>")).toEqual(QUESTIONS);
    const [args, options] = mocks.betaCreate.mock.calls[0];
    expect(args.model).toBe("claude-opus-5-5");
    expect(args.max_tokens).toBe(8000);
    expect(args.system).toBe(QUESTIONS_SYSTEM);
    expect(args.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(args.fallbacks).toBe("default");
    expect(args.output_config.effort).toBe("low");
    expect(args.output_config.format.type).toBe("json_schema");
    expect(args.thinking).toBeUndefined();
    expect(options).toEqual({ timeout: 90_000, maxRetries: 0 });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("constrains the reply with the questions schema", async () => {
    mocks.betaCreate.mockResolvedValue(reply(QUESTIONS));
    await writeTaskQuestions("x");
    const schema = mocks.betaCreate.mock.calls[0][0].output_config.format.schema;
    expect(schema.required).toEqual(["outputType", "coveredByDescription", "perUseInputs", "questions"]);
    expect(schema.properties.coveredByDescription).toEqual({
      type: "array",
      items: { type: "string", enum: ["triggers", "inputs", "steps", "output", "quality", "avoid"] },
    });
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties.perUseInputs.items.required).toEqual(["label", "hint", "required"]);
    const item = schema.properties.questions.items;
    expect(item.required).toEqual(["text", "guidance", "kind", "wantsFiles", "fileHint", "fileNote", "covers"]);
    expect(item.properties.kind).toEqual({ type: "string", enum: ["fixed", "per_use"] });
    expect(item.properties.fileHint).toEqual({ type: "string", enum: ["REFERENCE", "INPUT", "TEMPLATE", "BRAND", "NONE"] });
    expect(item.properties.covers).toEqual({
      type: "array",
      items: { type: "string", enum: ["triggers", "inputs", "steps", "output", "quality", "avoid"] },
    });
    expect(item.properties.wantsFiles).toEqual({ type: "boolean" });
  });

  it("treats a cut-off or mismatched reply as an AI failure", async () => {
    mocks.betaCreate.mockResolvedValueOnce(reply(QUESTIONS, "max_tokens"));
    await expect(writeTaskQuestions("x")).rejects.toBeInstanceOf(AiResponseError);
    mocks.betaCreate.mockResolvedValueOnce(reply({ ...QUESTIONS, questions: [{ text: "x" }] }));
    await expect(writeTaskQuestions("x")).rejects.toBeInstanceOf(AiResponseError);
    mocks.betaCreate.mockResolvedValueOnce(reply({ ...QUESTIONS, questions: [{ ...QUESTIONS.questions[0], kind: "sometimes" }] }));
    await expect(writeTaskQuestions("x")).rejects.toBeInstanceOf(AiResponseError);
  });
});
