/** Relative imports only: scripts/skills-builder-seed-sql.ts loads this through tsx. */
import { sqlLiteral } from "../prompt-bot/seed-sql";
import type { CatalogSeedEntry } from "./catalog-seed";

export const sqlTextArray = (values: string[]) => `ARRAY[${values.map(sqlLiteral).join(",")}]::TEXT[]`;

export function catalogSeedSql(entries: CatalogSeedEntry[]): string[] {
  return entries.map(
    (e) =>
      `INSERT INTO "skill_catalog_entries" ("id","slug","name","description","source_url","license","bundlable","install_notes","tags","is_active","created_at","updated_at") VALUES (${sqlLiteral(e.id)},${sqlLiteral(e.slug)},${sqlLiteral(e.name)},${sqlLiteral(e.description)},${sqlLiteral(e.sourceUrl)},${sqlLiteral(e.license)},${e.bundlable},${sqlLiteral(e.installNotes)},${sqlTextArray(e.tags)},true,NOW(),NOW());`,
  );
}
