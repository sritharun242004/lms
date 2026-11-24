// Prints INSERT statements for the built-in matrices and AI settings.
// Usage: npx tsx scripts/prompt-bot-seed-sql.ts >> prisma/migrations/<dir>/migration.sql
import { BUILTIN_MATRICES } from "../src/lib/prompt-bot/builtin-matrices";

const s = (value: string | null) => (value === null ? "NULL" : `'${value.replace(/'/g, "''")}'`);
const lines: string[] = ["", "-- Seed: built-in Prompt Bot matrices (src/lib/prompt-bot/builtin-matrices.ts)"];
for (const m of BUILTIN_MATRICES) {
  lines.push(
    `INSERT INTO "prompt_matrices" ("id","slug","name","description","kind","is_built_in","is_active","created_at","updated_at") VALUES (${s(m.id)},${s(m.slug)},${s(m.name)},${s(m.description)},'${m.kind}',true,true,NOW(),NOW());`,
  );
  m.questions.forEach((question, order) => {
    lines.push(
      `INSERT INTO "prompt_matrix_questions" ("id","matrix_id","order","text","guidance","element","is_active") VALUES (${s(question.id)},${s(m.id)},${order},${s(question.text)},${s(question.guidance)},${s(question.element)},true);`,
    );
  });
}
lines.push(
  `INSERT INTO "ai_settings" ("id","limits","updated_at") VALUES ('singleton','{"score":300,"enhance":30,"skill_split":10,"skill_generate":20}'::jsonb,NOW());`,
);
console.log(lines.join("\n"));
