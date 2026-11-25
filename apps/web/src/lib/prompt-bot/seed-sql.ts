import type { BuiltinMatrix } from "./builtin-matrices";

/** SQL string literal with single quotes doubled; NULL for null. */
export const sqlLiteral = (value: string | null) => (value === null ? "NULL" : `'${value.replace(/'/g, "''")}'`);

/**
 * INSERT statements for one built-in matrix and its questions, exactly as the migrations seed them:
 * every row starts active. Rows switched off later are handled by retirementSql.
 */
export function matrixSeedSql(m: BuiltinMatrix): string[] {
  return [
    `INSERT INTO "prompt_matrices" ("id","slug","name","description","kind","is_built_in","is_active","created_at","updated_at") VALUES (${sqlLiteral(m.id)},${sqlLiteral(m.slug)},${sqlLiteral(m.name)},${sqlLiteral(m.description)},'${m.kind}',true,true,NOW(),NOW());`,
    ...m.questions.map(
      (question, order) =>
        `INSERT INTO "prompt_matrix_questions" ("id","matrix_id","order","text","guidance","element","is_active") VALUES (${sqlLiteral(question.id)},${sqlLiteral(m.id)},${order},${sqlLiteral(question.text)},${sqlLiteral(question.guidance)},${sqlLiteral(question.element)},true);`,
    ),
  ];
}

/** UPDATE statements that switch off the matrices and questions the source marks inactive. Rows are never deleted. */
export function retirementSql(matrices: BuiltinMatrix[]): string[] {
  return matrices.flatMap((m) => [
    ...(m.isActive === false
      ? [`UPDATE "prompt_matrices" SET "is_active" = false, "updated_at" = NOW() WHERE "id" = ${sqlLiteral(m.id)};`]
      : []),
    ...m.questions
      .filter((q) => q.isActive === false)
      .map((q) => `UPDATE "prompt_matrix_questions" SET "is_active" = false WHERE "id" = ${sqlLiteral(q.id)};`),
  ]);
}

/**
 * UPDATE statements that switch questions back on, with the source's text and position, for rows a
 * data migration once retired. The question must be active in the source; unknown ids throw.
 */
export function restorationSql(m: BuiltinMatrix, questionIds: string[]): string[] {
  return questionIds.map((id) => {
    const order = m.questions.findIndex((q) => q.id === id);
    const question = m.questions[order];
    if (!question || question.isActive === false) throw new Error(`${id} is not an active question of ${m.id}`);
    return `UPDATE "prompt_matrix_questions" SET "is_active" = true, "text" = ${sqlLiteral(question.text)}, "order" = ${order} WHERE "id" = ${sqlLiteral(id)};`;
  });
}
