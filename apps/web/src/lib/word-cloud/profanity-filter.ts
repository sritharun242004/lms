/**
 * Pluggable profanity filter. `checkProfanity` is the seam the rest of
 * the app calls through — swap `defaultProfanityFilter` for a smarter
 * implementation (an external moderation API, a bigger word list,
 * per-locale lists, …) without touching any call site.
 */
export interface ProfanityFilter {
  check(normalizedWord: string): boolean;
}

// Intentionally small and generic — this is a baseline, not a
// moderation product. Swap in a real provider for anything public-facing.
const BLOCKED_WORDS = new Set([
  "fuck",
  "shit",
  "bitch",
  "asshole",
  "bastard",
  "cunt",
  "dick",
  "piss",
  "slut",
  "whore",
]);

export const defaultProfanityFilter: ProfanityFilter = {
  check(normalizedWord: string): boolean {
    const tokens = normalizedWord.split(" ");
    return tokens.some((token) => BLOCKED_WORDS.has(token));
  },
};

export function containsProfanity(
  normalizedWord: string,
  filter: ProfanityFilter = defaultProfanityFilter
): boolean {
  return filter.check(normalizedWord);
}
