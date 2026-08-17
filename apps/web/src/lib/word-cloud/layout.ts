export interface WordLayoutInput {
  id: string;
  text: string;
  count: number;
}

export interface PlacedWord extends WordLayoutInput {
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  rotation: number;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Use an absolute curve rather than one relative to the current cloud's
// min/max, so a word tracks its own count over time and never jumps just
// because another word received a response.
const REFERENCE_MIN_COUNT = 1;
const REFERENCE_MAX_COUNT = 12;
export const WORD_CLOUD_MIN_FONT_SIZE = 14;
export const WORD_CLOUD_MAX_FONT_SIZE = 220;

export function fontSizeForCount(
  count: number,
  minSize = WORD_CLOUD_MIN_FONT_SIZE,
  maxSize = WORD_CLOUD_MAX_FONT_SIZE
): number {
  const clamped = Math.max(REFERENCE_MIN_COUNT, Math.min(count, REFERENCE_MAX_COUNT));
  const linearRatio =
    (clamped - REFERENCE_MIN_COUNT) /
    (REFERENCE_MAX_COUNT - REFERENCE_MIN_COUNT);
  // Accelerate the first few repetitions so frequency changes are obvious
  // during a live session instead of becoming visible only at high counts.
  const ratio = Math.pow(linearRatio, 0.72);
  return Math.round(minSize + (maxSize - minSize) * ratio);
}

// Keep every response horizontal for fast scanning and consistent alignment.
export function rotationForWord(text: string): number {
  void text;
  return 0;
}

function toRect(cx: number, cy: number, width: number, height: number): Rect {
  return { x: cx - width / 2, y: cy - height / 2, width, height };
}

function overlaps(a: Rect, b: Rect, padding: number): boolean {
  return !(
    a.x + a.width + padding < b.x ||
    b.x + b.width + padding < a.x ||
    a.y + a.height + padding < b.y ||
    b.y + b.height + padding < a.y
  );
}

function withinBounds(r: Rect, width: number, height: number): boolean {
  return r.x >= 0 && r.y >= 0 && r.x + r.width <= width && r.y + r.height <= height;
}

function collidesWithAny(candidate: Rect, placed: Rect[], padding: number): boolean {
  return placed.some((p) => overlaps(candidate, p, padding));
}

/**
 * Archimedean spiral search for the nearest open spot to (startX, startY).
 * `minimumDistance` creates concentric frequency bands: after the dominant
 * center word, each lower-ranked word must sit at least one step farther out.
 */
function findPosition(
  startX: number,
  startY: number,
  width: number,
  height: number,
  placed: Rect[],
  bounds: { width: number; height: number },
  padding: number,
  minimumDistance: number
): { x: number; y: number } {
  const first = toRect(startX, startY, width, height);
  if (
    minimumDistance === 0 &&
    withinBounds(first, bounds.width, bounds.height) &&
    !collidesWithAny(first, placed, padding)
  ) {
    return { x: startX, y: startY };
  }

  const angleStep = 0.28;
  const radiusGrowth = 2.6;
  const maxRadius = Math.hypot(bounds.width, bounds.height);

  let angle = 0;
  let radius = Math.max(radiusGrowth, minimumDistance);
  let fallback = { x: startX, y: startY };

  while (radius < maxRadius) {
    const cx = startX + radius * Math.cos(angle);
    const cy = startY + radius * Math.sin(angle) * 0.62; // wider than tall, like most word clouds
    const candidate = toRect(cx, cy, width, height);
    const distanceFromCenter = Math.hypot(cx - startX, cy - startY);
    fallback = { x: cx, y: cy };

    if (
      distanceFromCenter >= minimumDistance &&
      withinBounds(candidate, bounds.width, bounds.height) &&
      !collidesWithAny(candidate, placed, padding)
    ) {
      return { x: cx, y: cy };
    }

    angle += angleStep;
    radius += (radiusGrowth * angleStep) / (2 * Math.PI);
  }

  // Bounds exhausted (very crowded cloud) — place it anyway rather than
  // looping forever; a little overlap beats a word that never appears.
  return fallback;
}

export function computeWordCloudLayout(
  words: WordLayoutInput[],
  options: {
    width: number;
    height: number;
    minFontSize: number;
    maxFontSize: number;
    measureText: (text: string, fontSize: number) => number;
    previousPositions?: Map<string, { x: number; y: number }>;
    padding?: number;
  }
): PlacedWord[] {
  const { width, height, minFontSize, maxFontSize, measureText, padding = 6 } = options;
  const centerX = width / 2;
  const centerY = height / 2;

  // Largest words claim their spot first so they land nearest the center;
  // smaller ones fill in around them.
  const sorted = [...words].sort((a, b) => b.count - a.count);

  // `placed` holds each word's center (what callers/rendering use); collision
  // checks need top-left rects instead, so those are tracked separately —
  // conflating the two under the same x/y previously let words overlap
  // because a placed word's *center* was compared as if it were a rect's
  // top-left corner.
  const placed: PlacedWord[] = [];
  const placedRects: Rect[] = [];
  let previousDistance = 0;

  for (const word of sorted) {
    const fontSize = fontSizeForCount(word.count, minFontSize, maxFontSize);
    const textWidth = measureText(word.text, fontSize);
    const textHeight = fontSize * 1.25;
    const rotation = rotationForWord(word.text);

    const minimumDistance = placed.length === 0 ? 0 : previousDistance + padding;
    const { x, y } = findPosition(
      centerX,
      centerY,
      textWidth,
      textHeight,
      placedRects,
      { width, height },
      padding,
      minimumDistance
    );
    previousDistance = Math.hypot(x - centerX, y - centerY);

    placed.push({
      ...word,
      x,
      y,
      width: textWidth,
      height: textHeight,
      fontSize,
      rotation,
    });
    placedRects.push(toRect(x, y, textWidth, textHeight));
  }

  return placed;
}
