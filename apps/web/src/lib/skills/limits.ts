/** Every resource bound of the Skills Builder, in one place. Pure constants: safe for client components. */

/** Agent Skills rules (Anthropic skill-creator validator, verified 2026-11-24) and the stored-size limits. */
export const SKILL_LIMITS = {
  /** The spec's per-file limit. */
  fileBytes: 200 * 1024,
  /** Tighter than the spec's 1 MB ceiling, so a pack of many skills stays small in memory. */
  skillBytes: 512 * 1024,
  files: 100,
  pathChars: 200,
  nameChars: 64,
  descriptionChars: 1024,
  compatibilityChars: 500,
} as const;

/** One generation call (run in after()); a run makes at most two. */
export const GENERATION_TIMEOUT_MS = 240_000;
/**
 * A GENERATING item older than this was interrupted (for example by a deploy) and may be generated again.
 * Two bounded attempts (2 x 240 s) plus database writes fit inside it.
 */
export const GENERATION_STALE_MS = 10 * 60_000;

/** Jobs redesign (spec 2026-11-25, Limits). Pure constants: safe for client components. */
export const JOB_LIMITS = {
  titleChars: 120,
  /** A job skill's folder name as typed (the kebab-case name is derived from it). */
  skillNameChars: 120,
  skillPurposeChars: 300,
  /** Every small JSON body (job, answer, skill, analysis edits): a 20 000-character text fits with escaping headroom. */
  jsonBodyBytes: 64 * 1024,
  descriptionChars: 20_000,
  filesPerJob: 10,
  fileBytes: 20 * 1024 * 1024,
  assetBytes: 10 * 1024 * 1024,
  skillAssetBytes: 25 * 1024 * 1024,
  skillsPerJob: 5,
  fileIdsPerSkill: 10,
  analysisChars: 12_000,
  analysisExcerptChars: 1_500,
  scoringBaseChars: 12_000,
  factsBytes: 64 * 1024,
  ooxmlPartBytes: 16 * 1024 * 1024,
  ooxmlTotalBytes: 64 * 1024 * 1024,
  ooxmlPartsParsed: 300,
  slidesDetailed: 60,
  pdfPagesForAnalysis: 100,
  imageEdgePx: 1568,
  versionsKept: 20,
  packZipBytes: 100 * 1024 * 1024,
  /** Tasks redesign (spec 2026-11-25 tasks, Limits). The description's trimmed length needed to write questions. */
  descriptionMinChars: 500,
  enhanceMinWords: 5,
  /** Fixed questions kept from one AI generation (plus no more: fallbacks replace redundant ones). */
  aiQuestionsMax: 8,
  /** Fixed ("Answer now") questions per task. */
  questionsPerTask: 12,
  /** Per-use inputs kept from one AI generation. */
  aiPerUseMax: 10,
  /** Per-use ("Asked each time you use it") inputs per task. */
  perUseInputsPerTask: 15,
  questionTextChars: 300,
  perUseLabelChars: 120,
  questionGuidanceChars: 300,
  fileNoteChars: 120,
  outputTypeChars: 60,
} as const;

/** One file analysis call (run in after()); the SDK retries it once. */
export const ANALYSIS_TIMEOUT_MS = 90_000;
/** A PENDING analysis older than this was interrupted and may be started again: 2 x 90 s plus writes fit inside it. */
export const ANALYSIS_STALE_MS = 5 * 60_000;
/** Suggest runs inside the request (App Runner cuts requests at 120 s): one attempt. */
export const SUGGEST_TIMEOUT_MS = 100_000;
/** Enhance runs inside the request; the SDK retries it once (2 x 45 s < 120 s). */
export const ENHANCE_TIMEOUT_MS = 45_000;
/** Write questions runs inside the request: one attempt. */
export const QUESTIONS_TIMEOUT_MS = 90_000;
