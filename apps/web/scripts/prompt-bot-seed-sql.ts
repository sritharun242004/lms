// Prints the SQL that puts the built-in matrices and AI settings into the database.
// Usage:
//   npx tsx scripts/prompt-bot-seed-sql.ts                     INSERTs (every row active) for a first seed
//   npx tsx scripts/prompt-bot-seed-sql.ts --retire            UPDATEs that switch off rows the source marks inactive
//   npx tsx scripts/prompt-bot-seed-sql.ts --restore ID[,ID]   UPDATEs that switch core questions back on
// 20261124150000_add_prompt_bot holds the INSERTs; 20261125090000_prompt_bot_core_seven holds the retiring
// UPDATEs; 20261125090500_prompt_bot_core_eighth restores pbq_core_8 (`--restore pbq_core_8`).
import { BUILTIN_MATRICES, CORE_MATRIX_ID } from "../src/lib/prompt-bot/builtin-matrices";
import { matrixSeedSql, restorationSql, retirementSql } from "../src/lib/prompt-bot/seed-sql";

const restore = process.argv.indexOf("--restore");
if (restore !== -1) {
  const core = BUILTIN_MATRICES.find((m) => m.id === CORE_MATRIX_ID)!;
  const ids = (process.argv[restore + 1] ?? "").split(",").filter(Boolean);
  console.log(["-- Switch built-in core questions back on (src/lib/prompt-bot/builtin-matrices.ts)", ...restorationSql(core, ids)].join("\n"));
} else if (process.argv.includes("--retire")) {
  console.log(["-- Switch off retired built-in Prompt Bot rows (src/lib/prompt-bot/builtin-matrices.ts)", ...retirementSql(BUILTIN_MATRICES)].join("\n"));
} else {
  const lines: string[] = ["", "-- Seed: built-in Prompt Bot matrices (src/lib/prompt-bot/builtin-matrices.ts)"];
  for (const m of BUILTIN_MATRICES) lines.push(...matrixSeedSql(m));
  lines.push(
    `INSERT INTO "ai_settings" ("id","limits","updated_at") VALUES ('singleton','{"score":300,"enhance":30,"skill_split":10,"skill_generate":20}'::jsonb,NOW());`,
  );
  console.log(lines.join("\n"));
}
