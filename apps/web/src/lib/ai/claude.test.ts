import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ create: vi.fn(), betaCreate: vi.fn(), ctor: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    constructor(options: unknown) {
      mocks.ctor(options);
    }
    messages = { create: mocks.create };
    beta = { messages: { stream: vi.fn(), create: mocks.betaCreate } };
  },
}));

import { analyseFile, generateJobSkillDraft, scoreQuestions, suggestJobSkills } from "./claude";
import { AiNotConfiguredError } from "./config";
import { AiResponseError } from "./errors";

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

  it("reports every unusable reply (stop reason, no text, bad JSON, wrong shape) as an AiResponseError", async () => {
    const q = [{ id: "q1", text: "Why?", guidance: "g" }];
    mocks.create.mockResolvedValueOnce({ content: [{ type: "text", text: "{" }], stop_reason: "max_tokens" });
    await expect(scoreQuestions("p", q)).rejects.toBeInstanceOf(AiResponseError);
    mocks.create.mockResolvedValueOnce({ content: [], stop_reason: "end_turn" });
    await expect(scoreQuestions("p", q)).rejects.toBeInstanceOf(AiResponseError);
    mocks.create.mockResolvedValueOnce({ content: [{ type: "text", text: "not json" }], stop_reason: "end_turn" });
    await expect(scoreQuestions("p", q)).rejects.toBeInstanceOf(AiResponseError);
    mocks.create.mockResolvedValueOnce(reply({ wrong: true }));
    await expect(scoreQuestions("p", q)).rejects.toBeInstanceOf(AiResponseError);
  });
});

describe("skills builder job calls", () => {
  const text = (value: string, stop = "end_turn") => ({ content: [{ type: "text", text: value }], stop_reason: stop });

  it("analyses a PDF with Haiku: document block first, then the text, with the analysis timeout and one retry", async () => {
    mocks.create.mockResolvedValue(text("  ## Colours\n- #1F4E79  "));
    const result = await analyseFile({ text: "<file/>", document: { base64: "JVBERi0=", title: "brand.pdf" } });
    expect(result).toBe("## Colours\n- #1F4E79");
    const [args, options] = mocks.create.mock.calls[0];
    expect(args.model).toBe("claude-haiku-4-5");
    expect(args.max_tokens).toBe(3000);
    expect(args.system).toContain("style guide");
    expect(args.output_config).toBeUndefined();
    expect(args.messages).toEqual([
      {
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: "JVBERi0=" }, title: "brand.pdf" },
          { type: "text", text: "<file/>" },
        ],
      },
    ]);
    expect(options).toEqual({ timeout: 90_000, maxRetries: 1 });
    expect(mocks.betaCreate).not.toHaveBeenCalled();
  });

  it("sends an image block before the text for images, and only text for Office files", async () => {
    mocks.create.mockResolvedValue(text("guide"));
    await analyseFile({ text: "t", image: { base64: "iVBO", mediaType: "image/png" } });
    expect(mocks.create.mock.calls[0][0].messages[0].content).toEqual([
      { type: "image", source: { type: "base64", media_type: "image/png", data: "iVBO" } },
      { type: "text", text: "t" },
    ]);
    await analyseFile({ text: "facts only" });
    expect(mocks.create.mock.calls[1][0].messages[0].content).toEqual([{ type: "text", text: "facts only" }]);
  });

  it("keeps at most 12 000 characters of the analysis", async () => {
    mocks.create.mockResolvedValue(text("y".repeat(13_000)));
    expect(await analyseFile({ text: "t" })).toHaveLength(12_000);
  });

  it("reports a stopped, empty or text-less analysis as an AiResponseError", async () => {
    mocks.create.mockResolvedValueOnce(text("partial", "max_tokens"));
    await expect(analyseFile({ text: "t" })).rejects.toBeInstanceOf(AiResponseError);
    mocks.create.mockResolvedValueOnce(text("no", "refusal"));
    await expect(analyseFile({ text: "t" })).rejects.toBeInstanceOf(AiResponseError);
    mocks.create.mockResolvedValueOnce(text("   "));
    await expect(analyseFile({ text: "t" })).rejects.toBeInstanceOf(AiResponseError);
    mocks.create.mockResolvedValueOnce({ content: [], stop_reason: "end_turn" });
    await expect(analyseFile({ text: "t" })).rejects.toBeInstanceOf(AiResponseError);
  });

  it("refuses to analyse without a key", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(analyseFile({ text: "t" })).rejects.toBeInstanceOf(AiNotConfiguredError);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("suggests with Opus 5.5, the fallback, a skills schema with file ids, and a request-scoped timeout", async () => {
    const skills = { skills: [{ name: "board-deck", purpose: "Builds the deck.", fileIds: ["f1"] }] };
    mocks.betaCreate.mockResolvedValue(reply(skills));
    await expect(suggestJobSkills("message")).resolves.toEqual(skills);
    const [args, options] = mocks.betaCreate.mock.calls[0];
    expect(args.model).toBe("claude-opus-5-5");
    expect(args.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(args.fallbacks).toBe("default");
    expect(args.max_tokens).toBe(4000);
    const item = args.output_config.format.schema.properties.skills.items;
    expect(item.required).toEqual(["name", "purpose", "fileIds"]);
    expect(item.properties.fileIds).toEqual({ type: "array", items: { type: "string" } });
    expect(options).toEqual({ timeout: 100_000, maxRetries: 0 });
  });

  it("rejects a suggestion that does not match the schema", async () => {
    mocks.betaCreate.mockResolvedValue(reply({ skills: [{ name: "a", purpose: "b" }] }));
    await expect(suggestJobSkills("m")).rejects.toBeInstanceOf(AiResponseError);
  });

  it("generates a job draft without name or assets fields, with the long non-retrying request", async () => {
    const draft = { description: "d", compatibility: "", body: "b", references: [{ path: "references/x.md", content: "x" }], scripts: [] };
    mocks.betaCreate.mockResolvedValueOnce(reply(draft));
    await expect(generateJobSkillDraft("message")).resolves.toEqual(draft);
    const [args, options] = mocks.betaCreate.mock.calls[0];
    expect(Object.keys(args.output_config.format.schema.properties)).toEqual(["description", "compatibility", "body", "references", "scripts"]);
    expect(args.max_tokens).toBe(16000);
    expect(args.fallbacks).toBe("default");
    expect(options).toEqual({ timeout: 240_000, maxRetries: 0 });
    mocks.betaCreate.mockResolvedValueOnce({ content: [{ type: "text", text: "{" }], stop_reason: "max_tokens" });
    await expect(generateJobSkillDraft("m")).rejects.toThrow("max_tokens");
  });
});

describe("old Skills Builder calls", () => {
  it("are gone", async () => {
    const mod = await import("./claude");
    expect("splitWork" in mod).toBe(false);
    expect("generateSkillDraft" in mod).toBe(false);
  });
});
