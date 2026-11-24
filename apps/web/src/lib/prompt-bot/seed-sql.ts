import type { BuiltinMatrix } from "./builtin-matrices";

/** SQL string literal with single quotes doubled; NULL for null. */
export const sqlLiteral = (value: string | null) => (value === null ? "NULL" : `'${value.replace(/'/g, "''")}'`);

/** INSERT statements for one built-in matrix and its questions, exactly as the migrations seed them. */
export function matrixSeedSql(m: BuiltinMatrix): string[] {
  return [
    `INSERT INTO "prompt_matrices" ("id","slug","name","description","kind","is_built_in","is_active","created_at","updated_at") VALUES (${sqlLiteral(m.id)},${sqlLiteral(m.slug)},${sqlLiteral(m.name)},${sqlLiteral(m.description)},'${m.kind}',true,true,NOW(),NOW());`,
    ...m.questions.map(
      (question, order) =>
        `INSERT INTO "prompt_matrix_questions" ("id","matrix_id","order","text","guidance","element","is_active") VALUES (${sqlLiteral(question.id)},${sqlLiteral(m.id)},${order},${sqlLiteral(question.text)},${sqlLiteral(question.guidance)},${sqlLiteral(question.element)},true);`,
    ),
  ];
}
