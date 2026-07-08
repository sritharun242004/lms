/**
 * Deterministic color assignment: the same normalized word always
 * hashes to the same hue. Only the *hue* is persisted (as a string,
 * e.g. "217") — saturation/lightness are chosen at render time based
 * on the viewer's active theme, so a word's identity color stays
 * genuinely fixed while remaining readable against both a light and a
 * dark background (see `hslForHue`).
 */
export function hueForWord(normalizedWord: string): number {
  let hash = 0;
  for (let i = 0; i < normalizedWord.length; i++) {
    hash = (hash * 31 + normalizedWord.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 360;
}

export function hslForHue(hue: number, isDark: boolean): string {
  const saturation = 72;
  const lightness = isDark ? 68 : 40;
  return `hsl(${hue}deg ${saturation}% ${lightness}%)`;
}
