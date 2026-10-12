import * as React from "react";

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Smoothly follow a list of target numbers.
 *
 * - Starts at 0 on mount (or at `initial`, per index), so values grow in on
 *   first render. Pass `initial` for values that should be at their final
 *   position from the first frame, such as an axis maximum.
 * - When the targets change, the new tween begins from the value currently
 *   RENDERED (not from the previous target) and the previous animation frame
 *   is cancelled, so an interrupted transition never snaps or keeps updating an
 *   obsolete value.
 * - Re-renders with unchanged targets (resize, selection highlight, parent
 *   refresh) do not touch it at all.
 * - `disabled` (prefers-reduced-motion) returns the targets as-is.
 *
 * `animating` is true while any value is still moving.
 */
export function useTweenedNumbers(
  targets: readonly number[],
  durationMs: number,
  disabled = false,
  initial?: readonly number[]
): { values: number[]; animating: boolean } {
  const key = targets.join("|");
  const [shown, setShown] = React.useState<number[]>(() => targets.map((_, i) => initial?.[i] ?? 0));
  // Latest rendered values, readable from the effect without re-subscribing.
  const shownRef = React.useRef<number[]>(shown);

  React.useEffect(() => {
    if (disabled) return;
    // `key` is exactly the targets, so the effect re-runs when (and only when)
    // they change and can rebuild them without reading a ref during render.
    const to = key === "" ? [] : key.split("|").map(Number);
    const from = to.map((_, i) => shownRef.current[i] ?? 0);
    if (to.every((value, i) => value === from[i])) return;

    const startedAt = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const progress = Math.min(1, Math.max(0, (now - startedAt) / durationMs));
      const eased = easeOutCubic(progress);
      const next = to.map((target, i) => (progress >= 1 ? target : from[i] + (target - from[i]) * eased));
      shownRef.current = next;
      setShown(next);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    // A newer target set supersedes this animation: stop it before it can
    // write another (now obsolete) frame.
    return () => cancelAnimationFrame(frame);
  }, [key, durationMs, disabled]);

  if (disabled) return { values: [...targets], animating: false };
  const values = targets.map((_, i) => shown[i] ?? 0);
  const animating = targets.some((target, i) => Math.abs(target - values[i]) > 0.001);
  return { values, animating };
}
