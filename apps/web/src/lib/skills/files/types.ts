/** Deterministic facts read from an uploaded file (spec: File Analysis Pipeline, stage 2). No server imports: client-safe. */
export type SkillFileKind = "PPTX" | "DOCX" | "XLSX" | "PDF" | "PNG" | "JPEG";

export const THEME_SLOTS = ["dk1", "lt1", "dk2", "lt2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6", "hlink", "folHlink"] as const;
export type ThemeSlot = (typeof THEME_SLOTS)[number];
export type ThemeFacts = { name: string | null; colors: { slot: ThemeSlot; hex: string }[]; majorFont: string | null; minorFont: string | null };
export type ColorUse = { hex: string; count: number };

export type SlideFacts = {
  index: number; // 1-based, presentation order
  layout: string | null;
  title: string | null;
  placeholders: string[];
  text: string; // <= 300 chars
  tables: number;
  charts: number;
  images: number;
};
export type PptxFacts = {
  kind: "PPTX";
  slideSize: { widthIn: number; heightIn: number; aspect: "16:9" | "4:3" | "16:10" | "A4" | "custom" } | null;
  theme: ThemeFacts | null;
  themes: string[]; // names of every theme part, in part-number order
  masters: string[];
  layouts: string[];
  slideCount: number;
  slides: SlideFacts[]; // first JOB_LIMITS.slidesDetailed
  colorsUsed: ColorUse[]; // top 12
  fontsUsed: string[]; // up to 12
  truncated: boolean;
};

export type DocxStyle = {
  id: string;
  name: string;
  type: "paragraph" | "character" | "table" | "numbering";
  basedOn: string | null;
  font: string | null;
  sizePt: number | null;
  color: string | null;
  bold: boolean;
};
export type DocxFacts = {
  kind: "DOCX";
  theme: ThemeFacts | null;
  defaults: { font: string | null; sizePt: number | null };
  styles: DocxStyle[]; // <= 40
  headings: { level: number; text: string }[]; // <= 100; Title = level 0
  paragraphs: number;
  tables: number;
  images: number;
  page: { widthIn: number; heightIn: number; orientation: "portrait" | "landscape" } | null;
  textSample: string; // <= 4000 chars
  truncated: boolean;
};

export type SheetFacts = { name: string; dimension: string | null; rows: number; headerRow: string[]; formulas: number; formulaSamples: string[] };
export type XlsxFacts = {
  kind: "XLSX";
  theme: ThemeFacts | null;
  sheets: SheetFacts[]; // <= 20
  numberFormats: string[]; // <= 20
  charts: number;
  definedNames: string[]; // <= 30
  truncated: boolean;
};

export type PdfFacts = { kind: "PDF"; version: string | null; pages: number | null; title: string | null };
export type ImageFacts = { kind: "PNG" | "JPEG"; width: number; height: number };
export type FileFacts = PptxFacts | DocxFacts | XlsxFacts | PdfFacts | ImageFacts;

export const KIND_MIME: Record<SkillFileKind, string> = {
  PPTX: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  DOCX: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  XLSX: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  PDF: "application/pdf",
  PNG: "image/png",
  JPEG: "image/jpeg",
};
export const KIND_EXTENSION: Record<SkillFileKind, string> = { PPTX: "pptx", DOCX: "docx", XLSX: "xlsx", PDF: "pdf", PNG: "png", JPEG: "jpg" };
export const KIND_LABEL: Record<SkillFileKind, string> = { PPTX: "PowerPoint", DOCX: "Word", XLSX: "Excel", PDF: "PDF", PNG: "PNG image", JPEG: "JPG image" };

const EXTENSION_KIND: Record<string, SkillFileKind> = { pptx: "PPTX", docx: "DOCX", xlsx: "XLSX", pdf: "PDF", png: "PNG", jpg: "JPEG", jpeg: "JPEG" };
/** The kind a file's name declares (a direct upload is signed for it before any byte is seen); null when unsupported. */
export function kindFromFileName(name: string): SkillFileKind | null {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? null : (EXTENSION_KIND[name.slice(dot + 1).toLowerCase()] ?? null);
}

export type FileReadErrorCode = "UNSUPPORTED_FILE" | "FILE_ENCRYPTED" | "FILE_UNREADABLE";
export const FILE_READ_MESSAGES = {
  unsupported: "Upload a PowerPoint, Word, Excel, PDF, PNG or JPG file.",
  macro: "Macro-enabled files aren't supported. Save it as .pptx, .docx or .xlsx without macros.",
  ole: "This file is password-protected or in an old Office format. Remove the password or save it as .pptx, .docx or .xlsx, then upload it again.",
  encryptedPdf: "This PDF is password-protected. Remove the password, then upload it again.",
  unreadable: "We couldn't read this file. It may be damaged. Open and save it again, then upload it.",
  mismatch: "This file's contents don't match its name. Save it again in the format its name says, then upload it.",
} as const;

export class FileReadError extends Error {
  constructor(
    readonly code: FileReadErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "FileReadError";
  }
  get status(): 415 | 422 {
    return this.code === "UNSUPPORTED_FILE" ? 415 : 422;
  }
}
