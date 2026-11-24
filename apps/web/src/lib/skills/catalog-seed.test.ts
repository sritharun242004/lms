import { describe, expect, it } from "vitest";
import { VERIFIED_LICENSES } from "./catalog-licenses";
import { CATALOG_SEED } from "./catalog-seed";
import { isPermissiveLicense, PERMISSIVE_LICENSES } from "./license";
import { isValidSkillName } from "./names";

describe("catalog seed", () => {
  it("seeds the spec's candidates", () => {
    expect(CATALOG_SEED.map((e) => e.slug).sort()).toEqual(["docx", "frontend-design", "impeccable", "pdf", "pptx", "skill-creator", "xlsx"]);
  });

  it("has a license verification record for every candidate", () => {
    for (const entry of CATALOG_SEED) {
      const record = VERIFIED_LICENSES[entry.slug];
      expect(record, entry.slug).toBeDefined();
      expect(record.checkedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.license).toBe(record.license);
    }
  });

  it("never marks a non-permissive or unverified license as bundlable", () => {
    for (const entry of CATALOG_SEED) {
      if (!(PERMISSIVE_LICENSES as readonly string[]).includes(entry.license)) expect(entry.bundlable, entry.slug).toBe(false);
      expect(entry.bundlable).toBe(isPermissiveLicense(entry.license));
    }
  });

  it("derives bundlable from the verified license and records license and source for every entry", () => {
    for (const entry of CATALOG_SEED) {
      expect(entry.bundlable, entry.slug).toBe(isPermissiveLicense(entry.license));
      expect(entry.license.trim(), entry.slug).not.toBe("");
      expect(entry.sourceUrl.trim(), entry.slug).not.toBe("");
    }
  });

  it("uses kebab-case slugs, https GitHub sources and unique ids", () => {
    for (const entry of CATALOG_SEED) {
      expect(isValidSkillName(entry.slug)).toBe(true);
      expect(entry.sourceUrl).toMatch(/^https:\/\/github\.com\//);
      expect(entry.description.length).toBeGreaterThan(20);
      expect(entry.description).not.toMatch(/[<>]/);
    }
    expect(new Set(CATALOG_SEED.map((e) => e.id)).size).toBe(CATALOG_SEED.length);
  });
});
