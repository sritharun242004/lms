/**
 * Clean-up of Write questions' reply (spec 2026-11-25 tasks, "Essentials guaranteed"). Pure and generic:
 * nothing here depends on the output type.
 */
import { JOB_LIMITS } from "../limits";
import type { Essential, FileHint, PerUseInput, RawTaskQuestions } from "./types";

export type { Essential };
export const ESSENTIALS: readonly Essential[] = ["triggers", "inputs", "steps", "output", "quality", "avoid"];

export type CleanQuestion = {
  text: string;
  guidance: string;
  wantsFiles: boolean;
  fileHint: FileHint | null;
  fileNote: string;
  covers: Essential[];
};

/** One generic question per essential, appended when the model's questions leave it uncovered. */
export const FALLBACK_QUESTIONS: Record<Essential, { text: string; guidance: string }> = {
  triggers: {
    text: "When should this skill be used, and when not?",
    guidance: "Name the requests or situations that should start it, and the ones that should not.",
  },
  inputs: { text: "What do you start from each time?", guidance: "List the files, data or notes the work begins with." },
  steps: { text: "What are the steps, in order?", guidance: "Describe how you do it today, step by step." },
  output: { text: "What does a great result look like?", guidance: "Describe the format, the length and what makes it excellent." },
  quality: { text: "How do you judge it is good enough to hand over?", guidance: "Name the checks you or a reviewer apply." },
  avoid: { text: "What should it never do?", guidance: "List the mistakes, claims, words or formats to stay away from." },
};

/** Lower case, collapsed spaces, trailing ?.!: removed: the key for duplicates and for keeping rows on regenerate. */
export function normalizeQuestionText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim().replace(/[?.!:]+$/, "").trim();
}

const oneLine = (text: string, max: number) => text.replace(/\s+/g, " ").trim().slice(0, max).trim();

export function cleanOutputType(outputType: string | null | undefined): string | null {
  return oneLine(outputType ?? "", JOB_LIMITS.outputTypeChars) || null;
}

const isEssential = (value: string): value is Essential => (ESSENTIALS as readonly string[]).includes(value);

function cleanFixed(raw: RawTaskQuestions["questions"], seen: Set<string>): CleanQuestion[] {
  const out: CleanQuestion[] = [];
  for (const q of raw) {
    if (q.kind === "per_use") continue;
    const text = oneLine(q.text, JOB_LIMITS.questionTextChars);
    const key = normalizeQuestionText(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const wantsFiles = q.wantsFiles === true;
    out.push({
      text,
      guidance: oneLine(q.guidance, JOB_LIMITS.questionGuidanceChars),
      wantsFiles,
      fileHint: wantsFiles ? (q.fileHint === "NONE" ? "REFERENCE" : q.fileHint) : null,
      fileNote: wantsFiles ? oneLine(q.fileNote, JOB_LIMITS.fileNoteChars) : "",
      covers: [...new Set(q.covers.filter(isEssential))],
    });
    if (out.length === JOB_LIMITS.aiQuestionsMax) break;
  }
  return out;
}

/** Drops redundant questions from the end until the fallbacks fit within the cap, then appends one per missing essential. */
function coverEssentials(fixed: CleanQuestion[], seen: Set<string>): CleanQuestion[] {
  const kept = [...fixed];
  const coveredBy = (list: CleanQuestion[]) => new Set(list.flatMap((q) => q.covers));
  const missing = () => ESSENTIALS.filter((e) => !coveredBy(kept).has(e));
  while (kept.length + missing().length > JOB_LIMITS.aiQuestionsMax) {
    let dropped = false;
    for (let i = kept.length - 1; i >= 0; i--) {
      const others = coveredBy(kept.filter((_, j) => j !== i));
      if (kept[i].covers.every((e) => others.has(e))) {
        kept.splice(i, 1);
        dropped = true;
        break;
      }
    }
    if (!dropped) break;
  }
  for (const essential of missing()) {
    const fallback = FALLBACK_QUESTIONS[essential];
    const key = normalizeQuestionText(fallback.text);
    const same = kept.find((q) => normalizeQuestionText(q.text) === key);
    if (same) {
      same.covers.push(essential);
      continue;
    }
    seen.add(key);
    kept.push({ ...fallback, wantsFiles: false, fileHint: null, fileNote: "", covers: [essential] });
  }
  return kept;
}

function cleanPerUse(raw: RawTaskQuestions, seen: Set<string>): PerUseInput[] {
  const candidates = [
    ...raw.questions.filter((q) => q.kind === "per_use").map((q) => ({ label: q.text, hint: q.guidance, required: true })),
    ...raw.perUseInputs,
  ];
  const out: PerUseInput[] = [];
  for (const c of candidates) {
    const label = oneLine(c.label, JOB_LIMITS.perUseLabelChars);
    const key = normalizeQuestionText(label);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ label, hint: oneLine(c.hint, JOB_LIMITS.questionGuidanceChars), required: c.required !== false });
    if (out.length === JOB_LIMITS.aiPerUseMax) break;
  }
  return out;
}

/** Fixed questions (every essential covered, at most 8) and per-use inputs (at most 10), deduplicated across both. */
export function cleanQuestionSet(raw: RawTaskQuestions): { outputType: string | null; fixed: CleanQuestion[]; perUse: PerUseInput[] } {
  const seen = new Set<string>();
  const fixed = coverEssentials(cleanFixed(raw.questions, seen), seen);
  return { outputType: cleanOutputType(raw.outputType), fixed, perUse: cleanPerUse(raw, seen) };
}
