import type { AnswerView } from "@/lib/prompt-bot/sessions";
import type { FileFacts, SkillFileKind } from "../files/types";
import type { SkillFile, SkillItemStatus, SkillMatrixView } from "../types";

export type AnalysisStatus = "PENDING" | "READY" | "FAILED";
export type { AnswerView, SkillItemStatus };

/** Tasks redesign (spec 2026-11-25 tasks, API Contract): the binding view types shared with the UI. */
export type FileHint = "REFERENCE" | "INPUT" | "TEMPLATE" | "BRAND";
export const FILE_HINTS: readonly FileHint[] = ["REFERENCE", "INPUT", "TEMPLATE", "BRAND"];
export type QuestionKind = "FIXED" | "PER_USE";
export type QuestionSource = "AI" | "USER";

/** FIXED = "Answer now (same every time)"; PER_USE = "Asked each time you use it" (text = label, guidance = hint). */
export type TaskQuestionView = {
  id: string;
  order: number;
  kind: QuestionKind;
  /** FIXED <= 300 chars; PER_USE label <= 120. */
  text: string;
  /** <= 300; PER_USE: hint or example. */
  guidance: string;
  /** PER_USE only (FIXED rows are always true). */
  required: boolean;
  /** FIXED only: make the upload prominent (every FIXED question takes uploads). */
  wantsFiles: boolean;
  /** Set only when wantsFiles. */
  fileHint: FileHint | null;
  /** <= 120; "" when none, e.g. "Upload your logo files and brand colours." */
  fileNote: string;
  source: QuestionSource;
};

/** A per-use input as the prompts and SKILL.md's "Before you start" section see it. */
export type PerUseInput = { label: string; hint: string; required: boolean };

export type QuestionInput = {
  text: string;
  guidance?: string;
  kind?: QuestionKind;
  required?: boolean;
  wantsFiles?: boolean;
  fileHint?: FileHint | null;
  fileNote?: string;
};

export type ScoreReply = { applied: boolean; revision: number; answers: AnswerView[] };

/** The skill essentials every task's fixed questions must cover. */
export type Essential = "triggers" | "inputs" | "steps" | "output" | "quality" | "avoid";
/** Write questions' structured reply before clean-up. */
export type RawTaskQuestions = {
  outputType: string;
  /** Essentials the description already answers fully: no question, and no fallback, for them. Transient (not stored). */
  coveredByDescription: string[];
  perUseInputs: { label: string; hint: string; required: boolean }[];
  questions: {
    text: string;
    guidance: string;
    kind: "fixed" | "per_use";
    wantsFiles: boolean;
    fileHint: FileHint | "NONE";
    fileNote: string;
    /** Unknown values are ignored by cleanQuestionSet. */
    covers: string[];
  }[];
};

export type JobFileView = {
  id: string;
  fileName: string;
  assetName: string;
  kind: SkillFileKind;
  size: number;
  createdAt: string;
  analysisStatus: AnalysisStatus;
  analysis: string | null;
  analysisEdited: boolean;
  analysisError: string | null;
  /** size <= JOB_LIMITS.assetBytes: can be bundled under assets/. */
  bundlable: boolean;
  /** The FIXED question it answers; null = General files. */
  questionId: string | null;
};
export type JobFileDetail = JobFileView & { facts: FileFacts | null };

export type VersionSummary = { version: number; name: string; createdAt: string; assets: number };

export type JobSkillView = {
  id: string;
  order: number;
  name: string;
  purpose: string;
  fileIds: string[];
  status: SkillItemStatus;
  validationErrors: string[];
  latestVersion: number;
  /** Newest first. */
  versions: VersionSummary[];
};

export type JobView = {
  id: string;
  title: string;
  description: string;
  scoreRevision: number;
  updatedAt: string;
  suggestedAt: string | null;
  /** Null until questions were written (the UI auto-writes once). */
  questionsGeneratedAt: string | null;
  /** E.g. "Instagram carousel"; null for migrated jobs. */
  outputType: string | null;
  /** Both kinds, sorted by order. */
  questions: TaskQuestionView[];
  /** Temporary projection of the FIXED questions for the old UI; removed with the UI switch (plan B9/C1). */
  matrix: SkillMatrixView;
  /** FIXED questions only. */
  answers: AnswerView[];
  /** Active files, oldest first. */
  files: JobFileView[];
  skills: JobSkillView[];
};

export type VersionAsset = { fileId: string; path: string; fileName: string; bytes: number };
export type VersionDetail = {
  skillId: string;
  version: number;
  name: string;
  description: string;
  createdAt: string;
  files: SkillFile[];
  assets: VersionAsset[];
};

/** Suggest's structured reply before clean-up. */
export type RawSuggestions = { skills: { name: string; purpose: string; fileIds: string[] }[] };
/** Generation's structured reply. The server writes SKILL.md, the style guide and assets/. */
export type JobSkillDraft = {
  description: string;
  compatibility: string;
  body: string;
  references: { path: string; content: string }[];
  scripts: { path: string; content: string; purpose: string }[];
};
