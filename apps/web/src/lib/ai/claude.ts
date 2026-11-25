import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { BEST_MODEL, FAST_MODEL, AiNotConfiguredError, isAiConfigured } from "./config";
import { AiBadRequestError, AiResponseError } from "./errors";
import { sanitizeScores, type ScoreResult } from "@/lib/prompt-bot/scoring";
import { ENHANCE_SYSTEM, SCORE_SYSTEM } from "@/lib/prompt-bot/instructions";
import {
  ANALYSIS_TIMEOUT_MS,
  ENHANCE_TIMEOUT_MS,
  GENERATION_TIMEOUT_MS,
  JOB_LIMITS,
  QUESTIONS_TIMEOUT_MS,
  SUGGEST_TIMEOUT_MS,
} from "@/lib/skills/limits";
import { ANALYSE_SYSTEM, ENHANCE_TASK_SYSTEM, GENERATE_JOB_SYSTEM, QUESTIONS_SYSTEM, SUGGEST_SYSTEM } from "@/lib/skills/jobs/instructions";
import type { JobSkillDraft, RawSuggestions, RawTaskQuestions } from "@/lib/skills/jobs/types";

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
  /** output_config.effort; omitted = the model's default. */
  effort?: "low" | "medium" | "high";
}): Promise<T> {
  const format = { type: "json_schema" as const, schema: args.schema };
  const request = {
    model: args.model,
    max_tokens: args.maxTokens,
    system: args.system,
    messages: [{ role: "user" as const, content: args.user }],
    output_config: args.effort ? { format, effort: args.effort } : { format },
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

const object = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const STRING = { type: "string" };

// ---------------------------------------------------------------------------
// Skills Builder jobs (spec 2026-11-25)
// ---------------------------------------------------------------------------

/** What one file analysis sends: the facts text, plus the PDF or (resized) image itself when there is one. */
export type AnalysisContent = {
  text: string;
  document?: { base64: string; title: string };
  image?: { base64: string; mediaType: "image/png" | "image/jpeg" };
};

/** Analysis runs in after(): one 90 s attempt plus one SDK retry, inside the 5-minute stale window. */
const ANALYSE_REQUEST = { timeout: ANALYSIS_TIMEOUT_MS, maxRetries: 1 };
/** Suggest runs inside a request (120 s cap): one attempt. */
const SUGGEST_REQUEST = { timeout: SUGGEST_TIMEOUT_MS, maxRetries: 0 };
/** Job generation runs in after(); two attempts stay inside the generation stale window. */
const JOB_GENERATE_REQUEST = { timeout: GENERATION_TIMEOUT_MS, maxRetries: 0 };

/** Writes the readable style guide for one uploaded file (plain Markdown, Haiku). Document/image blocks go before the text. */
export async function analyseFile(content: AnalysisContent): Promise<string> {
  const blocks: Anthropic.ContentBlockParam[] = [];
  if (content.document) {
    blocks.push({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: content.document.base64 },
      title: content.document.title,
    });
  }
  if (content.image) {
    blocks.push({ type: "image", source: { type: "base64", media_type: content.image.mediaType, data: content.image.base64 } });
  }
  blocks.push({ type: "text", text: content.text });
  const response = await getClient()
    .messages.create({ model: FAST_MODEL, max_tokens: 3000, system: ANALYSE_SYSTEM, messages: [{ role: "user", content: blocks }] }, ANALYSE_REQUEST)
    .catch((error: unknown) => {
      // Callers decide what a refused request means (an unreadable PDF) without depending on the SDK.
      throw error instanceof Anthropic.BadRequestError ? new AiBadRequestError({ cause: error }) : error;
    });
  if (response.stop_reason === "max_tokens" || response.stop_reason === "refusal") {
    throw new AiResponseError(`Claude stopped with ${response.stop_reason}`);
  }
  const text = (response.content as ReadonlyArray<{ type: string; text?: string }>)
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("")
    .trim();
  if (!text) throw new AiResponseError("Claude returned no analysis");
  return text.slice(0, JOB_LIMITS.analysisChars);
}

const SuggestReply = z.object({
  skills: z.array(z.object({ name: z.string(), purpose: z.string(), fileIds: z.array(z.string()) })),
});

/** Proposes the skills for one job (spec, Suggest Skills). The caller applies cleanSuggestions. */
export async function suggestJobSkills(message: string): Promise<RawSuggestions> {
  return structured({
    model: BEST_MODEL,
    fallback: true,
    requestOptions: SUGGEST_REQUEST,
    system: SUGGEST_SYSTEM,
    user: message,
    schema: object({
      skills: { type: "array", items: object({ name: STRING, purpose: STRING, fileIds: { type: "array", items: STRING } }) },
    }),
    parse: SuggestReply,
    maxTokens: 4000,
  });
}

const JobFile = z.object({ path: z.string(), content: z.string() });
const JobDraftReply = z.object({
  description: z.string(),
  compatibility: z.string(),
  body: z.string(),
  references: z.array(JobFile),
  scripts: z.array(JobFile.extend({ purpose: z.string() })),
});

/** Writes one job skill as structured fields. No name (the skill row owns it) and no assets (the uploaded originals are). */
export async function generateJobSkillDraft(message: string): Promise<JobSkillDraft> {
  const file = object({ path: STRING, content: STRING });
  return structured({
    model: BEST_MODEL,
    fallback: true,
    requestOptions: JOB_GENERATE_REQUEST,
    system: GENERATE_JOB_SYSTEM,
    user: message,
    schema: object({
      description: STRING,
      compatibility: STRING,
      body: STRING,
      references: { type: "array", items: file },
      scripts: { type: "array", items: object({ path: STRING, content: STRING, purpose: STRING }) },
    }),
    parse: JobDraftReply,
    maxTokens: 16000,
  });
}

// ---------------------------------------------------------------------------
// Skills Builder tasks (spec 2026-11-25 tasks): Enhance and Write questions, both inside the request
// ---------------------------------------------------------------------------

/** Two 45 s attempts stay under App Runner's 120 s request cap. */
const ENHANCE_REQUEST = { timeout: ENHANCE_TIMEOUT_MS, maxRetries: 1 };
/** One 90 s attempt. */
const QUESTIONS_REQUEST = { timeout: QUESTIONS_TIMEOUT_MS, maxRetries: 0 };

const BriefReply = z.object({ brief: z.string() });

/** Rewrites a task description into a brief (Haiku). Nothing is stored. */
export async function enhanceTaskBrief(message: string): Promise<string> {
  const result = await structured({
    model: FAST_MODEL,
    requestOptions: ENHANCE_REQUEST,
    system: ENHANCE_TASK_SYSTEM,
    user: message,
    schema: object({ brief: STRING }),
    parse: BriefReply,
    maxTokens: 3000,
  });
  const brief = result.brief.trim();
  if (!brief) throw new AiResponseError("Claude returned an empty brief");
  return brief.slice(0, JOB_LIMITS.descriptionChars);
}

export const ESSENTIAL_NAMES = ["triggers", "inputs", "steps", "output", "quality", "avoid"] as const;
const QUESTION_FILE_HINTS = ["REFERENCE", "INPUT", "TEMPLATE", "BRAND", "NONE"] as const;

/** The questions reply as zod validates it (exported for the fake API's shape tests). */
export const TaskQuestionsReply = z.object({
  outputType: z.string(),
  perUseInputs: z.array(z.object({ label: z.string(), hint: z.string(), required: z.boolean() })),
  questions: z.array(
    z.object({
      text: z.string(),
      guidance: z.string(),
      kind: z.enum(["fixed", "per_use"]),
      wantsFiles: z.boolean(),
      fileHint: z.enum(QUESTION_FILE_HINTS),
      fileNote: z.string(),
      covers: z.array(z.string()),
    }),
  ),
}) satisfies z.ZodType<RawTaskQuestions>;

const enumOf = (values: readonly string[]) => ({ type: "string", enum: [...values] });

/** Writes the task's questions and per-use inputs (Opus, low effort). The caller applies cleanQuestionSet. */
export async function writeTaskQuestions(message: string): Promise<RawTaskQuestions> {
  return structured({
    model: BEST_MODEL,
    fallback: true,
    effort: "low",
    requestOptions: QUESTIONS_REQUEST,
    system: QUESTIONS_SYSTEM,
    user: message,
    schema: object({
      outputType: STRING,
      perUseInputs: { type: "array", items: object({ label: STRING, hint: STRING, required: { type: "boolean" } }) },
      questions: {
        type: "array",
        items: object({
          text: STRING,
          guidance: STRING,
          kind: enumOf(["fixed", "per_use"]),
          wantsFiles: { type: "boolean" },
          fileHint: enumOf(QUESTION_FILE_HINTS),
          fileNote: STRING,
          covers: { type: "array", items: enumOf(ESSENTIAL_NAMES) },
        }),
      },
    }),
    parse: TaskQuestionsReply,
    maxTokens: 8000,
  });
}
