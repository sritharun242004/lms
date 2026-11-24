import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import type { PromptQuestionContext } from "@/lib/prompt-bot/instructions";
import { buildQuestionContext, scoreAndApply, toAnswerView } from "@/lib/prompt-bot/score-run";
import { SKILL_MATRIX_SLUG } from "./builtin-skill-matrix";
import { skillScoringBase } from "./instructions";
import { GENERATION_STALE_MS } from "./limits";
import type { SplitResult } from "./split";
import type { SkillFile, SkillItemStatus, SkillItemView, SkillMatrixView, SkillPackView } from "./types";

export const INTERRUPTED_MESSAGE = "Writing this skill was interrupted. Generate it again.";
export const UNREADABLE_FILES_MESSAGE = "The saved files couldn't be read. Generate this skill again.";

export const generationCutoff = (now = new Date()) => new Date(now.getTime() - GENERATION_STALE_MS);

export function isGenerating(status: string, generationStartedAt: Date | null, now = new Date()): boolean {
  return status === "GENERATING" && generationStartedAt !== null && generationStartedAt > generationCutoff(now);
}

const StoredFiles = z.array(z.object({ path: z.string(), content: z.string() }));

export function parseStoredFiles(value: unknown): SkillFile[] | null {
  if (value === null || value === undefined) return null;
  const parsed = StoredFiles.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export const toStoredFiles = (files: SkillFile[]): Prisma.InputJsonValue => files.map((f) => ({ path: f.path, content: f.content }));

export async function loadSkillMatrix(): Promise<SkillMatrixView> {
  const matrix = await prisma.promptMatrix.findFirst({
    where: { slug: SKILL_MATRIX_SLUG, kind: "SKILL", isActive: true },
    include: { questions: { where: { isActive: true }, orderBy: { order: "asc" } } },
  });
  return {
    id: matrix?.id ?? "",
    name: matrix?.name ?? "Skill definition",
    questions: matrix?.questions.map((q) => ({ id: q.id, text: q.text, guidance: q.guidance, order: q.order })) ?? [],
  };
}

const itemInclude = { answers: true, catalogEntry: true } as const satisfies Prisma.SkillPackItemInclude;
type ItemRow = Prisma.SkillPackItemGetPayload<{ include: typeof itemInclude }>;

export function toItemView(row: ItemRow, activeQuestionIds: ReadonlySet<string>, now = new Date()): SkillItemView {
  const files = parseStoredFiles(row.files);
  let status = row.status as SkillItemStatus;
  let validationErrors = row.validationErrors;
  if (status === "GENERATING" && !isGenerating(status, row.generationStartedAt, now)) {
    status = "FAILED";
    validationErrors = [INTERRUPTED_MESSAGE];
  } else if (row.files !== null && files === null) {
    status = "FAILED";
    validationErrors = [UNREADABLE_FILES_MESSAGE];
  }
  const entry = row.catalogEntry;
  return {
    id: row.id,
    order: row.order,
    kind: row.kind,
    name: row.name,
    purpose: row.purpose,
    status,
    files,
    validationErrors,
    scoreRevision: row.scoreRevision,
    answers: row.answers.filter((a) => activeQuestionIds.has(a.questionId)).map(toAnswerView),
    catalog: entry
      ? { id: entry.id, slug: entry.slug, name: entry.name, sourceUrl: entry.sourceUrl, license: entry.license, bundlable: entry.bundlable, installNotes: entry.installNotes }
      : null,
  };
}

export async function loadPackView(packId: string, userId: string, now = new Date()): Promise<SkillPackView | null> {
  const pack = await prisma.skillPack.findFirst({
    where: { id: packId, userId },
    include: { items: { include: itemInclude, orderBy: { order: "asc" } } },
  });
  if (!pack) return null;
  const matrix = await loadSkillMatrix();
  const active = new Set(matrix.questions.map((q) => q.id));
  return {
    id: pack.id,
    title: pack.title,
    description: pack.description,
    role: pack.role,
    matrix,
    items: pack.items.map((item) => toItemView(item, active, now)),
  };
}

export async function loadItemView(packId: string, itemId: string, userId: string): Promise<SkillItemView | null> {
  const row = await prisma.skillPackItem.findFirst({ where: { id: itemId, packId, pack: { userId } }, include: itemInclude });
  if (!row) return null;
  const matrix = await loadSkillMatrix();
  return toItemView(row, new Set(matrix.questions.map((q) => q.id)));
}

export function findOwnedCustomItem(packId: string, itemId: string, userId: string) {
  return prisma.skillPackItem.findFirst({
    where: { id: itemId, packId, kind: "CUSTOM", pack: { userId } },
    include: { answers: true, pack: { select: { description: true, role: true } } },
  });
}

export function questionContext(
  matrix: SkillMatrixView,
  answers: { questionId: string; answer: string; score: number; reason?: string | null; notRelevant: boolean }[],
): PromptQuestionContext[] {
  return buildQuestionContext(matrix.questions, answers.map((a) => ({ reason: null, ...a })));
}

export async function createPackFromSplit(input: {
  userId: string;
  title: string;
  description: string;
  role: string | null;
  split: SplitResult;
  catalog: { id: string; slug: string }[];
}): Promise<string> {
  const idBySlug = new Map(input.catalog.map((c) => [c.slug, c.id]));
  const custom: Prisma.SkillPackItemUncheckedCreateWithoutPackInput[] = input.split.customSkills.map((s, order) => ({
    order,
    kind: "CUSTOM" as const,
    name: s.name,
    purpose: s.purpose,
  }));
  const catalog: Prisma.SkillPackItemUncheckedCreateWithoutPackInput[] = input.split.catalogMatches.flatMap((m, i) => {
    const catalogEntryId = idBySlug.get(m.slug);
    return catalogEntryId ? [{ order: custom.length + i, kind: "CATALOG" as const, catalogEntryId, name: m.slug, purpose: m.why }] : [];
  });
  const pack = await prisma.skillPack.create({
    data: { userId: input.userId, title: input.title, description: input.description, role: input.role, items: { create: [...custom, ...catalog] } },
    select: { id: true },
  });
  return pack.id;
}

export async function ensureItemAnswerRows(itemId: string, questionIds: string[]) {
  if (questionIds.length === 0) return;
  await prisma.skillItemAnswer.createMany({ data: questionIds.map((questionId) => ({ itemId, questionId })), skipDuplicates: true });
}

/** The enhancer's scoring flow for one skill item: purpose plus answers, applied only if `revision` is not stale. */
export async function runItemScoring(packId: string, itemId: string, userId: string, revision: number) {
  const item = await findOwnedCustomItem(packId, itemId, userId);
  if (!item) throw new Error("skill not found");
  const matrix = await loadSkillMatrix();
  const active = new Set(matrix.questions.map((q) => q.id));
  return scoreAndApply({
    userId,
    revision,
    scoringBase: skillScoringBase(item.name, item.purpose),
    questions: matrix.questions,
    answers: item.answers.filter((a) => active.has(a.questionId)).map(toAnswerView),
    ensureRows: () => ensureItemAnswerRows(itemId, matrix.questions.map((q) => q.id)),
    readRevision: async () =>
      (await prisma.skillPackItem.findFirst({ where: { id: itemId, packId, pack: { userId } }, select: { scoreRevision: true } }))?.scoreRevision ?? null,
    applyOps: (results, scoredAt, next) => [
      ...results.map((r) =>
        prisma.skillItemAnswer.update({
          where: { itemId_questionId: { itemId, questionId: r.questionId } },
          data: { score: r.score, reason: r.reason, scoredAt },
        }),
      ),
      prisma.skillPackItem.update({ where: { id: itemId }, data: { scoreRevision: next } }),
    ],
    transaction: (ops) => prisma.$transaction(ops),
    reload: async () => (await loadItemView(packId, itemId, userId))?.answers ?? [],
  });
}
