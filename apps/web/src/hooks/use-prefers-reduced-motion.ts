import * as React from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function getSnapshot() {
  return window.matchMedia(QUERY).matches;
}

function getServerSnapshot() {
  return false;
}

/**
 * Whether the user has requested reduced motion, read live from
 * `prefers-reduced-motion` and kept in sync with changes to it.
 *
 * `motion/react`'s own `useReducedMotion` only captures this once, into a
 * module-level singleton, the first time any component calls it — and in
 * this app that first call happens during SSR, where there is no `window`,
 * so the capture is skipped and the value is left at `null` forever; it is
 * never corrected on the client. Verified directly against a real browser:
 * it stays `null` regardless of the browser's actual setting, in both dev
 * and production builds. `useSyncExternalStore` is the React-recommended
 * way to read a synchronous external source like `matchMedia`: it reads the
 * real value on the client immediately (no post-mount setState, so no extra
 * render) while still matching `getServerSnapshot`'s `false` during SSR
 * without a hydration-mismatch warning.
 */
export function usePrefersReducedMotion(): boolean {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
