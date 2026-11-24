import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { BEST_MODEL, FAST_MODEL, AiNotConfiguredError, isAiConfigured } from "./config";
import { AiResponseError } from "./errors";
import { sanitizeScores, type ScoreResult } from "@/lib/prompt-bot/scoring";
import { DETECT_SYSTEM, ENHANCE_SYSTEM, SCORE_SYSTEM } from "@/lib/prompt-bot/instructions";
import type { SkillDraft } from "@/lib/skills/assemble";
import { buildSplitMessage, GENERATE_SYSTEM, SPLIT_SYSTEM } from "@/lib/skills/instructions";
import { GENERATION_TIMEOUT_MS } from "@/lib/skills/limits";
import type { RawSplit } from "@/lib/skills/split";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!isAiConfigured()) throw new AiNotConfiguredError();
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 90_000, maxRetries: 1 });
  return client;
}

/** One structured-output call: the JSON schema constrains the reply; zod validates it again. */
async function structured<T>(args: {
  model: string;
  system: string;
  user: string;
  schema: Record<string, unknown>;
  parse: z.ZodType<T>;
  maxTokens: number;
  /** Opus skills calls enable Anthropic's server-side refusal fallback. */
  fallback?: boolean;
  /** Per-request SDK options; the shared client keeps its own defaults for everything else. */
  requestOptions?: { timeout: number; maxRetries: number };
}): Promise<T> {
  const request = {
    model: args.model,
    max_tokens: args.maxTokens,
    system: args.system,
    messages: [{ role: "user" as const, content: args.user }],
    output_config: { format: { type: "json_schema" as const, schema: args.schema } },
  };
  const response = args.fallback
    ? await getClient().beta.messages.create(
        { ...request, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" },
        args.requestOptions,
      )
    : await getClient().messages.create(request, args.requestOptions);
  if (response.stop_reason === "max_tokens" || response.stop_reason === "refusal") {
    throw new AiResponseError(`Claude stopped with ${response.stop_reason}`);
  }
  const text = (response.content as ReadonlyArray<{ type: string; text?: string }>).find((block) => block.type === "text");
  if (!text || typeof text.text !== "string") throw new AiResponseError("Claude returned no text");
  let json: unknown;
  try {
    json = JSON.parse(text.text);
  } catch {
    throw new AiResponseError("Claude returned invalid JSON");
  }
  const parsed = args.parse.safeParse(json);
  if (!parsed.success) throw new AiResponseError("Claude's reply did not match the schema");
  return parsed.data;
}

const Detection = z.object({ slug: z.string(), confidence: z.number() });

export async function detectTaskKind(
  basePrompt: string,
  matrices: { slug: string; name: string; description: string | null }[],
): Promise<{ slug: string | null; confidence: number }> {
  if (matrices.length === 0) return { slug: null, confidence: 0 };
  const list = matrices.map((m) => `- ${m.slug}: ${m.name}${m.description ? ` — ${m.description}` : ""}`).join("\n");
  const result = await structured({
    model: FAST_MODEL,
    system: DETECT_SYSTEM,
    user: `Task kinds:\n${list}\n- none: nothing fits\n\nPrompt:\n${basePrompt}`,
    schema: {
      type: "object",
      properties: { slug: { type: "string" }, confidence: { type: "number" } },
      required: ["slug", "confidence"],
      additionalProperties: false,
    },
    parse: Detection,
    maxTokens: 200,
  });
  const known = matrices.some((m) => m.slug === result.slug);
  return { slug: known && result.confidence >= 0.5 ? result.slug : null, confidence: result.confidence };
}

const Scores = z.object({ scores: z.array(z.unknown()) });

export async function scoreQuestions(
  text: string,
  questions: { id: string; text: string; guidance: string }[],
): Promise<ScoreResult[]> {
  if (!isAiConfigured()) throw new AiNotConfiguredError();
  if (questions.length === 0) return [];
  const list = questions.map((q) => `- id: ${q.id}\n  question: ${q.text}\n  guidance: ${q.guidance}`).join("\n");
  const result = await structured({
    model: FAST_MODEL,
    system: SCORE_SYSTEM,
    user: `Questions:\n${list}\n\nWhat the person wrote:\n<text>\n${text}\n</text>`,
    schema: {
      type: "object",
      properties: {
        scores: {
          type: "array",
          items: {
            type: "object",
            properties: { questionId: { type: "string" }, score: { type: "integer" }, reason: { type: "string" } },
            required: ["questionId", "score", "reason"],
            additionalProperties: false,
          },
        },
      },
      required: ["scores"],
      additionalProperties: false,
    },
    parse: Scores,
    maxTokens: Math.max(2000, 90 * questions.length),
  });
  return sanitizeScores(result.scores, new Set(questions.map((q) => q.id)));
}

/** Streams the enhanced prompt from Opus 5.5 with server-side refusal fallback enabled. */
export function streamEnhancement(message: string, signal?: AbortSignal) {
  const stream = getClient().beta.messages.stream(
    {
      model: BEST_MODEL,
      max_tokens: 8000,
      system: ENHANCE_SYSTEM,
      messages: [{ role: "user", content: message }],
      output_config: { effort: "medium" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    },
    { signal },
  );
  async function* textStream() {
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") yield event.delta.text;
    }
  }
  return {
    textStream: textStream(),
    finalMessage: async () => {
      const message = await stream.finalMessage();
      return { model: message.model as string, stopReason: (message.stop_reason as string | null) ?? null };
    },
  };
}

const SplitReply = z.object({
  customSkills: z.array(z.object({ name: z.string(), purpose: z.string() })),
  catalogMatches: z.array(z.object({ slug: z.string(), why: z.string() })),
});

const object = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const STRING = { type: "string" };

/** The split runs inside a request (120 s cap): one attempt, 100 s. */
const SPLIT_REQUEST = { timeout: 100_000, maxRetries: 0 };
/** Generation runs in after(); two attempts stay inside the stale window (limits.ts). */
const GENERATE_REQUEST = { timeout: GENERATION_TIMEOUT_MS, maxRetries: 0 };

/** Proposes custom skills and catalog matches (spec, Split). The caller applies cleanSplit. */
export async function splitWork(input: {
  description: string;
  role: string | null;
  catalog: { slug: string; name: string; description: string }[];
}): Promise<RawSplit> {
  return structured({
    model: BEST_MODEL,
    fallback: true,
    requestOptions: SPLIT_REQUEST,
    system: SPLIT_SYSTEM,
    user: buildSplitMessage(input),
    schema: object({
      customSkills: { type: "array", items: object({ name: STRING, purpose: STRING }) },
      catalogMatches: { type: "array", items: object({ slug: STRING, why: STRING }) },
    }),
    parse: SplitReply,
    maxTokens: 4000,
  });
}

const DraftFile = z.object({ path: z.string(), content: z.string() });
const DraftReply = z.object({
  name: z.string(),
  description: z.string(),
  compatibility: z.string(),
  body: z.string(),
  references: z.array(DraftFile),
  scripts: z.array(DraftFile.extend({ purpose: z.string() })),
  assets: z.array(DraftFile),
});

/** Writes one skill as structured fields (spec, Generate). The server assembles and validates the files. */
export async function generateSkillDraft(message: string): Promise<SkillDraft> {
  const file = object({ path: STRING, content: STRING });
  return structured({
    model: BEST_MODEL,
    fallback: true,
    requestOptions: GENERATE_REQUEST,
    system: GENERATE_SYSTEM,
    user: message,
    schema: object({
      name: STRING,
      description: STRING,
      compatibility: STRING,
      body: STRING,
      references: { type: "array", items: file },
      scripts: { type: "array", items: object({ path: STRING, content: STRING, purpose: STRING }) },
      assets: { type: "array", items: file },
    }),
    parse: DraftReply,
    maxTokens: 16000,
  });
}
