import { z } from "zod";
import { isPermissiveLicense, PERMISSIVE_LICENSES } from "./license";
import { isValidSkillName } from "./names";
import type { CatalogEntryView } from "./types";

const name = z.string().trim().min(2).max(80);
const description = z.string().trim().min(10).max(600);
const sourceUrl = z.string().trim().max(500).url().refine((v) => v.startsWith("https://"), "Use an https:// link");
const license = z.string().trim().min(1).max(64);
const installNotes = z.string().trim().max(1000);
const tags = z.array(z.string().trim().min(1).max(30)).max(10);

export const CatalogCreate = z.object({
  slug: z.string().trim().refine(isValidSkillName, "Use a kebab-case slug of at most 64 characters"),
  name,
  description,
  sourceUrl,
  license,
  bundlable: z.boolean().default(false),
  installNotes: installNotes.default(""),
  tags: tags.default([]),
  isActive: z.boolean().default(true),
});

export const CatalogPatch = z
  .object({ name, description, sourceUrl, license, bundlable: z.boolean(), installNotes, tags, isActive: z.boolean() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

export const BUNDLABLE_MESSAGE = `Only skills under a verified permissive license (${PERMISSIVE_LICENSES.join(", ")}) can be marked bundlable.`;

export const bundlableAllowed = (license: string, bundlable: boolean) => !bundlable || isPermissiveLicense(license);

/** Picks the client-facing fields from a catalog row (drops createdById and timestamps). */
export function toCatalogEntryView(row: CatalogEntryView): CatalogEntryView {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    sourceUrl: row.sourceUrl,
    license: row.license,
    bundlable: row.bundlable,
    installNotes: row.installNotes,
    tags: row.tags,
    isActive: row.isActive,
  };
}
