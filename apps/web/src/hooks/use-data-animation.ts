import * as React from "react";

/**
 * Whether a chart's data animation should run right now.
 *
 * Recharts restarts its animation on ANY layout change (container resize,
 * rotating a phone, a sidebar toggling), replaying bars and slices from their
 * previous geometry and hiding labels while it does. That is only wanted when
 * the numbers themselves change. This returns true on mount and for one
 * animation window after `signature` (a string describing the data) changes,
 * and false otherwise - so resizes and selection-only re-renders are applied
 * instantly instead of replayed.
 *
 * `disabled` (prefers-reduced-motion) forces false.
 */
export function useDataAnimation(signature: string, durationMs: number, disabled = false): boolean {
  const [seen, setSeen] = React.useState(signature);
  const [animating, setAnimating] = React.useState(true);

  // Derived state: a new signature opens a new animation window immediately,
  // in the same render, so the chart never paints the new data un-animated.
  if (seen !== signature) {
    setSeen(signature);
    setAnimating(true);
  }

  React.useEffect(() => {
    if (!animating) return;
    const timer = window.setTimeout(() => setAnimating(false), durationMs + 150);
    return () => window.clearTimeout(timer);
  }, [animating, seen, durationMs]);

  return animating && !disabled;
}
