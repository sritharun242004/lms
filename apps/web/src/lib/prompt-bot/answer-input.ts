import { z } from "zod";

/** Request bodies shared by the enhancer's and the Skills Builder's answer and score routes. */
export const AnswerBody = z
  .object({ answer: z.string().max(4000).optional(), notRelevant: z.boolean().optional() })
  .refine((v) => v.answer !== undefined || v.notRelevant !== undefined, "Nothing to update");

export const ScoreBody = z.object({ revision: z.number().int().min(0) });

/** Only the fields the caller sent, so an update never clobbers the other one. */
export function answerFields(data: z.infer<typeof AnswerBody>) {
  return {
    ...(data.answer !== undefined ? { answer: data.answer } : {}),
    ...(data.notRelevant !== undefined ? { notRelevant: data.notRelevant } : {}),
  };
}
