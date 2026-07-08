"use client";

import * as React from "react";
import { computeWordCloudLayout, type PlacedWord, type WordLayoutInput } from "@/lib/word-cloud/layout";

const FONT_STACK = "ui-sans-serif, system-ui, sans-serif";

// A module-level singleton, not a React ref — plain lazy init, so the
// compiler's render-purity rules (which govern refs, not module scope)
// don't apply here.
let measureCtx: CanvasRenderingContext2D | null | undefined;

function measureTextWidth(text: string, fontSize: number): number {
  if (measureCtx === undefined) {
    measureCtx = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
  }
  if (!measureCtx) return text.length * fontSize * 0.6;
  measureCtx.font = `600 ${fontSize}px ${FONT_STACK}`;
  return measureCtx.measureText(text).width;
}

interface LayoutState {
  key: string | null;
  placed: PlacedWord[];
  positions: Map<string, { x: number; y: number }>;
}

/**
 * Lays out a word cloud's entries as collision-free positions, re-running
 * only when the entry set, size bounds, or container dimensions change.
 * Previously-placed words are re-seeded from their last position (not the
 * center) so the whole cloud doesn't jump around every time one word's
 * count changes.
 *
 * Recomputes via the "adjust state during render" pattern (comparing a
 * derived key against what's stored in state) rather than an effect, so
 * the new layout is ready for this same render instead of committing a
 * stale one and re-rendering a frame later.
 */
export function useWordCloudLayout(
  words: WordLayoutInput[],
  {
    width,
    height,
    minFontSize,
    maxFontSize,
  }: { width: number; height: number; minFontSize: number; maxFontSize: number }
): PlacedWord[] {
  const key = `${words.map((w) => `${w.id}:${w.count}`).join(",")}|${width}|${height}|${minFontSize}|${maxFontSize}`;

  const [state, setState] = React.useState<LayoutState>({
    key: null,
    placed: [],
    positions: new Map(),
  });

  if (state.key !== key) {
    if (width > 0 && height > 0) {
      const placed = computeWordCloudLayout(words, {
        width,
        height,
        minFontSize,
        maxFontSize,
        measureText: measureTextWidth,
        previousPositions: state.positions,
      });
      const positions = new Map(placed.map((w) => [w.id, { x: w.x, y: w.y }]));
      setState({ key, placed, positions });
    } else if (state.placed.length > 0 || state.key === null) {
      setState({ key, placed: [], positions: state.positions });
    }
  }

  return state.placed;
}
