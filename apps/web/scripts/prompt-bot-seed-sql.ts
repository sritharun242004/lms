// Prints INSERT statements for the built-in matrices and AI settings.
// Usage: npx tsx scripts/prompt-bot-seed-sql.ts >> prisma/migrations/<dir>/migration.sql
import { BUILTIN_MATRICES } from "../src/lib/prompt-bot/builtin-matrices";
import { matrixSeedSql } from "../src/lib/prompt-bot/seed-sql";

const lines: string[] = ["", "-- Seed: built-in Prompt Bot matrices (src/lib/prompt-bot/builtin-matrices.ts)"];
for (const m of BUILTIN_MATRICES) lines.push(...matrixSeedSql(m));
lines.push(
  `INSERT INTO "ai_settings" ("id","limits","updated_at") VALUES ('singleton','{"score":300,"enhance":30,"skill_split":10,"skill_generate":20}'::jsonb,NOW());`,
);
console.log(lines.join("\n"));
