import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import type { PromptQuestionContext } from "@/lib/prompt-bot/instructions";
import { buildQuestionContext, scoreAndApply, toAnswerView } from "@/lib/prompt-bot/score-run";
import { SKILL_MATRIX_SLUG } from "./builtin-skill-matrix";
import { skillScoringBase } from "./instructions";
import { GENERATION_STALE_MS, PACK_LIMITS } from "./limits";
import type { SplitResult } from "./split";
import type { ZipSkill } from "./zip";
import type { SkillFile, SkillFileEntry, SkillItemDetail, SkillItemStatus, SkillItemView, SkillMatrixView, SkillPackView } from "./types";

export const INTERRUPTED_MESSAGE = "Writing this skill was interrupted. Generate it again.";
export const UNREADABLE_FILES_MESSAGE = "The saved files couldn't be read. Generate this skill again.";

export const generationCutoff = (now = new Date()) => new Date(now.getTime() - GENERATION_STALE_MS);

export function isGenerating(status: string, generationStartedAt: Date | null, now = new Date()): boolean {
  return status === "GENERATING" && generationStartedAt !== null && generationStartedAt > generationCutoff(now);
}

const StoredFiles = z.array(z.object({ path: z.string(), content: z.string() }));
const FileIndex = z.array(z.object({ path: z.string(), bytes: z.number().int().nonnegative() }));

export function parseStoredFiles(value: unknown): SkillFile[] | null {
  if (value === null || value === undefined) return null;
  const parsed = StoredFiles.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * Paths and UTF-8 sizes of each item's stored files, computed in Postgres so file contents never leave the database
 * for the pack view or its poll. NULL means no files; a non-array `files` value comes back as `false` (unreadable).
 */
const FILE_INDEX_SQL = Prisma.sql`CASE
  WHEN i.files IS NULL THEN NULL
  WHEN jsonb_typeof(i.files) <> 'array' THEN 'false'::jsonb
  ELSE (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'path', f -> 'path',
      'bytes', CASE WHEN jsonb_typeof(f -> 'content') = 'string' THEN octet_length(f ->> 'content') END
    ) ORDER BY n), '[]'::jsonb)
    FROM jsonb_array_elements(i.files) WITH ORDINALITY AS e(f, n)
  )
END`;

async function fileIndexes(where: Prisma.Sql): Promise<Map<string, unknown>> {
  const rows = await prisma.$queryRaw<{ id: string; file_index: unknown }[]>`SELECT i.id, ${FILE_INDEX_SQL} AS file_index FROM skill_pack_items i WHERE ${where}`;
  return new Map(rows.map((r) => [r.id, r.file_index]));
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
type ItemRow = Prisma.SkillPackItemGetPayload<{ include: typeof itemInclude; omit: { files: true } }>;

/** Status, answers and catalog card for one item, given its files as already parsed (null with `unreadable`). */
function viewOf<F>(row: ItemRow, files: F[] | null, unreadable: boolean, activeQuestionIds: ReadonlySet<string>, now: Date) {
  let status = row.status as SkillItemStatus;
  let validationErrors = row.validationErrors;
  if (status === "GENERATING" && !isGenerating(status, row.generationStartedAt, now)) {
    status = "FAILED";
    validationErrors = [INTERRUPTED_MESSAGE];
  } else if (unreadable) {
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

/** The pack-view shape: `fileIndex` is the item's FILE_INDEX_SQL value (paths and sizes, no contents). */
export function toItemView(row: ItemRow, fileIndex: unknown, activeQuestionIds: ReadonlySet<string>, now = new Date()): SkillItemView {
  const parsed = fileIndex === null || fileIndex === undefined ? null : FileIndex.safeParse(fileIndex);
  const files: SkillFileEntry[] | null = parsed?.success ? parsed.data : null;
  return viewOf(row, files, parsed !== null && !parsed.success, activeQuestionIds, now);
}

export function toItemDetail(row: ItemRow & { files: Prisma.JsonValue }, activeQuestionIds: ReadonlySet<string>, now = new Date()): SkillItemDetail {
  const files = parseStoredFiles(row.files);
  return viewOf(row, files, row.files !== null && files === null, activeQuestionIds, now);
}

export async function loadPackView(packId: string, userId: string, now = new Date()): Promise<SkillPackView | null> {
  const pack = await prisma.skillPack.findFirst({
    where: { id: packId, userId },
    include: { items: { include: itemInclude, omit: { files: true }, orderBy: { order: "asc" } } },
  });
  if (!pack) return null;
  const [matrix, indexes] = await Promise.all([loadSkillMatrix(), fileIndexes(Prisma.sql`i.pack_id = ${packId}`)]);
  const active = new Set(matrix.questions.map((q) => q.id));
  return {
    id: pack.id,
    title: pack.title,
    description: pack.description,
    role: pack.role,
    matrix,
    items: pack.items.map((item) => toItemView(item, indexes.get(item.id) ?? null, active, now)),
  };
}

/** One item in the pack-view shape (no file contents). */
export async function loadItemView(packId: string, itemId: string, userId: string): Promise<SkillItemView | null> {
  const row = await prisma.skillPackItem.findFirst({ where: { id: itemId, packId, pack: { userId } }, include: itemInclude, omit: { files: true } });
  if (!row) return null;
  const [matrix, indexes] = await Promise.all([loadSkillMatrix(), fileIndexes(Prisma.sql`i.id = ${itemId}`)]);
  return toItemView(row, indexes.get(itemId) ?? null, new Set(matrix.questions.map((q) => q.id)));
}

/** One item with its file contents, for the preview and the single-skill download. */
export async function loadItemDetail(packId: string, itemId: string, userId: string): Promise<SkillItemDetail | null> {
  const row = await prisma.skillPackItem.findFirst({ where: { id: itemId, packId, pack: { userId } }, include: itemInclude });
  if (!row) return null;
  const matrix = await loadSkillMatrix();
  return toItemDetail(row, new Set(matrix.questions.map((q) => q.id)));
}

/** The owner's READY custom skills with contents, for the pack zip. Each is within SKILL_LIMITS, the pack within PACK_LIMITS. */
export async function loadReadySkillFiles(packId: string, userId: string): Promise<ZipSkill[]> {
  const rows = await prisma.skillPackItem.findMany({
    where: { packId, pack: { userId }, kind: "CUSTOM", status: "READY" },
    orderBy: { order: "asc" },
    select: { name: true, purpose: true, files: true },
  });
  return rows.flatMap((r) => {
    const files = parseStoredFiles(r.files);
    return files ? [{ name: r.name, purpose: r.purpose, files }] : [];
  });
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
  const items = [...custom, ...catalog].slice(0, PACK_LIMITS.items);
  const pack = await prisma.skillPack.create({
    data: { userId: input.userId, title: input.title, description: input.description, role: input.role, items: { create: items } },
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
