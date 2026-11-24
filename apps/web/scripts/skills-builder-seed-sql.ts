// Prints INSERT statements for the skill-definition matrix and the skill catalog.
// Usage: npx tsx scripts/skills-builder-seed-sql.ts >> prisma/migrations/20261124120000_add_skills_builder/migration.sql
import { matrixSeedSql } from "../src/lib/prompt-bot/seed-sql";
import { SKILL_MATRIX } from "../src/lib/skills/builtin-skill-matrix";
import { CATALOG_SEED } from "../src/lib/skills/catalog-seed";
import { catalogSeedSql } from "../src/lib/skills/seed-sql";

console.log(
  [
    "",
    "-- Seed: skill-definition matrix (src/lib/skills/builtin-skill-matrix.ts)",
    ...matrixSeedSql(SKILL_MATRIX),
    "",
    "-- Seed: skill catalog (src/lib/skills/catalog-seed.ts; licenses from scripts/verify-catalog-licenses.ts)",
    ...catalogSeedSql(CATALOG_SEED),
  ].join("\n"),
);
