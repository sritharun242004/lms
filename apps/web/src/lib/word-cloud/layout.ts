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
): { x: number; y: number } | null {
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
  while (radius < maxRadius) {
    const cx = startX + radius * Math.cos(angle);
    const cy = startY + radius * Math.sin(angle) * 0.62; // wider than tall, like most word clouds
    const candidate = toRect(cx, cy, width, height);
    const distanceFromCenter = Math.hypot(cx - startX, cy - startY);
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

  return null;
}

function scaledWord(
  word: WordLayoutInput,
  scale: number,
  minFontSize: number,
  maxFontSize: number,
  measureText: (text: string, fontSize: number) => number
) {
  const requested = fontSizeForCount(word.count, minFontSize, maxFontSize);
  const fontSize = Math.max(1, Math.floor(requested * scale));
  return {
    ...word,
    fontSize,
    width: measureText(word.text, fontSize),
    height: fontSize * 1.25,
    rotation: rotationForWord(word.text),
  };
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
  const {
    width,
    height,
    minFontSize,
    maxFontSize,
    measureText,
    previousPositions,
    padding = 6,
  } = options;
  const centerX = width / 2;
  const centerY = height / 2;

  // Largest words claim their spot first so they land nearest the center;
  // smaller ones fill in around them.
  const sorted = [...words].sort((a, b) => b.count - a.count);

  if (sorted.length === 0) return [];

  // Preserve the existing slots. If leadership changes, swap the former
  // center word into the new leader's old slot; every other word remains
  // exactly where it was.
  const targets = new Map<string, { x: number; y: number }>();
  const dominant = sorted[0];
  targets.set(dominant.id, { x: centerX, y: centerY });

  if (previousPositions?.size) {
    const activePrevious = sorted.filter((word) => previousPositions.has(word.id));
    const previousCenter = activePrevious.reduce<WordLayoutInput | null>((closest, word) => {
      if (!closest) return word;
      const point = previousPositions.get(word.id)!;
      const closestPoint = previousPositions.get(closest.id)!;
      return Math.hypot(point.x - centerX, point.y - centerY) <
        Math.hypot(closestPoint.x - centerX, closestPoint.y - centerY)
        ? word
        : closest;
    }, null);
    const dominantPrevious = previousPositions.get(dominant.id);

    for (const word of activePrevious) {
      if (word.id !== dominant.id && word.id !== previousCenter?.id) {
        targets.set(word.id, previousPositions.get(word.id)!);
      }
    }
    if (previousCenter && previousCenter.id !== dominant.id && dominantPrevious) {
      targets.set(previousCenter.id, dominantPrevious);
    }
  }

  // Retry the whole cloud at a smaller uniform scale when any requested size
  // would overlap. This guarantees visibility without changing stable slots.
  for (let attempt = 0; attempt < 80; attempt++) {
    const scale = Math.pow(0.92, attempt);
    const placed: PlacedWord[] = [];
    const placedRects: Rect[] = [];
    let failed = false;
    let previousDistance = 0;

    for (const word of sorted) {
      const dimensions = scaledWord(word, scale, minFontSize, maxFontSize, measureText);
      const fixed = targets.get(word.id);
      let position: { x: number; y: number } | null = fixed ?? null;

      if (fixed) {
        const fixedRect = toRect(fixed.x, fixed.y, dimensions.width, dimensions.height);
        if (
          !withinBounds(fixedRect, width, height) ||
          collidesWithAny(fixedRect, placedRects, padding)
        ) {
          failed = true;
          break;
        }
      } else {
        position = findPosition(
          centerX,
          centerY,
          dimensions.width,
          dimensions.height,
          placedRects,
          { width, height },
          padding,
          previousDistance + padding
        );
        if (!position) {
          failed = true;
          break;
        }
      }

      previousDistance = Math.max(
        previousDistance,
        Math.hypot(position!.x - centerX, position!.y - centerY)
      );
      placed.push({ ...dimensions, x: position!.x, y: position!.y });
      placedRects.push(toRect(position!.x, position!.y, dimensions.width, dimensions.height));
    }

    if (!failed && placed.length === sorted.length) return placed;
  }

  // A 1px retry is a deterministic last resort for extremely small canvases.
  // It still uses collision checks and never intentionally overlays entries.
  const placed: PlacedWord[] = [];
  const rects: Rect[] = [];
  for (const word of sorted) {
    const dimensions = scaledWord(word, 0, minFontSize, maxFontSize, measureText);
    const fixed = targets.get(word.id);
    const position =
      fixed ??
      findPosition(centerX, centerY, dimensions.width, dimensions.height, rects, { width, height }, 0, 0);
    if (!position) continue;
    const rect = toRect(position.x, position.y, dimensions.width, dimensions.height);
    if (!withinBounds(rect, width, height) || collidesWithAny(rect, rects, 0)) continue;
    placed.push({ ...dimensions, x: position.x, y: position.y });
    rects.push(rect);
  }
  return placed;
}
