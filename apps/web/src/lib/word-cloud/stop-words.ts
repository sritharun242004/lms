// A small, deliberately conservative stop-word list — this only
// rejects single, near-meaningless filler words (already normalized:
// lowercase, no punctuation). Short phrases like "team work" are left
// alone even if one part matches, since only an *exact* whole-submission
// match is rejected.
const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "of",
  "to",
  "in",
  "on",
  "at",
  "is",
  "are",
  "was",
  "were",
  "be",
  "it",
  "this",
  "that",
  "i",
  "you",
  "he",
  "she",
  "we",
  "they",
]);

export function isStopWord(normalized: string): boolean {
  return STOP_WORDS.has(normalized);
}
