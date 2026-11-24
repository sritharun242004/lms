// Prints the SQL that puts the built-in matrices and AI settings into the database.
// Usage:
//   npx tsx scripts/prompt-bot-seed-sql.ts           INSERTs (every row active) for a first seed
//   npx tsx scripts/prompt-bot-seed-sql.ts --retire  UPDATEs that switch off rows the source marks inactive
// 20261124150000_add_prompt_bot holds the INSERTs; 20261125090000_prompt_bot_core_seven holds the UPDATEs.
import { BUILTIN_MATRICES } from "../src/lib/prompt-bot/builtin-matrices";
import { matrixSeedSql, retirementSql } from "../src/lib/prompt-bot/seed-sql";

if (process.argv.includes("--retire")) {
  console.log(["-- Switch off retired built-in Prompt Bot rows (src/lib/prompt-bot/builtin-matrices.ts)", ...retirementSql(BUILTIN_MATRICES)].join("\n"));
} else {
  const lines: string[] = ["", "-- Seed: built-in Prompt Bot matrices (src/lib/prompt-bot/builtin-matrices.ts)"];
  for (const m of BUILTIN_MATRICES) lines.push(...matrixSeedSql(m));
  lines.push(
    `INSERT INTO "ai_settings" ("id","limits","updated_at") VALUES ('singleton','{"score":300,"enhance":30,"skill_split":10,"skill_generate":20}'::jsonb,NOW());`,
  );
  console.log(lines.join("\n"));
}
