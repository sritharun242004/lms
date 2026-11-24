import type { AnswerView } from "@/lib/prompt-bot/sessions";

export type SkillFile = { path: string; content: string };
/** What the pack view and its poll carry per file: never the contents (they load per item in the preview). */
export type SkillFileEntry = { path: string; bytes: number };
export type SkillItemKind = "CUSTOM" | "CATALOG";
export type SkillItemStatus = "DRAFT" | "GENERATING" | "READY" | "FAILED";

export type CatalogCard = { id: string; slug: string; name: string; sourceUrl: string; license: string; bundlable: boolean; installNotes: string };

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
  catalog: CatalogCard | null;
};

/** One item with its file contents (GET /items/:itemId, for the preview). */
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

export type CatalogEntryView = {
  id: string;
  slug: string;
  name: string;
  description: string;
  sourceUrl: string;
  license: string;
  bundlable: boolean;
  installNotes: string;
  tags: string[];
  isActive: boolean;
};
