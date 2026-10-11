/**
 * Hard-splits one over-long word into pieces that each fit. A greedy split can
 * strand a single character on the last line ("reimaginatio" / "n"), so when
 * the tail is tiny the word is re-divided into equal parts instead, provided
 * every part still fits.
 */
function splitWord(word: string, fits: (candidate: string) => boolean): string[] {
  const chars = Array.from(word);
  const greedy: string[] = [];
  let chunk = "";
  for (const char of chars) {
    if (chunk && !fits(chunk + char)) {
      greedy.push(chunk);
      chunk = char;
    } else {
      chunk += char;
    }
  }
  greedy.push(chunk);

  const tail = Array.from(greedy[greedy.length - 1]).length;
  if (greedy.length < 2 || tail >= 3) return greedy;

  const size = Math.ceil(chars.length / greedy.length);
  const even: string[] = [];
  for (let i = 0; i < chars.length; i += size) even.push(chars.slice(i, i + size).join(""));
  return even.every((part) => fits(part)) ? even : greedy;
}

/**
 * Splits an axis label into lines for which `fits(line)` is true.
 *
 * Words are kept whole where they fit; a word that cannot fit on a line (an
 * unbroken string, a URL, a long number) is hard-split instead of being clipped
 * or forcing the chart wider. Characters are walked as Unicode code points so
 * emoji and non-Latin scripts are never cut mid-character. A single character
 * is always accepted, so the loop terminates for any `fits`. Nothing is ever
 * dropped or ellipsized.
 */
export function wrapLabelBy(text: string, fits: (candidate: string) => boolean): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];

  const lines: string[] = [];
  let current = "";
  const flush = () => {
    if (current) lines.push(current);
    current = "";
  };

  for (const word of words) {
    if (fits(word)) {
      const candidate = current ? `${current} ${word}` : word;
      if (fits(candidate)) current = candidate;
      else {
        flush();
        current = word;
      }
      continue;
    }
    // Longer than a whole line: split it, keeping the tail open for the next word.
    flush();
    const chunks = splitWord(word, fits);
    current = chunks.pop() ?? "";
    lines.push(...chunks);
  }
  flush();
  return lines;
}

/** Character-count wrapping (used when no font can be measured, e.g. in tests). */
export function wrapLabel(text: string, maxChars: number): string[] {
  const limit = Math.max(1, Math.floor(maxChars));
  return wrapLabelBy(text, (candidate) => Array.from(candidate).length <= limit);
}

/**
 * Measures text width in pixels with the real rendered font via a canvas.
 * Returns null where canvas text measurement is unavailable (SSR, jsdom), so
 * callers fall back to character counts.
 */
export function createTextMeasurer(
  sizePx: number,
  family: string
): ((text: string) => number) | null {
  if (typeof document === "undefined") return null;
  if (typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent)) return null;
  try {
    const context = document.createElement("canvas").getContext("2d");
    if (!context) return null;
    context.font = `400 ${sizePx}px ${family}`;
    return (text) => context.measureText(text).width;
  } catch {
    return null;
  }
}
