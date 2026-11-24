import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { BEST_MODEL, FAST_MODEL, AiNotConfiguredError, isAiConfigured } from "./config";
import { sanitizeScores, type ScoreResult } from "@/lib/prompt-bot/scoring";
import { DETECT_SYSTEM, ENHANCE_SYSTEM, SCORE_SYSTEM } from "@/lib/prompt-bot/instructions";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!isAiConfigured()) throw new AiNotConfiguredError();
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
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
}): Promise<T> {
  const response = await getClient().messages.create({
    model: args.model,
    max_tokens: args.maxTokens,
    system: args.system,
    messages: [{ role: "user", content: args.user }],
    output_config: { format: { type: "json_schema", schema: args.schema } },
  });
  const text = response.content.find((block) => block.type === "text");
  if (!text || text.type !== "text") throw new Error("Claude returned no text");
  return args.parse.parse(JSON.parse(text.text));
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
    maxTokens: 2000,
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
    finalModel: async () => (await stream.finalMessage()).model,
  };
}
