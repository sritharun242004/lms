// apps/web/src/lib/prompt-bot/matrix-input.ts
import { z } from "zod";

export const canEditMatrices = (role?: string) => role === "ADMIN" || role === "MENTOR";

export const QuestionInput = z.object({
  id: z.string().optional(),
  text: z.string().trim().min(3).max(300),
  guidance: z.string().trim().min(3).max(600),
  element: z.string().trim().max(40).nullable().optional(),
});
