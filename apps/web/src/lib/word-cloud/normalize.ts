/**
 * Normalizes a raw submission for storage and display without changing its
 * submitted letter casing. Punctuation variants collapse while case variants
 * remain distinct entries. Internal hyphens and single spaces survive so short
 * phrases ("well-being", "team work") stay intact as one entry.
 */
export function normalizeWord(raw: string): string {
  return raw
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}
