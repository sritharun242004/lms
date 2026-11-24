import { prisma } from "@/lib/db/prisma";
import { generateSkillDraft } from "@/lib/ai/claude";
import { consumeAiUsage } from "@/lib/ai/usage";
import { assembleSkillFiles } from "./assemble";
import { validateSkillFiles } from "./format";
import { buildGenerateMessage, buildRetryMessage } from "./instructions";
import { findOwnedCustomItem, generationCutoff, isGenerating, loadItemView, loadSkillMatrix, questionContext, toStoredFiles } from "./packs";
import type { SkillItemView } from "./types";

export const GENERATION_FAILED_MESSAGE = "The AI couldn't finish writing this skill. Try again.";

export class SkillNotFoundError extends Error {
  constructor() {
    super("Skill not found");
    this.name = "SkillNotFoundError";
  }
}

export class AlreadyGeneratingError extends Error {
  constructor() {
    super("This skill is already being written");
    this.name = "AlreadyGeneratingError";
  }
}

/** Checks ownership, counts one skill_generate use and claims the item. runGeneration does the writing. */
export async function startGeneration(packId: string, itemId: string, userId: string, now = new Date()): Promise<SkillItemView> {
  const item = await findOwnedCustomItem(packId, itemId, userId);
  if (!item) throw new SkillNotFoundError();
  if (isGenerating(item.status, item.generationStartedAt, now)) throw new AlreadyGeneratingError();
  await consumeAiUsage(userId, "skill_generate");
  const claimed = await prisma.skillPackItem.updateMany({
    where: {
      id: itemId,
      OR: [{ status: { not: "GENERATING" } }, { generationStartedAt: null }, { generationStartedAt: { lt: generationCutoff(now) } }],
    },
    // generationStartedAt, not updatedAt, is the staleness clock: scoring and PATCH also bump updatedAt.
    data: { status: "GENERATING", validationErrors: [], generationStartedAt: now },
  });
  if (claimed.count === 0) throw new AlreadyGeneratingError();
  const view = await loadItemView(packId, itemId, userId);
  if (!view) throw new SkillNotFoundError();
  return view;
}

/** One model call, validation, one retry with the errors, then READY or FAILED. Runs after the response; never throws. */
export async function runGeneration(packId: string, itemId: string, userId: string): Promise<void> {
  try {
    const item = await findOwnedCustomItem(packId, itemId, userId);
    if (!item) return;
    const matrix = await loadSkillMatrix();
    const message = buildGenerateMessage({
      packDescription: item.pack.description,
      role: item.pack.role,
      name: item.name,
      purpose: item.purpose,
      questions: questionContext(matrix, item.answers),
    });
    let draft = await generateSkillDraft(message);
    let files = assembleSkillFiles(item.name, draft);
    let errors = validateSkillFiles(files, item.name);
    if (errors.length > 0) {
      draft = await generateSkillDraft(buildRetryMessage(message, draft, errors));
      files = assembleSkillFiles(item.name, draft);
      errors = validateSkillFiles(files, item.name);
    }
    await prisma.skillPackItem.update({
      where: { id: itemId },
      data: { status: errors.length > 0 ? "FAILED" : "READY", files: toStoredFiles(files), validationErrors: errors },
    });
  } catch (error) {
    console.error("[skills-builder] generation failed:", error instanceof Error ? error.name : "unknown");
    await prisma.skillPackItem
      .update({ where: { id: itemId }, data: { status: "FAILED", validationErrors: [GENERATION_FAILED_MESSAGE] } })
      .catch((writeError: unknown) => {
        // The item stays GENERATING and becomes retryable once the stale window passes.
        console.error("[skills-builder] could not record the failure:", writeError instanceof Error ? writeError.name : "unknown");
      });
  }
}
