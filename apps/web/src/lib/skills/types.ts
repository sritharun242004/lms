import type { AnswerView } from "@/lib/prompt-bot/sessions";

export type SkillFile = { path: string; content: string };
/** What a pack view carries per file: never the contents (they load per item). */
export type SkillFileEntry = { path: string; bytes: number };
export type SkillItemKind = "CUSTOM" | "CATALOG";
export type SkillItemStatus = "DRAFT" | "GENERATING" | "READY" | "FAILED";

/** A legacy pack item (packs made before the Jobs redesign; read-only). */
export type SkillItemView = {
  id: string;
  order: number;
  kind: SkillItemKind;
  name: string;
  purpose: string;
  status: SkillItemStatus;
  files: SkillFileEntry[] | null;
  validationErrors: string[];
  scoreRevision: number;
  answers: AnswerView[];
};

/** One item with its file contents (GET /skill-packs/:id/items/:itemId). */
export type SkillItemDetail = Omit<SkillItemView, "files"> & { files: SkillFile[] | null };

export type SkillMatrixView = { id: string; name: string; questions: { id: string; text: string; guidance: string; order: number }[] };

export type SkillPackView = {
  id: string;
  title: string;
  description: string;
  role: string | null;
  matrix: SkillMatrixView;
  items: SkillItemView[];
};
