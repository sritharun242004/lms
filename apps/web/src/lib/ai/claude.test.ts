import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ create: vi.fn(), ctor: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    constructor(options: unknown) {
      mocks.ctor(options);
    }
    messages = { create: mocks.create };
    beta = { messages: { stream: vi.fn() } };
  },
}));

import { detectTaskKind, scoreQuestions } from "./claude";
import { AiNotConfiguredError } from "./config";

const reply = (json: unknown) => ({ content: [{ type: "text", text: JSON.stringify(json) }], stop_reason: "end_turn" });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ANTHROPIC_API_KEY = "sk-ant-test";
});

describe("claude client", () => {
  it("refuses to call the API without a key", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(scoreQuestions("x", [])).rejects.toBeInstanceOf(AiNotConfiguredError);
  });

  it("scores with Haiku 4.5 using a JSON schema, and sanitizes the result", async () => {
    mocks.create.mockResolvedValue(
      reply({
        scores: [
          { questionId: "q1", score: 7, reason: "ok" },
          { questionId: "zz", score: 2, reason: "x" },
        ],
      }),
    );
    const result = await scoreQuestions("prompt", [{ id: "q1", text: "Why?", guidance: "Reason" }]);
    expect(result).toEqual([{ questionId: "q1", score: 3, reason: "ok" }]);
    const args = mocks.create.mock.calls[0][0];
    expect(args.model).toBe("claude-haiku-4-5");
    expect(args.output_config.format.type).toBe("json_schema");
  });

  it("returns no task when confidence is low or the slug is unknown", async () => {
    const matrices = [{ slug: "image", name: "Image", description: "Images" }];
    mocks.create.mockResolvedValueOnce(reply({ slug: "image", confidence: 0.4 }));
    await expect(detectTaskKind("p", matrices)).resolves.toEqual({ slug: null, confidence: 0.4 });
    mocks.create.mockResolvedValueOnce(reply({ slug: "video", confidence: 0.9 }));
    await expect(detectTaskKind("p", matrices)).resolves.toEqual({ slug: null, confidence: 0.9 });
    mocks.create.mockResolvedValueOnce(reply({ slug: "image", confidence: 0.8 }));
    await expect(detectTaskKind("p", matrices)).resolves.toEqual({ slug: "image", confidence: 0.8 });
  });

  it("builds the client with a timeout under the 120s request cap and limited retries", async () => {
    vi.resetModules();
    mocks.create.mockResolvedValue(reply({ scores: [] }));
    const fresh = await import("./claude");
    await fresh.scoreQuestions("p", [{ id: "q1", text: "Why?", guidance: "g" }]);
    expect(mocks.ctor).toHaveBeenCalledWith({ apiKey: "sk-ant-test", timeout: 90_000, maxRetries: 1 });
  });

  it("scales the scoring token budget with the number of questions", async () => {
    mocks.create.mockResolvedValue(reply({ scores: [] }));
    const many = Array.from({ length: 40 }, (_, i) => ({ id: `q${i}`, text: "t", guidance: "g" }));
    await scoreQuestions("p", many);
    expect(mocks.create.mock.calls[0][0].max_tokens).toBe(3600);
    await scoreQuestions("p", many.slice(0, 2));
    expect(mocks.create.mock.calls[1][0].max_tokens).toBe(2000);
  });

  it.each(["max_tokens", "refusal"])("throws a clear error when the reply stopped with %s", async (stop) => {
    mocks.create.mockResolvedValue({ content: [{ type: "text", text: '{"scores":[' }], stop_reason: stop });
    await expect(scoreQuestions("p", [{ id: "q1", text: "Why?", guidance: "g" }])).rejects.toThrow(stop);
  });
});
