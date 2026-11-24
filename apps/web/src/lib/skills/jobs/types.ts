import type { AnswerView } from "@/lib/prompt-bot/sessions";
import type { FileFacts, SkillFileKind } from "../files/types";
import type { SkillFile, SkillItemStatus, SkillMatrixView } from "../types";

export type AnalysisStatus = "PENDING" | "READY" | "FAILED";

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
  matrix: SkillMatrixView;
  answers: AnswerView[];
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
