"use client";

import * as React from "react";
import { ReactLenis } from "lenis/react";
import { useReducedMotion } from "motion/react";

// Lenis only when the visitor hasn't asked for reduced motion — browsers
// already give a perfectly good native scroll otherwise, and we never
// want to fight that preference. Reuses the same hook the rest of this
// codebase already uses for the same check (see word-cloud-canvas.tsx),
// which also means no manual matchMedia effect to get SSR-safe ourselves.
export function SmoothScroll({ children }: { children?: React.ReactNode }) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) return <>{children}</>;

  return (
    <ReactLenis root options={{ lerp: 0.12, duration: 1.1, smoothWheel: true, anchors: true }}>
      {children}
    </ReactLenis>
  );
}
