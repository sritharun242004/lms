import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { toAnswerView } from "@/lib/prompt-bot/score-run";
import { loadSkillMatrix } from "./matrix";
import { parseStoredFiles } from "./stored-files";
import type { ZipSkill } from "./zip";
import type { SkillFileEntry, SkillItemDetail, SkillItemStatus, SkillItemView, SkillPackView } from "./types";

/**
 * Legacy skill packs, made before the Jobs redesign. They are read-only: only their finished custom skills
 * are shown and downloaded. Catalog items and unfinished drafts stay in the database and are never read.
 */
export const UNREADABLE_FILES_MESSAGE = "The saved files couldn't be read, so this skill can't be shown or downloaded.";

const LEGACY_ITEMS = { kind: "CUSTOM", status: "READY" } as const satisfies Prisma.SkillPackItemWhereInput;

const FileIndex = z.array(z.object({ path: z.string(), bytes: z.number().int().nonnegative() }));

/**
 * Paths and UTF-8 sizes of each item's stored files, computed in Postgres so file contents never leave the database
 * for the pack view. NULL means no files; a non-array `files` value comes back as `false` (unreadable).
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

async function fileIndexes(packId: string): Promise<Map<string, unknown>> {
  const rows = await prisma.$queryRaw<{ id: string; file_index: unknown }[]>`SELECT i.id, ${FILE_INDEX_SQL} AS file_index FROM skill_pack_items i WHERE i.pack_id = ${packId}`;
  return new Map(rows.map((r) => [r.id, r.file_index]));
}

const itemInclude = { answers: true } as const satisfies Prisma.SkillPackItemInclude;
type ItemRow = Prisma.SkillPackItemGetPayload<{ include: typeof itemInclude; omit: { files: true } }>;

function viewOf<F>(row: ItemRow, files: F[] | null, unreadable: boolean, activeQuestionIds: ReadonlySet<string>) {
  return {
    id: row.id,
    order: row.order,
    kind: row.kind,
    name: row.name,
    purpose: row.purpose,
    status: (unreadable ? "FAILED" : row.status) as SkillItemStatus,
    files,
    validationErrors: unreadable ? [UNREADABLE_FILES_MESSAGE] : row.validationErrors,
    scoreRevision: row.scoreRevision,
    answers: row.answers.filter((a) => activeQuestionIds.has(a.questionId)).map(toAnswerView),
  };
}

/** The pack-view shape: `fileIndex` is the item's FILE_INDEX_SQL value (paths and sizes, no contents). */
export function toItemView(row: ItemRow, fileIndex: unknown, activeQuestionIds: ReadonlySet<string>): SkillItemView {
  const parsed = fileIndex === null || fileIndex === undefined ? null : FileIndex.safeParse(fileIndex);
  const files: SkillFileEntry[] | null = parsed?.success ? parsed.data : null;
  return viewOf(row, files, parsed !== null && !parsed.success, activeQuestionIds);
}

export function toItemDetail(row: ItemRow & { files: Prisma.JsonValue }, activeQuestionIds: ReadonlySet<string>): SkillItemDetail {
  const files = parseStoredFiles(row.files);
  return viewOf(row, files, row.files !== null && files === null, activeQuestionIds);
}

export async function loadPackView(packId: string, userId: string): Promise<SkillPackView | null> {
  const pack = await prisma.skillPack.findFirst({
    where: { id: packId, userId },
    include: { items: { where: LEGACY_ITEMS, include: itemInclude, omit: { files: true }, orderBy: { order: "asc" } } },
  });
  if (!pack) return null;
  const [matrix, indexes] = await Promise.all([loadSkillMatrix(), fileIndexes(packId)]);
  const active = new Set(matrix.questions.map((q) => q.id));
  return {
    id: pack.id,
    title: pack.title,
    description: pack.description,
    role: pack.role,
    matrix,
    items: pack.items.map((item) => toItemView(item, indexes.get(item.id) ?? null, active)),
  };
}

/** One finished custom skill with its file contents, for the read-only viewer and the single-skill download. */
export async function loadItemDetail(packId: string, itemId: string, userId: string): Promise<SkillItemDetail | null> {
  const row = await prisma.skillPackItem.findFirst({ where: { id: itemId, packId, ...LEGACY_ITEMS, pack: { userId } }, include: itemInclude });
  if (!row) return null;
  const matrix = await loadSkillMatrix();
  return toItemDetail(row, new Set(matrix.questions.map((q) => q.id)));
}

/** The owner's READY custom skills with contents, for the legacy pack zip. */
export async function loadReadySkillFiles(packId: string, userId: string): Promise<ZipSkill[]> {
  const rows = await prisma.skillPackItem.findMany({
    where: { packId, pack: { userId }, ...LEGACY_ITEMS },
    orderBy: { order: "asc" },
    select: { name: true, purpose: true, files: true },
  });
  return rows.flatMap((r) => {
    const files = parseStoredFiles(r.files);
    return files ? [{ name: r.name, purpose: r.purpose, files }] : [];
  });
}
