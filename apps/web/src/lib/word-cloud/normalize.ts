/**
 * Normalizes a raw submission so that "Creative", "creative", "CREATIVE",
 * "creative." and "creative," all collapse onto the exact same word
 * cloud entry. Internal hyphens and single spaces survive so short
 * phrases ("well-being", "team work") stay intact as one entry.
 */
export function normalizeWord(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}
