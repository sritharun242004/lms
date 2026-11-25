/** Request bodies of the question routes (spec 2026-11-25 tasks, API Contract routes 7 and 8). */
import { z } from "zod";
import { JOB_LIMITS } from "../limits";
import { FILE_HINTS, type FileHint } from "./types";

const fields = {
  text: z.string().trim().min(1).max(JOB_LIMITS.questionTextChars),
  guidance: z.string().max(JOB_LIMITS.questionGuidanceChars).optional(),
  kind: z.enum(["FIXED", "PER_USE"]).optional(),
  required: z.boolean().optional(),
  wantsFiles: z.boolean().optional(),
  fileHint: z.enum(FILE_HINTS as [FileHint, ...FileHint[]]).nullable().optional(),
  fileNote: z.string().max(JOB_LIMITS.fileNoteChars).optional(),
};

/** A per-use label is at most 120 characters. */
function perUseLabel(value: { text?: string; kind?: "FIXED" | "PER_USE" }, ctx: z.RefinementCtx) {
  if (value.kind === "PER_USE" && value.text !== undefined && value.text.length > JOB_LIMITS.perUseLabelChars) {
    ctx.addIssue({
      code: z.ZodIssueCode.too_big,
      maximum: JOB_LIMITS.perUseLabelChars,
      type: "string",
      inclusive: true,
      path: ["text"],
      message: `An input's name can be up to ${JOB_LIMITS.perUseLabelChars} characters`,
    });
  }
}

export const QuestionBody = z.object(fields).superRefine(perUseLabel);

export const QuestionPatch = z
  .object({ ...fields, text: fields.text.optional() })
  .superRefine(perUseLabel)
  .refine((v) => Object.values(v).some((x) => x !== undefined), "Nothing to update");
