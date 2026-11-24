/** Catalog rows seeded by the 20261124160000_add_skills_builder migration. Relative imports only (tsx scripts). */
import { CATALOG_CANDIDATES } from "./catalog-candidates";
import { VERIFIED_LICENSES } from "./catalog-licenses";
import { isPermissiveLicense } from "./license";

export type CatalogSeedEntry = {
  id: string;
  slug: string;
  name: string;
  description: string;
  sourceUrl: string;
  installNotes: string;
  tags: string[];
  license: string;
  bundlable: boolean;
};

export const CATALOG_SEED: CatalogSeedEntry[] = CATALOG_CANDIDATES.map((candidate) => {
  const license = VERIFIED_LICENSES[candidate.slug]?.license ?? "NOASSERTION";
  return {
    id: `scat_${candidate.slug.replace(/-/g, "_")}`,
    slug: candidate.slug,
    name: candidate.name,
    description: candidate.description,
    sourceUrl: candidate.sourceUrl,
    installNotes: candidate.installNotes,
    tags: candidate.tags,
    license,
    bundlable: isPermissiveLicense(license),
  };
});
